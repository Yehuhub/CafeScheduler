import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import BossNav from "../components/BossNav";
import { api } from "../api";
import type { WeekDto, WeekStatus } from "@shared/types";

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

type ConfirmState = { weekId: number; to: WeekStatus } | null;

function ConfirmModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-base font-semibold">
          {t("weeks.confirmWipeTitle")}
        </h2>
        <p className="mb-6 text-sm text-gray-600">{t("weeks.confirmWipeBody")}</p>
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
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "…" : t("weeks.confirmWipeAction")}
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

// ── Week card ─────────────────────────────────────────────────────────────────

function WeekCard({
  week,
  onTransition,
  onDelete,
  transitioning,
}: {
  week: WeekDto;
  onTransition: (weekId: number, from: WeekStatus, to: WeekStatus) => void;
  onDelete: (week: WeekDto) => void;
  transitioning: boolean;
}) {
  const { t } = useTranslation();
  const status = week.status;

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {t("weeks.weekOf", { date: formatDate(week.startDate) })}
        </span>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <button
            onClick={() => onDelete(week)}
            className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-600 hover:border-red-300 hover:bg-red-100"
          >
            {t("weeks.deleteWeek")}
          </button>
        </div>
      </div>

      {status !== "published" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {status === "availability_open" && (
            <button
              onClick={() => onTransition(week.id, status, "availability_closed")}
              disabled={transitioning}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {t("weeks.action.closeAvailability")}
            </button>
          )}

          {status === "availability_closed" && (
            <>
              <button
                onClick={() => onTransition(week.id, status, "availability_open")}
                disabled={transitioning}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t("weeks.action.reopenAvailability")}
              </button>
              <button
                disabled
                title={t("weeks.action.runAssignerSoon")}
                className="rounded bg-indigo-100 px-3 py-1.5 text-sm font-medium text-indigo-400 cursor-not-allowed"
              >
                {t("weeks.action.runAssigner")}
              </button>
            </>
          )}

          {status === "draft" && (
            <>
              <button
                onClick={() => onTransition(week.id, status, "availability_open")}
                disabled={transitioning}
                className="rounded border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {t("weeks.action.reopenAvailability")} ⚠
              </button>
              <button
                onClick={() => onTransition(week.id, status, "published")}
                disabled={transitioning}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {t("weeks.action.publish")}
              </button>
            </>
          )}
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
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [deleteTarget, setDeleteTarget] = useState<WeekDto | null>(null);

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
      setConfirm({ weekId, to });
      return;
    }
    void doTransition(weekId, to);
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
            transitioning={transitioning}
          />
        ))}
      </main>

      {confirm && (
        <ConfirmModal
          onConfirm={() => void doTransition(confirm.weekId, confirm.to)}
          onCancel={() => setConfirm(null)}
          loading={transitioning}
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
