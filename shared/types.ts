// Shared types imported by both server and client via relative paths.
// Server uses these alongside Prisma-derived types; client uses them for API shapes.

export type Role = "boss" | "employee";
export type WeekStatus =
  | "availability_open"
  | "availability_closed"
  | "draft"
  | "published";
export const ROLES_WORKING = ["cook", "barista"] as const;
export type RoleWorking = (typeof ROLES_WORKING)[number];

// DTO shapes returned by the API (no passwordHash, dates as ISO strings)

export interface UserDto {
  id: number;
  name: string;
  username: string;
  role: Role;
  isCook: boolean;
  isBarista: boolean;
  defaultShiftsPerWeek: number;
  isActive: boolean;
  createdAt: string;
}

export interface WeekDto {
  id: number;
  startDate: string;
  status: WeekStatus;
  createdAt: string;
  publishedAt: string | null;
}

// A boss-defined named shift within a week. `startTime` is "HH:MM" and drives the
// chronological ordering of shifts in grids and the exported schedule.
export interface ShiftDto {
  id: number;
  weekId: number;
  name: string;
  startTime: string;
}

// GET /weeks/:weekId/shifts augments each shift with the days it actually runs
// (has a non-zero requirement) so the availability grid can offer only real cells.
export interface ShiftWithDaysDto extends ShiftDto {
  days: number[]; // 0–6, sorted ascending
}

export interface AvailabilityDto {
  id: number;
  weekId: number;
  userId: number;
  day: number;
  shiftId: number;
  available: boolean;
}

export interface ShiftRequirementDto {
  id: number;
  weekId: number;
  day: number;
  shiftId: number;
  cooksNeeded: number;
  baristasNeeded: number;
}

export interface WeeklyShiftCountDto {
  id: number;
  weekId: number;
  userId: number;
  shiftsThisWeek: number;
}

export interface AssignmentDto {
  id: number;
  weekId: number;
  userId: number;
  day: number;
  shiftId: number;
  roleWorking: RoleWorking;
  createdAt: string;
}

// Minimal name lookup returned alongside a week's assignments so employees can
// render the full published schedule without access to the boss-only user roster.
export interface AssigneeDto {
  id: number;
  name: string;
}

export interface ApiError {
  error: string;
  code: string;
}
