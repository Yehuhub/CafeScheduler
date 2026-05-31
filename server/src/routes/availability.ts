import { Router } from "express";
import { requireLogin, requireBoss } from "../middleware/auth";

const router = Router();

// GET /weeks/:weekId/availability  (boss only — sees all employees)
router.get("/weeks/:weekId/availability", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// GET /weeks/:weekId/availability/me
router.get("/weeks/:weekId/availability/me", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// PUT /weeks/:weekId/availability/me  { entries: [...] }
router.put("/weeks/:weekId/availability/me", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
