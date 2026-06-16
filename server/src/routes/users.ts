import { Router } from "express";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { requireLogin, requireBoss } from "../middleware/auth";
import { HttpError } from "../lib/errors";
import type { Role } from "../../../shared/types";

const router = Router();

const VALID_ROLES: Role[] = ["boss", "employee"];

function toDto(user: {
  id: number;
  name: string;
  username: string;
  role: string;
  isCook: boolean;
  isBarista: boolean;
  defaultShiftsPerWeek: number;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role as Role,
    isCook: user.isCook,
    isBarista: user.isBarista,
    defaultShiftsPerWeek: user.defaultShiftsPerWeek,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

// GET /users
router.get("/", requireLogin, requireBoss, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      orderBy: { name: "asc" },
    });
    res.json({ users: users.map(toDto) });
  } catch (err) {
    next(err);
  }
});

// POST /users
router.post("/", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const { name, username, password, role, isCook, isBarista, defaultShiftsPerWeek } =
      req.body as Record<string, unknown>;

    if (typeof name !== "string" || name.trim() === "") {
      throw new HttpError(400, "name is required", "VALIDATION_ERROR");
    }
    if (typeof username !== "string" || username.trim() === "") {
      throw new HttpError(400, "username is required", "VALIDATION_ERROR");
    }
    if (typeof password !== "string" || password.length < 6) {
      throw new HttpError(400, "password must be at least 6 characters", "VALIDATION_ERROR");
    }
    const resolvedRole: Role = role === undefined ? "employee" : (role as Role);
    if (!VALID_ROLES.includes(resolvedRole)) {
      throw new HttpError(400, "role must be 'boss' or 'employee'", "VALIDATION_ERROR");
    }
    if (typeof isCook !== "boolean") {
      throw new HttpError(400, "isCook must be a boolean", "VALIDATION_ERROR");
    }
    if (typeof isBarista !== "boolean") {
      throw new HttpError(400, "isBarista must be a boolean", "VALIDATION_ERROR");
    }
    if (typeof defaultShiftsPerWeek !== "number" || !Number.isInteger(defaultShiftsPerWeek) || defaultShiftsPerWeek < 0) {
      throw new HttpError(400, "defaultShiftsPerWeek must be a non-negative integer", "VALIDATION_ERROR");
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      throw new HttpError(409, "Username already taken", "USERNAME_TAKEN");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        username: username.trim(),
        passwordHash,
        role: resolvedRole,
        isCook,
        isBarista,
        defaultShiftsPerWeek,
      },
    });

    res.status(201).json({ user: toDto(user) });
  } catch (err) {
    next(err);
  }
});

// PATCH /users/:id
router.patch("/:id", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new HttpError(400, "Invalid user id", "VALIDATION_ERROR");

    const body = req.body as Record<string, unknown>;
    const data: {
      name?: string;
      isCook?: boolean;
      isBarista?: boolean;
      defaultShiftsPerWeek?: number;
      isActive?: boolean;
    } = {};

    if ("name" in body) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        throw new HttpError(400, "name must be a non-empty string", "VALIDATION_ERROR");
      }
      data.name = body.name.trim();
    }
    if ("isCook" in body) {
      if (typeof body.isCook !== "boolean") {
        throw new HttpError(400, "isCook must be a boolean", "VALIDATION_ERROR");
      }
      data.isCook = body.isCook;
    }
    if ("isBarista" in body) {
      if (typeof body.isBarista !== "boolean") {
        throw new HttpError(400, "isBarista must be a boolean", "VALIDATION_ERROR");
      }
      data.isBarista = body.isBarista;
    }
    if ("defaultShiftsPerWeek" in body) {
      if (
        typeof body.defaultShiftsPerWeek !== "number" ||
        !Number.isInteger(body.defaultShiftsPerWeek) ||
        body.defaultShiftsPerWeek < 0
      ) {
        throw new HttpError(400, "defaultShiftsPerWeek must be a non-negative integer", "VALIDATION_ERROR");
      }
      data.defaultShiftsPerWeek = body.defaultShiftsPerWeek;
    }
    if ("isActive" in body) {
      if (typeof body.isActive !== "boolean") {
        throw new HttpError(400, "isActive must be a boolean", "VALIDATION_ERROR");
      }
      data.isActive = body.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new HttpError(400, "No valid fields to update", "VALIDATION_ERROR");
    }

    const user = await prisma.user.update({
      where: { id, isDeleted: false },
      data,
    });

    res.json({ user: toDto(user) });
  } catch (err) {
    next(err);
  }
});

// POST /users/:id/reset-password
router.post("/:id/reset-password", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new HttpError(400, "Invalid user id", "VALIDATION_ERROR");

    const { newPassword } = req.body as Record<string, unknown>;
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      throw new HttpError(400, "newPassword must be at least 6 characters", "VALIDATION_ERROR");
    }

    const exists = await prisma.user.findUnique({ where: { id, isDeleted: false } });
    if (!exists) throw new HttpError(404, "User not found", "NOT_FOUND");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id
router.delete("/:id", requireLogin, requireBoss, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new HttpError(400, "Invalid user id", "VALIDATION_ERROR");

    if (id === req.user!.id) {
      throw new HttpError(403, "You cannot delete your own account", "CANNOT_DELETE_SELF");
    }

    const { password } = req.body as Record<string, unknown>;
    if (typeof password !== "string" || password === "") {
      throw new HttpError(400, "password is required", "VALIDATION_ERROR");
    }

    const valid = await bcrypt.compare(password, req.user!.passwordHash);
    if (!valid) {
      throw new HttpError(403, "Incorrect password", "INVALID_PASSWORD");
    }

    const target = await prisma.user.findUnique({ where: { id, isDeleted: false } });
    if (!target) throw new HttpError(404, "User not found", "NOT_FOUND");

    await prisma.user.update({ where: { id }, data: { isDeleted: true } });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
