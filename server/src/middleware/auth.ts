import type { RequestHandler } from "express";
import type { User } from "@prisma/client";
import type { Role } from "../../../shared/types";
import prisma from "../lib/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Augment express-session so req.session.userId / role are typed everywhere
declare module "express-session" {
  interface SessionData {
    userId: number;
    role: Role;
  }
}

export const requireLogin: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user || !user.isActive || user.isDeleted) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
      return;
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// Must be composed after requireLogin
export const requireBoss: RequestHandler = (req, res, next) => {
  if (req.session.role !== "boss") {
    res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    return;
  }
  next();
};
