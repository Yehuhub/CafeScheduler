import type { RequestHandler } from "express";
import type { Role } from "../../../shared/types";

// Augment express-session so req.session.userId / role are typed everywhere
declare module "express-session" {
  interface SessionData {
    userId: number;
    role: Role;
  }
}

// Callers that need a deactivated-user check should re-query the DB themselves;
// this middleware only validates that a session exists.
export const requireLogin: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
    return;
  }
  next();
};

// Must be composed after requireLogin
export const requireBoss: RequestHandler = (req, res, next) => {
  if (req.session.role !== "boss") {
    res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    return;
  }
  next();
};
