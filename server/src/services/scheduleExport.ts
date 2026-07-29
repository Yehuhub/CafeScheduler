// Pure functions — no DB calls, no randomness, no Date.now().
// The route gathers DB rows and passes plain objects in; these shape and render them.
// Rendered HTML is opened directly in a browser tab for print-to-PDF (DESIGN.md §6).

import type { RoleWorking } from "../../../shared/types";

export type ExportFormat = "html" | "pdf";

interface CellPerson {
  name: string;
  role: RoleWorking;
}

interface ScheduleShift {
  id: number;
  name: string;
  startTime: string; // "HH:MM"
}

export interface ScheduleView {
  weekStartDate: string; // ISO date string, supplied by the caller
  shifts: ScheduleShift[]; // only shifts with at least one assignment, ordered by startTime
  cells: Record<string, CellPerson[]>; // key `${day}-${shiftId}`
}

export interface BuildScheduleViewInput {
  weekStartDate: string;
  shifts: Array<{ id: number; name: string; startTime: string }>;
  assignments: Array<{ userId: number; day: number; shiftId: number; roleWorking: RoleWorking }>;
  names: Map<number, string>;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// Server has no i18next — English-only per DESIGN.md §6. Hebrew/RTL is future work.
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cellKey(day: number, shiftId: number): string {
  return `${day}-${shiftId}`;
}

export function buildScheduleView(input: BuildScheduleViewInput): ScheduleView {
  const { shifts: allShifts, assignments, names } = input;

  // Only keep shifts that actually have assignments, ordered chronologically by
  // startTime (mirrors the employee "Everyone" view).
  const usedShiftIds = new Set(assignments.map((a) => a.shiftId));
  const shifts = [...allShifts]
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id - b.id)
    .filter((s) => usedShiftIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, startTime: s.startTime }));

  const cells: Record<string, CellPerson[]> = {};
  for (const a of assignments) {
    const key = cellKey(a.day, a.shiftId);
    (cells[key] ??= []).push({
      name: names.get(a.userId) ?? `#${a.userId}`,
      role: a.roleWorking,
    });
  }

  // Sort each cell by role, then name — same order as EmployeePage's Everyone grid.
  for (const key of Object.keys(cells)) {
    cells[key].sort(
      (a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)
    );
  }

  return { weekStartDate: input.weekStartDate, shifts, cells };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

export function renderScheduleHtml(view: ScheduleView): string {
  const dateLabel = formatDate(view.weekStartDate);

  // One column per day; inside a column, only the shifts that actually run that day,
  // in chronological (view.shifts) order — same day-columns shape as the in-app editor.
  const columns = DAYS.map((day) => {
    const blocks = view.shifts
      .map((shift) => {
        const people = view.cells[cellKey(day, shift.id)] ?? [];
        if (people.length === 0) return "";
        const chips = people
          .map(
            (p) =>
              `<span class="chip ${p.role === "cook" ? "cook" : "barista"}">${escapeHtml(
                p.name
              )}</span>`
          )
          .join("");
        return `<div class="shift"><div class="shift-name">${escapeHtml(shift.name)} <span class="shift-time">${escapeHtml(shift.startTime)}</span></div>${chips}</div>`;
      })
      .join("");
    const body = blocks || `<div class="empty">—</div>`;
    return `<div class="day"><div class="day-head"><span>${DAY_LABELS[day]}</span><span class="day-date">${dayDate(view.weekStartDate, day)}</span></div><div class="day-body">${body}</div></div>`;
  }).join("");

  // Standalone document — opened directly in a browser tab, not through the SPA.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Schedule — Week of ${dateLabel}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #111827;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  h1 { font-size: 24px; font-weight: 700; margin: 0; }
  .print-btn {
    border: 1px solid #c7d2fe; background: #eef2ff; color: #4f46e5;
    border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer;
  }
  /* On screen the week scrolls sideways on narrow phones instead of squishing;
     print collapses it back to a single page (see @media print below). */
  .grid-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .week { display: flex; gap: 8px; min-width: 860px; align-items: flex-start; }
  .day { flex: 1 1 0; min-width: 116px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .day-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; background: #f9fafb; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; padding: 8px; border-bottom: 1px solid #e5e7eb; }
  .day-date { font-size: 12px; font-weight: 400; text-transform: none; letter-spacing: 0; color: #9ca3af; }
  /* Light-gray body so the white shift cards read as clearly separate blocks. */
  .day-body { padding: 8px; background: #f3f4f6; }
  .shift { border: 1px solid #d1d5db; background: #fff; border-radius: 6px; padding: 8px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
  .shift:last-child { margin-bottom: 0; }
  .shift-name { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; margin-bottom: 6px; }
  .shift-time { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; text-transform: none; letter-spacing: 0; color: #9ca3af; }
  .empty { text-align: center; color: #d1d5db; padding: 8px 0; }
  .chip { display: block; border-radius: 4px; padding: 4px 8px; font-size: 15px; font-weight: 600; margin-bottom: 5px; overflow-wrap: anywhere; word-break: break-word; }
  .chip:last-child { margin-bottom: 0; }
  .chip.barista { background: #eef2ff; color: #3730a3; }
  .chip.cook { background: #f0fdfa; color: #115e59; }
  .legend { display: flex; gap: 16px; margin-top: 12px; font-size: 13px; font-weight: 600; color: #6b7280; }
  .legend .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-inline-end: 6px; vertical-align: middle; }
  .legend .barista { background: #eef2ff; }
  .legend .cook { background: #f0fdfa; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; }
    /* Fit the whole week on the page regardless of the on-screen min-width. */
    .grid-wrap { overflow: visible; }
    .week { min-width: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Schedule — Week of ${dateLabel}</h1>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="grid-wrap">
    <div class="week">${columns}</div>
  </div>
  <div class="legend">
    <span><span class="swatch barista"></span>Barista</span>
    <span><span class="swatch cook"></span>Cook</span>
  </div>
</body>
</html>`;
}

// Exporter registry (the "strategy" seam). Adding a true PDF binary later is one
// render function + one line here — no route changes.
interface Exporter {
  contentType: string;
  render(view: ScheduleView): string | Buffer;
}

export const exporters: Partial<Record<ExportFormat, Exporter>> = {
  html: { contentType: "text/html; charset=utf-8", render: renderScheduleHtml },
  // pdf: added later — implement renderSchedulePdf(view): Buffer and register here.
};
