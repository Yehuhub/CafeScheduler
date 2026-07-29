import { Router } from "express";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import { isPastWeek } from "../../../shared/weekDates";
import type { ShiftDto } from "../../../shared/types";

const router = Router();

function toShiftDto(row: {
  id: number;
  weekId: number;
  name: string;
  startTime: string;
}): ShiftDto {
  return { id: row.id, weekId: row.weekId, name: row.name, startTime: row.startTime };
}

// "HH:MM", 00:00–23:59
function isValidStartTime(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(":").map((n) => parseInt(n, 10));
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// Loads a non-deleted week, or throws 404. Shared by every handler below.
async function loadWeek(weekIdRaw: string) {
  const weekId = parseInt(weekIdRaw, 10);
  if (isNaN(weekId)) throw new HttpError(400, "Invalid week id", "VALIDATION_ERROR");
  const week = await prisma.week.findUnique({ where: { id: weekId, isDeleted: false } });
  if (!week) throw new HttpError(404, "Week not found", "NOT_FOUND");
  return { weekId, week };
}

// GET /weeks/:weekId/shifts  (any logged-in user — employees need shift metadata to render
// their availability grid and the published schedule; only name/startTime/running-days are
// exposed, never the boss-only headcount numbers). Each shift carries `days`: the days it
// actually runs (has a non-zero requirement), so the availability grid offers only real cells.
router.get("/weeks/:weekId/shifts", requireLogin, async (req, res, next) => {
  try {
    const { weekId } = await loadWeek(req.params.weekId);
    const [rows, reqs] = await Promise.all([
      prisma.shift.findMany({
        where: { weekId },
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
      }),
      prisma.shiftRequirement.findMany({
        where: { weekId },
        select: { shiftId: true, day: true, cooksNeeded: true, baristasNeeded: true },
      }),
    ]);

    const daysByShift = new Map<number, Set<number>>();
    const cookDaysByShift = new Map<number, Set<number>>();
    const baristaDaysByShift = new Map<number, Set<number>>();
    const addDay = (map: Map<number, Set<number>>, shiftId: number, day: number) => {
      let set = map.get(shiftId);
      if (!set) map.set(shiftId, (set = new Set()));
      set.add(day);
    };
    for (const r of reqs) {
      if (r.cooksNeeded > 0 || r.baristasNeeded > 0) addDay(daysByShift, r.shiftId, r.day);
      if (r.cooksNeeded > 0) addDay(cookDaysByShift, r.shiftId, r.day);
      if (r.baristasNeeded > 0) addDay(baristaDaysByShift, r.shiftId, r.day);
    }
    const sortedDays = (map: Map<number, Set<number>>, shiftId: number) =>
      [...(map.get(shiftId) ?? [])].sort((a, b) => a - b);

    res.json({
      shifts: rows.map((s) => ({
        ...toShiftDto(s),
        days: sortedDays(daysByShift, s.id),
        cookDays: sortedDays(cookDaysByShift, s.id),
        baristaDays: sortedDays(baristaDaysByShift, s.id),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /weeks/:weekId/shifts  { name, startTime }  (boss only)
router.post("/weeks/:weekId/shifts", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const { weekId, week } = await loadWeek(req.params.weekId);
    if (isPastWeek(week.startDate)) {
      throw new HttpError(409, "This week has ended and can no longer be edited", "WEEK_ENDED");
    }

    const { name, startTime } = req.body as Record<string, unknown>;
    if (typeof name !== "string" || name.trim() === "") {
      throw new HttpError(400, "name must be a non-empty string", "VALIDATION_ERROR");
    }
    if (!isValidStartTime(startTime)) {
      throw new HttpError(400, "startTime must be a valid HH:MM time", "VALIDATION_ERROR");
    }

    const trimmed = name.trim();
    const existing = await prisma.shift.findUnique({
      where: { weekId_name: { weekId, name: trimmed } },
    });
    if (existing) {
      throw new HttpError(409, "A shift with this name already exists this week", "ALREADY_EXISTS");
    }

    const shift = await prisma.shift.create({
      data: { weekId, name: trimmed, startTime },
    });
    res.status(201).json({ shift: toShiftDto(shift) });
  } catch (err) {
    next(err);
  }
});

// PATCH /weeks/:weekId/shifts/:shiftId  { name?, startTime? }  (boss only)
router.patch(
  "/weeks/:weekId/shifts/:shiftId",
  requireLogin,
  requireBoss,
  async (req, res, next) => {
    try {
      const { weekId, week } = await loadWeek(req.params.weekId);
      if (isPastWeek(week.startDate)) {
        throw new HttpError(409, "This week has ended and can no longer be edited", "WEEK_ENDED");
      }

      const shiftId = parseInt(req.params.shiftId, 10);
      if (isNaN(shiftId)) throw new HttpError(400, "Invalid shift id", "VALIDATION_ERROR");
      const shift = await prisma.shift.findFirst({ where: { id: shiftId, weekId } });
      if (!shift) throw new HttpError(404, "Shift not found", "NOT_FOUND");

      const { name, startTime } = req.body as Record<string, unknown>;
      const data: { name?: string; startTime?: string } = {};

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim() === "") {
          throw new HttpError(400, "name must be a non-empty string", "VALIDATION_ERROR");
        }
        const trimmed = name.trim();
        const clash = await prisma.shift.findUnique({
          where: { weekId_name: { weekId, name: trimmed } },
        });
        if (clash && clash.id !== shiftId) {
          throw new HttpError(
            409,
            "A shift with this name already exists this week",
            "ALREADY_EXISTS"
          );
        }
        data.name = trimmed;
      }
      if (startTime !== undefined) {
        if (!isValidStartTime(startTime)) {
          throw new HttpError(400, "startTime must be a valid HH:MM time", "VALIDATION_ERROR");
        }
        data.startTime = startTime;
      }

      const updated = await prisma.shift.update({ where: { id: shiftId }, data });
      res.json({ shift: toShiftDto(updated) });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /weeks/:weekId/shifts/:shiftId  (boss only)
// Cascade-deletes the shift's requirements, availability, and assignments (schema onDelete).
router.delete(
  "/weeks/:weekId/shifts/:shiftId",
  requireLogin,
  requireBoss,
  async (req, res, next) => {
    try {
      const { weekId, week } = await loadWeek(req.params.weekId);
      if (isPastWeek(week.startDate)) {
        throw new HttpError(409, "This week has ended and can no longer be edited", "WEEK_ENDED");
      }

      const shiftId = parseInt(req.params.shiftId, 10);
      if (isNaN(shiftId)) throw new HttpError(400, "Invalid shift id", "VALIDATION_ERROR");
      const shift = await prisma.shift.findFirst({ where: { id: shiftId, weekId } });
      if (!shift) throw new HttpError(404, "Shift not found", "NOT_FOUND");

      await prisma.shift.delete({ where: { id: shiftId } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
