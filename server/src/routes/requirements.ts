import { Router } from "express";
import { requireLogin, requireBoss } from "../middleware/auth";

const router = Router();

// GET /weeks/:weekId/requirements  (boss only)
router.get("/weeks/:weekId/requirements", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// PUT /weeks/:weekId/requirements  { entries: [...] }  (boss only)
router.put("/weeks/:weekId/requirements", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
