import type { UserDto, ApiError } from "../../../shared/types";

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
  return res.json() as Promise<T>;
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
};
