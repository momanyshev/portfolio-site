import { describe, expect, it } from "@jest/globals";

import {
  hasUnsavedWorkspaceChanges,
  isSameWorkspaceId,
  isValidUuid,
  normalizeWorkspaceId,
  validateWorkspaceId,
} from "../lib/workspace";

const WORKSPACE_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("workspace UUID helpers", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeWorkspaceId(`  ${WORKSPACE_ID.toUpperCase()}\n`)).toBe(
      WORKSPACE_ID,
    );
  });

  it("validates the API UUID shape", () => {
    expect(isValidUuid(WORKSPACE_ID)).toBe(true);
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid(` ${WORKSPACE_ID} `)).toBe(false);
    expect(isValidUuid(null)).toBe(false);
  });

  it("returns a normalized value only for valid input", () => {
    expect(validateWorkspaceId(` ${WORKSPACE_ID.toUpperCase()} `)).toEqual({
      isValid: true,
      value: WORKSPACE_ID,
      error: null,
    });
    expect(validateWorkspaceId("   ")).toMatchObject({
      isValid: false,
      error: "Введите Workspace ID.",
    });
    expect(validateWorkspaceId("broken")).toMatchObject({
      isValid: false,
      error:
        "Введите UUID в формате 123e4567-e89b-12d3-a456-426614174000.",
    });
  });

  it("does not treat formatting-only edits as a workspace change", () => {
    expect(isSameWorkspaceId(WORKSPACE_ID, ` ${WORKSPACE_ID.toUpperCase()} `)).toBe(
      true,
    );
    expect(
      hasUnsavedWorkspaceChanges(` ${WORKSPACE_ID.toUpperCase()} `, WORKSPACE_ID),
    ).toBe(false);
    expect(
      hasUnsavedWorkspaceChanges(
        "223e4567-e89b-12d3-a456-426614174000",
        WORKSPACE_ID,
      ),
    ).toBe(true);
  });
});
