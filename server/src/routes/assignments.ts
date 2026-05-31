import { Router } from "express";
import { requireLogin, requireBoss } from "../middleware/auth";

const router = Router();

// GET /weeks/:weekId/assignments
// Employees may only see assignments once published (enforced in implementation)
router.get("/weeks/:weekId/assignments", requireLogin, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// POST /weeks/:weekId/assignments/run-assigner  (boss only)
// Must be declared before /:weekId/assignments to avoid route shadowing
router.post(
  "/weeks/:weekId/assignments/run-assigner",
  requireLogin,
  requireBoss,
  async (_req, res) => {
    res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
  }
);

// POST /weeks/:weekId/assignments  { userId, day, slot, roleWorking }  (boss only)
router.post("/weeks/:weekId/assignments", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

// DELETE /assignments/:id  (boss only)
router.delete("/assignments/:id", requireLogin, requireBoss, async (_req, res) => {
  res.status(501).json({ error: "Not implemented", code: "NOT_IMPLEMENTED" });
});

export default router;
