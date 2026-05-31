// Shared types imported by both server and client via relative paths.
// Server uses these alongside Prisma-derived types; client uses them for API shapes.

export type Role = "boss" | "employee";
export type WeekStatus =
  | "availability_open"
  | "availability_closed"
  | "draft"
  | "published";
export type Slot = "morning" | "mid" | "evening";
export type RoleWorking = "cook" | "barista";

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
