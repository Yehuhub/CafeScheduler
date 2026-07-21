// Shared types imported by both server and client via relative paths.
// Server uses these alongside Prisma-derived types; client uses them for API shapes.

export type Role = "boss" | "employee";
export type WeekStatus =
  | "availability_open"
  | "availability_closed"
  | "draft"
  | "published";
export const SLOTS = ["morning", "mid", "evening"] as const;
export type Slot = (typeof SLOTS)[number];

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

export interface AvailabilityDto {
  id: number;
  weekId: number;
  userId: number;
  day: number;
  slot: Slot;
  available: boolean;
}

export interface ShiftRequirementDto {
  id: number;
  weekId: number;
  day: number;
  slot: Slot;
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
  slot: Slot;
  roleWorking: RoleWorking;
  createdAt: string;
}

// Minimal name lookup returned alongside a week's assignments so employees can
// render the full published schedule without access to the boss-only user roster.
export interface AssigneeDto {
  id: number;
  name: string;
}

export interface DashboardDto {
  filledCount: number;
  totalActiveUsers: number;
  unfilledUsers: Array<{ id: number; name: string }>;
  understaffedSlots: Array<{
    day: number;
    slot: Slot;
    role: RoleWorking;
    needed: number;
    assigned: number;
  }>;
}

export interface ApiError {
  error: string;
  code: string;
}
