import { describe, it, expect } from "vitest";
import { runAssigner } from "../../src/services/assigner";
import type { AssignerInput, AssignerOutputAssignment } from "../../src/services/assigner";

// ── Shift fixtures ──────────────────────────────────────────────────────────
// Named shifts are now dynamic per week; tests use fixed ids + start times.
// Start time drives the scarcity-sort tiebreak (replaces the old fixed SLOT_ORDER).
const MORNING = { id: 1, startTime: "06:00" };
const EVENING = { id: 3, startTime: "13:00" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<AssignerInput> = {}): AssignerInput {
  return {
    weekId: 1,
    users: [],
    availability: [],
    requirements: [],
    shiftCounts: [],
    prevWeekAssignments: [],
    ...overrides,
  };
}

/** Shorthand: a shift requirement for one day. */
function req(
  day: number,
  shift: { id: number; startTime: string },
  cooksNeeded: number,
  baristasNeeded: number
) {
  return { day, shiftId: shift.id, startTime: shift.startTime, cooksNeeded, baristasNeeded };
}

/** Shorthand: produce an available=true availability entry */
function avail(userId: number, day: number, shift: { id: number }) {
  return { userId, day, shiftId: shift.id, available: true };
}

function assignmentsFor(
  assignments: AssignerOutputAssignment[],
  userId: number
): AssignerOutputAssignment[] {
  return assignments.filter((a) => a.userId === userId);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAssigner", () => {
  // 1. Basic assignment
  it("places a cook and a barista into a single slot", () => {
    const input = makeInput({
      users: [
        { id: 1, isCook: true, isBarista: false },
        { id: 2, isCook: false, isBarista: true },
      ],
      requirements: [req(0, MORNING, 1, 1)],
      availability: [avail(1, 0, MORNING), avail(2, 0, MORNING)],
      shiftCounts: [
        { userId: 1, shiftsThisWeek: 3 },
        { userId: 2, shiftsThisWeek: 3 },
      ],
    });

    const { assignments } = runAssigner(input);

    expect(assignments).toHaveLength(2);
    const cook = assignments.find((a) => a.roleWorking === "cook");
    const barista = assignments.find((a) => a.roleWorking === "barista");
    expect(cook?.userId).toBe(1);
    expect(barista?.userId).toBe(2);
    expect(cook?.day).toBe(0);
    expect(cook?.shiftId).toBe(MORNING.id);
  });

  // 2. Understaffing
  it("assigns fewer than needed without throwing when supply is short", () => {
    const input = makeInput({
      users: [{ id: 1, isCook: true, isBarista: false }],
      requirements: [req(0, MORNING, 2, 0)],
      availability: [avail(1, 0, MORNING)],
      shiftCounts: [{ userId: 1, shiftsThisWeek: 5 }],
    });

    const { assignments } = runAssigner(input);

    // 2 cooks needed, only 1 available → 1 assignment, no error, no overstaffing
    expect(assignments).toHaveLength(1);
    expect(assignments[0].roleWorking).toBe("cook");
  });

  // 3. Day-uniqueness (hard constraint 4)
  it("never assigns the same person to more than one slot on the same day", () => {
    const input = makeInput({
      users: [{ id: 1, isCook: true, isBarista: false }],
      requirements: [req(0, MORNING, 1, 0), req(0, EVENING, 1, 0)],
      availability: [avail(1, 0, MORNING), avail(1, 0, EVENING)],
      shiftCounts: [{ userId: 1, shiftsThisWeek: 5 }],
    });

    const { assignments } = runAssigner(input);

    // User qualifies for both but day-uniqueness allows only one
    expect(assignments).toHaveLength(1);
    expect(assignments[0].userId).toBe(1);
  });

  // 4a. Cap respected: shiftsThisWeek=1 → exactly 1 assignment across two eligible days
  it("does not schedule a user beyond their WeeklyShiftCount cap", () => {
    const input = makeInput({
      users: [{ id: 1, isCook: true, isBarista: false }],
      requirements: [req(0, MORNING, 1, 0), req(1, MORNING, 1, 0)],
      availability: [avail(1, 0, MORNING), avail(1, 1, MORNING)],
      shiftCounts: [{ userId: 1, shiftsThisWeek: 1 }],
    });

    const { assignments } = runAssigner(input);

    expect(assignmentsFor(assignments, 1)).toHaveLength(1);
  });

  // 4b. Cap=0 → never scheduled
  it("never schedules a user whose shiftsThisWeek is 0", () => {
    const input = makeInput({
      users: [{ id: 1, isCook: true, isBarista: false }],
      requirements: [req(0, MORNING, 1, 0)],
      availability: [avail(1, 0, MORNING)],
      shiftCounts: [{ userId: 1, shiftsThisWeek: 0 }],
    });

    const { assignments } = runAssigner(input);

    expect(assignments).toHaveLength(0);
  });

  // 4c. Missing shift-count row → treated as cap 0, never scheduled
  it("never schedules a user who has no WeeklyShiftCount row", () => {
    const input = makeInput({
      users: [{ id: 1, isCook: true, isBarista: false }],
      requirements: [req(0, MORNING, 1, 0)],
      availability: [avail(1, 0, MORNING)],
      shiftCounts: [], // no row for user 1
    });

    const { assignments } = runAssigner(input);

    expect(assignments).toHaveLength(0);
  });

  // 5. Dual-role packing (+3 penalty on dual-role candidate when pure-role exists)
  it("prefers a pure-role user over a dual-role user for the same slot", () => {
    // Both available for the cook slot. The dual user gets +3; pure cook wins.
    const input = makeInput({
      users: [
        { id: 1, isCook: true, isBarista: false }, // pure cook
        { id: 2, isCook: true, isBarista: true },  // dual
      ],
      requirements: [req(0, MORNING, 1, 0)],
      availability: [avail(1, 0, MORNING), avail(2, 0, MORNING)],
      shiftCounts: [
        { userId: 1, shiftsThisWeek: 3 },
        { userId: 2, shiftsThisWeek: 3 },
      ],
    });

    const { assignments } = runAssigner(input);

    expect(assignments).toHaveLength(1);
    expect(assignments[0].userId).toBe(1); // pure cook wins over dual
    expect(assignments[0].roleWorking).toBe("cook");
  });

  // 6a. Weekend rotation: user who had weekend last week is deprioritised (+5)
  it("prefers a user without a prior weekend when a weekend slot is scarce", () => {
    // Day 5 = Friday. User 1 worked a weekend last week → +5 penalty.
    const input = makeInput({
      users: [
        { id: 1, isCook: true, isBarista: false },
        { id: 2, isCook: true, isBarista: false },
      ],
      requirements: [req(5, MORNING, 1, 0)],
      availability: [avail(1, 5, MORNING), avail(2, 5, MORNING)],
      shiftCounts: [
        { userId: 1, shiftsThisWeek: 3 },
        { userId: 2, shiftsThisWeek: 3 },
      ],
      prevWeekAssignments: [{ userId: 1, day: 5 }], // user 1 had a weekend last week
    });

    const { assignments } = runAssigner(input);

    expect(assignments).toHaveLength(1);
    expect(assignments[0].userId).toBe(2); // user 2 preferred — no prior weekend
  });

  // 6b. Weekend rotation: second weekend shift heavily penalised (+100)
  //     With two weekend slots, each person should get one.
  it("gives each person at most one weekend shift when possible", () => {
    // Two weekend slots; both users eligible for both.
    // User 1 gets day 5 first (lower id, tied score=0). Then day 6:
    // user 1 has +100 (already has weekend this week), user 2 has 0 → user 2 wins.
    const input = makeInput({
      users: [
        { id: 1, isCook: true, isBarista: false },
        { id: 2, isCook: true, isBarista: false },
      ],
      requirements: [req(5, MORNING, 1, 0), req(6, MORNING, 1, 0)],
      availability: [
        avail(1, 5, MORNING), avail(2, 5, MORNING),
        avail(1, 6, MORNING), avail(2, 6, MORNING),
      ],
      shiftCounts: [
        { userId: 1, shiftsThisWeek: 3 },
        { userId: 2, shiftsThisWeek: 3 },
      ],
    });

    const { assignments } = runAssigner(input);

    expect(assignments).toHaveLength(2);
    // One weekend shift each — not both to the same person
    const userIds = assignments.map((a) => a.userId).sort((a, b) => a - b);
    expect(userIds).toEqual([1, 2]);
  });

  // 7. Overstaffing never (hard constraint 6)
  it("never assigns more people than the slot requires", () => {
    const input = makeInput({
      users: [
        { id: 1, isCook: true, isBarista: false },
        { id: 2, isCook: true, isBarista: false },
        { id: 3, isCook: true, isBarista: false },
      ],
      requirements: [req(0, MORNING, 1, 0)],
      availability: [
        avail(1, 0, MORNING),
        avail(2, 0, MORNING),
        avail(3, 0, MORNING),
      ],
      shiftCounts: [
        { userId: 1, shiftsThisWeek: 3 },
        { userId: 2, shiftsThisWeek: 3 },
        { userId: 3, shiftsThisWeek: 3 },
      ],
    });

    const { assignments } = runAssigner(input);

    expect(assignments).toHaveLength(1); // exactly cooksNeeded=1, never more
  });

  // 8. Dynamic-shift ordering: with equal scarcity, the earlier-startTime shift is
  //    filled first (replaces the old fixed morning<mid<evening SLOT_ORDER).
  it("fills the earlier-startTime shift first when scarcity ties", () => {
    const EARLY = { id: 7, startTime: "08:00" };
    const LATE = { id: 8, startTime: "09:00" };
    // One user, eligible for both same-day shifts, each needs 1 cook. Day-uniqueness
    // allows only one assignment — it should land on the earlier shift.
    const input = makeInput({
      users: [{ id: 1, isCook: true, isBarista: false }],
      requirements: [req(0, LATE, 1, 0), req(0, EARLY, 1, 0)],
      availability: [avail(1, 0, EARLY), avail(1, 0, LATE)],
      shiftCounts: [{ userId: 1, shiftsThisWeek: 5 }],
    });

    const { assignments } = runAssigner(input);

    expect(assignments).toHaveLength(1);
    expect(assignments[0].shiftId).toBe(EARLY.id);
  });

  // 9a. Determinism: same input → identical output on repeated runs
  it("produces identical output on every run with the same input", () => {
    const input = makeInput({
      users: [
        { id: 1, isCook: true, isBarista: false },
        { id: 2, isCook: false, isBarista: true },
        { id: 3, isCook: true, isBarista: true },
      ],
      requirements: [
        req(0, MORNING, 1, 1),
        req(1, EVENING, 1, 0),
        req(5, MORNING, 1, 1),
      ],
      availability: [
        avail(1, 0, MORNING), avail(2, 0, MORNING), avail(3, 0, MORNING),
        avail(1, 1, EVENING), avail(3, 1, EVENING),
        avail(1, 5, MORNING), avail(2, 5, MORNING), avail(3, 5, MORNING),
      ],
      shiftCounts: [
        { userId: 1, shiftsThisWeek: 3 },
        { userId: 2, shiftsThisWeek: 3 },
        { userId: 3, shiftsThisWeek: 3 },
      ],
      prevWeekAssignments: [{ userId: 2, day: 5 }],
    });

    const first = runAssigner(input);
    const second = runAssigner(input);

    expect(first.assignments).toEqual(second.assignments);
  });

  // 9b. userId tiebreaker: when scores are equal, lowest userId always wins
  it("picks the lowest userId when all scores are tied", () => {
    // Users provided in non-id order to verify the tiebreak is on id, not array index
    const input = makeInput({
      users: [
        { id: 3, isCook: true, isBarista: false },
        { id: 1, isCook: true, isBarista: false },
        { id: 2, isCook: true, isBarista: false },
      ],
      requirements: [req(0, MORNING, 1, 0)],
      availability: [
        avail(1, 0, MORNING),
        avail(2, 0, MORNING),
        avail(3, 0, MORNING),
      ],
      shiftCounts: [
        { userId: 1, shiftsThisWeek: 3 },
        { userId: 2, shiftsThisWeek: 3 },
        { userId: 3, shiftsThisWeek: 3 },
      ],
    });

    const { assignments } = runAssigner(input);

    expect(assignments[0].userId).toBe(1); // lowest id wins
  });
});
