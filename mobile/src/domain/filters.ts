import { getUnicodeLength } from "./issue-validation";
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  type Issue,
  type IssueSeverity,
  type IssueStatus,
} from "./issues";

export const ISSUE_SEARCH_MAX_LENGTH = 120;

export interface IssueFilters {
  q: string;
  status: IssueStatus[];
  severity: IssueSeverity[];
}

export type IssueFilterKind = "status" | "severity";

export function createEmptyIssueFilters(): IssueFilters {
  return { q: "", status: [], severity: [] };
}

export function normalizeIssueSearchQuery(value: string): string {
  return value.trim();
}

export function getIssueSearchQueryError(value: string): string | null {
  return getUnicodeLength(normalizeIssueSearchQuery(value)) >
    ISSUE_SEARCH_MAX_LENGTH
    ? "Введите не более 120 символов без учёта пробелов по краям."
    : null;
}

export function hasActiveIssueFilters(filters: IssueFilters): boolean {
  return Boolean(
    normalizeIssueSearchQuery(filters.q) ||
      filters.status.length ||
      filters.severity.length,
  );
}

export function toggleFilterSelection<T extends string>(
  selectedValues: readonly T[],
  changedValue: T | "all",
  allValues: readonly T[],
): T[] {
  if (changedValue === "all") {
    return [];
  }

  if (!allValues.includes(changedValue)) {
    throw new RangeError(`Unknown filter value: ${changedValue}`);
  }

  const selected = new Set(
    selectedValues.filter((value) => allValues.includes(value)),
  );

  if (selected.has(changedValue)) {
    selected.delete(changedValue);
  } else {
    selected.add(changedValue);
  }

  if (selected.size === 0 || selected.size === allValues.length) {
    return [];
  }

  return allValues.filter((value) => selected.has(value));
}

export function toggleIssueFilter(
  filters: IssueFilters,
  kind: "status",
  value: IssueStatus | "all",
): IssueFilters;
export function toggleIssueFilter(
  filters: IssueFilters,
  kind: "severity",
  value: IssueSeverity | "all",
): IssueFilters;
export function toggleIssueFilter(
  filters: IssueFilters,
  kind: IssueFilterKind,
  value: IssueStatus | IssueSeverity | "all",
): IssueFilters {
  if (kind === "status") {
    return {
      ...filters,
      status: toggleFilterSelection(
        filters.status,
        value as IssueStatus | "all",
        ISSUE_STATUSES,
      ),
    };
  }

  return {
    ...filters,
    severity: toggleFilterSelection(
      filters.severity,
      value as IssueSeverity | "all",
      ISSUE_SEVERITIES,
    ),
  };
}

export function issueMatchesFilters(
  issue: Issue,
  filters: IssueFilters,
): boolean {
  const query = normalizeIssueSearchQuery(filters.q).toLocaleLowerCase("ru");
  const searchableText = `${issue.title}\n${issue.description}`.toLocaleLowerCase(
    "ru",
  );

  return (
    (!query || searchableText.includes(query)) &&
    (!filters.status.length || filters.status.includes(issue.status)) &&
    (!filters.severity.length || filters.severity.includes(issue.severity))
  );
}
