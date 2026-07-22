import { describe, expect, it, jest } from "@jest/globals";

import {
  createIssuesApi,
  type InspectorEntry,
  type WorkspaceSnapshot,
} from "../api/client";
import { createEmptyIssueFilters } from "../domain/filters";
import type { Issue, IssueCreatePayload } from "../domain/issues";
import {
  createInspectorSequencingState,
  recordInspectorEntry,
  type InspectorSequencingState,
} from "../lib/inspector";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174001";

type TestFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;
type FetchMock = jest.Mock<TestFetch>;

const ISSUE: Issue = {
  id: "123e4567-e89b-42d3-a456-426614174010",
  title: "Кнопка сохранения не работает",
  description: "Форма остаётся открытой после отправки.",
  severity: "high",
  status: "open",
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-21T10:00:00.000Z",
};

function makeResponse(
  body: unknown,
  options: { status?: number; statusText?: string } = {},
): Response {
  const status = options.status ?? 200;
  const responseText = body === undefined ? "" : JSON.stringify(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: options.statusText ?? "",
    text: jest.fn(async () => responseText),
  } as unknown as Response;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function createClient(
  fetchMock: FetchMock,
  options: {
    getWorkspace?: () => WorkspaceSnapshot;
    onInspect?: (entry: InspectorEntry) => void;
    baseUrl?: string;
  } = {},
) {
  return createIssuesApi({
    baseUrl: options.baseUrl ?? "https://api.example.test/",
    fetchImpl: fetchMock as unknown as typeof fetch,
    getWorkspace:
      options.getWorkspace ?? (() => ({ id: WORKSPACE_ID, revision: 0 })),
    onInspect: options.onInspect ?? (() => undefined),
  });
}

describe("issues API client", () => {
  it("adds workspace and JSON headers while omitting Content-Type for bodyless requests", async () => {
    const payload: IssueCreatePayload = {
      title: ISSUE.title,
      description: ISSUE.description,
      severity: ISSUE.severity,
      status: ISSUE.status,
    };
    const fetchMock = jest
      .fn<TestFetch>()
      .mockResolvedValueOnce(makeResponse({ items: [ISSUE], total: 1 }))
      .mockResolvedValueOnce(
        makeResponse(ISSUE, { status: 201, statusText: "Created" }),
      );
    const api = createClient(fetchMock);

    await api.list(createEmptyIssueFilters());
    await api.create(payload);

    const listInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(listInit.headers).toEqual({
      Accept: "application/json",
      "X-Demo-Workspace-Id": WORKSPACE_ID,
    });
    expect(listInit.body).toBeUndefined();

    const createInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(createInit).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Demo-Workspace-Id": WORKSPACE_ID,
        },
      }),
    );
  });

  it("builds an absolute URL with repeated normalized filters", async () => {
    const inspections: InspectorEntry[] = [];
    const fetchMock = jest
      .fn<TestFetch>()
      .mockResolvedValue(makeResponse({ items: [], total: 0 }));
    const api = createClient(fetchMock, {
      baseUrl: "https://api.example.test///",
      onInspect: (entry) => inspections.push(entry),
    });

    await api.list({
      q: "  кнопка  ",
      status: ["testing", "open", "testing"],
      severity: ["blocker", "high"],
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.origin).toBe("https://api.example.test");
    expect(requestUrl.pathname).toBe("/api/issues");
    expect(requestUrl.searchParams.get("q")).toBe("кнопка");
    expect(requestUrl.searchParams.getAll("status")).toEqual([
      "open",
      "testing",
    ]);
    expect(requestUrl.searchParams.getAll("severity")).toEqual([
      "high",
      "blocker",
    ]);
    expect(inspections[0].url).toBe(requestUrl.toString());
  });

  it("rejects successful responses whose runtime shape violates the contract", async () => {
    const fetchMock = jest
      .fn<TestFetch>()
      .mockResolvedValueOnce(
        makeResponse({ items: [{ ...ISSUE, status: "closed" }], total: 1 }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          id: ISSUE.id,
          title: ISSUE.title,
          description: ISSUE.description,
          severity: ISSUE.severity,
          status: ISSUE.status,
          createdAt: ISSUE.createdAt,
        }),
      );
    const api = createClient(fetchMock);

    await expect(api.list(createEmptyIssueFilters())).rejects.toMatchObject({
      name: "ApiError",
      message: "API вернул неожиданный формат списка",
    });
    await expect(api.get(ISSUE.id)).rejects.toMatchObject({
      name: "ApiError",
      message: "API вернул неожиданный формат дефекта",
    });
  });

  it("records a reproducible NETWORK ERROR inspector entry", async () => {
    const inspections: InspectorEntry[] = [];
    const fetchMock = jest
      .fn<TestFetch>()
      .mockRejectedValue(new TypeError("offline"));
    const api = createClient(fetchMock, {
      onInspect: (entry) => inspections.push(entry),
    });

    await expect(api.get(ISSUE.id)).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        isNetworkFailure: true,
      }),
    );

    expect(inspections).toHaveLength(1);
    expect(inspections[0]).toEqual(
      expect.objectContaining({
        method: "GET",
        statusLabel: "NETWORK ERROR",
        ok: false,
        requestBody: null,
        responseBody: { error: { message: "Network request failed" } },
      }),
    );
    expect(inspections[0].curl).toContain(`X-Demo-Workspace-Id: ${WORKSPACE_ID}`);
    expect(inspections[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("publishes empty request and response bodies for a 204 DELETE", async () => {
    const inspections: InspectorEntry[] = [];
    const fetchMock = jest
      .fn<TestFetch>()
      .mockResolvedValueOnce(
        makeResponse(ISSUE, { status: 201, statusText: "Created" }),
      )
      .mockResolvedValueOnce(
        makeResponse(undefined, { status: 204, statusText: "No Content" }),
      );
    const api = createClient(fetchMock, {
      onInspect: (entry) => inspections.push(entry),
    });

    await api.create({
      title: ISSUE.title,
      description: ISSUE.description,
      severity: ISSUE.severity,
    });
    await api.remove(ISSUE.id);

    expect(inspections).toHaveLength(2);
    const deletion = inspections[1];
    expect(deletion).toEqual(
      expect.objectContaining({
        method: "DELETE",
        statusLabel: "204 No Content",
        requestBody: null,
        responseBody: null,
        ok: true,
      }),
    );
    expect(deletion.serializedBody).toBeUndefined();
    expect(deletion.curl).not.toContain("--data-raw");
  });

  it("turns a stale workspace response into AbortError without inspecting it", async () => {
    const response = createDeferred<Response>();
    const inspections: InspectorEntry[] = [];
    let workspace: WorkspaceSnapshot = { id: WORKSPACE_ID, revision: 0 };
    const fetchMock = jest.fn<TestFetch>(() => response.promise);
    const api = createClient(fetchMock, {
      getWorkspace: () => workspace,
      onInspect: (entry) => inspections.push(entry),
    });

    const pending = api.list(createEmptyIssueFilters());
    workspace = { id: OTHER_WORKSPACE_ID, revision: 1 };
    response.resolve(makeResponse({ items: [ISSUE], total: 1 }));

    await expect(pending).rejects.toMatchObject({
      name: "AbortError",
      message: "Workspace changed",
    });
    expect(inspections).toEqual([]);
  });

  it("lets the sequencing sink ignore an older response that finishes last", async () => {
    const firstResponse = createDeferred<Response>();
    const secondResponse = createDeferred<Response>();
    const fetchMock = jest
      .fn<TestFetch>()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);
    let inspectorState: InspectorSequencingState<InspectorEntry> =
      createInspectorSequencingState();
    const api = createClient(fetchMock, {
      onInspect: (entry) => {
        inspectorState = recordInspectorEntry(
          inspectorState,
          {
            sequence: entry.sequence,
            workspaceRevision: entry.workspaceRevision,
            inspect: true,
          },
          entry,
        );
      },
    });

    const olderRequest = api.list(createEmptyIssueFilters());
    const newerRequest = api.get(ISSUE.id);

    secondResponse.resolve(makeResponse(ISSUE));
    await newerRequest;
    expect(inspectorState.entry?.sequence).toBe(2);

    firstResponse.resolve(makeResponse({ items: [ISSUE], total: 1 }));
    await olderRequest;

    expect(inspectorState.entry?.sequence).toBe(2);
    expect(inspectorState.entry?.url).toBe(
      `https://api.example.test/api/issues/${ISSUE.id}`,
    );
  });
});
