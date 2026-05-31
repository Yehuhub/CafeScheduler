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

export function runAssigner(_input: AssignerInput): AssignerOutput {
  // TODO: implement greedy slot-first algorithm from DESIGN.md §4
  throw new Error("Assigner not yet implemented");
}
