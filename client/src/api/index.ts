import type { UserDto, ApiError } from "@shared/types";

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
  },
};
