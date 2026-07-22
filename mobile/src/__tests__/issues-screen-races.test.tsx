/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import IssuesScreen from "../app/index";
import type { Issue } from "../domain/issues";
import { themes } from "../theme/tokens";

const mockUseIssuesApp = jest.fn<() => unknown>();
const mockUseAppTheme = jest.fn<() => unknown>();
let mockFocusCleanup: (() => void) | undefined;

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = require("react") as typeof import("react");
    useEffect(() => {
      const cleanup = callback();
      mockFocusCleanup = cleanup ?? undefined;
      return () => {
        cleanup?.();
        if (mockFocusCleanup === cleanup) mockFocusCleanup = undefined;
      };
    }, [callback]);
  }
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => undefined)
}));

jest.mock("@/providers/issues-provider", () => ({
  describeIssueCount: (count: number) => String(count),
  useIssuesApp: () => mockUseIssuesApp()
}));

jest.mock("@/providers/theme-provider", () => ({
  useAppTheme: () => mockUseAppTheme()
}));

jest.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
jest.mock("@/components/ui/feedback-banner", () => ({ FeedbackBanner: () => null }));
jest.mock("@/components/workspace-modal", () => ({ WorkspaceModal: () => null }));
jest.mock("@/components/filter-modal", () => ({ FilterModal: () => null }));
jest.mock("@/components/delete-issue-modal", () => ({ DeleteIssueModal: () => null }));

jest.mock("@/components/issue-card", () => {
  const React = require("react") as typeof import("react");
  const { Pressable, Text, View } = require("react-native") as typeof import("react-native");

  return {
    IssueCard: ({
      issue,
      onEdit,
      onOpen
    }: {
      issue: { id: string };
      onEdit: () => void;
      onOpen: () => void;
    }) =>
      React.createElement(
        View,
        { testID: `mock-card-${issue.id}` },
        React.createElement(
          Pressable,
          { onPress: onOpen, testID: `mock-open-${issue.id}` },
          React.createElement(Text, null, "Открыть")
        ),
        React.createElement(
          Pressable,
          { onPress: onEdit, testID: `mock-edit-${issue.id}` },
          React.createElement(Text, null, "Редактировать")
        )
      )
  };
});

jest.mock("@/components/issue-details-modal", () => {
  const React = require("react") as typeof import("react");
  const { Text } = require("react-native") as typeof import("react-native");

  return {
    IssueDetailsModal: ({
      issue,
      visible
    }: {
      issue: { id: string } | null;
      visible: boolean;
    }) =>
      visible && issue
        ? React.createElement(Text, { testID: "details-mode" }, issue.id)
        : null
  };
});

jest.mock("@/components/issue-form-modal", () => {
  const React = require("react") as typeof import("react");
  const { Text } = require("react-native") as typeof import("react-native");

  return {
    IssueFormModal: ({
      issue,
      visible
    }: {
      issue: { id: string } | null;
      visible: boolean;
    }) =>
      visible
        ? React.createElement(
            Text,
            { testID: "form-mode" },
            issue ? `edit:${issue.id}` : "create"
          )
        : null
  };
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function renderScreen() {
  const view = await render(<IssuesScreen />);
  await act(
    () => new Promise<void>((resolve) => setTimeout(resolve, 60))
  );
  return view;
}

const firstIssue: Issue = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Первый дефект",
  description: "Описание первого дефекта",
  severity: "high",
  status: "open",
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z"
};

const secondIssue: Issue = {
  ...firstIssue,
  id: "22222222-2222-4222-8222-222222222222",
  title: "Второй дефект"
};

type FetchIssueMock = jest.Mock<
  (id: string, inspect?: boolean, signal?: AbortSignal) => Promise<Issue>
>;

function createApp(fetchIssue: FetchIssueMock) {
  return {
    ready: true,
    workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspacePersistent: true,
    items: [firstIssue, secondIssue],
    total: 2,
    filters: { q: "", severity: [], status: [] },
    loading: false,
    refreshing: false,
    loadError: null,
    feedback: null,
    inspector: null,
    inspectorRevision: 0,
    pendingStatusIds: new Set<string>(),
    applyFilters: jest.fn(async () => true),
    resetFilters: jest.fn(async () => true),
    reload: jest.fn(async () => true),
    switchWorkspace: jest.fn(async () => true),
    fetchIssue,
    createIssue: jest.fn(),
    updateIssue: jest.fn(),
    deleteIssue: jest.fn(),
    changeIssueStatus: jest.fn(async () => undefined),
    refreshIssueAfterConflict: jest.fn(),
    applyIssueToCache: jest.fn(),
    showFeedback: jest.fn(),
    clearFeedback: jest.fn()
  };
}

describe("IssuesScreen detail request races", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCleanup = undefined;
    mockUseAppTheme.mockReturnValue({ theme: themes.dark });
  });

  it("keeps a create form in create mode after an older edit request resolves", async () => {
    const editRequest = createDeferred<Issue>();
    const fetchIssue = jest.fn<
      (id: string, inspect?: boolean, signal?: AbortSignal) => Promise<Issue>
    >(() => editRequest.promise);
    mockUseIssuesApp.mockReturnValue(createApp(fetchIssue));
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId(`mock-edit-${firstIssue.id}`));
    const signal = fetchIssue.mock.calls[0][2];
    expect(signal).toBeDefined();
    if (!signal) throw new Error("AbortSignal was not passed to fetchIssue");
    expect(signal.aborted).toBe(false);

    await fireEvent.press(view.getByTestId("create-issue-button"));
    expect(signal.aborted).toBe(true);
    expect(view.getByTestId("form-mode")).toHaveTextContent("create");

    await act(async () => {
      editRequest.resolve(firstIssue);
      await editRequest.promise;
    });

    expect(view.getByTestId("form-mode")).toHaveTextContent("create");
    expect(view.queryByTestId("details-mode")).toBeNull();
  });

  it("lets the newest card request win and ignores the aborted response", async () => {
    const firstRequest = createDeferred<Issue>();
    const secondRequest = createDeferred<Issue>();
    const fetchIssue = jest
      .fn<(id: string, inspect?: boolean, signal?: AbortSignal) => Promise<Issue>>()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    mockUseIssuesApp.mockReturnValue(createApp(fetchIssue));
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId(`mock-open-${firstIssue.id}`));
    const firstSignal = fetchIssue.mock.calls[0][2];
    expect(firstSignal).toBeDefined();
    if (!firstSignal) throw new Error("AbortSignal was not passed to fetchIssue");
    await fireEvent.press(view.getByTestId(`mock-edit-${secondIssue.id}`));
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      firstRequest.resolve(firstIssue);
      await firstRequest.promise;
    });
    expect(view.queryByTestId("details-mode")).toBeNull();
    expect(view.queryByTestId("form-mode")).toBeNull();

    await act(async () => {
      secondRequest.resolve(secondIssue);
      await secondRequest.promise;
    });
    expect(view.getByTestId("form-mode")).toHaveTextContent(`edit:${secondIssue.id}`);
    expect(view.queryByTestId("details-mode")).toBeNull();
  });

  it("aborts a pending request when the issues tab loses focus", async () => {
    const request = createDeferred<Issue>();
    const fetchIssue = jest.fn<
      (id: string, inspect?: boolean, signal?: AbortSignal) => Promise<Issue>
    >(() => request.promise);
    mockUseIssuesApp.mockReturnValue(createApp(fetchIssue));
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId(`mock-open-${firstIssue.id}`));
    const signal = fetchIssue.mock.calls[0][2];
    expect(signal).toBeDefined();
    if (!signal) throw new Error("AbortSignal was not passed to fetchIssue");

    await act(() => mockFocusCleanup?.());
    expect(signal.aborted).toBe(true);

    await act(async () => {
      request.resolve(firstIssue);
      await request.promise;
    });
    expect(view.queryByTestId("details-mode")).toBeNull();
    expect(view.queryByTestId("form-mode")).toBeNull();
  });
});
