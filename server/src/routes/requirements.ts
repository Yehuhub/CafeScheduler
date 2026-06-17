import { Router } from "express";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import type { ShiftRequirementDto, Slot } from "../../../shared/types";

const router = Router();

const VALID_SLOTS: Slot[] = ["morning", "mid", "evening"];

function toRequirementDto(row: {
  id: number;
  weekId: number;
  day: number;
  slot: string;
  cooksNeeded: number;
  baristasNeeded: number;
}): ShiftRequirementDto {
  return {
    id: row.id,
    weekId: row.weekId,
    day: row.day,
    slot: row.slot as Slot,
    cooksNeeded: row.cooksNeeded,
    baristasNeeded: row.baristasNeeded,
  };
}

// GET /weeks/:weekId/requirements  (boss only)
router.get("/weeks/:weekId/requirements", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const weekId = parseInt(req.params.weekId, 10);
    if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    const rows = await prisma.shiftRequirement.findMany({ where: { weekId } });

    res.json({ requirements: rows.map(toRequirementDto) });
  } catch (err) {
    next(err);
  }
});

// PUT /weeks/:weekId/requirements  { entries: [...] }  (boss only)
router.put("/weeks/:weekId/requirements", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const weekId = parseInt(req.params.weekId, 10);
    if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    const { entries } = req.body as Record<string, unknown>;
    if (!Array.isArray(entries)) {
      throw new HttpError(400, "entries must be an array", "VALIDATION_ERROR");
    }

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
      if (typeof e.slot !== "string" || !VALID_SLOTS.includes(e.slot as Slot)) {
        throw new HttpError(
          400,
          `entries[${i}].slot must be one of: ${VALID_SLOTS.join(", ")}`,
          "VALIDATION_ERROR"
        );
      }
      if (
        typeof e.cooksNeeded !== "number" ||
        !Number.isInteger(e.cooksNeeded) ||
        e.cooksNeeded < 0
      ) {
        throw new HttpError(
          400,
          `entries[${i}].cooksNeeded must be a non-negative integer`,
          "VALIDATION_ERROR"
        );
      }
      if (
        typeof e.baristasNeeded !== "number" ||
        !Number.isInteger(e.baristasNeeded) ||
        e.baristasNeeded < 0
      ) {
        throw new HttpError(
          400,
          `entries[${i}].baristasNeeded must be a non-negative integer`,
          "VALIDATION_ERROR"
        );
      }
    }

    type EntryInput = { day: number; slot: Slot; cooksNeeded: number; baristasNeeded: number };

    const rows = await prisma.$transaction(async (tx) => {
      await tx.shiftRequirement.deleteMany({ where: { weekId } });

      if (entries.length > 0) {
        await tx.shiftRequirement.createMany({
          data: (entries as EntryInput[]).map((e) => ({
            weekId,
            day: e.day,
            slot: e.slot,
            cooksNeeded: e.cooksNeeded,
            baristasNeeded: e.baristasNeeded,
          })),
        });
      }

      return tx.shiftRequirement.findMany({ where: { weekId } });
    });

    res.json({ requirements: rows.map(toRequirementDto) });
  } catch (err) {
    next(err);
  }
});

export default router;
