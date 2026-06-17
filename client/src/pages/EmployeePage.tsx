import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api";
import type { WeekDto } from "@shared/types";
import type { Slot } from "@shared/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const SLOTS: Slot[] = ["morning", "mid", "evening"];

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

  // Set of "day-slot" keys that are ticked
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [avError, setAvError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load existing availability once we have a week
  useEffect(() => {
    setLoadingAvail(true);
    setAvError(null);
    api.availability
      .getMine(week.id)
      .then(({ availability }) => {
        const keys = new Set(availability.map((a) => cellKey(a.day, a.slot as Slot)));
        setChecked(keys);
      })
      .catch(() => setAvError(t("availability.loadError")))
      .finally(() => setLoadingAvail(false));
  }, [week.id, t]);

  const toggle = (day: number, slot: Slot) => {
    setSaved(false);
    setSaveError(null);
    setChecked((prev) => {
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
    setSaved(false);
    setSaving(true);
    // Send the full grid so the server can do a sparse replace
    const entries = DAYS.flatMap((day) =>
      SLOTS.map((slot) => ({ day, slot, available: checked.has(cellKey(day, slot)) }))
    );
    try {
      const { availability } = await api.availability.putMine(week.id, entries);
      // Reconcile local state with what the server persisted
      const keys = new Set(availability.map((a) => cellKey(a.day, a.slot as Slot)));
      setChecked(keys);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("availability.title")}</h2>
          <p className="text-xs text-gray-500">
            {t("availability.weekOf", { date: formatDate(week.startDate) })}
          </p>
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-600">{t("availability.intro")}</p>

      {loadingAvail && (
        <p className="text-center text-sm text-gray-400">{t("common.loading")}</p>
      )}

      {avError && <p className="text-sm text-red-600">{avError}</p>}

      {!loadingAvail && !avError && (
        <>
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
                            checked={checked.has(key)}
                            onChange={() => toggle(day, slot)}
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
              {saved && <span className="text-green-600">{t("availability.saved")}</span>}
              {saveError && <span className="text-red-600">{saveError}</span>}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "…" : t("availability.save")}
            </button>
          </div>
        </>
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
  const [weekError, setWeekError] = useState<string | null>(null);

  useEffect(() => {
    api.weeks
      .list()
      .then(({ weeks }) => {
        // Pick the earliest availability_open week (startDate is ISO, lexical < = chronological)
        const open = weeks.filter((w) => w.status === "availability_open");
        const found =
          open.length === 0
            ? null
            : open.reduce((earliest, w) =>
                w.startDate < earliest.startDate ? w : earliest
              );
        setOpenWeek(found);
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
        {/* Availability form — primary content */}
        {weekError && <p className="text-sm text-red-600">{weekError}</p>}

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
