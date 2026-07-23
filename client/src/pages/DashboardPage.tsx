import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import BossNav from "../components/BossNav";
import ReviewScheduleModal from "../components/ReviewScheduleModal";
import { api } from "../api";
import type { WeekDto, WeekStatus, ShiftRequirementDto, Slot, UserDto } from "@shared/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function cellKey(day: number, slot: string): string {
  return `${day}-${slot}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Mirrors the server-side wipesAssignments check
function wipesAssignments(from: WeekStatus, to: WeekStatus): boolean {
  return from === "draft" && to === "availability_open";
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<WeekStatus, string> = {
  availability_open: "bg-green-100 text-green-700",
  availability_closed: "bg-amber-100 text-amber-700",
  draft: "bg-blue-100 text-blue-700",
  published: "bg-gray-100 text-gray-500",
};

function StatusBadge({ status }: { status: WeekStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {t(`weeks.status.${status}`)}
    </span>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

// "wipe" = draft → open (destructive, amber); "close" = open → closed (primary).
type ConfirmKind = "wipe" | "close";
type ConfirmState = { weekId: number; to: WeekStatus; kind: ConfirmKind } | null;

function ConfirmModal({
  title,
  body,
  confirmLabel,
  tone,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  tone: "warning" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const confirmClass =
    tone === "warning"
      ? "bg-amber-600 hover:bg-amber-700"
      : "bg-indigo-600 hover:bg-indigo-700";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-base font-semibold">{title}</h2>
        <p className="mb-6 text-sm text-gray-600">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete week modal ─────────────────────────────────────────────────────────

function DeleteWeekModal({
  week,
  onClose,
  onDeleted,
}: {
  week: WeekDto;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.weeks.delete(week.id, password);
      onDeleted(week.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("weeks.deleteWeek")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-600">
            {t("weeks.deleteWeekWarning", { date: formatDate(week.startDate) })}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("weeks.deleteWeekConfirmPassword")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "…" : t("weeks.deleteWeek")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center overflow-hidden rounded border border-gray-300">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="px-1.5 py-0.5 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200"
      >
        −
      </button>
      <span className="w-6 border-x border-gray-300 py-0.5 text-center text-sm">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="px-1.5 py-0.5 text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200"
      >
        +
      </button>
    </div>
  );
}

// ── Requirements modal ────────────────────────────────────────────────────────

type CellCounts = { cooksNeeded: number; baristasNeeded: number };
type CellState = Record<string, CellCounts>;

function RequirementsModal({ week, onClose }: { week: WeekDto; onClose: () => void }) {
  const { t } = useTranslation();
  const [cells, setCells] = useState<CellState>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    api.requirements
      .get(week.id)
      .then(({ requirements }) => {
        const initial: CellState = {};
        for (const r of requirements) {
          initial[cellKey(r.day, r.slot)] = {
            cooksNeeded: r.cooksNeeded,
            baristasNeeded: r.baristasNeeded,
          };
        }
        // Morning and evening always present; mid only if a row existed
        for (const day of DAYS) {
          if (!initial[cellKey(day, "morning")]) initial[cellKey(day, "morning")] = { cooksNeeded: 1, baristasNeeded: 1 };
          if (!initial[cellKey(day, "evening")]) initial[cellKey(day, "evening")] = { cooksNeeded: 1, baristasNeeded: 1 };
        }
        setCells(initial);
      })
      .catch(() => setLoadError(t("requirements.loadError")))
      .finally(() => setLoading(false));
  }, [week.id, t]);

  const updateCount = (key: string, field: keyof CellCounts, value: number) => {
    setCells((prev) => ({ ...prev, [key]: { ...prev[key], [field]: Math.max(0, value) } }));
  };

  const toggleMid = (day: number, on: boolean) => {
    const key = cellKey(day, "mid");
    setCells((prev) => {
      const next = { ...prev };
      if (on) {
        next[key] = { cooksNeeded: 0, baristasNeeded: 0 };
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaveError(null);
    setSubmitting(true);
    try {
      const entries = Object.entries(cells).map(([key, counts]) => {
        const dashIdx = key.indexOf("-");
        const day = parseInt(key.slice(0, dashIdx), 10);
        const slot = key.slice(dashIdx + 1) as Slot;
        return { day, slot, ...counts };
      });
      await api.requirements.put(week.id, entries);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  const showWarning = week.status === "draft" || week.status === "published";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("requirements.title")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {showWarning && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {t("requirements.warning")}
            </div>
          )}

          {loading && <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>}
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}

          {!loading && !loadError && (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white pb-2 pe-3 text-start text-xs font-medium text-gray-400" />
                    {DAYS.map((day) => (
                      <th key={day} className="pb-2 text-center text-xs font-medium text-gray-500" style={{ minWidth: "4rem" }}>
                        {t(`days.${day}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["morning", "evening"] as Slot[]).map((slot) => (
                    <>
                      {/* Slot section header */}
                      <tr key={`${slot}-header`}>
                        <td className="sticky left-0 z-10 bg-white border-t border-gray-200 pt-3 pb-1 pe-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {t(`slots.${slot}`)}
                        </td>
                        {DAYS.map((day) => <td key={day} className="border-t border-gray-200" />)}
                      </tr>
                      <tr key={`${slot}-cooks`}>
                        <td className="sticky left-0 z-10 bg-white py-1 pe-3 text-xs text-gray-500 whitespace-nowrap border-e border-gray-100">{t("requirements.cooks")}</td>
                        {DAYS.map((day) => {
                          const key = cellKey(day, slot);
                          return (
                            <td key={day} className="py-1 ps-2 border-s border-gray-100">
                              <Stepper value={cells[key]?.cooksNeeded ?? 1} onChange={(v) => updateCount(key, "cooksNeeded", v)} />
                            </td>
                          );
                        })}
                      </tr>
                      <tr key={`${slot}-baristas`}>
                        <td className="sticky left-0 z-10 bg-white py-1 pe-3 text-xs text-gray-500 whitespace-nowrap border-e border-gray-100">{t("requirements.baristas")}</td>
                        {DAYS.map((day) => {
                          const key = cellKey(day, slot);
                          return (
                            <td key={day} className="py-1 ps-2 border-s border-gray-100">
                              <Stepper value={cells[key]?.baristasNeeded ?? 1} onChange={(v) => updateCount(key, "baristasNeeded", v)} />
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  ))}

                  {/* Mid section */}
                  <tr>
                    <td className="sticky left-0 z-10 bg-white border-t border-gray-200 pt-3 pb-1 pe-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {t("slots.mid")}
                    </td>
                    {DAYS.map((day) => <td key={day} className="border-t border-gray-200" />)}
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-white py-1 pe-3 text-xs text-gray-500 whitespace-nowrap border-e border-gray-100">{t("requirements.midToggle")}</td>
                    {DAYS.map((day) => {
                      const midKey = cellKey(day, "mid");
                      const hasMid = midKey in cells;
                      return (
                        <td key={day} className="py-1 ps-2 border-s border-gray-100 align-top">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="checkbox"
                              checked={hasMid}
                              onChange={(e) => toggleMid(day, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                            />
                            {hasMid && (
                              <>
                                <Stepper value={cells[midKey].cooksNeeded} onChange={(v) => updateCount(midKey, "cooksNeeded", v)} />
                                <Stepper value={cells[midKey].baristasNeeded} onChange={(v) => updateCount(midKey, "baristasNeeded", v)} />
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-3">
          {saveError && <p className="mb-2 text-sm text-red-600">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={submitting || loading}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "…" : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shift counts modal ────────────────────────────────────────────────────────

function ShiftCountsModal({ week, onClose }: { week: WeekDto; onClose: () => void }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [original, setOriginal] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.shiftCounts.get(week.id), api.users.list()])
      .then(([{ shiftCounts }, { users: allUsers }]) => {
        const activeUsers = allUsers.filter((u) => u.isActive);
        const initial: Record<number, number> = {};
        for (const sc of shiftCounts) {
          initial[sc.userId] = sc.shiftsThisWeek;
        }
        // Fall back to defaultShiftsPerWeek for users without a seeded row
        for (const u of activeUsers) {
          if (!(u.id in initial)) initial[u.id] = u.defaultShiftsPerWeek;
        }
        setUsers(activeUsers);
        setCounts({ ...initial });
        setOriginal({ ...initial });
      })
      .catch(() => setLoadError(t("shiftCounts.loadError")))
      .finally(() => setLoading(false));
  }, [week.id, t]);

  const handleSave = async () => {
    setSaveError(null);
    setSubmitting(true);
    try {
      for (const user of users) {
        if (counts[user.id] !== original[user.id]) {
          await api.shiftCounts.patch(week.id, user.id, counts[user.id] ?? 0);
        }
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  const showWarning = week.status === "draft" || week.status === "published";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("shiftCounts.title")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {showWarning && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {t("shiftCounts.warning")}
            </div>
          )}

          {loading && <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>}
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}

          {!loading && !loadError && users.map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-gray-400">
                  {t("shiftCounts.default", { n: user.defaultShiftsPerWeek })}
                </p>
              </div>
              <Stepper
                value={counts[user.id] ?? 0}
                onChange={(v) => setCounts((prev) => ({ ...prev, [user.id]: v }))}
              />
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 px-4 py-3">
          {saveError && <p className="mb-2 text-sm text-red-600">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={submitting || loading}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "…" : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pending availability (open weeks) ─────────────────────────────────────────

// Lists active employees who haven't submitted availability yet for an open week,
// so the boss knows who to nudge. "Submitted" = has at least one ticked slot,
// mirroring the employee page (sparse storage means an all-empty submit reads as pending).
function PendingAvailability({ weekId }: { weekId: number }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<UserDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.users.list(), api.availability.getAll(weekId)])
      .then(([{ users }, { availability }]) => {
        const submitted = new Set(availability.map((a) => a.userId));
        const employees = users.filter((u) => u.isActive && u.role === "employee");
        setPending(employees.filter((u) => !submitted.has(u.id)));
      })
      .catch(() => setError(t("weeks.loadError")));
  }, [weekId, t]);

  if (error)
    return <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-red-600">{error}</p>;
  if (pending === null) return null; // stay quiet while loading

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {pending.length === 0 ? (
        <p className="text-xs text-green-600">{t("weeks.allSubmitted")}</p>
      ) : (
        <>
          <p className="text-xs font-medium text-gray-500">
            {t("weeks.pendingAvailabilityTitle")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {pending.map((u) => (
              <span
                key={u.id}
                className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
              >
                {u.name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Week card ─────────────────────────────────────────────────────────────────

function WeekCard({
  week,
  onTransition,
  onDelete,
  onEditRequirements,
  onEditShiftCounts,
  onRunAssigner,
  onReview,
  transitioning,
  running,
}: {
  week: WeekDto;
  onTransition: (weekId: number, from: WeekStatus, to: WeekStatus) => void;
  onDelete: (week: WeekDto) => void;
  onEditRequirements: (week: WeekDto) => void;
  onEditShiftCounts: (week: WeekDto) => void;
  onRunAssigner: (weekId: number) => void;
  onReview: (week: WeekDto) => void;
  transitioning: boolean;
  running: boolean;
}) {
  const { t } = useTranslation();
  const status = week.status;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      {/* Whole header toggles the card; collapsed shows just date + status. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="font-medium">
          {t("weeks.weekOf", { date: formatDate(week.startDate) })}
        </span>
        <span className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span
            aria-hidden
            className={`text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ▸
          </span>
        </span>
      </button>

      {/* Collapsed cards still surface who the boss is waiting on for open weeks. */}
      {status === "availability_open" && <PendingAvailability weekId={week.id} />}

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          {/* Status-specific actions — stacked so each status can tier its buttons. */}
          <div className="space-y-2">
            {status === "availability_open" && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onTransition(week.id, status, "availability_closed")}
                  disabled={transitioning}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {t("weeks.action.closeAvailability")}
                </button>
              </div>
            )}

            {status === "availability_closed" && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onRunAssigner(week.id)}
                  disabled={transitioning || running}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {running ? "…" : t("weeks.action.runAssigner")}
                </button>
                <button
                  onClick={() => onTransition(week.id, status, "availability_open")}
                  disabled={transitioning || running}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t("weeks.action.reopenAvailability")}
                </button>
              </div>
            )}

            {status === "draft" && (
              <>
                {/* Primary: the two most likely next steps — big and prominent. */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onTransition(week.id, status, "published")}
                    disabled={transitioning || running}
                    className="flex-1 rounded bg-green-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
                  >
                    {t("weeks.action.publish")}
                  </button>
                  <button
                    onClick={() => onReview(week)}
                    disabled={transitioning || running}
                    className="flex-1 rounded bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {t("review.reviewDraft")}
                  </button>
                </div>
                {/* Secondary: less-common escape hatches — smaller. */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onTransition(week.id, status, "availability_open")}
                    disabled={transitioning || running}
                    className="rounded border border-amber-300 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {t("weeks.action.reopenAvailability")} ⚠
                  </button>
                  <button
                    onClick={() => onRunAssigner(week.id)}
                    disabled={transitioning || running}
                    className="rounded border border-indigo-300 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {running ? "…" : t("weeks.action.rerunAssigner")}
                  </button>
                </div>
              </>
            )}

            {status === "published" && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onReview(week)}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {t("review.editSchedule")}
                </button>
                <a
                  href={api.weeks.exportUrl(week.id)}
                  target="_blank"
                  rel="noopener"
                  className="rounded border border-indigo-300 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-50"
                >
                  {t("weeks.action.exportSchedule")}
                </a>
              </div>
            )}
          </div>

          {/* Configuration — always behind the accordion to keep collapsed cards tidy. */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onEditRequirements(week)}
              className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-600 hover:border-indigo-300 hover:bg-indigo-100"
            >
              {t("requirements.editRequirements")}
            </button>
            {/* Shift counts only feed the assigner, which can't run once published —
                so editing them post-publish does nothing. Hide the button then. */}
            {status !== "published" && (
              <button
                onClick={() => onEditShiftCounts(week)}
                className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-600 hover:border-indigo-300 hover:bg-indigo-100"
              >
                {t("shiftCounts.editShiftCounts")}
              </button>
            )}
            <button
              onClick={() => onDelete(week)}
              className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:border-red-300 hover:bg-red-100"
            >
              {t("weeks.deleteWeek")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState<WeekDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [deleteTarget, setDeleteTarget] = useState<WeekDto | null>(null);
  const [requirementsTarget, setRequirementsTarget] = useState<WeekDto | null>(null);
  const [shiftCountsTarget, setShiftCountsTarget] = useState<WeekDto | null>(null);
  const [reviewTarget, setReviewTarget] = useState<WeekDto | null>(null);

  useEffect(() => {
    api.weeks
      .list()
      .then(({ weeks }) => setWeeks(weeks))
      .catch(() => setError(t("weeks.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  const handleCreate = async () => {
    setCreateError(null);
    setCreating(true);
    try {
      const { week } = await api.weeks.create();
      setWeeks((prev) => [week, ...prev]);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setCreating(false);
    }
  };

  const doTransition = async (weekId: number, to: WeekStatus) => {
    setTransitionError(null);
    setTransitioning(true);
    try {
      const { week } = await api.weeks.updateStatus(weekId, to);
      setWeeks((prev) => prev.map((w) => (w.id === weekId ? week : w)));
      setConfirm(null);
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setTransitioning(false);
    }
  };

  const handleTransition = (weekId: number, from: WeekStatus, to: WeekStatus) => {
    if (wipesAssignments(from, to)) {
      setConfirm({ weekId, to, kind: "wipe" });
      return;
    }
    if (from === "availability_open" && to === "availability_closed") {
      setConfirm({ weekId, to, kind: "close" });
      return;
    }
    void doTransition(weekId, to);
  };

  const handleRunAssigner = async (weekId: number) => {
    setRunError(null);
    setRunning(true);
    try {
      await api.assignments.runAssigner(weekId);
      // Week transitions to draft on the server; update local state to reflect it
      setWeeks((prev) =>
        prev.map((w) => (w.id === weekId ? { ...w, status: "draft" as WeekStatus } : w))
      );
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setRunning(false);
    }
  };

  const isSunday = new Date().getUTCDay() === 0;
  const hasOpenWeek = weeks.some((w) => w.status !== "published");

  return (
    <div className="min-h-screen bg-gray-50">
      <BossNav />

      <main className="mx-auto max-w-2xl space-y-3 p-4">
        {isSunday && !hasOpenWeek && !loading && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
            {t("weeks.sundayNudge")}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{t("weeks.title")}</h1>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {creating ? "…" : `+ ${t("weeks.openNextWeek")}`}
          </button>
        </div>

        {createError && <p className="text-sm text-red-600">{createError}</p>}
        {transitionError && <p className="text-sm text-red-600">{transitionError}</p>}
        {runError && <p className="text-sm text-red-600">{runError}</p>}

        {loading && (
          <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && weeks.length === 0 && (
          <p className="text-center text-sm text-gray-400">{t("weeks.noWeeks")}</p>
        )}

        {weeks.map((week) => (
          <WeekCard
            key={week.id}
            week={week}
            onTransition={handleTransition}
            onDelete={setDeleteTarget}
            onEditRequirements={setRequirementsTarget}
            onEditShiftCounts={setShiftCountsTarget}
            onRunAssigner={handleRunAssigner}
            onReview={setReviewTarget}
            transitioning={transitioning}
            running={running}
          />
        ))}
      </main>

      {confirm && (
        <ConfirmModal
          title={t(
            confirm.kind === "wipe"
              ? "weeks.confirmWipeTitle"
              : "weeks.confirmCloseTitle",
          )}
          body={t(
            confirm.kind === "wipe"
              ? "weeks.confirmWipeBody"
              : "weeks.confirmCloseBody",
          )}
          confirmLabel={t(
            confirm.kind === "wipe"
              ? "weeks.confirmWipeAction"
              : "weeks.confirmCloseAction",
          )}
          tone={confirm.kind === "wipe" ? "warning" : "primary"}
          onConfirm={() => void doTransition(confirm.weekId, confirm.to)}
          onCancel={() => setConfirm(null)}
          loading={transitioning}
        />
      )}

      {requirementsTarget && (
        <RequirementsModal
          week={requirementsTarget}
          onClose={() => setRequirementsTarget(null)}
        />
      )}

      {shiftCountsTarget && (
        <ShiftCountsModal
          week={shiftCountsTarget}
          onClose={() => setShiftCountsTarget(null)}
        />
      )}

      {reviewTarget && (
        <ReviewScheduleModal
          week={reviewTarget}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteWeekModal
          week={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(id) => {
            setWeeks((prev) => prev.filter((w) => w.id !== id));
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
