import {
  isAllowedStatusTransition,
  isIssueSeverity,
  isIssueStatus,
  type IssueMutableFields,
  type IssuePatchPayload,
} from "./issues";

export const ISSUE_TITLE_MIN_LENGTH = 3;
export const ISSUE_TITLE_MAX_LENGTH = 120;
export const ISSUE_DESCRIPTION_MIN_LENGTH = 10;
export const ISSUE_DESCRIPTION_MAX_LENGTH = 2000;

export interface IssueFormValues {
  title: string;
  description: string;
  severity: string;
  status: string;
}

export type IssueFormField = keyof IssueFormValues;
export type IssueValidationField = IssueFormField | "_form";
export type IssueValidationErrors = Partial<
  Record<IssueValidationField, string>
>;

export type IssueValidationResult<T> =
  | {
      isValid: true;
      value: T;
      errors: IssueValidationErrors;
    }
  | {
      isValid: false;
      value: null;
      errors: IssueValidationErrors;
    };

interface NormalizedFormResult {
  value: IssueMutableFields | null;
  errors: IssueValidationErrors;
}

/** Matches the API's `[...value].length` Unicode code-point counting. */
export function getUnicodeLength(value: string): number {
  return [...value].length;
}

export function getDescriptionCharacterCount(value: string): number {
  return getUnicodeLength(value);
}

export function normalizeIssueText(value: string): string {
  return value.trim();
}

function normalizeAndValidateIssueForm(
  values: IssueFormValues,
): NormalizedFormResult {
  const errors: IssueValidationErrors = {};
  const title = normalizeIssueText(values.title);
  const description = normalizeIssueText(values.description);
  const titleLength = getUnicodeLength(title);
  const descriptionLength = getUnicodeLength(description);

  if (
    titleLength < ISSUE_TITLE_MIN_LENGTH ||
    titleLength > ISSUE_TITLE_MAX_LENGTH
  ) {
    errors.title =
      "Введите от 3 до 120 символов без учёта пробелов по краям.";
  }

  if (
    descriptionLength < ISSUE_DESCRIPTION_MIN_LENGTH ||
    descriptionLength > ISSUE_DESCRIPTION_MAX_LENGTH
  ) {
    errors.description =
      "Введите от 10 до 2000 символов без учёта пробелов по краям.";
  }

  if (!isIssueSeverity(values.severity)) {
    errors.severity = "Выберите допустимую критичность.";
  }

  if (!isIssueStatus(values.status)) {
    errors.status = "Выберите допустимый статус.";
  }

  if (Object.keys(errors).length > 0) {
    return { value: null, errors };
  }

  // Both values were narrowed by the checks above. Keeping the construction
  // here ensures invalid select values never escape into an API payload.
  return {
    value: {
      title,
      description,
      severity: values.severity as IssueMutableFields["severity"],
      status: values.status as IssueMutableFields["status"],
    },
    errors,
  };
}

export function validateCreateIssueForm(
  values: IssueFormValues,
): IssueValidationResult<IssueMutableFields> {
  const result = normalizeAndValidateIssueForm(values);

  if (!result.value) {
    return { isValid: false, value: null, errors: result.errors };
  }

  return { isValid: true, value: result.value, errors: {} };
}

export function validateEditIssueForm(
  values: IssueFormValues,
  initialValue: IssueMutableFields,
): IssueValidationResult<IssuePatchPayload> {
  const result = normalizeAndValidateIssueForm(values);

  if (!result.value) {
    return { isValid: false, value: null, errors: result.errors };
  }

  if (!isAllowedStatusTransition(initialValue.status, result.value.status)) {
    return {
      isValid: false,
      value: null,
      errors: {
        status: "Выберите один из доступных переходов статуса.",
      },
    };
  }

  const patch: Partial<IssueMutableFields> = {};

  if (result.value.title !== initialValue.title) {
    patch.title = result.value.title;
  }
  if (result.value.description !== initialValue.description) {
    patch.description = result.value.description;
  }
  if (result.value.severity !== initialValue.severity) {
    patch.severity = result.value.severity;
  }
  if (result.value.status !== initialValue.status) {
    patch.status = result.value.status;
  }

  if (Object.keys(patch).length === 0) {
    return {
      isValid: false,
      value: null,
      errors: { _form: "Измените хотя бы одно поле." },
    };
  }

  return {
    isValid: true,
    value: patch as IssuePatchPayload,
    errors: {},
  };
}

/**
 * Uses raw values intentionally: trimming is a submit-time normalization, while
 * adding or removing edge whitespace still counts as an unsaved form change.
 */
export function hasUnsavedIssueChanges(
  values: IssueFormValues,
  snapshot: IssueFormValues,
): boolean {
  return (
    values.title !== snapshot.title ||
    values.description !== snapshot.description ||
    values.severity !== snapshot.severity ||
    values.status !== snapshot.status
  );
}
