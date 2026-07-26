import { describe, it, expect } from "vitest";
import {
  buildScheduleView,
  renderScheduleHtml,
} from "../../src/services/scheduleExport";
import type { RoleWorking } from "../../../shared/types";

// Shift fixtures: named shifts with start times (drive chronological row ordering).
const MORNING = { id: 1, name: "Morning", startTime: "06:00" };
const EVENING = { id: 3, name: "Evening", startTime: "13:00" };
const allShifts = [MORNING, EVENING];

function assign(userId: number, day: number, shift: { id: number }, roleWorking: RoleWorking) {
  return { userId, day, shiftId: shift.id, roleWorking };
}

const names = new Map([
  [1, "Alice"],
  [2, "Bob"],
  [3, "Carol"],
]);

describe("buildScheduleView", () => {
  it("groups people into the right day/shift cells", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      shifts: allShifts,
      assignments: [
        assign(1, 0, MORNING, "cook"),
        assign(2, 0, MORNING, "barista"),
        assign(3, 5, EVENING, "barista"),
      ],
      names,
    });

    expect(view.cells[`0-${MORNING.id}`]).toEqual([
      { name: "Bob", role: "barista" },
      { name: "Alice", role: "cook" },
    ]);
    expect(view.cells[`5-${EVENING.id}`]).toEqual([{ name: "Carol", role: "barista" }]);
  });

  it("only includes shifts that have assignments, in start-time order", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      shifts: allShifts,
      assignments: [
        assign(1, 0, EVENING, "cook"),
        assign(2, 1, MORNING, "barista"),
      ],
      names,
    });

    // both present, morning (06:00) before evening (13:00) regardless of assignment order
    expect(view.shifts).toEqual([
      { id: MORNING.id, name: "Morning" },
      { id: EVENING.id, name: "Evening" },
    ]);
  });

  it("drops shifts with no assignments", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      shifts: allShifts,
      assignments: [assign(1, 0, MORNING, "cook")],
      names,
    });
    expect(view.shifts).toEqual([{ id: MORNING.id, name: "Morning" }]);
  });

  it("sorts each cell by role then name", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      shifts: allShifts,
      assignments: [
        assign(2, 0, MORNING, "cook"), // Bob, cook
        assign(1, 0, MORNING, "barista"), // Alice, barista
        assign(3, 0, MORNING, "barista"), // Carol, barista
      ],
      names,
    });

    // baristas (Alice, Carol) before cook (Bob); within role, alphabetical
    expect(view.cells[`0-${MORNING.id}`]).toEqual([
      { name: "Alice", role: "barista" },
      { name: "Carol", role: "barista" },
      { name: "Bob", role: "cook" },
    ]);
  });

  it("falls back to #id when a name is missing", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      shifts: allShifts,
      assignments: [assign(99, 0, MORNING, "cook")],
      names,
    });
    expect(view.cells[`0-${MORNING.id}`]).toEqual([{ name: "#99", role: "cook" }]);
  });
});

describe("renderScheduleHtml", () => {
  const view = buildScheduleView({
    weekStartDate: "2026-06-07",
    shifts: allShifts,
    assignments: [assign(1, 0, MORNING, "cook")],
    names,
  });
  const html = renderScheduleHtml(view);

  it("renders day headers and the week date", () => {
    expect(html).toContain("Sun");
    expect(html).toContain("Sat");
    expect(html).toContain("Jun 7, 2026");
  });

  it("renders the shift name as a row label", () => {
    expect(html).toContain(">Morning<");
  });

  it("renders assigned names", () => {
    expect(html).toContain("Alice");
  });

  it("omits shift rows that have no assignments", () => {
    // Only Morning is used; the Evening row label should not appear in the body
    expect(html).not.toContain(">Evening<");
  });

  it("escapes names containing HTML metacharacters", () => {
    const evil = renderScheduleHtml(
      buildScheduleView({
        weekStartDate: "2026-06-07",
        shifts: allShifts,
        assignments: [assign(1, 0, MORNING, "cook")],
        names: new Map([[1, '<script>&"x']]),
      })
    );
    expect(evil).toContain("&lt;script&gt;&amp;&quot;x");
    expect(evil).not.toContain("<script>&");
  });
});
