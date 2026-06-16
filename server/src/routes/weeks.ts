import { Router } from "express";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { isValidTransition, wipesAssignments } from "../services/weekState";
import type { WeekDto, WeekStatus } from "../../../shared/types";

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

      // Copy ShiftRequirements from the previous non-deleted week
      if (lastWeek) {
        const reqs = await tx.shiftRequirement.findMany({
          where: { weekId: lastWeek.id },
        });
        if (reqs.length > 0) {
          await tx.shiftRequirement.createMany({
            data: reqs.map((r) => ({
              weekId: newWeek.id,
              day: r.day,
              slot: r.slot,
              cooksNeeded: r.cooksNeeded,
              baristasNeeded: r.baristasNeeded,
            })),
          });
        }
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

// GET /weeks/:weekId/dashboard (boss only) — stubbed until availability + assignments are built
router.get("/:weekId/dashboard", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// GET /weeks/:weekId/export.pdf — stubbed
router.get("/:weekId/export.pdf", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
