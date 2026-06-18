import { Router } from "express";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { runAssigner } from "../services/assigner";
import type { AssignmentDto, Slot, RoleWorking, WeekStatus } from "../../../shared/types";

const router = Router();

function toAssignmentDto(row: {
  id: number;
  weekId: number;
  userId: number;
  day: number;
  slot: string;
  roleWorking: string;
  createdAt: Date;
}): AssignmentDto {
  return {
    id: row.id,
    weekId: row.weekId,
    userId: row.userId,
    day: row.day,
    slot: row.slot as Slot,
    roleWorking: row.roleWorking as RoleWorking,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /weeks/:weekId/assignments
// Employees may only see assignments once published (enforced in implementation)
router.get("/weeks/:weekId/assignments", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// POST /weeks/:weekId/assignments/run-assigner  (boss only)
// Must be declared before /:weekId/assignments to avoid route shadowing
router.post(
  "/weeks/:weekId/assignments/run-assigner",
  requireLogin,
  requireBoss,
  async (req, res, next) => {
    try {
      const weekId = parseInt(req.params.weekId, 10);
      if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

      const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
      if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

      const status = week.status as WeekStatus;
      if (status !== "availability_closed" && status !== "draft") {
        throw new HttpError(
          409,
          "Assigner can only run when week is availability_closed or draft",
          "INVALID_STATE"
        );
      }

      // Gather all inputs for the pure assigner function
      const [users, availability, requirements, shiftCounts, prevWeek] = await Promise.all([
        prisma.user.findMany({ where: { isActive: true, isDeleted: false } }),
        prisma.availability.findMany({ where: { weekId } }),
        prisma.shiftRequirement.findMany({ where: { weekId } }),
        prisma.weeklyShiftCount.findMany({ where: { weekId } }),
        // Previous week for weekend rotation — most recent non-deleted week before this one
        prisma.week.findFirst({
          where: { isDeleted: false, startDate: { lt: week.startDate } },
          orderBy: { startDate: "desc" },
        }),
      ]);

      const prevWeekAssignments = prevWeek
        ? await prisma.assignment.findMany({ where: { weekId: prevWeek.id } })
        : [];

      const result = runAssigner({
        weekId,
        users: users.map((u) => ({ id: u.id, isCook: u.isCook, isBarista: u.isBarista })),
        availability: availability.map((a) => ({
          userId: a.userId,
          day: a.day,
          slot: a.slot as Slot,
          available: a.available,
        })),
        requirements: requirements.map((r) => ({
          day: r.day,
          slot: r.slot as Slot,
          cooksNeeded: r.cooksNeeded,
          baristasNeeded: r.baristasNeeded,
        })),
        shiftCounts: shiftCounts.map((sc) => ({
          userId: sc.userId,
          shiftsThisWeek: sc.shiftsThisWeek,
        })),
        prevWeekAssignments: prevWeekAssignments.map((a) => ({
          userId: a.userId,
          day: a.day,
        })),
      });

      // Wipe existing assignments, insert new ones, and transition to draft — all atomic
      const rows = await prisma.$transaction(async (tx) => {
        await tx.assignment.deleteMany({ where: { weekId } });

        if (result.assignments.length > 0) {
          await tx.assignment.createMany({
            data: result.assignments.map((a) => ({
              weekId: a.weekId,
              userId: a.userId,
              day: a.day,
              slot: a.slot,
              roleWorking: a.roleWorking,
            })),
          });
        }

        // Only update status if not already draft (availability_closed → draft)
        if (status !== "draft") {
          await tx.week.update({ where: { id: weekId }, data: { status: "draft" } });
        }

        return tx.assignment.findMany({ where: { weekId } });
      });

      res.json({ assignments: rows.map(toAssignmentDto) });
    } catch (err) {
      next(err);
    }
  }
);

// POST /weeks/:weekId/assignments  { userId, day, slot, roleWorking }  (boss only)
router.post("/weeks/:weekId/assignments", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// DELETE /assignments/:id  (boss only)
router.delete("/assignments/:id", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
