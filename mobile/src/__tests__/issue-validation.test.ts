import { describe, expect, it } from "@jest/globals";

import {
  getDescriptionCharacterCount,
  getUnicodeLength,
  hasUnsavedIssueChanges,
  validateCreateIssueForm,
  validateEditIssueForm,
  type IssueFormValues,
} from "../domain/issue-validation";
import type { IssueMutableFields } from "../domain/issues";

const VALID_FORM: IssueFormValues = {
  title: "Ошибка кнопки",
  description: "Кнопка не реагирует на нажатие.",
  severity: "high",
  status: "open",
};

const INITIAL_ISSUE: IssueMutableFields = {
  title: VALID_FORM.title,
  description: VALID_FORM.description,
  severity: "high",
  status: "open",
};

describe("issue form validation", () => {
  it("counts Unicode code points like the server instead of UTF-16 units", () => {
    expect("😀".length).toBe(2);
    expect(getUnicodeLength("😀")).toBe(1);
    expect(getDescriptionCharacterCount("😀".repeat(10))).toBe(10);
  });

  it("accepts Unicode values at the exact minimum and trims the payload", () => {
    const result = validateCreateIssueForm({
      title: "  😀😀😀  ",
      description: `  ${"😀".repeat(10)}  `,
      severity: "medium",
      status: "resolved",
    });

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.value).toEqual({
        title: "😀😀😀",
        description: "😀".repeat(10),
        severity: "medium",
        status: "resolved",
      });
    }
  });

  it("validates trimmed title and description bounds", () => {
    const tooShort = validateCreateIssueForm({
      ...VALID_FORM,
      title: "  ab  ",
      description: "  коротко ",
    });
    const tooLong = validateCreateIssueForm({
      ...VALID_FORM,
      title: "😀".repeat(121),
      description: "😀".repeat(2001),
    });

    expect(tooShort.errors.title).toContain("от 3 до 120");
    expect(tooShort.errors.description).toContain("от 10 до 2000");
    expect(tooLong.errors.title).toContain("от 3 до 120");
    expect(tooLong.errors.description).toContain("от 10 до 2000");
  });

  it("rejects unknown severity and status values", () => {
    const result = validateCreateIssueForm({
      ...VALID_FORM,
      severity: "urgent",
      status: "closed",
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toMatchObject({
      severity: "Выберите допустимую критичность.",
      status: "Выберите допустимый статус.",
    });
  });

  it("returns only normalized fields that actually changed on edit", () => {
    const result = validateEditIssueForm(
      {
        ...VALID_FORM,
        title: "  Ошибка кнопки Save  ",
        status: "in_progress",
      },
      INITIAL_ISSUE,
    );

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.value).toEqual({
        title: "Ошибка кнопки Save",
        status: "in_progress",
      });
    }
  });

  it("rejects an empty edit patch after submit-time trimming", () => {
    const result = validateEditIssueForm(
      { ...VALID_FORM, title: `  ${VALID_FORM.title}  ` },
      INITIAL_ISSUE,
    );

    expect(result).toEqual({
      isValid: false,
      value: null,
      errors: { _form: "Измените хотя бы одно поле." },
    });
  });

  it("rejects a forbidden edit transition", () => {
    const result = validateEditIssueForm(
      { ...VALID_FORM, status: "testing" },
      INITIAL_ISSUE,
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.status).toBe(
      "Выберите один из доступных переходов статуса.",
    );
  });

  it("detects raw unsaved changes even when submit trimming cancels them", () => {
    expect(
      hasUnsavedIssueChanges(
        { ...VALID_FORM, title: ` ${VALID_FORM.title}` },
        VALID_FORM,
      ),
    ).toBe(true);
    expect(hasUnsavedIssueChanges(VALID_FORM, { ...VALID_FORM })).toBe(false);
  });
});
