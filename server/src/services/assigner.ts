// Pure function — no DB calls, no randomness, no Date.now().
// All time-dependent and DB-sourced data is passed in as plain objects.
// See DESIGN.md §4 for the full algorithm spec.

import type { Slot, RoleWorking } from "../../../shared/types";

export interface AssignerUser {
  id: number;
  isCook: boolean;
  isBarista: boolean;
}

export interface AssignerAvailability {
  userId: number;
  day: number;
  slot: Slot;
  available: boolean;
}

export interface AssignerShiftRequirement {
  day: number;
  slot: Slot;
  cooksNeeded: number;
  baristasNeeded: number;
}

export interface AssignerShiftCount {
  userId: number;
  shiftsThisWeek: number;
}

export interface AssignerPrevAssignment {
  userId: number;
  day: number; // used to detect prior weekend shifts (day >= 5)
}

export interface AssignerInput {
  weekId: number;
  users: AssignerUser[];
  availability: AssignerAvailability[];
  requirements: AssignerShiftRequirement[];
  shiftCounts: AssignerShiftCount[];
  prevWeekAssignments: AssignerPrevAssignment[];
}

export interface AssignerOutputAssignment {
  weekId: number;
  userId: number;
  day: number;
  slot: Slot;
  roleWorking: RoleWorking;
}

export interface AssignerOutput {
  assignments: AssignerOutputAssignment[];
}

// Internal type for an expanded "head" to fill
type SlotInstance = { day: number; slot: Slot; role: RoleWorking };

const SLOT_ORDER: Record<Slot, number> = { morning: 0, mid: 1, evening: 2 };

export function runAssigner(input: AssignerInput): AssignerOutput {
  const { weekId, users, availability, requirements, shiftCounts, prevWeekAssignments } = input;

  // ── Precompute lookups ────────────────────────────────────────────────────

  // Fast availability check: "userId-day-slot"
  const availSet = new Set<string>(
    availability.filter((a) => a.available).map((a) => `${a.userId}-${a.day}-${a.slot}`)
  );

  // Users absent from shiftCounts get an implicit cap of 0 (not schedulable this week)
  const shiftCap = new Map<number, number>(
    shiftCounts.map((sc) => [sc.userId, sc.shiftsThisWeek])
  );

  // Users who worked a weekend (day >= 5) the previous week
  const prevWeekendUsers = new Set<number>(
    prevWeekAssignments.filter((a) => a.day >= 5).map((a) => a.userId)
  );

  // ── Mutable per-run state ─────────────────────────────────────────────────

  const assignedCount = new Map<number, number>(users.map((u) => [u.id, 0]));
  const weekendCount = new Map<number, number>(users.map((u) => [u.id, 0]));
  // daysUsed enforces "at most one slot per day" (hard constraint 4)
  const daysUsed = new Map<number, Set<number>>(users.map((u) => [u.id, new Set()]));

  const output: AssignerOutputAssignment[] = [];

  // ── Helpers (all close over the state above) ──────────────────────────────

  // Scarcity = # users who have the role AND appear in availSet for (day, slot).
  // Computed on raw availability — does not reflect current assignment state.
  function countQualified(day: number, slot: Slot, role: RoleWorking): number {
    return users.filter((u) => {
      const hasRole = role === "cook" ? u.isCook : u.isBarista;
      return hasRole && availSet.has(`${u.id}-${day}-${slot}`);
    }).length;
  }

  // Returns every user who passes all hard constraints for this instance.
  function getCandidates(inst: SlotInstance): AssignerUser[] {
    return users.filter((u) => {
      const hasRole = inst.role === "cook" ? u.isCook : u.isBarista;
      if (!hasRole) return false;
      if (!availSet.has(`${u.id}-${inst.day}-${inst.slot}`)) return false;
      if (daysUsed.get(u.id)!.has(inst.day)) return false; // day-uniqueness (constraint 4)
      const cap = shiftCap.get(u.id) ?? 0;
      return (assignedCount.get(u.id) ?? 0) < cap;
    });
  }

  // Score per DESIGN §4 step 3b. Lower is better.
  function scoreCandidate(
    u: AssignerUser,
    inst: SlotInstance,
    hasPureForRole: boolean
  ): number {
    let score = (assignedCount.get(u.id) ?? 0) * 10;
    if (inst.day >= 5) {
      // Already has a weekend this week → heavily penalise (prefer sharing)
      if ((weekendCount.get(u.id) ?? 0) > 0) score += 100;
      // Had a weekend last week → mildly penalise
      if (prevWeekendUsers.has(u.id)) score += 5;
    }
    // Dual-role penalty: preserve flexibility for later, scarcer slots
    if (u.isCook && u.isBarista && hasPureForRole) score += 3;
    return score;
  }

  // Pick the lowest-scoring candidate; tiebreak by lowest userId.
  function pickBest(candidates: AssignerUser[], inst: SlotInstance): AssignerUser | null {
    if (candidates.length === 0) return null;
    // Precompute once per slot-instance whether a pure-role alternative exists
    const hasPureForRole = candidates.some((c) =>
      inst.role === "cook" ? c.isCook && !c.isBarista : c.isBarista && !c.isCook
    );
    let best = candidates[0];
    let bestScore = scoreCandidate(best, inst, hasPureForRole);
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const s = scoreCandidate(c, inst, hasPureForRole);
      if (s < bestScore || (s === bestScore && c.id < best.id)) {
        best = c;
        bestScore = s;
      }
    }
    return best;
  }

  function doAssign(u: AssignerUser, inst: SlotInstance): void {
    output.push({ weekId, userId: u.id, day: inst.day, slot: inst.slot, roleWorking: inst.role });
    assignedCount.set(u.id, (assignedCount.get(u.id) ?? 0) + 1);
    if (inst.day >= 5) weekendCount.set(u.id, (weekendCount.get(u.id) ?? 0) + 1);
    daysUsed.get(u.id)!.add(inst.day);
  }

  // ── 1. Expand requirements → slot-instances ───────────────────────────────
  // One entry per "head" needed. cooksNeeded=2 → two separate cook instances.

  const slotInstances: SlotInstance[] = [];
  for (const req of requirements) {
    for (let i = 0; i < req.cooksNeeded; i++) {
      slotInstances.push({ day: req.day, slot: req.slot, role: "cook" });
    }
    for (let i = 0; i < req.baristasNeeded; i++) {
      slotInstances.push({ day: req.day, slot: req.slot, role: "barista" });
    }
  }

  // ── 2. Static scarcity sort ───────────────────────────────────────────────
  // Tiebreak: day asc, slot order, cook before barista.

  slotInstances.sort((a, b) => {
    const scarDiff =
      countQualified(a.day, a.slot, a.role) - countQualified(b.day, b.slot, b.role);
    if (scarDiff !== 0) return scarDiff;
    if (a.day !== b.day) return a.day - b.day;
    const slotDiff = SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];
    if (slotDiff !== 0) return slotDiff;
    return a.role === b.role ? 0 : a.role === "cook" ? -1 : 1;
  });

  // ── 3. Greedy fill (single pass in scarcity order) ────────────────────────

  const unfilledInstances: SlotInstance[] = [];

  for (const inst of slotInstances) {
    const best = pickBest(getCandidates(inst), inst);
    if (best) {
      doAssign(best, inst);
    } else {
      unfilledInstances.push(inst);
    }
  }

  // ── 4. Second pass (defensive sweep, per spec step 4) ────────────────────
  // State has changed since pass 1; re-check unfilled instances.

  for (const inst of unfilledInstances) {
    const best = pickBest(getCandidates(inst), inst);
    if (best) doAssign(best, inst);
  }

  return { assignments: output };
}
