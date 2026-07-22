import {
  normalizeIssueSearchQuery,
  type IssueFilters,
} from "../domain/filters";
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  type IssueSeverity,
  type IssueStatus,
} from "../domain/issues";

function normalizeSelection<T extends string>(
  selectedValues: readonly T[],
  allValues: readonly T[],
): T[] {
  const selected = new Set(selectedValues);
  const normalized = allValues.filter((value) => selected.has(value));
  return normalized.length === allValues.length ? [] : normalized;
}

export function normalizeIssueFilters(filters: IssueFilters): IssueFilters {
  return {
    q: normalizeIssueSearchQuery(filters.q),
    status: normalizeSelection<IssueStatus>(filters.status, ISSUE_STATUSES),
    severity: normalizeSelection<IssueSeverity>(
      filters.severity,
      ISSUE_SEVERITIES,
    ),
  };
}

export function buildIssueListSearchParams(
  filters: IssueFilters,
): URLSearchParams {
  const normalized = normalizeIssueFilters(filters);
  const searchParams = new URLSearchParams();

  if (normalized.q) {
    searchParams.set("q", normalized.q);
  }

  for (const status of normalized.status) {
    searchParams.append("status", status);
  }

  for (const severity of normalized.severity) {
    searchParams.append("severity", severity);
  }

  return searchParams;
}

export function buildIssueListQueryString(filters: IssueFilters): string {
  return buildIssueListSearchParams(filters).toString();
}

export function buildIssueListPath(
  filters: IssueFilters,
  collectionPath = "/api/issues",
): string {
  const query = buildIssueListQueryString(filters);
  return query ? `${collectionPath}?${query}` : collectionPath;
}
