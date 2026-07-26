import { Router } from "express";
import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { isValidTransition, wipesAssignments } from "../services/weekState";
import { isPastWeek } from "../../../shared/weekDates";
import { buildScheduleView, exporters } from "../services/scheduleExport";
import type { ExportFormat } from "../services/scheduleExport";
import type { WeekDto, WeekStatus, RoleWorking } from "../../../shared/types";

const router = Router();

const VALID_STATUSES: WeekStatus[] = [
  "availability_open",
  "availability_closed",
  "draft",
  "published",
];

function toWeekDto(week: {
  id: number;
  startDate: Date;
  status: string;
  createdAt: Date;
  publishedAt: Date | null;
}): WeekDto {
  return {
    id: week.id,
    startDate: week.startDate.toISOString(),
    status: week.status as WeekStatus,
    createdAt: week.createdAt.toISOString(),
    publishedAt: week.publishedAt?.toISOString() ?? null,
  };
}

// Returns the upcoming Sunday on or after `from` (at midnight UTC)
function nextSunday(from: Date): Date {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() + (day === 0 ? 0 : 7 - day));
  return d;
}

// GET /weeks
router.get("/", requireLogin, async (_req, res, next) => {
  try {
    const weeks = await prisma.week.findMany({
      where: { isDeleted: false },
      orderBy: { startDate: "desc" },
    });
    res.json({ weeks: weeks.map(toWeekDto) });
  } catch (err) {
    next(err);
  }
});

// GET /weeks/current — must come before /:id
router.get("/current", requireLogin, async (_req, res, next) => {
  try {
    const nonPublished = await prisma.week.findFirst({
      where: { isDeleted: false, status: { not: "published" } },
      orderBy: { startDate: "desc" },
    });
    if (nonPublished) {
      res.json({ week: toWeekDto(nonPublished) });
      return;
    }
    const published = await prisma.week.findFirst({
      where: { isDeleted: false, status: "published" },
      orderBy: { startDate: "desc" },
    });
    res.json({ week: published ? toWeekDto(published) : null });
  } catch (err) {
    next(err);
  }
});

// GET /weeks/:id
router.get("/:id", requireLogin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    res.json({ week: toWeekDto(week) });
  } catch (err) {
    next(err);
  }
});

// POST /weeks (boss only)  { startDate? }
// Without startDate: opens the next sequential week (legacy "Open next week" behavior).
// With startDate: opens that specific week — the dashboard's week navigator lets the boss
// open any future week directly, so gaps in the sequence are allowed.
router.post("/", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const { startDate: requestedStart } = req.body as Record<string, unknown>;

    let startDate: Date;
    if (requestedStart === undefined) {
      // Use only non-deleted weeks to determine the next startDate
      const lastWeek = await prisma.week.findFirst({
        where: { isDeleted: false },
        orderBy: { startDate: "desc" },
      });
      if (lastWeek) {
        startDate = new Date(lastWeek.startDate);
        startDate.setUTCDate(startDate.getUTCDate() + 7);
      } else {
        startDate = nextSunday(new Date());
      }
    } else {
      if (typeof requestedStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(requestedStart)) {
        throw new HttpError(400, "startDate must be a YYYY-MM-DD date", "VALIDATION_ERROR");
      }
      startDate = new Date(`${requestedStart}T00:00:00.000Z`);
      if (isNaN(startDate.getTime())) {
        throw new HttpError(400, "startDate is not a valid date", "VALIDATION_ERROR");
      }
      if (startDate.getUTCDay() !== 0) {
        throw new HttpError(400, "startDate must be a Sunday", "VALIDATION_ERROR");
      }
      if (isPastWeek(startDate)) {
        throw new HttpError(409, "Cannot open a week that has already ended", "WEEK_ENDED");
      }
    }

    // Requirements are copied from the most recent non-deleted week *before* this one,
    // so opening a week out of sequence still inherits the nearest earlier template.
    const lastWeek = await prisma.week.findFirst({
      where: { isDeleted: false, startDate: { lt: startDate } },
      orderBy: { startDate: "desc" },
    });

    // A deleted week may already exist at this startDate (created then deleted).
    // Restore it to a clean state rather than trying to insert a duplicate.
    const existing = await prisma.week.findUnique({ where: { startDate } });
    if (existing && !existing.isDeleted) {
      throw new HttpError(409, "This week is already open", "ALREADY_EXISTS");
    }

    const week = await prisma.$transaction(async (tx) => {
      if (existing) {
        // Wipe stale data so the week starts fresh
        await tx.assignment.deleteMany({ where: { weekId: existing.id } });
        await tx.availability.deleteMany({ where: { weekId: existing.id } });
        await tx.weeklyShiftCount.deleteMany({ where: { weekId: existing.id } });

        const activeUsers = await tx.user.findMany({
          where: { isActive: true, isDeleted: false },
        });
        if (activeUsers.length > 0) {
          await tx.weeklyShiftCount.createMany({
            data: activeUsers.map((u) => ({
              weekId: existing.id,
              userId: u.id,
              shiftsThisWeek: u.defaultShiftsPerWeek,
            })),
          });
        }

        return tx.week.update({
          where: { id: existing.id },
          data: { isDeleted: false, status: "availability_open", publishedAt: null },
        });
      }

      // No existing row — create a fresh week
      const newWeek = await tx.week.create({
        data: { startDate, status: "availability_open" },
      });

      // Copy the previous non-deleted week's Shifts + ShiftRequirements forward.
      // If no previous week exists (or it defined no shifts), seed a default template:
      // Morning (06:00) and Evening (13:00), 1 cook + 1 barista on every day.
      const prevShifts = lastWeek
        ? await tx.shift.findMany({ where: { weekId: lastWeek.id } })
        : [];

      if (prevShifts.length > 0) {
        // Recreate the shifts for the new week, then remap requirements onto the new ids.
        // (weekId, name) is unique, so name is a safe old→new join key.
        await tx.shift.createMany({
          data: prevShifts.map((s) => ({
            weekId: newWeek.id,
            name: s.name,
            startTime: s.startTime,
          })),
        });
        const newShifts = await tx.shift.findMany({ where: { weekId: newWeek.id } });
        const newIdByName = new Map(newShifts.map((s) => [s.name, s.id]));
        const oldNameById = new Map(prevShifts.map((s) => [s.id, s.name]));

        const prevReqs = await tx.shiftRequirement.findMany({
          where: { weekId: lastWeek!.id },
        });
        if (prevReqs.length > 0) {
          await tx.shiftRequirement.createMany({
            data: prevReqs.map((r) => ({
              weekId: newWeek.id,
              day: r.day,
              shiftId: newIdByName.get(oldNameById.get(r.shiftId)!)!,
              cooksNeeded: r.cooksNeeded,
              baristasNeeded: r.baristasNeeded,
            })),
          });
        }
      } else {
        await tx.shift.createMany({
          data: [
            { weekId: newWeek.id, name: "Morning", startTime: "06:00" },
            { weekId: newWeek.id, name: "Evening", startTime: "13:00" },
          ],
        });
        const newShifts = await tx.shift.findMany({ where: { weekId: newWeek.id } });
        const idByName = new Map(newShifts.map((s) => [s.name, s.id]));
        const reqsToSeed = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
          { weekId: newWeek.id, day, shiftId: idByName.get("Morning")!, cooksNeeded: 1, baristasNeeded: 1 },
          { weekId: newWeek.id, day, shiftId: idByName.get("Evening")!, cooksNeeded: 1, baristasNeeded: 1 },
        ]);
        await tx.shiftRequirement.createMany({ data: reqsToSeed });
      }

      const activeUsers = await tx.user.findMany({
        where: { isActive: true, isDeleted: false },
      });
      if (activeUsers.length > 0) {
        await tx.weeklyShiftCount.createMany({
          data: activeUsers.map((u) => ({
            weekId: newWeek.id,
            userId: u.id,
            shiftsThisWeek: u.defaultShiftsPerWeek,
          })),
        });
      }

      return newWeek;
    });

    res.status(201).json({ week: toWeekDto(week) });
  } catch (err) {
    next(err);
  }
});

// PATCH /weeks/:id/status (boss only)
router.patch("/:id/status", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const { status } = req.body as Record<string, unknown>;
    if (typeof status !== "string" || !VALID_STATUSES.includes(status as WeekStatus)) {
      throw new HttpError(400, "Invalid status value", "VALIDATION_ERROR");
    }
    const to = status as WeekStatus;

    const currentWeek = await prisma.week.findUnique({ where: { id, isDeleted: false } });
    if (!currentWeek) throw new HttpError(404, "Week not found", "NOT_FOUND");

    if (isPastWeek(currentWeek.startDate)) {
      throw new HttpError(409, "This week has ended and can no longer be edited", "WEEK_ENDED");
    }

    const from = currentWeek.status as WeekStatus;
    if (!isValidTransition(from, to)) {
      throw new HttpError(
        409,
        `Cannot transition from '${from}' to '${to}'`,
        "INVALID_TRANSITION"
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Backward transition to availability_open from draft wipes the draft assignments
      if (wipesAssignments(from, to)) {
        await tx.assignment.deleteMany({ where: { weekId: id } });
      }
      return tx.week.update({
        where: { id },
        data: {
          status: to,
          ...(to === "published" ? { publishedAt: new Date() } : {}),
        },
      });
    });

    res.json({ week: toWeekDto(updated) });
  } catch (err) {
    next(err);
  }
});

// DELETE /weeks/:id (boss only)
router.delete("/:id", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const { password } = req.body as Record<string, unknown>;
    if (typeof password !== "string" || password === "") {
      throw new HttpError(400, "password is required", "VALIDATION_ERROR");
    }

    const valid = await bcrypt.compare(password, req.user!.passwordHash);
    if (!valid) {
      throw new HttpError(403, "Incorrect password", "INVALID_PASSWORD");
    }

    const week = await prisma.week.findUnique({ where: { id, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    if (isPastWeek(week.startDate)) {
      throw new HttpError(409, "This week has ended and can no longer be edited", "WEEK_ENDED");
    }

    await prisma.week.update({ where: { id }, data: { isDeleted: true } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /weeks/:weekId/export.html | export.pdf  (any logged-in user, published weeks only)
// Serves a styled HTML print page (DESIGN.md §6). The handler is format-parameterized
// so `export.pdf` can be swapped from the stub below to makeExportHandler("pdf") once a
// binary exporter is registered.
function makeExportHandler(format: ExportFormat): RequestHandler {
  return async (req, res, next) => {
    try {
      const weekId = parseInt(req.params.weekId, 10);
      if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

      const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
      if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

      // Published-only for now (matches the future employee behavior).
      if (week.status !== "published") {
        throw new HttpError(409, "Week is not published", "INVALID_STATE");
      }

      const exporter = exporters[format];
      if (!exporter) {
        throw new HttpError(
          501,
          `Export format '${format}' is not implemented`,
          "NOT_IMPLEMENTED"
        );
      }

      const [rows, shifts] = await Promise.all([
        prisma.assignment.findMany({ where: { weekId } }),
        prisma.shift.findMany({ where: { weekId }, select: { id: true, name: true, startTime: true } }),
      ]);
      // Include soft-deleted users — historical shifts keep their name.
      const assigneeIds = [...new Set(rows.map((r) => r.userId))];
      const assignees = assigneeIds.length
        ? await prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, name: true },
          })
        : [];

      const view = buildScheduleView({
        weekStartDate: week.startDate.toISOString(),
        shifts,
        assignments: rows.map((r) => ({
          userId: r.userId,
          day: r.day,
          shiftId: r.shiftId,
          roleWorking: r.roleWorking as RoleWorking,
        })),
        names: new Map(assignees.map((a) => [a.id, a.name])),
      });

      res.type(exporter.contentType).send(exporter.render(view));
    } catch (err) {
      next(err);
    }
  };
}

router.get("/:weekId/export.html", requireLogin, makeExportHandler("html"));

// GET /weeks/:weekId/export.pdf — stubbed (reserved for a future server-side PDF binary)
router.get("/:weekId/export.pdf", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
