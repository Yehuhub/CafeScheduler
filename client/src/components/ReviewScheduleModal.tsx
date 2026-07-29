import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { ROLES_WORKING } from "@shared/types";
import type {
  WeekDto,
  AssignmentDto,
  ShiftRequirementDto,
  ShiftDto,
  UserDto,
  RoleWorking,
} from "@shared/types";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function cellKey(day: number, shiftId: number): string {
  return `${day}-${shiftId}`;
}
function availKey(userId: number, day: number, shiftId: number): string {
  return `${userId}-${day}-${shiftId}`;
}
function byStartTime(a: ShiftDto, b: ShiftDto): number {
  return a.startTime.localeCompare(b.startTime) || a.id - b.id;
}

// `anchor` is the + button's viewport rect, captured at click time so the desktop popover
// can position itself next to it. Undefined on mobile (bottom sheet doesn't need it).
type Picker = { day: number; shift: ShiftDto; role: RoleWorking; anchor?: DOMRect };

// Matches the Tailwind `lg` breakpoint — desktop gets the anchored popover, mobile the sheet.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function ReviewScheduleModal({
  week,
  onClose,
}: {
  week: WeekDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const [assignments, setAssignments] = useState<AssignmentDto[]>([]);
  const [requirements, setRequirements] = useState<ShiftRequirementDto[]>([]);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [bosses, setBosses] = useState<UserDto[]>([]);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [shiftLimits, setShiftLimits] = useState<Map<number, number>>(new Map());
  const [availableSet, setAvailableSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  // Desktop columns default open; this tracks the ones the boss has collapsed.
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const [picker, setPicker] = useState<Picker | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.assignments.list(week.id),
      api.requirements.get(week.id),
      api.shifts.get(week.id),
      api.users.list(),
      api.availability.getAll(week.id),
      api.shiftCounts.get(week.id),
    ])
      .then(([{ assignments, assignees }, { requirements }, { shifts }, { users: allUsers }, { availability }, { shiftCounts }]) => {
        const employees = allUsers.filter((u) => u.isActive && u.role === "employee");
        const bossUsers = allUsers.filter((u) => u.isActive && u.role === "boss");
        setAssignments(assignments);
        setRequirements(requirements);
        setShifts([...shifts].sort(byStartTime));
        setUsers(employees);
        setBosses(bossUsers);

        // Name lookup for the assigned chips. `assignees` is authoritative — it includes
        // deactivated / soft-deleted users still on this schedule. Merge the active roster
        // on top so anyone added during this session also resolves.
        const nameMap = new Map<number, string>();
        for (const a of assignees) nameMap.set(a.id, a.name);
        for (const u of [...employees, ...bossUsers]) nameMap.set(u.id, u.name);
        setNames(nameMap);
        setAvailableSet(
          new Set(availability.filter((a) => a.available).map((a) => availKey(a.userId, a.day, a.shiftId)))
        );

        // Weekly shift cap per user: their WeeklyShiftCount row, or defaultShiftsPerWeek if unseeded.
        const seeded = new Map(shiftCounts.map((sc) => [sc.userId, sc.shiftsThisWeek]));
        setShiftLimits(new Map(employees.map((u) => [u.id, seeded.get(u.id) ?? u.defaultShiftsPerWeek])));

        // Expand days that are understaffed so gaps are visible immediately.
        const shortDays = new Set<number>();
        for (const r of requirements) {
          const cooks = assignments.filter(
            (a) => a.day === r.day && a.shiftId === r.shiftId && a.roleWorking === "cook"
          ).length;
          const baristas = assignments.filter(
            (a) => a.day === r.day && a.shiftId === r.shiftId && a.roleWorking === "barista"
          ).length;
          if (cooks < r.cooksNeeded || baristas < r.baristasNeeded) shortDays.add(r.day);
        }
        setExpandedDays(shortDays);
      })
      .catch(() => setLoadError(t("review.loadError")))
      .finally(() => setLoading(false));
  }, [week.id, t]);

  const reqByCell = useMemo(() => {
    const m = new Map<string, ShiftRequirementDto>();
    for (const r of requirements) m.set(cellKey(r.day, r.shiftId), r);
    return m;
  }, [requirements]);

  // Which (day, shift) cells to render: any shift with a requirement or an existing
  // assignment that day, ordered chronologically by start time.
  const shiftsByDay = useMemo(() => {
    const present = new Set<string>();
    for (const r of requirements) present.add(cellKey(r.day, r.shiftId));
    for (const a of assignments) present.add(cellKey(a.day, a.shiftId));
    const m = new Map<number, ShiftDto[]>();
    for (const day of DAYS) {
      const dayShifts = shifts.filter((s) => present.has(cellKey(day, s.id)));
      if (dayShifts.length > 0) m.set(day, dayShifts);
    }
    return m;
  }, [requirements, assignments, shifts]);

  const neededFor = (day: number, shiftId: number, role: RoleWorking): number => {
    const r = reqByCell.get(cellKey(day, shiftId));
    if (!r) return 0;
    return role === "cook" ? r.cooksNeeded : r.baristasNeeded;
  };
  const assignmentsFor = (day: number, shiftId: number, role: RoleWorking): AssignmentDto[] =>
    assignments.filter((a) => a.day === day && a.shiftId === shiftId && a.roleWorking === role);

  const daySummary = (day: number): { assigned: number; needed: number } => {
    const dayShifts = shiftsByDay.get(day) ?? [];
    let assigned = 0;
    let needed = 0;
    for (const shift of dayShifts) {
      for (const role of ROLES_WORKING) {
        assigned += assignmentsFor(day, shift.id, role).length;
        needed += neededFor(day, shift.id, role);
      }
    }
    return { assigned, needed };
  };

  const toggleDay = (day: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  };

  const toggleColumn = (day: number) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  };

  // Collapse-all / expand-all for the desktop columns.
  const allColumnsCollapsed = DAYS.every((d) => collapsedDays.has(d));
  const toggleAllColumns = () =>
    setCollapsedDays(allColumnsCollapsed ? new Set() : new Set(DAYS));

  const handleAdd = async (userId: number) => {
    if (!picker || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const { assignment } = await api.assignments.add(week.id, {
        userId,
        day: picker.day,
        shiftId: picker.shift.id,
        roleWorking: picker.role,
      });
      setAssignments((prev) => [...prev, assignment]);
      setPicker(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("review.addError"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: number) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.assignments.remove(id);
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("review.addError"));
    } finally {
      setBusy(false);
    }
  };

  // `compact` (desktop day-columns) stacks the label/badge above wrapped chips so the row
  // fits a narrow column; the default (mobile) keeps the single-line label · chips · badge.
  const renderRoleRow = (day: number, shift: ShiftDto, role: RoleWorking, compact = false) => {
    const needed = neededFor(day, shift.id, role);
    const filled = assignmentsFor(day, shift.id, role);
    if (needed === 0 && filled.length === 0) return null;
    const short = filled.length < needed;

    const chips = (
      <>
        {filled.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 lg:text-sm"
          >
            {names.get(a.userId) ?? `#${a.userId}`}
            <button
              type="button"
              onClick={() => void handleRemove(a.id)}
              disabled={busy}
              aria-label={names.get(a.userId)}
              className="text-indigo-400 hover:text-indigo-700 disabled:opacity-50"
            >
              ✕
            </button>
          </span>
        ))}
        {filled.length < needed && (
          <button
            type="button"
            onClick={(e) => {
              setActionError(null);
              setPicker({ day, shift, role, anchor: e.currentTarget.getBoundingClientRect() });
            }}
            className="rounded border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:bg-gray-50 lg:text-sm"
          >
            + {t(role === "cook" ? "review.addCook" : "review.addBarista")}
          </button>
        )}
      </>
    );

    const badge = (
      <span className={`shrink-0 text-xs lg:text-sm ${short ? "text-amber-600" : "text-green-600"}`}>
        {filled.length}/{needed} {short ? "⚠" : "✓"}
      </span>
    );

    if (compact) {
      return (
        <div key={role} className="py-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-500">{t(`review.${role}`)}</span>
            {badge}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">{chips}</div>
        </div>
      );
    }

    return (
      <div key={role} className="flex items-start gap-2 py-1">
        <span className="w-16 shrink-0 text-xs text-gray-500">{t(`review.${role}`)}</span>
        <div className="flex flex-1 flex-wrap items-center gap-1.5">{chips}</div>
        {badge}
      </div>
    );
  };

  // The shift rows shared by both layouts (mobile section body / desktop column body).
  const renderShiftRows = (day: number, compact: boolean) =>
    (shiftsByDay.get(day) ?? []).map((shift) => (
      <div
        key={shift.id}
        className={
          // Desktop: each shift is a distinct card so a busy column stays legible.
          compact
            ? "mb-2 rounded-md border border-gray-100 bg-gray-50 p-2 last:mb-0"
            : "border-b border-gray-50 py-1.5 last:border-b-0"
        }
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 lg:text-sm">
          {shift.name} <span className="font-normal text-gray-300">{shift.startTime}</span>
        </p>
        {ROLES_WORKING.map((role) => renderRoleRow(day, shift, role, compact))}
      </div>
    ));

  // Mobile: one collapsible section per day.
  const renderDaySection = (day: number) => {
    const { assigned, needed } = daySummary(day);
    const short = assigned < needed;
    const open = expandedDays.has(day);
    return (
      <div key={day} className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleDay(day)}
          className="flex w-full items-center justify-between px-3 py-2 text-start"
        >
          <span className="flex items-center gap-2 font-medium">
            <span className="text-gray-400">{open ? "▾" : "▸"}</span>
            {t(`days.${day}`)}
          </span>
          <span className={`text-xs ${short ? "text-amber-600" : "text-green-600"}`}>
            {t("review.daySummary", { assigned, needed })}
          </span>
        </button>

        {open && <div className="border-t border-gray-100 px-3 py-2">{renderShiftRows(day, false)}</div>}
      </div>
    );
  };

  // Desktop: one always-open column per day, laid out horizontally so it reads as a week.
  const renderDayColumn = (day: number) => {
    const { assigned, needed } = daySummary(day);
    const short = assigned < needed;
    const dayShifts = shiftsByDay.get(day) ?? [];
    const collapsed = collapsedDays.has(day);
    return (
      <div key={day} className="flex min-w-0 flex-1 flex-col self-start rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleColumn(day)}
          className={`flex w-full items-center justify-between gap-1 px-2 py-1.5 text-start ${
            collapsed ? "" : "border-b border-gray-100"
          }`}
        >
          <span className="flex min-w-0 items-center gap-1 text-base font-semibold">
            <span aria-hidden className="text-gray-400">{collapsed ? "▸" : "▾"}</span>
            <span className="truncate">{t(`days.${day}`)}</span>
          </span>
          {dayShifts.length > 0 && (
            <span className={`shrink-0 text-sm ${short ? "text-amber-600" : "text-green-600"}`}>
              {assigned}/{needed}
            </span>
          )}
        </button>
        {!collapsed && (
          <div className="flex-1 px-2 py-1.5">
            {dayShifts.length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-300">—</p>
            ) : (
              renderShiftRows(day, true)
            )}
          </div>
        )}
      </div>
    );
  };

  const presentDays = [...shiftsByDay.keys()];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl lg:w-[96vw] lg:max-w-none">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("review.title")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {actionError && (
            <div className="px-4 pt-3">
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {actionError}
              </p>
            </div>
          )}
          {loading && (
            <p className="px-4 py-3 text-center text-sm text-gray-400">{t("common.loading")}</p>
          )}
          {loadError && <p className="px-4 py-3 text-sm text-red-600">{loadError}</p>}

          {!loading && !loadError && (
            <>
              {/* Mobile: vertical collapsible day list */}
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 lg:hidden">
                {presentDays.length === 0 ? (
                  <p className="text-center text-sm text-gray-400">{t("review.empty")}</p>
                ) : (
                  presentDays.map(renderDaySection)
                )}
              </div>

              {/* Desktop: horizontal week editor (3/4) + availability reference (1/4) */}
              <div className="hidden min-h-0 flex-1 lg:flex">
                <div className="w-3/4 overflow-y-auto p-4">
                  {presentDays.length === 0 ? (
                    <p className="text-center text-sm text-gray-400">{t("review.empty")}</p>
                  ) : (
                    <>
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          onClick={toggleAllColumns}
                          className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
                        >
                          {allColumnsCollapsed ? t("review.expandAll") : t("review.collapseAll")}
                        </button>
                      </div>
                      <div className="flex gap-2">{DAYS.map(renderDayColumn)}</div>
                    </>
                  )}
                </div>
                <aside className="w-1/4 overflow-y-auto border-s border-gray-200 p-3">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                    {t("review.availabilityPanelTitle")}
                  </p>
                  <AvailabilityReference users={users} shifts={shifts} availableSet={availableSet} />
                </aside>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-3 text-end">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            {t("common.close")}
          </button>
        </div>
      </div>

      {picker && (
        <AddPersonSheet
          picker={picker}
          users={users}
          bosses={bosses}
          assignments={assignments}
          availableSet={availableSet}
          shiftLimits={shiftLimits}
          busy={busy}
          onPick={handleAdd}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ── Add-person bottom sheet ────────────────────────────────────────────────────

function AddPersonSheet({
  picker,
  users,
  bosses,
  assignments,
  availableSet,
  shiftLimits,
  busy,
  onPick,
  onClose,
}: {
  picker: Picker;
  users: UserDto[];
  bosses: UserDto[];
  assignments: AssignmentDto[];
  availableSet: Set<string>;
  shiftLimits: Map<number, number>;
  busy: boolean;
  onPick: (userId: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const { day, shift, role, anchor } = picker;

  // A popover is anchored to a fixed viewport point, so close it if the page scrolls
  // underneath (capture:true also catches the editor pane's own scroll).
  useEffect(() => {
    if (!isDesktop || !anchor) return;
    const close = () => onClose();
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [isDesktop, anchor, onClose]);

  const inCell = new Set(
    assignments.filter((a) => a.day === day && a.shiftId === shift.id).map((a) => a.userId)
  );

  // Bosses are always offerable (they can fill any role) — a last-resort tier when
  // no employee fits. Only excluded if already in this exact cell.
  const bossCandidates = bosses
    .filter((b) => !inCell.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const candidates = users
    .filter((u) => (role === "cook" ? u.isCook : u.isBarista) && !inCell.has(u.id))
    .map((u) => {
      const assignedThisWeek = assignments.filter((a) => a.userId === u.id).length;
      const limit = shiftLimits.get(u.id) ?? u.defaultShiftsPerWeek;
      const available = availableSet.has(availKey(u.id, day, shift.id));
      const elsewhere = assignments.some((a) => a.userId === u.id && a.day === day);
      const atLimit = assignedThisWeek >= limit;
      return {
        user: u,
        available,
        elsewhere,
        assignedThisWeek,
        limit,
        atLimit,
        // Fully safe = available, under their weekly limit, and not already working this day.
        unsafe: !available || atLimit || elsewhere,
      };
    })
    .sort((a, b) => {
      // Safe candidates first, then alphabetical.
      if (a.unsafe !== b.unsafe) return a.unsafe ? 1 : -1;
      return a.user.name.localeCompare(b.user.name);
    });

  const titleEl = (
    <h3 className="text-sm font-semibold">
      {t(role === "cook" ? "review.addCook" : "review.addBarista")} · {t(`days.${day}`)}{" "}
      {shift.name}
    </h3>
  );
  const closeBtn = (
    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
      ✕
    </button>
  );
  const listEl = (
    <>
      {candidates.length === 0 && bossCandidates.length === 0 && (
        <p className="px-2 py-4 text-center text-sm text-gray-400">{t("review.noCandidates")}</p>
      )}
      {candidates.map(({ user, available, elsewhere, assignedThisWeek, limit, atLimit, unsafe }) => (
        <button
          key={user.id}
          type="button"
          onClick={() => onPick(user.id)}
          disabled={busy}
          className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-start disabled:opacity-50 ${
            unsafe ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-gray-50"
          }`}
        >
          <span
            className={`flex items-center gap-1 text-sm font-medium ${
              unsafe ? "text-amber-700" : "text-gray-900"
            }`}
          >
            {unsafe && <span aria-hidden>⚠</span>}
            {user.name}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
            {atLimit && (
              <span className="whitespace-nowrap rounded border border-gray-300 bg-amber-100 px-1.5 py-0.5 text-amber-800">
                {t("review.atShiftLimit", { assigned: assignedThisWeek, limit })}
              </span>
            )}
            {elsewhere && (
              <span className="whitespace-nowrap rounded border border-gray-300 bg-amber-100 px-1.5 py-0.5 text-amber-800">
                {t("review.alreadyWorking", { day: t(`days.${day}`) })}
              </span>
            )}
            <span
              className={`whitespace-nowrap rounded border border-gray-300 px-1.5 py-0.5 ${
                available ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
              }`}
            >
              {available ? t("review.available") : t("review.notAvailable")}
            </span>
          </span>
        </button>
      ))}

      {bossCandidates.length > 0 && (
        <>
          <p className="mt-2 border-t border-gray-200 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("review.bosses")}
          </p>
          {bossCandidates.map((boss) => (
            <button
              key={boss.id}
              type="button"
              onClick={() => onPick(boss.id)}
              disabled={busy}
              className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-start hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="text-sm font-medium text-gray-900">{boss.name}</span>
              <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {t("users.boss")}
              </span>
            </button>
          ))}
        </>
      )}
    </>
  );

  // Desktop: a popover anchored to the + button (flips above / clamps to the viewport).
  if (isDesktop && anchor) {
    const width = 288;
    const gap = 6;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(margin, Math.min(anchor.left, vw - width - margin));
    const spaceBelow = vh - anchor.bottom - margin;
    const spaceAbove = anchor.top - margin;
    const below = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const style: CSSProperties = {
      left,
      width,
      maxHeight: Math.max(180, below ? spaceBelow : spaceAbove),
      ...(below ? { top: anchor.bottom + gap } : { bottom: vh - anchor.top + gap }),
    };
    return (
      <>
        {/* Transparent catcher: click outside closes the popover. */}
        <div className="fixed inset-0 z-[60]" onClick={onClose} />
        <div
          className="fixed z-[61] flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
          style={style}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
            {titleEl}
            {closeBtn}
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">{listEl}</div>
        </div>
      </>
    );
  }

  // Mobile: bottom sheet.
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-t-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          {titleEl}
          {closeBtn}
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">{listEl}</div>
      </div>
    </div>
  );
}

// ── Availability reference (desktop side panel) ────────────────────────────────

// View-only: each employee's submitted availability as a compact grid, so the boss can
// browse who is free while editing. Reuses the modal's availableSet (userId-day-shiftId).
function AvailabilityReference({
  users,
  shifts,
  availableSet,
}: {
  users: UserDto[];
  shifts: ShiftDto[];
  availableSet: Set<string>;
}) {
  const { t } = useTranslation();
  const submittedIds = useMemo(
    () => new Set([...availableSet].map((k) => Number(k.split("-")[0]))),
    [availableSet]
  );
  // By the time the boss is editing (closed/published), availability is final, so only the
  // employees who actually submitted are worth showing here.
  const submitted = users.filter((u) => submittedIds.has(u.id));
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (submitted.length === 0)
    return <p className="text-sm text-gray-400">{t("review.noAvailability")}</p>;

  return (
    <div className="space-y-2">
      {submitted.map((u) => {
        const isCollapsed = collapsed.has(u.id);
        return (
          <div key={u.id} className="rounded border border-gray-100">
            <button
              type="button"
              onClick={() => toggle(u.id)}
              className="flex w-full items-center gap-1 px-2 py-1 text-start"
            >
              <span aria-hidden className="text-gray-400">
                {isCollapsed ? "▸" : "▾"}
              </span>
              <span className="truncate text-sm font-medium text-gray-700">{u.name}</span>
            </button>
            {!isCollapsed && (
              <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full border-collapse text-center text-xs">
                  <thead>
                    <tr>
                      <th className="pb-0.5" />
                      {DAYS.map((day) => (
                        <th key={day} className="pb-0.5 font-normal text-gray-400">
                          {t(`days.${day}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map((shift) => (
                      <tr key={shift.id}>
                        <td className="whitespace-nowrap pe-1 text-start text-gray-400">{shift.name}</td>
                        {DAYS.map((day) => (
                          <td key={day} className="py-0.5">
                            {availableSet.has(availKey(u.id, day, shift.id)) ? (
                              <span className="text-green-600">✓</span>
                            ) : (
                              <span className="text-gray-300">·</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
