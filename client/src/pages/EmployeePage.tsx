import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api";
import { SLOTS } from "@shared/types";
import type { WeekDto, Slot, AssignmentDto } from "@shared/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function cellKey(day: number, slot: Slot): string {
  return `${day}-${slot}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Availability grid ─────────────────────────────────────────────────────────

function AvailabilityForm({ week }: { week: WeekDto }) {
  const { t } = useTranslation();

  // persisted: what the server has saved; draft: working copy while editing
  const [persisted, setPersisted] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [avError, setAvError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load existing availability once we have a week
  useEffect(() => {
    setLoadingAvail(true);
    setAvError(null);
    api.availability
      .getMine(week.id)
      .then(({ availability }) => {
        const keys = new Set(availability.map((a) => cellKey(a.day, a.slot as Slot)));
        setPersisted(keys);
      })
      .catch(() => setAvError(t("availability.loadError")))
      .finally(() => setLoadingAvail(false));
  }, [week.id, t]);

  const hasFilled = persisted.size > 0;
  const canEdit = week.status === "availability_open";

  const handleEdit = () => {
    setDraft(new Set(persisted));
    setSaveError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError(null);
  };

  const toggleDraft = (day: number, slot: Slot) => {
    setSaveError(null);
    setDraft((prev) => {
      const next = new Set(prev);
      const key = cellKey(day, slot);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    // Send the full grid so the server can do a sparse replace
    const entries = DAYS.flatMap((day) =>
      SLOTS.map((slot) => ({ day, slot, available: draft.has(cellKey(day, slot)) }))
    );
    try {
      const { availability } = await api.availability.putMine(week.id, entries);
      // Reconcile persisted state with what the server saved, then collapse
      const keys = new Set(availability.map((a) => cellKey(a.day, a.slot as Slot)));
      setPersisted(keys);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-base font-semibold">{t("availability.title")}</h2>
        <p className="text-xs text-gray-500">
          {t("availability.weekOf", { date: formatDate(week.startDate) })}
        </p>
      </div>

      {loadingAvail && (
        <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
      )}

      {avError && <p className="text-sm text-red-600">{avError}</p>}

      {!loadingAvail && !avError && !editing && (
        <>
          {/* Filled/unfilled status */}
          {!hasFilled && (
            <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {t("availability.notFilledWarning")}
            </div>
          )}
          {hasFilled && (
            <p className="mb-3 text-sm text-green-600">{t("availability.submitted")}</p>
          )}

          <button
            onClick={handleEdit}
            disabled={!canEdit}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("availability.editAvailability")}
          </button>
        </>
      )}

      {!loadingAvail && !avError && editing && (
        <>
          <p className="mb-4 text-sm text-gray-600">{t("availability.intro")}</p>

          {/* Grid — days as columns, slots as rows; overflow-x-auto for narrow screens */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {/* Empty corner */}
                  <th className="pb-2 pe-3 text-start text-xs font-medium text-gray-400" />
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className="pb-2 text-center text-xs font-medium text-gray-500"
                    >
                      {t(`days.${day}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot) => (
                  <tr key={slot} className="border-t border-gray-100">
                    <td className="py-2 pe-3 text-xs font-medium text-gray-500 whitespace-nowrap">
                      {t(`slots.${slot}`)}
                    </td>
                    {DAYS.map((day) => {
                      const key = cellKey(day, slot);
                      return (
                        <td key={day} className="py-2 text-center">
                          <input
                            type="checkbox"
                            checked={draft.has(key)}
                            onChange={() => toggleDraft(day, slot)}
                            className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-indigo-600"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-sm">
              {saveError && <span className="text-red-600">{saveError}</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="rounded px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "…" : t("availability.save")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Published schedule ────────────────────────────────────────────────────────

function RolePill({ role }: { role: string }) {
  const { t } = useTranslation();
  const isCook = role === "cook";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
        isCook ? "bg-teal-50 text-teal-700" : "bg-indigo-50 text-indigo-700"
      }`}
    >
      {isCook ? t("users.isCook") : t("users.isBarista")}
    </span>
  );
}

// A published week's schedule, read-only. The assignments endpoint returns the
// whole week (plus assignee names) to employees once published; a toggle switches
// between the employee's own shifts and everyone's.
function PublishedSchedule({ week, userId }: { week: WeekDto; userId: number }) {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<AssignmentDto[] | null>(null);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"mine" | "all">("mine");

  useEffect(() => {
    api.assignments
      .list(week.id)
      .then(({ assignments, assignees }) => {
        setAssignments(assignments);
        setNames(new Map(assignees.map((a) => [a.id, a.name])));
      })
      .catch(() => setError(t("weeks.loadError")));
  }, [week.id, t]);

  const byShift = (a: AssignmentDto, b: AssignmentDto) =>
    a.day - b.day ||
    SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) ||
    a.roleWorking.localeCompare(b.roleWorking);

  const mine = (assignments ?? []).filter((a) => a.userId === userId).sort(byShift);
  const all = (assignments ?? []).slice().sort(byShift);

  const tab = (m: "mine" | "all", label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`rounded px-2.5 py-1 text-xs font-medium ${
        mode === m ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {t("availability.weekOf", { date: formatDate(week.startDate) })}
        </p>
        <div className="inline-flex rounded-md border border-gray-200 p-0.5">
          {tab("mine", t("employee.myShifts"))}
          {tab("all", t("employee.everyone"))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && assignments === null && (
        <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
      )}

      {!error && assignments !== null && mode === "mine" && (
        mine.length === 0 ? (
          <p className="text-sm text-gray-500">{t("employee.noShifts")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {mine.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium">{t(`days.${s.day}`)}</span>
                <span className="text-gray-600">{t(`slots.${s.slot}`)}</span>
                <RolePill role={s.roleWorking} />
              </li>
            ))}
          </ul>
        )
      )}

      {!error && assignments !== null && mode === "all" && (
        all.length === 0 ? (
          <p className="text-sm text-gray-500">{t("employee.emptySchedule")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white pb-2 pe-3" />
                    {DAYS.map((day) => (
                      <th
                        key={day}
                        className="border-b border-gray-200 pb-2 text-center text-xs font-medium text-gray-500"
                        style={{ minWidth: "6.5rem" }}
                      >
                        {t(`days.${day}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.filter((slot) => all.some((a) => a.slot === slot)).map((slot) => (
                    <tr key={slot} className="border-t border-gray-200 align-top">
                      <td className="sticky left-0 z-10 whitespace-nowrap border-e border-gray-100 bg-white py-3 pe-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {t(`slots.${slot}`)}
                      </td>
                      {DAYS.map((day) => {
                        const people = all
                          .filter((a) => a.day === day && a.slot === slot)
                          .sort(
                            (a, b) =>
                              a.roleWorking.localeCompare(b.roleWorking) ||
                              (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? "")
                          );
                        return (
                          <td key={day} className="border-s border-gray-100 p-1.5">
                            <div className="flex flex-col gap-1.5">
                              {people.map((s) => (
                                <span
                                  key={s.id}
                                  className={`truncate rounded px-2 py-1 text-xs ${
                                    s.roleWorking === "cook"
                                      ? "bg-teal-50 text-teal-700"
                                      : "bg-indigo-50 text-indigo-700"
                                  } ${s.userId === userId ? "font-bold ring-1 ring-gray-400" : ""}`}
                                >
                                  {names.get(s.userId) ?? `#${s.userId}`}
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-50 ring-1 ring-indigo-200" />
                {t("users.isBarista")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-teal-50 ring-1 ring-teal-200" />
                {t("users.isCook")}
              </span>
            </div>
          </>
        )
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmployeePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [openWeek, setOpenWeek] = useState<WeekDto | null | undefined>(undefined); // undefined = loading
  const [publishedWeek, setPublishedWeek] = useState<WeekDto | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);

  useEffect(() => {
    api.weeks
      .list()
      .then(({ weeks }) => {
        // Pick the earliest availability_open week (startDate is ISO, lexical < = chronological)
        const open = weeks.filter((w) => w.status === "availability_open");
        setOpenWeek(
          open.length === 0
            ? null
            : open.reduce((earliest, w) => (w.startDate < earliest.startDate ? w : earliest))
        );

        // Show the most recent published week's schedule.
        const published = weeks.filter((w) => w.status === "published");
        setPublishedWeek(
          published.length === 0
            ? null
            : published.reduce((latest, w) => (w.startDate > latest.startDate ? w : latest))
        );
      })
      .catch(() => setWeekError(t("weeks.loadError")));
  }, [t]);

  if (!user) return null;
  if (user.role === "boss") return <Navigate to="/dashboard" replace />;

  const roles = [
    user.isCook && t("users.isCook"),
    user.isBarista && t("users.isBarista"),
  ].filter(Boolean);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <h1 className="text-lg font-semibold">{t("employee.title")}</h1>
          <button
            onClick={handleLogout}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t("auth.logout")}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        {weekError && <p className="text-sm text-red-600">{weekError}</p>}

        {/* Published schedule — the employee's own shifts */}
        {publishedWeek && <PublishedSchedule week={publishedWeek} userId={user.id} />}

        {/* Availability form */}

        {openWeek === undefined && !weekError && (
          <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
        )}

        {openWeek === null && !weekError && (
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{t("availability.noOpenWeek")}</p>
          </div>
        )}

        {openWeek && <AvailabilityForm week={openWeek} />}

        {/* Profile card — secondary */}
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{user.name}</h2>
          <p className="mt-0.5 text-sm text-gray-500">@{user.username}</p>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("users.role")}</dt>
              <dd className="font-medium capitalize">{user.role}</dd>
            </div>
            {roles.length > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">{t("employee.roles")}</dt>
                <dd className="font-medium">{roles.join(", ")}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">{t("users.defaultShiftsPerWeek")}</dt>
              <dd className="font-medium">
                {t("users.shiftsPerWeek", { count: user.defaultShiftsPerWeek })}
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
