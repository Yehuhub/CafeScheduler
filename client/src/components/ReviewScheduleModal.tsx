import { useEffect, useMemo, useState } from "react";
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

type Picker = { day: number; shift: ShiftDto; role: RoleWorking };

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

  const renderRoleRow = (day: number, shift: ShiftDto, role: RoleWorking) => {
    const needed = neededFor(day, shift.id, role);
    const filled = assignmentsFor(day, shift.id, role);
    if (needed === 0 && filled.length === 0) return null;
    const short = filled.length < needed;

    return (
      <div key={role} className="flex items-start gap-2 py-1">
        <span className="w-16 shrink-0 text-xs text-gray-500">{t(`review.${role}`)}</span>
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {filled.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
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
              onClick={() => {
                setActionError(null);
                setPicker({ day, shift, role });
              }}
              className="rounded border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:bg-gray-50"
            >
              + {t(role === "cook" ? "review.addCook" : "review.addBarista")}
            </button>
          )}
        </div>
        <span className={`shrink-0 text-xs ${short ? "text-amber-600" : "text-green-600"}`}>
          {filled.length}/{needed} {short ? "⚠" : "✓"}
        </span>
      </div>
    );
  };

  const presentDays = [...shiftsByDay.keys()];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold">{t("review.title")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {loading && <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>}
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {actionError && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {actionError}
            </p>
          )}

          {!loading && !loadError && presentDays.length === 0 && (
            <p className="text-center text-sm text-gray-400">{t("review.empty")}</p>
          )}

          {!loading &&
            !loadError &&
            presentDays.map((day) => {
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

                  {open && (
                    <div className="border-t border-gray-100 px-3 py-2">
                      {(shiftsByDay.get(day) ?? []).map((shift) => (
                        <div key={shift.id} className="border-b border-gray-50 py-1.5 last:border-b-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {shift.name} <span className="font-normal text-gray-300">{shift.startTime}</span>
                          </p>
                          {ROLES_WORKING.map((role) => renderRoleRow(day, shift, role))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
  const { day, shift, role } = picker;

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-t-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold">
            {t(role === "cook" ? "review.addCook" : "review.addBarista")} · {t(`days.${day}`)}{" "}
            {shift.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {candidates.length === 0 && bossCandidates.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-gray-400">{t("review.noCandidates")}</p>
          )}
          {candidates.map(({ user, available, elsewhere, assignedThisWeek, limit, atLimit, unsafe }) => {
            return (
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
            );
          })}

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
        </div>
      </div>
    </div>
  );
}
