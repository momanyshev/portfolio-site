import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";
import { Text } from "react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  createIssuesApi,
  type IssuesApi
} from "../api/client";
import type { Issue, IssueListResponse } from "../domain/issues";
import {
  IssuesProvider,
  useIssuesApp
} from "../providers/issues-provider";

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000";

const ISSUE: Issue = {
  id: "123e4567-e89b-42d3-a456-426614174010",
  title: "Форма долго остаётся заблокированной",
  description: "После успешной мутации интерфейс ожидает фоновый GET.",
  severity: "high",
  status: "open",
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-21T10:00:00.000Z"
};

const UPDATED_ISSUE: Issue = {
  ...ISSUE,
  title: "Форма закрывается сразу",
  updatedAt: "2026-07-21T10:01:00.000Z"
};

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => WORKSPACE_ID)
}));

jest.mock("../api/client", () => ({
  createIssuesApi: jest.fn(),
  getConfiguredApiBaseUrl: jest.fn(() => "https://api.example.test")
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createApiMock(): jest.Mocked<IssuesApi> {
  return {
    list: jest.fn<IssuesApi["list"]>(),
    get: jest.fn<IssuesApi["get"]>(),
    create: jest.fn<IssuesApi["create"]>(),
    update: jest.fn<IssuesApi["update"]>(),
    remove: jest.fn<IssuesApi["remove"]>()
  };
}

type IssuesApp = ReturnType<typeof useIssuesApp>;

function ContextProbe({ onChange }: { onChange: (value: IssuesApp) => void }) {
  const app = useIssuesApp();

  useEffect(() => {
    onChange(app);
  }, [app, onChange]);

  return <Text testID="provider-ready">{String(app.ready)}</Text>;
}

describe("IssuesProvider mutations", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("resolves CRUD mutations before their background list refresh", async () => {
    const createRefresh = createDeferred<IssueListResponse>();
    const updateRefresh = createDeferred<IssueListResponse>();
    const deleteRefresh = createDeferred<IssueListResponse>();
    const api = createApiMock();
    api.list
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockImplementationOnce(() => createRefresh.promise)
      .mockImplementationOnce(() => updateRefresh.promise)
      .mockImplementationOnce(() => deleteRefresh.promise);
    api.create.mockResolvedValueOnce(ISSUE);
    api.update.mockResolvedValueOnce(UPDATED_ISSUE);
    api.remove.mockResolvedValueOnce(undefined);
    jest.mocked(createIssuesApi).mockReturnValue(api);

    let app: IssuesApp | null = null;
    const view = await render(
      <IssuesProvider>
        <ContextProbe onChange={(value) => { app = value; }} />
      </IssuesProvider>
    );

    await waitFor(() => {
      expect(view.getByTestId("provider-ready")).toHaveTextContent("true");
      expect(app?.loading).toBe(false);
    });

    let created: Issue | null = null;
    await act(async () => {
      created = await app!.createIssue({
        title: ISSUE.title,
        description: ISSUE.description,
        severity: ISSUE.severity,
        status: ISSUE.status
      });
    });

    expect(created).toEqual(ISSUE);
    expect(app!.items).toEqual([ISSUE]);
    expect(app!.loading).toBe(false);
    expect(app!.refreshing).toBe(true);
    expect(app!.inspector).toBeNull();
    expect(api.list.mock.calls[1][2]).toBe(false);

    await act(async () => {
      createRefresh.resolve({ items: [ISSUE], total: 1 });
      await createRefresh.promise;
    });
    await waitFor(() => expect(app!.refreshing).toBe(false));

    let updated: Issue | null = null;
    await act(async () => {
      updated = await app!.updateIssue(ISSUE.id, { title: UPDATED_ISSUE.title });
    });

    expect(updated).toEqual(UPDATED_ISSUE);
    expect(app!.items).toEqual([UPDATED_ISSUE]);
    expect(app!.refreshing).toBe(true);
    expect(api.list.mock.calls[2][2]).toBe(false);

    await act(async () => {
      updateRefresh.resolve({ items: [UPDATED_ISSUE], total: 1 });
      await updateRefresh.promise;
    });
    await waitFor(() => expect(app!.refreshing).toBe(false));

    await act(async () => {
      await app!.deleteIssue(ISSUE.id);
    });

    expect(app!.items).toEqual([]);
    expect(app!.total).toBe(0);
    expect(app!.refreshing).toBe(true);
    expect(api.list.mock.calls[3][2]).toBe(false);

    await act(async () => {
      deleteRefresh.resolve({ items: [], total: 0 });
      await deleteRefresh.promise;
    });
    await waitFor(() => expect(app!.refreshing).toBe(false));

    expect(api.list).toHaveBeenCalledTimes(4);
  });
});
