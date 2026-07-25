import { describe, it, expect } from "vitest";
import { isPastWeek, isCurrentWeek, weekStartOf } from "../../../shared/weekDates";

// Week of Sun 2026-07-19 spans [07-19, 07-26).
const WEEK = "2026-07-19";
const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe("isPastWeek", () => {
  it("is false before the week starts (upcoming)", () => {
    expect(isPastWeek(WEEK, at("2026-07-18"))).toBe(false);
  });
  it("is false mid-week (current)", () => {
    expect(isPastWeek(WEEK, at("2026-07-23"))).toBe(false);
  });
  it("is false on the last day of the week (Sat)", () => {
    expect(isPastWeek(WEEK, at("2026-07-25"))).toBe(false);
  });
  it("is true once the following Sunday arrives", () => {
    expect(isPastWeek(WEEK, at("2026-07-26"))).toBe(true);
  });
  it("accepts a Date startDate too", () => {
    expect(isPastWeek(new Date("2026-07-19T00:00:00Z"), at("2026-08-01"))).toBe(true);
  });
});

describe("isCurrentWeek", () => {
  it("is true on the first day", () => {
    expect(isCurrentWeek(WEEK, at("2026-07-19"))).toBe(true);
  });
  it("is true mid-week", () => {
    expect(isCurrentWeek(WEEK, at("2026-07-23"))).toBe(true);
  });
  it("is false before it starts", () => {
    expect(isCurrentWeek(WEEK, at("2026-07-18"))).toBe(false);
  });
  it("is false once elapsed", () => {
    expect(isCurrentWeek(WEEK, at("2026-07-26"))).toBe(false);
  });
});

describe("weekStartOf", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  it("returns the same day for a Sunday", () => {
    expect(iso(weekStartOf(at("2026-07-19")))).toBe("2026-07-19");
  });
  it("rolls back to Sunday mid-week", () => {
    expect(iso(weekStartOf(at("2026-07-23")))).toBe("2026-07-19"); // Thu
  });
  it("rolls back to Sunday on Saturday", () => {
    expect(iso(weekStartOf(at("2026-07-25")))).toBe("2026-07-19"); // Sat
  });
});
