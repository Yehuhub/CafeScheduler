import { Router } from "express";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import type { WeeklyShiftCountDto } from "../../../shared/types";

const router = Router();

function toShiftCountDto(row: {
  id: number;
  weekId: number;
  userId: number;
  shiftsThisWeek: number;
}): WeeklyShiftCountDto {
  return {
    id: row.id,
    weekId: row.weekId,
    userId: row.userId,
    shiftsThisWeek: row.shiftsThisWeek,
  };
}

// GET /weeks/:weekId/shift-counts  (boss only)
router.get("/weeks/:weekId/shift-counts", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const weekId = parseInt(req.params.weekId, 10);
    if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    const rows = await prisma.weeklyShiftCount.findMany({ where: { weekId } });

    res.json({ shiftCounts: rows.map(toShiftCountDto) });
  } catch (err) {
    next(err);
  }
});

// PATCH /weeks/:weekId/shift-counts/:userId  { shiftsThisWeek }  (boss only)
router.patch(
  "/weeks/:weekId/shift-counts/:userId",
  requireLogin,
  requireBoss,
  async (req, res, next) => {
    try {
      const weekId = parseInt(req.params.weekId, 10);
      if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

      const userId = parseInt(req.params.userId, 10);
      if (isNaN(userId)) throw new HttpError(400, "Invalid user id", "VALIDATION_ERROR");

      const { shiftsThisWeek } = req.body as Record<string, unknown>;
      if (
        typeof shiftsThisWeek !== "number" ||
        !Number.isInteger(shiftsThisWeek) ||
        shiftsThisWeek < 0
      ) {
        throw new HttpError(
          400,
          "shiftsThisWeek must be a non-negative integer",
          "VALIDATION_ERROR"
        );
      }

      const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
      if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

      const user = await prisma.user.findUnique({ where: { id: userId, isDeleted: false } });
      if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");

      // Upsert: a user added after week creation has no seeded row
      const updated = await prisma.weeklyShiftCount.upsert({
        where: { weekId_userId: { weekId, userId } },
        update: { shiftsThisWeek },
        create: { weekId, userId, shiftsThisWeek },
      });

      res.json({ shiftCount: toShiftCountDto(updated) });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
