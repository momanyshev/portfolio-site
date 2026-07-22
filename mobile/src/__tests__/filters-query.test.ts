import { describe, expect, it } from "@jest/globals";

import {
  createEmptyIssueFilters,
  getIssueSearchQueryError,
  hasActiveIssueFilters,
  issueMatchesFilters,
  toggleIssueFilter,
  type IssueFilters,
} from "../domain/filters";
import type { Issue } from "../domain/issues";
import {
  buildIssueListPath,
  buildIssueListQueryString,
  buildIssueListSearchParams,
  normalizeIssueFilters,
} from "../lib/query";

describe("issue filters", () => {
  it("represents All as empty arrays and collapses a complete selection", () => {
    let filters = createEmptyIssueFilters();
    filters = toggleIssueFilter(filters, "status", "open");
    filters = toggleIssueFilter(filters, "status", "testing");

    expect(filters.status).toEqual(["open", "testing"]);

    filters = toggleIssueFilter(filters, "status", "in_progress");
    filters = toggleIssueFilter(filters, "status", "resolved");

    expect(filters.status).toEqual([]);
  });

  it("selecting All or removing the last concrete value restores All", () => {
    const selected = toggleIssueFilter(
      createEmptyIssueFilters(),
      "severity",
      "critical",
    );

    expect(toggleIssueFilter(selected, "severity", "all").severity).toEqual([]);
    expect(toggleIssueFilter(selected, "severity", "critical").severity).toEqual(
      [],
    );
  });

  it("normalizes filter order, duplicates, full sets, and the search query", () => {
    expect(
      normalizeIssueFilters({
        q: "  кнопка  ",
        status: ["testing", "open", "testing"],
        severity: ["blocker", "high"],
      }),
    ).toEqual({
      q: "кнопка",
      status: ["open", "testing"],
      severity: ["high", "blocker"],
    });

    expect(
      normalizeIssueFilters({
        q: "",
        status: ["resolved", "testing", "open", "in_progress"],
        severity: [],
      }).status,
    ).toEqual([]);
  });

  it("builds repeated status and severity query parameters", () => {
    const filters: IssueFilters = {
      q: " кнопка ",
      status: ["open", "testing"],
      severity: ["high", "blocker"],
    };
    const params = buildIssueListSearchParams(filters);

    expect(params.get("q")).toBe("кнопка");
    expect(params.getAll("status")).toEqual(["open", "testing"]);
    expect(params.getAll("severity")).toEqual(["high", "blocker"]);
    expect(buildIssueListQueryString(filters).match(/status=/g)).toHaveLength(2);
    expect(buildIssueListQueryString(filters).match(/severity=/g)).toHaveLength(2);
    expect(buildIssueListPath(filters)).toBe(
      `/api/issues?${buildIssueListQueryString(filters)}`,
    );
  });

  it("omits inactive and explicit full-set filters from the URL", () => {
    expect(buildIssueListPath(createEmptyIssueFilters())).toBe("/api/issues");
    expect(
      buildIssueListPath({
        q: "  ",
        status: ["open", "in_progress", "testing", "resolved"],
        severity: [],
      }),
    ).toBe("/api/issues");
  });

  it("uses AND across filter fields and case-insensitive title/description search", () => {
    const issue: Issue = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      title: "Кнопка SAVE не работает",
      description: "Ошибка появляется после отправки формы.",
      severity: "high",
      status: "open",
      createdAt: "2026-07-21T10:00:00.000Z",
      updatedAt: "2026-07-21T10:00:00.000Z",
    };

    expect(
      issueMatchesFilters(issue, {
        q: "save",
        status: ["open", "testing"],
        severity: ["high"],
      }),
    ).toBe(true);
    expect(
      issueMatchesFilters(issue, {
        q: "save",
        status: ["testing"],
        severity: ["high"],
      }),
    ).toBe(false);
  });

  it("validates the 120 Unicode code-point search limit", () => {
    expect(getIssueSearchQueryError("😀".repeat(120))).toBeNull();
    expect(getIssueSearchQueryError(`  ${"😀".repeat(121)}  `)).toContain("120");
    expect(
      hasActiveIssueFilters({ q: "  ", status: [], severity: [] }),
    ).toBe(false);
  });
});
