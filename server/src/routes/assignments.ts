import { Router } from "express";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { runAssigner } from "../services/assigner";
import { SLOTS, ROLES_WORKING } from "../../../shared/types";
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
// Boss sees the schedule in any status; employees only once the week is published.
router.get("/weeks/:weekId/assignments", requireLogin, async (req, res, next) => {
  try {
    const weekId = parseInt(req.params.weekId, 10);
    if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    if (req.user!.role !== "boss" && week.status !== "published") {
      throw new HttpError(403, "Schedule is not published yet", "FORBIDDEN");
    }

    const rows = await prisma.assignment.findMany({ where: { weekId } });

    // Names for the assignees so employees can render the schedule without the
    // boss-only user list. Include soft-deleted users — historical shifts keep their name.
    const assigneeIds = [...new Set(rows.map((r) => r.userId))];
    const assignees = assigneeIds.length
      ? await prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true },
        })
      : [];

    res.json({ assignments: rows.map(toAssignmentDto), assignees });
  } catch (err) {
    next(err);
  }
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
// Manual override: enforces the hard invariants (role, no duplicate cell, no overstaffing)
// but lets the boss override availability, weekly shift count, and same-day double-booking.
router.post("/weeks/:weekId/assignments", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const weekId = parseInt(req.params.weekId, 10);
    if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");

    const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    const status = week.status as WeekStatus;
    if (status !== "draft" && status !== "published") {
      throw new HttpError(
        409,
        "Assignments can only be edited when the week is draft or published",
        "INVALID_STATE"
      );
    }

    const { userId, day, slot, roleWorking } = req.body as Record<string, unknown>;
    if (typeof userId !== "number" || !Number.isInteger(userId)) {
      throw new HttpError(400, "userId must be an integer", "VALIDATION_ERROR");
    }
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
      throw new HttpError(400, "day must be an integer 0–6", "VALIDATION_ERROR");
    }
    if (typeof slot !== "string" || !SLOTS.includes(slot as Slot)) {
      throw new HttpError(400, `slot must be one of: ${SLOTS.join(", ")}`, "VALIDATION_ERROR");
    }
    if (typeof roleWorking !== "string" || !ROLES_WORKING.includes(roleWorking as RoleWorking)) {
      throw new HttpError(
        400,
        `roleWorking must be one of: ${ROLES_WORKING.join(", ")}`,
        "VALIDATION_ERROR"
      );
    }
    const validSlot = slot as Slot;
    const validRole = roleWorking as RoleWorking;

    const user = await prisma.user.findUnique({
      where: { id: userId, isActive: true, isDeleted: false },
    });
    if (!user) throw new HttpError(400, "User not found or inactive", "VALIDATION_ERROR");

    // Hard constraint: user must actually have the role they'd fill.
    const hasRole = validRole === "cook" ? user.isCook : user.isBarista;
    if (!hasRole) {
      throw new HttpError(409, `User cannot work as ${validRole}`, "INVALID_STATE");
    }

    // Check-then-create atomically so a concurrent add can't exceed the cap.
    const assignment = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.assignment.findFirst({
        where: { weekId, userId, day, slot: validSlot },
      });
      if (duplicate) {
        throw new HttpError(409, "Already assigned to this slot", "INVALID_STATE");
      }

      const requirement = await tx.shiftRequirement.findUnique({
        where: { weekId_day_slot: { weekId, day, slot: validSlot } },
      });
      const cap = requirement
        ? validRole === "cook"
          ? requirement.cooksNeeded
          : requirement.baristasNeeded
        : 0;
      const assigned = await tx.assignment.count({
        where: { weekId, day, slot: validSlot, roleWorking: validRole },
      });
      if (assigned >= cap) {
        throw new HttpError(409, "Slot is already fully staffed", "INVALID_STATE");
      }

      return tx.assignment.create({
        data: { weekId, userId, day, slot: validSlot, roleWorking: validRole },
      });
    });

    res.status(201).json({ assignment: toAssignmentDto(assignment) });
  } catch (err) {
    next(err);
  }
});

// DELETE /assignments/:id  (boss only)
router.delete("/assignments/:id", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new HttpError(400, "Invalid assignment id", "VALIDATION_ERROR");

    const assignment = await prisma.assignment.findUnique({ where: { id } });
    if (!assignment) throw new HttpError(404, "Assignment not found", "NOT_FOUND");

    const week = await prisma.week.findUnique({
      where: { id: assignment.weekId, isDeleted: false },
    });
    if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");

    const status = week.status as WeekStatus;
    if (status !== "draft" && status !== "published") {
      throw new HttpError(
        409,
        "Assignments can only be edited when the week is draft or published",
        "INVALID_STATE"
      );
    }

    await prisma.assignment.delete({ where: { id } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
