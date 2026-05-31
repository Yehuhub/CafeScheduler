import { Router } from "express";
import { requireLogin, requireBoss } from "../middleware/auth";

const router = Router();

// GET /weeks
router.get("/", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// GET /weeks/current — must come before /:id
router.get("/current", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// GET /weeks/:id
router.get("/:id", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// POST /weeks  (boss only)
router.post("/", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// PATCH /weeks/:id/status  (boss only)
router.patch("/:id/status", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// GET /weeks/:weekId/dashboard  (boss only)
router.get("/:weekId/dashboard", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// GET /weeks/:weekId/export.pdf
router.get("/:weekId/export.pdf", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
