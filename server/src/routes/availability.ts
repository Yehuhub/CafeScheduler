import { Router } from "express";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { SLOTS } from "../../../shared/types";
import type { AvailabilityDto, Slot } from "../../../shared/types";

const router = Router();

function toAvailabilityDto(row: {
  id: number;
  weekId: number;
  userId: number;
  day: number;
  slot: string;
  available: boolean;
}): AvailabilityDto {
  return {
    id: row.id,
    weekId: row.weekId,
    userId: row.userId,
    day: row.day,
    slot: row.slot as Slot,
    available: row.available,
  };
}

// GET /weeks/:weekId/availability/me
router.get("/weeks/:weekId/availability/me", requireLogin, async (req, res, next) => {
  try {
    const weekId = parseInt(req.params.weekId, 10);
    if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    const rows = await prisma.availability.findMany({
      where: { weekId, userId: req.user!.id },
    });

    res.json({ availability: rows.map(toAvailabilityDto) });
  } catch (err) {
    next(err);
  }
});

// PUT /weeks/:weekId/availability/me  { entries: [...] }
router.put("/weeks/:weekId/availability/me", requireLogin, async (req, res, next) => {
  try {
    const weekId = parseInt(req.params.weekId, 10);
    if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    if (week.status !== "availability_open") {
      throw new HttpError(409, "Availability is closed for this week", "INVALID_STATE");
    }

    const { entries } = req.body as Record<string, unknown>;
    if (!Array.isArray(entries)) {
      throw new HttpError(400, "entries must be an array", "VALIDATION_ERROR");
    }

    // Validate each entry before writing anything
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i] as Record<string, unknown>;
      if (
        typeof e.day !== "number" ||
        !Number.isInteger(e.day) ||
        e.day < 0 ||
        e.day > 6
      ) {
        throw new HttpError(400, `entries[${i}].day must be an integer 0–6`, "VALIDATION_ERROR");
      }
      if (typeof e.slot !== "string" || !SLOTS.includes(e.slot as Slot)) {
        throw new HttpError(
          400,
          `entries[${i}].slot must be one of: ${SLOTS.join(", ")}`,
          "VALIDATION_ERROR"
        );
      }
      if (typeof e.available !== "boolean") {
        throw new HttpError(400, `entries[${i}].available must be a boolean`, "VALIDATION_ERROR");
      }
    }

    const userId = req.user!.id;

    const rows = await prisma.$transaction(async (tx) => {
      // Wipe existing availability for this user + week, then insert only ticked cells
      await tx.availability.deleteMany({ where: { weekId, userId } });

      const ticked = (entries as Array<{ day: number; slot: Slot; available: boolean }>).filter(
        (e) => e.available
      );

      if (ticked.length > 0) {
        await tx.availability.createMany({
          data: ticked.map((e) => ({
            weekId,
            userId,
            day: e.day,
            slot: e.slot,
            available: true,
          })),
        });
      }

      return tx.availability.findMany({ where: { weekId, userId } });
    });

    res.json({ availability: rows.map(toAvailabilityDto) });
  } catch (err) {
    next(err);
  }
});

// GET /weeks/:weekId/availability  (boss only — sees all employees)
router.get("/weeks/:weekId/availability", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const weekId = parseInt(req.params.weekId, 10);
    if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    const rows = await prisma.availability.findMany({ where: { weekId } });

    res.json({ availability: rows.map(toAvailabilityDto) });
  } catch (err) {
    next(err);
  }
});

export default router;
