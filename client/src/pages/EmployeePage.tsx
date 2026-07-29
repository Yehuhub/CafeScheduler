import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import EmployeeNav from "../components/EmployeeNav";
import { api } from "../api";
import { weekStartOf } from "@shared/weekDates";
import type { WeekDto, AssignmentDto, ShiftDto, ShiftWithDaysDto } from "@shared/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function cellKey(day: number, shiftId: number): string {
  return `${day}-${shiftId}`;
}

function byStartTime(a: ShiftDto, b: ShiftDto): number {
  return a.startTime.localeCompare(b.startTime) || a.id - b.id;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Short dd/mm for a day-of-week header. `startIso` is the week's Sunday; day 0..6 offsets it.
function dayDate(startIso: string, day: number): string {
  const d = new Date(startIso);
  d.setUTCDate(d.getUTCDate() + day);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

// ── Availability grid ─────────────────────────────────────────────────────────

function AvailabilityForm({ week }: { week: WeekDto }) {
  const { t } = useTranslation();

  // persisted: what the server has saved; draft: working copy while editing
  const [shifts, setShifts] = useState<ShiftWithDaysDto[]>([]);
  const [persisted, setPersisted] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [avError, setAvError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load the week's shifts + existing availability
  useEffect(() => {
    setLoadingAvail(true);
    setAvError(null);
    Promise.all([api.availability.getMine(week.id), api.shifts.get(week.id)])
      .then(([{ availability }, { shifts }]) => {
        setShifts([...shifts].sort(byStartTime));
        setPersisted(new Set(availability.map((a) => cellKey(a.day, a.shiftId))));
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

  const toggleDraft = (day: number, shiftId: number) => {
    setSaveError(null);
    setDraft((prev) => {
      const next = new Set(prev);
      const key = cellKey(day, shiftId);
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
    // Send only cells for (shift, day) that actually run — the server sparse-replaces,
    // so anything omitted is cleared.
    const entries = DAYS.flatMap((day) =>
      shifts
        .filter((shift) => shift.days.includes(day))
        .map((shift) => ({
          day,
          shiftId: shift.id,
          available: draft.has(cellKey(day, shift.id)),
        }))
    );
    try {
      const { availability } = await api.availability.putMine(week.id, entries);
      // Reconcile persisted state with what the server saved, then collapse
      const keys = new Set(availability.map((a) => cellKey(a.day, a.shiftId)));
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
                {shifts
                  .filter((shift) => shift.days.length > 0)
                  .map((shift) => (
                    <tr key={shift.id} className="border-t border-gray-100">
                      <td className="py-2 pe-3 whitespace-nowrap">
                        <span className="text-xs font-medium text-gray-500">{shift.name}</span>
                        <span className="ms-1 text-xs text-gray-400">{shift.startTime}</span>
                      </td>
                      {DAYS.map((day) => {
                        const runs = shift.days.includes(day);
                        const key = cellKey(day, shift.id);
                        return (
                          <td key={day} className="py-2 text-center">
                            {runs ? (
                              <input
                                type="checkbox"
                                checked={draft.has(key)}
                                onChange={() => toggleDraft(day, shift.id)}
                                className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-indigo-600"
                              />
                            ) : (
                              <span className="text-gray-200" aria-hidden>·</span>
                            )}
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
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"mine" | "all">("mine");

  useEffect(() => {
    Promise.all([api.assignments.list(week.id), api.shifts.get(week.id)])
      .then(([{ assignments, assignees }, { shifts }]) => {
        setAssignments(assignments);
        setNames(new Map(assignees.map((a) => [a.id, a.name])));
        setShifts([...shifts].sort(byStartTime));
      })
      .catch(() => setError(t("weeks.loadError")));
  }, [week.id, t]);

  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const shiftName = (id: number) => shiftById.get(id)?.name ?? `#${id}`;
  const shiftTime = (id: number) => shiftById.get(id)?.startTime ?? "";

  const byShift = (a: AssignmentDto, b: AssignmentDto) =>
    a.day - b.day ||
    shiftTime(a.shiftId).localeCompare(shiftTime(b.shiftId)) ||
    a.shiftId - b.shiftId ||
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
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <div className="inline-flex rounded-md border border-gray-200 p-0.5">
          {tab("mine", t("employee.myShifts"))}
          {tab("all", t("employee.everyone"))}
        </div>
        {/* Full view — the same styled HTML schedule the boss can export/print. */}
        <a
          href={api.weeks.exportUrl(week.id)}
          target="_blank"
          rel="noopener"
          className="rounded border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
        >
          {t("employee.fullView")}
        </a>
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
              <li key={s.id} className="grid grid-cols-3 items-center gap-3 py-2 text-sm">
                <span className="font-medium">{t(`days.${s.day}`)}</span>
                <span className="text-center text-gray-600">
                  {shiftName(s.shiftId)}
                  <span className="ms-1 text-xs text-gray-400">{shiftTime(s.shiftId)}</span>
                </span>
                <div className="flex justify-end">
                  <RolePill role={s.roleWorking} />
                </div>
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
            {/* Day columns — same shape as the editor; scrolls sideways on a phone. */}
            <div className="overflow-x-auto">
              <div className="flex gap-2">
                {DAYS.map((day) => {
                  const dayShifts = shifts.filter((shift) =>
                    all.some((a) => a.day === day && a.shiftId === shift.id)
                  );
                  return (
                    <div key={day} className="flex min-w-[8rem] flex-1 flex-col overflow-hidden rounded-lg border border-gray-200">
                      <div className="flex items-baseline justify-between gap-1 border-b border-gray-200 px-2 py-1.5">
                        <span className="text-sm font-semibold">{t(`days.${day}`)}</span>
                        <span className="text-xs font-normal text-gray-400">
                          {dayDate(week.startDate, day)}
                        </span>
                      </div>
                      {/* flex-1 so the gray body fills the full (equal-height) column, not just
                          down to the last shift. */}
                      <div className="flex-1 space-y-2.5 bg-gray-100 px-2 py-2">
                        {dayShifts.length === 0 ? (
                          <p className="py-2 text-center text-xs text-gray-400">—</p>
                        ) : (
                          dayShifts.map((shift) => {
                            const people = all
                              .filter((a) => a.day === day && a.shiftId === shift.id)
                              .sort(
                                (a, b) =>
                                  a.roleWorking.localeCompare(b.roleWorking) ||
                                  (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? "")
                              );
                            return (
                              <div key={shift.id} className="rounded-md border border-gray-300 bg-white p-2 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                  {shift.name}
                                  <span className="mt-0.5 block font-normal normal-case text-gray-400">
                                    {shiftTime(shift.id)}
                                  </span>
                                </p>
                                <div className="mt-1.5 flex flex-col gap-1">
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
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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

// Shows one published week at a time with ‹ › navigation across the calendar (any week,
// scheduled or not), defaulting to the current week. `weeks` is the published weeks
// (past + current + upcoming) looked up by date; absent weeks show a message.
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ScheduleWeekView({ weeks, userId }: { weeks: WeekDto[]; userId: number }) {
  const { t } = useTranslation();
  const currentStart = weekStartOf();
  const [start, setStart] = useState<Date>(() => currentStart);

  const byDate = useMemo(() => {
    const m = new Map<string, WeekDto>();
    for (const w of weeks) m.set(w.startDate.slice(0, 10), w);
    return m;
  }, [weeks]);

  const week = byDate.get(isoDay(start));
  const isCurrent = isoDay(start) === isoDay(currentStart);
  const isPast = start.getTime() < currentStart.getTime();
  const label = isCurrent ? "thisWeek" : isPast ? "past" : "upcoming";

  const step = (dir: -1 | 1) =>
    setStart((s) => {
      const d = new Date(s);
      d.setUTCDate(d.getUTCDate() + dir * 7);
      return d;
    });

  const arrow = (dir: -1 | 1, aria: string, glyph: string) => (
    <button
      type="button"
      onClick={() => step(dir)}
      aria-label={aria}
      className="rounded p-2 text-xl leading-none text-gray-600 hover:bg-gray-100"
    >
      {glyph}
    </button>
  );

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        {arrow(-1, t("employee.prevWeek"), "‹")}
        <div className="text-center">
          <span className="text-xs font-medium text-indigo-600">{t(`employee.${label}`)}</span>
          <div className="font-medium">
            {t("availability.weekOf", { date: formatDate(start.toISOString()) })}
          </div>
        </div>
        {arrow(1, t("employee.nextWeek"), "›")}
      </div>

      {!isCurrent && (
        <div className="mt-1 text-center">
          <button
            type="button"
            onClick={() => setStart(currentStart)}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
          >
            {t("employee.goToCurrent")}
          </button>
        </div>
      )}

      <div className="mt-3 border-t border-gray-100 pt-3">
        {week ? (
          <PublishedSchedule week={week} userId={userId} />
        ) : (
          <p className="py-2 text-sm text-gray-500">
            {t(isPast ? "employee.noScheduleMade" : "employee.noScheduleMadeYet")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmployeePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();

  const [openWeek, setOpenWeek] = useState<WeekDto | null | undefined>(undefined); // undefined = loading
  const [publishedWeeks, setPublishedWeeks] = useState<WeekDto[]>([]);
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

        // All published weeks (past too) — the schedule navigator looks them up by date.
        setPublishedWeeks(weeks.filter((w) => w.status === "published"));
      })
      .catch(() => setWeekError(t("weeks.loadError")));
  }, [t]);

  if (!user) return null;
  if (user.role === "boss") return <Navigate to="/dashboard" replace />;

  const roles = [
    user.isCook && t("users.isCook"),
    user.isBarista && t("users.isBarista"),
  ].filter(Boolean);

  const tab = pathname === "/schedule" ? "schedule" : "home";
  const loading = openWeek === undefined && !weekError;

  return (
    <div className="min-h-screen bg-gray-50">
      <EmployeeNav />

      <main className="mx-auto max-w-md space-y-4 p-4">
        {weekError && <p className="text-sm text-red-600">{weekError}</p>}

        {/* Home — availability first (so a missing submission is obvious), then profile. */}
        {tab === "home" && (
          <>
            {loading && (
              <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
            )}

            {openWeek === null && !weekError && (
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500">{t("availability.noOpenWeek")}</p>
              </div>
            )}

            {openWeek && <AvailabilityForm week={openWeek} />}

            {/* Profile card */}
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
          </>
        )}

        {/* Schedule — one week at a time, navigable across the calendar. */}
        {tab === "schedule" && (
          <>
            {loading && (
              <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
            )}
            {!loading && !weekError && (
              <ScheduleWeekView weeks={publishedWeeks} userId={user.id} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
