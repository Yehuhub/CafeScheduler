import { describe, it, expect } from "vitest";
import {
  buildScheduleView,
  renderScheduleHtml,
} from "../../src/services/scheduleExport";
import type { RoleWorking, Slot } from "../../../shared/types";

function assign(userId: number, day: number, slot: Slot, roleWorking: RoleWorking) {
  return { userId, day, slot, roleWorking };
}

const names = new Map([
  [1, "Alice"],
  [2, "Bob"],
  [3, "Carol"],
]);

describe("buildScheduleView", () => {
  it("groups people into the right day/slot cells", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      assignments: [
        assign(1, 0, "morning", "cook"),
        assign(2, 0, "morning", "barista"),
        assign(3, 5, "evening", "barista"),
      ],
      names,
    });

    expect(view.cells["0-morning"]).toEqual([
      { name: "Bob", role: "barista" },
      { name: "Alice", role: "cook" },
    ]);
    expect(view.cells["5-evening"]).toEqual([{ name: "Carol", role: "barista" }]);
  });

  it("only includes slots that have assignments, in SLOTS order", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      assignments: [
        assign(1, 0, "evening", "cook"),
        assign(2, 1, "morning", "barista"),
      ],
      names,
    });

    // morning + evening present (mid absent), morning before evening
    expect(view.slots).toEqual(["morning", "evening"]);
  });

  it("sorts each cell by role then name", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      assignments: [
        assign(2, 0, "morning", "cook"), // Bob, cook
        assign(1, 0, "morning", "barista"), // Alice, barista
        assign(3, 0, "morning", "barista"), // Carol, barista
      ],
      names,
    });

    // baristas (Alice, Carol) before cook (Bob); within role, alphabetical
    expect(view.cells["0-morning"]).toEqual([
      { name: "Alice", role: "barista" },
      { name: "Carol", role: "barista" },
      { name: "Bob", role: "cook" },
    ]);
  });

  it("falls back to #id when a name is missing", () => {
    const view = buildScheduleView({
      weekStartDate: "2026-06-07",
      assignments: [assign(99, 0, "morning", "cook")],
      names,
    });
    expect(view.cells["0-morning"]).toEqual([{ name: "#99", role: "cook" }]);
  });
});

describe("renderScheduleHtml", () => {
  const view = buildScheduleView({
    weekStartDate: "2026-06-07",
    assignments: [assign(1, 0, "morning", "cook")],
    names,
  });
  const html = renderScheduleHtml(view);

  it("renders day headers and the week date", () => {
    expect(html).toContain("Sun");
    expect(html).toContain("Sat");
    expect(html).toContain("Jun 7, 2026");
  });

  it("renders assigned names", () => {
    expect(html).toContain("Alice");
  });

  it("omits slot rows that have no assignments", () => {
    // Only morning is used; evening/mid slot label rows should not appear in the body
    expect(html).not.toContain(">Evening<");
    expect(html).not.toContain(">Mid<");
  });

  it("escapes names containing HTML metacharacters", () => {
    const evil = renderScheduleHtml(
      buildScheduleView({
        weekStartDate: "2026-06-07",
        assignments: [assign(1, 0, "morning", "cook")],
        names: new Map([[1, '<script>&"x']]),
      })
    );
    expect(evil).toContain("&lt;script&gt;&amp;&quot;x");
    expect(evil).not.toContain("<script>&");
  });
});
