export const ISSUE_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
  "blocker",
] as const;

export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = [
  "open",
  "in_progress",
  "testing",
  "resolved",
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const API_ERROR_CODES = [
  "INVALID_WORKSPACE",
  "INVALID_ID",
  "INVALID_QUERY",
  "MALFORMED_JSON",
  "UNSUPPORTED_MEDIA_TYPE",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "WORKSPACE_LIMIT_REACHED",
  "CONCURRENT_MODIFICATION",
  "INVALID_STATUS_TRANSITION",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const SEVERITY_LABELS = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
  critical: "Критическая",
  blocker: "Блокер",
} as const satisfies Record<IssueSeverity, string>;

export const STATUS_LABELS = {
  open: "Открыт",
  in_progress: "В работе",
  testing: "Тестирование",
  resolved: "Решён",
} as const satisfies Record<IssueStatus, string>;

export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IssueMutableFields {
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
}

export interface IssueCreatePayload {
  title: string;
  description: string;
  severity: IssueSeverity;
  status?: IssueStatus;
}

type AtLeastOne<T, Keys extends keyof T = keyof T> = Keys extends keyof T
  ? Pick<T, Keys> & Partial<Omit<T, Keys>>
  : never;

export type IssuePatchPayload = AtLeastOne<IssueMutableFields>;

export interface IssueListResponse {
  items: Issue[];
  total: number;
}

export type ApiFieldErrors = Record<string, string>;

export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
  fields: ApiFieldErrors;
  requestId: string;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export const ISSUE_STATUS_TRANSITIONS = {
  open: ["in_progress"],
  in_progress: ["testing"],
  testing: ["in_progress", "resolved"],
  resolved: ["open"],
} as const satisfies Record<IssueStatus, readonly IssueStatus[]>;

export const DEFAULT_ISSUE_FORM_VALUES: Readonly<IssueMutableFields> = {
  title: "",
  description: "",
  severity: "medium",
  status: "open",
};

export function isIssueSeverity(value: unknown): value is IssueSeverity {
  return (
    typeof value === "string" &&
    (ISSUE_SEVERITIES as readonly string[]).includes(value)
  );
}

export function isIssueStatus(value: unknown): value is IssueStatus {
  return (
    typeof value === "string" &&
    (ISSUE_STATUSES as readonly string[]).includes(value)
  );
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === "string" &&
    (API_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function getAllowedStatusTransitions(
  status: IssueStatus,
): readonly IssueStatus[] {
  return ISSUE_STATUS_TRANSITIONS[status];
}

export function isAllowedStatusTransition(
  currentStatus: IssueStatus,
  nextStatus: IssueStatus,
): boolean {
  return (
    currentStatus === nextStatus ||
    getAllowedStatusTransitions(currentStatus).includes(nextStatus)
  );
}

export function getEditableStatuses(status: IssueStatus): IssueStatus[] {
  return [status, ...getAllowedStatusTransitions(status)];
}

export function formatStatusTransitionHint(status: IssueStatus): string {
  const transitions = getAllowedStatusTransitions(status);

  if (transitions.length === 1) {
    return `Доступный переход — «${STATUS_LABELS[transitions[0]]}».`;
  }

  return `Доступные переходы — «${transitions
    .map((nextStatus) => STATUS_LABELS[nextStatus])
    .join("» или «")}».`;
}
