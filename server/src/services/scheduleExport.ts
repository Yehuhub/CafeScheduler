// Pure functions — no DB calls, no randomness, no Date.now().
// The route gathers DB rows and passes plain objects in; these shape and render them.
// Rendered HTML is opened directly in a browser tab for print-to-PDF (DESIGN.md §6).

import { SLOTS } from "../../../shared/types";
import type { Slot, RoleWorking } from "../../../shared/types";

export type ExportFormat = "html" | "pdf";

interface CellPerson {
  name: string;
  role: RoleWorking;
}

export interface ScheduleView {
  weekStartDate: string; // ISO date string, supplied by the caller
  slots: Slot[]; // only slots that have at least one assignment, in SLOTS order
  cells: Record<string, CellPerson[]>; // key `${day}-${slot}`
}

export interface BuildScheduleViewInput {
  weekStartDate: string;
  assignments: Array<{ userId: number; day: number; slot: Slot; roleWorking: RoleWorking }>;
  names: Map<number, string>;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// Server has no i18next — English-only per DESIGN.md §6. Hebrew/RTL is future work.
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_LABELS: Record<Slot, string> = {
  morning: "Morning",
  mid: "Mid",
  evening: "Evening",
};

function cellKey(day: number, slot: Slot): string {
  return `${day}-${slot}`;
}

export function buildScheduleView(input: BuildScheduleViewInput): ScheduleView {
  const { assignments, names } = input;

  // Only keep slots that actually have assignments, in canonical SLOTS order
  // (mirrors the employee "Everyone" view).
  const slots = SLOTS.filter((slot) => assignments.some((a) => a.slot === slot));

  const cells: Record<string, CellPerson[]> = {};
  for (const a of assignments) {
    const key = cellKey(a.day, a.slot);
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

  return { weekStartDate: input.weekStartDate, slots, cells };
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

export function renderScheduleHtml(view: ScheduleView): string {
  const dateLabel = formatDate(view.weekStartDate);

  const bodyRows = view.slots
    .map((slot) => {
      const cells = DAYS.map((day) => {
        const people = view.cells[cellKey(day, slot)] ?? [];
        const chips = people
          .map(
            (p) =>
              `<span class="chip ${p.role === "cook" ? "cook" : "barista"}">${escapeHtml(
                p.name
              )}</span>`
          )
          .join("");
        return `<td>${chips}</td>`;
      }).join("");
      return `<tr><th class="slot">${SLOT_LABELS[slot]}</th>${cells}</tr>`;
    })
    .join("");

  const headCells = DAYS.map((day) => `<th>${DAY_LABELS[day]}</th>`).join("");

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
  /* On screen the grid scrolls sideways on narrow phones instead of squishing;
     print collapses it back to a single page (see @media print below). */
  .grid-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 860px; }
  th, td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; text-align: start; }
  thead th { background: #f9fafb; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; text-align: center; }
  th.slot { width: 96px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; background: #f9fafb; }
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
    /* Fit the whole grid on the page regardless of the on-screen min-width. */
    .grid-wrap { overflow: visible; }
    table { min-width: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Schedule — Week of ${dateLabel}</h1>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="grid-wrap">
    <table>
      <thead>
        <tr><th class="slot"></th>${headCells}</tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
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
