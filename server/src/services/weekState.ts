import type { WeekStatus } from "../../../shared/types";

// Legal forward and backward transitions per the state machine in DESIGN.md §3
const VALID_TRANSITIONS: Record<WeekStatus, WeekStatus[]> = {
  availability_open: ["availability_closed"],
  availability_closed: ["availability_open", "draft"],
  draft: ["availability_open", "published"],
  published: [], // published never goes backward; edits happen in-place
};

export function isValidTransition(from: WeekStatus, to: WeekStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// Returns true when transitioning back to availability_open from draft wipes existing assignments
export function wipesAssignments(from: WeekStatus, to: WeekStatus): boolean {
  return from === "draft" && to === "availability_open";
}
