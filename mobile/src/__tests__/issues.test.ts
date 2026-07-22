import { describe, expect, it } from "@jest/globals";

import {
  getAllowedStatusTransitions,
  getEditableStatuses,
  isAllowedStatusTransition,
  isIssueSeverity,
  isIssueStatus,
  formatStatusTransitionHint,
  SEVERITY_LABELS,
  STATUS_LABELS,
} from "../domain/issues";

describe("issue domain", () => {
  it("exposes the Russian API value labels", () => {
    expect(SEVERITY_LABELS).toEqual({
      low: "Низкая",
      medium: "Средняя",
      high: "Высокая",
      critical: "Критическая",
      blocker: "Блокер",
    });
    expect(STATUS_LABELS).toEqual({
      open: "Открыт",
      in_progress: "В работе",
      testing: "Тестирование",
      resolved: "Решён",
    });
  });

  it("implements every documented status transition", () => {
    expect(getAllowedStatusTransitions("open")).toEqual(["in_progress"]);
    expect(getAllowedStatusTransitions("in_progress")).toEqual(["testing"]);
    expect(getAllowedStatusTransitions("testing")).toEqual([
      "in_progress",
      "resolved",
    ]);
    expect(getAllowedStatusTransitions("resolved")).toEqual(["open"]);

    expect(isAllowedStatusTransition("open", "open")).toBe(true);
    expect(isAllowedStatusTransition("testing", "in_progress")).toBe(true);
    expect(isAllowedStatusTransition("resolved", "open")).toBe(true);
    expect(isAllowedStatusTransition("open", "testing")).toBe(false);
    expect(isAllowedStatusTransition("resolved", "testing")).toBe(false);
  });

  it("builds edit options and a localized transition hint", () => {
    expect(getEditableStatuses("testing")).toEqual([
      "testing",
      "in_progress",
      "resolved",
    ]);
    expect(formatStatusTransitionHint("open")).toBe(
      "Доступный переход — «В работе».",
    );
    expect(formatStatusTransitionHint("testing")).toBe(
      "Доступные переходы — «В работе» или «Решён».",
    );
  });

  it("narrows API enum values at runtime", () => {
    expect(isIssueSeverity("blocker")).toBe(true);
    expect(isIssueSeverity("urgent")).toBe(false);
    expect(isIssueStatus("in_progress")).toBe(true);
    expect(isIssueStatus(null)).toBe(false);
  });
});
