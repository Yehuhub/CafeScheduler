import { Router } from "express";
import { requireLogin, requireBoss } from "../middleware/auth";

const router = Router();

// GET /users
router.get("/", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// POST /users
router.post("/", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// PATCH /users/:id
router.patch("/:id", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// POST /users/:id/reset-password
router.post("/:id/reset-password", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
