import { Router } from "express";
import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { isValidTransition, wipesAssignments } from "../services/weekState";
import { buildScheduleView, exporters } from "../services/scheduleExport";
import type { ExportFormat } from "../services/scheduleExport";
import type { WeekDto, WeekStatus, Slot, RoleWorking } from "../../../shared/types";

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

// POST /weeks (boss only)
router.post("/", requireLogin, requireBoss, async (_req, res, next) => {
  try {
    // Use only non-deleted weeks to determine the next startDate
    const lastWeek = await prisma.week.findFirst({
      where: { isDeleted: false },
      orderBy: { startDate: "desc" },
    });

    let startDate: Date;
    if (lastWeek) {
      startDate = new Date(lastWeek.startDate);
      startDate.setUTCDate(startDate.getUTCDate() + 7);
    } else {
      startDate = nextSunday(new Date());
    }

    // A deleted week may already exist at this startDate (created then deleted).
    // Restore it to a clean state rather than trying to insert a duplicate.
    const existing = await prisma.week.findUnique({ where: { startDate } });

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

      // Copy ShiftRequirements from the previous non-deleted week.
      // If no previous week exists (or it had no requirements), seed a default
      // template: 1 cook + 1 barista for morning and evening on every day.
      const prevReqs = lastWeek
        ? await tx.shiftRequirement.findMany({ where: { weekId: lastWeek.id } })
        : [];

      const reqsToSeed =
        prevReqs.length > 0
          ? prevReqs.map((r) => ({
              weekId: newWeek.id,
              day: r.day,
              slot: r.slot,
              cooksNeeded: r.cooksNeeded,
              baristasNeeded: r.baristasNeeded,
            }))
          : [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
              { weekId: newWeek.id, day, slot: "morning", cooksNeeded: 1, baristasNeeded: 1 },
              { weekId: newWeek.id, day, slot: "evening", cooksNeeded: 1, baristasNeeded: 1 },
            ]);

      await tx.shiftRequirement.createMany({ data: reqsToSeed });

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

    await prisma.week.update({ where: { id }, data: { isDeleted: true } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /weeks/:weekId/export.html | export.pdf  (boss only, published weeks only)
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

      const rows = await prisma.assignment.findMany({ where: { weekId } });
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
        assignments: rows.map((r) => ({
          userId: r.userId,
          day: r.day,
          slot: r.slot as Slot,
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

router.get("/:weekId/export.html", requireLogin, requireBoss, makeExportHandler("html"));

// GET /weeks/:weekId/export.pdf — stubbed (reserved for a future server-side PDF binary)
router.get("/:weekId/export.pdf", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
