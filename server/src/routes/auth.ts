import { Router } from "express";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { HttpError } from "../lib/errors";
import { requireLogin } from "../middleware/auth";
import type { Role } from "../../../shared/types";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body as { username?: unknown; password?: unknown };
    if (typeof username !== "string" || typeof password !== "string") {
      throw new HttpError(400, "username and password are required", "VALIDATION_ERROR");
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }
    req.session.userId = user.id;
    req.session.role = user.role as Role;
    const { passwordHash: _pw, ...userDto } = user;
    res.json({ user: userDto });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.status(204).end();
  });
});

router.get("/me", requireLogin, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.session.userId },
    });
    const { passwordHash: _pw, ...userDto } = user;
    res.json({ user: userDto });
  } catch (err) {
    next(err);
  }
});

export default router;
