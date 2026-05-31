import { Router } from "express";
import { requireLogin, requireBoss } from "../middleware/auth";

const router = Router();

// GET /weeks/:weekId/shift-counts  (boss only)
router.get("/weeks/:weekId/shift-counts", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// PATCH /weeks/:weekId/shift-counts/:userId  { shiftsThisWeek }  (boss only)
router.patch(
  "/weeks/:weekId/shift-counts/:userId",
  requireLogin,
  requireBoss,
  async (_req, res) => {
    res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
  }
);

export default router;
