import type { UserDto, WeekDto, WeekStatus, AvailabilityDto, Slot, RoleWorking, ShiftRequirementDto, WeeklyShiftCountDto, AssignmentDto, AssigneeDto, ApiError } from "@shared/types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({
      error: "Unknown error",
      code: "UNKNOWN",
    }))) as ApiError;
    throw new Error(body.error);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  role: "boss" | "employee";
  isCook: boolean;
  isBarista: boolean;
  defaultShiftsPerWeek: number;
}

export interface ShiftRequirementEntryInput {
  day: number;
  slot: Slot;
  cooksNeeded: number;
  baristasNeeded: number;
}

export interface AvailabilityEntryInput {
  day: number;
  slot: Slot;
  available: boolean;
}

export interface AssignmentInput {
  userId: number;
  day: number;
  slot: Slot;
  roleWorking: RoleWorking;
}

export interface UpdateUserInput {
  name?: string;
  isCook?: boolean;
  isBarista?: boolean;
  defaultShiftsPerWeek?: number;
  isActive?: boolean;
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ user: UserDto }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request<void>("/auth/logout", { method: "POST" }),
    me: () => request<{ user: UserDto }>("/auth/me"),
  },

  users: {
    list: () => request<{ users: UserDto[] }>("/users"),
    create: (data: CreateUserInput) =>
      request<{ user: UserDto }>("/users", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: UpdateUserInput) =>
      request<{ user: UserDto }>(`/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    resetPassword: (id: number, newPassword: string) =>
      request<void>(`/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      }),
    delete: (id: number, password: string) =>
      request<void>(`/users/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ password }),
      }),
  },

  weeks: {
    list: () => request<{ weeks: WeekDto[] }>("/weeks"),
    current: () => request<{ week: WeekDto | null }>("/weeks/current"),
    create: () => request<{ week: WeekDto }>("/weeks", { method: "POST" }),
    updateStatus: (id: number, status: WeekStatus) =>
      request<{ week: WeekDto }>(`/weeks/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    delete: (id: number, password: string) =>
      request<void>(`/weeks/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ password }),
      }),
    // Direct browser navigation (opened in a new tab) — sends the session cookie.
    // Not a fetch; returns the URL so components don't hand-build it.
    exportUrl: (id: number, format: "html" | "pdf" = "html") =>
      `${BASE}/weeks/${id}/export.${format}`,
  },

  requirements: {
    get: (weekId: number) =>
      request<{ requirements: ShiftRequirementDto[] }>(`/weeks/${weekId}/requirements`),
    put: (weekId: number, entries: ShiftRequirementEntryInput[]) =>
      request<{ requirements: ShiftRequirementDto[] }>(`/weeks/${weekId}/requirements`, {
        method: "PUT",
        body: JSON.stringify({ entries }),
      }),
  },

  assignments: {
    list: (weekId: number) =>
      request<{ assignments: AssignmentDto[]; assignees: AssigneeDto[] }>(
        `/weeks/${weekId}/assignments`
      ),
    add: (weekId: number, input: AssignmentInput) =>
      request<{ assignment: AssignmentDto }>(`/weeks/${weekId}/assignments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      request<void>(`/assignments/${id}`, { method: "DELETE" }),
    runAssigner: (weekId: number) =>
      request<{ assignments: AssignmentDto[] }>(
        `/weeks/${weekId}/assignments/run-assigner`,
        { method: "POST" }
      ),
  },

  shiftCounts: {
    get: (weekId: number) =>
      request<{ shiftCounts: WeeklyShiftCountDto[] }>(`/weeks/${weekId}/shift-counts`),
    patch: (weekId: number, userId: number, shiftsThisWeek: number) =>
      request<{ shiftCount: WeeklyShiftCountDto }>(
        `/weeks/${weekId}/shift-counts/${userId}`,
        { method: "PATCH", body: JSON.stringify({ shiftsThisWeek }) }
      ),
  },

  availability: {
    getAll: (weekId: number) =>
      request<{ availability: AvailabilityDto[] }>(`/weeks/${weekId}/availability`),
    getMine: (weekId: number) =>
      request<{ availability: AvailabilityDto[] }>(`/weeks/${weekId}/availability/me`),
    putMine: (weekId: number, entries: AvailabilityEntryInput[]) =>
      request<{ availability: AvailabilityDto[] }>(`/weeks/${weekId}/availability/me`, {
        method: "PUT",
        body: JSON.stringify({ entries }),
      }),
  },
};
