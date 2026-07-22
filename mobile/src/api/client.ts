import { Platform } from "react-native";

import type { IssueFilters } from "@/domain/filters";
import {
  isIssueSeverity,
  isIssueStatus,
  type Issue,
  type IssueCreatePayload,
  type IssueListResponse,
  type IssuePatchPayload,
  type JsonValue
} from "@/domain/issues";
import { ApiError, isApiErrorResponse } from "@/lib/errors";
import { formatCurlCommand } from "@/lib/curl";
import { buildIssueListPath } from "@/lib/query";
import {
  getUnicodeLength,
  ISSUE_DESCRIPTION_MAX_LENGTH,
  ISSUE_DESCRIPTION_MIN_LENGTH,
  ISSUE_TITLE_MAX_LENGTH,
  ISSUE_TITLE_MIN_LENGTH
} from "@/domain/issue-validation";
import { isValidUuid } from "@/lib/workspace";

export type WorkspaceSnapshot = { id: string; revision: number };

export type InspectorEntry = {
  sequence: number;
  workspaceRevision: number;
  method: string;
  url: string;
  statusLabel: string;
  durationMs: number;
  headers: Record<string, string>;
  requestBody: JsonValue | null;
  responseBody: JsonValue | string | null;
  serializedBody?: string;
  curl: string;
  ok: boolean;
};

type FetchLike = typeof fetch;

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: IssueCreatePayload | IssuePatchPayload;
  signal?: AbortSignal;
  inspect?: boolean;
};

type ClientOptions = {
  baseUrl: string;
  fetchImpl?: FetchLike;
  getWorkspace: () => WorkspaceSnapshot;
  onInspect: (entry: InspectorEntry) => void;
};

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  500: "Internal Server Error",
  503: "Service Unavailable"
};

function createAbortError(message = "Request aborted") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function hasWorkspaceChanged(
  initial: WorkspaceSnapshot,
  current: WorkspaceSnapshot
): boolean {
  return initial.revision !== current.revision || initial.id !== current.id;
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}

function isStoredText(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string" || value !== value.trim()) return false;
  const length = getUnicodeLength(value);
  return length >= minimum && length <= maximum;
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function isIssue(value: unknown): value is Issue {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "title",
      "description",
      "severity",
      "status",
      "createdAt",
      "updatedAt"
    ]) &&
    typeof value.id === "string" &&
    isValidUuid(value.id) &&
    isStoredText(value.title, ISSUE_TITLE_MIN_LENGTH, ISSUE_TITLE_MAX_LENGTH) &&
    isStoredText(
      value.description,
      ISSUE_DESCRIPTION_MIN_LENGTH,
      ISSUE_DESCRIPTION_MAX_LENGTH
    ) &&
    isIssueSeverity(value.severity) &&
    isIssueStatus(value.status) &&
    isIsoDateTime(value.createdAt) &&
    isIsoDateTime(value.updatedAt)
  );
}

export function isIssueListResponse(value: unknown): value is IssueListResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["items", "total"]) &&
    Array.isArray(value.items) &&
    value.items.length <= 50 &&
    value.items.every(isIssue) &&
    typeof value.total === "number" &&
    Number.isInteger(value.total) &&
    value.total >= 0 &&
    value.total <= 50
  );
}

function requireIssue(value: unknown): Issue {
  if (!isIssue(value)) {
    throw new ApiError("API вернул неожиданный формат дефекта");
  }
  return value;
}

function requireIssueList(value: unknown): IssueListResponse {
  if (!isIssueListResponse(value)) {
    throw new ApiError("API вернул неожиданный формат списка");
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getConfiguredApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured?.trim()) return normalizeBaseUrl(configured);

  if (__DEV__) {
    return Platform.OS === "android"
      ? "http://10.0.2.2:8888"
      : "http://127.0.0.1:8888";
  }

  throw new Error("EXPO_PUBLIC_API_BASE_URL is required for production builds");
}

export function createIssuesApi({
  baseUrl,
  fetchImpl = fetch,
  getWorkspace,
  onInspect
}: ClientOptions) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  let requestSequence = 0;

  async function request(path: string, options: RequestOptions = {}) {
    const sequence = ++requestSequence;
    const workspace = getWorkspace();
    const method = options.method ?? "GET";
    const absoluteUrl = new URL(path, normalizedBaseUrl + "/").toString();
    const serializedBody = options.body === undefined
      ? undefined
      : JSON.stringify(options.body);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Demo-Workspace-Id": workspace.id
    };
    if (serializedBody !== undefined) headers["Content-Type"] = "application/json";

    const startedAt = now();
    try {
      const response = await fetchImpl(absoluteUrl, {
        method,
        headers,
        body: serializedBody,
        signal: options.signal
      });
      const responseText = await response.text();
      let responseBody: JsonValue | string | null = null;

      if (responseText) {
        try {
          responseBody = JSON.parse(responseText) as JsonValue;
        } catch {
          responseBody = responseText;
        }
      }

      if (hasWorkspaceChanged(workspace, getWorkspace())) {
        throw createAbortError("Workspace changed");
      }

      const statusText = response.statusText || STATUS_TEXT[response.status] || "";
      if (options.inspect !== false) {
        onInspect({
          sequence,
          workspaceRevision: workspace.revision,
          method,
          url: absoluteUrl,
          statusLabel: `${response.status}${statusText ? ` ${statusText}` : ""}`,
          durationMs: now() - startedAt,
          headers,
          requestBody: (options.body as JsonValue | undefined) ?? null,
          responseBody,
          serializedBody,
          curl: formatCurlCommand({
            method,
            url: absoluteUrl,
            headers,
            serializedBody
          }),
          ok: response.ok
        });
      }

      if (!response.ok) {
        const payload = isApiErrorResponse(responseBody) ? responseBody : null;
        const rawPayload = isRecord(responseBody) ? responseBody : null;
        const detail = rawPayload && isRecord(rawPayload.error) ? rawPayload.error : null;
        throw new ApiError(
          typeof detail?.message === "string" ? detail.message : "API request failed",
          { status: response.status, payload }
        );
      }

      return responseBody;
    } catch (error) {
      if (hasWorkspaceChanged(workspace, getWorkspace())) {
        throw createAbortError("Workspace changed");
      }
      if ((error as Error)?.name === "AbortError" || error instanceof ApiError) {
        throw error;
      }

      if (options.inspect !== false) {
        const responseBody = { error: { message: "Network request failed" } };
        onInspect({
          sequence,
          workspaceRevision: workspace.revision,
          method,
          url: absoluteUrl,
          statusLabel: "NETWORK ERROR",
          durationMs: now() - startedAt,
          headers,
          requestBody: (options.body as JsonValue | undefined) ?? null,
          responseBody,
          serializedBody,
          curl: formatCurlCommand({
            method,
            url: absoluteUrl,
            headers,
            serializedBody
          }),
          ok: false
        });
      }
      throw ApiError.network();
    }
  }

  return {
    async list(filters: IssueFilters, signal?: AbortSignal, inspect = true) {
      return requireIssueList(
        await request(buildIssueListPath(filters), { signal, inspect })
      );
    },
    async get(id: string, inspect = true, signal?: AbortSignal) {
      return requireIssue(
        await request(`/api/issues/${encodeURIComponent(id)}`, { inspect, signal })
      );
    },
    async create(payload: IssueCreatePayload) {
      return requireIssue(await request("/api/issues", { method: "POST", body: payload }));
    },
    async update(id: string, payload: IssuePatchPayload, inspect = true) {
      return requireIssue(
        await request(`/api/issues/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: payload,
          inspect
        })
      );
    },
    async remove(id: string) {
      const result = await request(`/api/issues/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (result !== null) throw new ApiError("API вернул неожиданное тело DELETE");
    }
  };
}

export type IssuesApi = ReturnType<typeof createIssuesApi>;
