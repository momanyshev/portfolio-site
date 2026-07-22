import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AccessibilityInfo } from "react-native";

import {
  createIssuesApi,
  getConfiguredApiBaseUrl,
  type InspectorEntry,
  type IssuesApi,
  type WorkspaceSnapshot
} from "@/api/client";
import {
  createEmptyIssueFilters,
  issueMatchesFilters,
  type IssueFilters
} from "@/domain/filters";
import type {
  Issue,
  IssueCreatePayload,
  IssuePatchPayload,
  IssueStatus
} from "@/domain/issues";
import {
  getApiErrorMessage,
  isNotFoundApiError,
  isStatusTransitionConflict,
  mapApiError
} from "@/lib/errors";
import {
  advanceWorkspaceRevision,
  createInspectorSequencingState,
  recordInspectorEntry
} from "@/lib/inspector";
import { isValidUuid, normalizeWorkspaceId } from "@/lib/workspace";
import type { Feedback } from "@/components/ui/feedback-banner";

const WORKSPACE_STORAGE_KEY = "qa-lab-workspace-id";

type LoadOptions = {
  inspect?: boolean;
  refreshing?: boolean;
  filters?: IssueFilters;
};

type IssuesContextValue = {
  ready: boolean;
  workspaceId: string;
  workspacePersistent: boolean;
  items: Issue[];
  total: number;
  filters: IssueFilters;
  loading: boolean;
  refreshing: boolean;
  loadError: string | null;
  feedback: Feedback | null;
  inspector: InspectorEntry | null;
  inspectorRevision: number;
  pendingStatusIds: ReadonlySet<string>;
  applyFilters: (filters: IssueFilters) => Promise<boolean>;
  resetFilters: () => Promise<boolean>;
  reload: (options?: LoadOptions) => Promise<boolean>;
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  fetchIssue: (id: string, inspect?: boolean, signal?: AbortSignal) => Promise<Issue>;
  createIssue: (payload: IssueCreatePayload) => Promise<Issue>;
  updateIssue: (id: string, payload: IssuePatchPayload) => Promise<Issue>;
  deleteIssue: (id: string) => Promise<void>;
  changeIssueStatus: (issue: Issue, status: IssueStatus) => Promise<void>;
  refreshIssueAfterConflict: (id: string) => Promise<Issue>;
  applyIssueToCache: (issue: Issue) => void;
  showFeedback: (message: string, kind?: "success" | "error") => void;
  clearFeedback: () => void;
};

const IssuesContext = createContext<IssuesContextValue | null>(null);

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function sortIssues(items: Issue[]) {
  return [...items].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
  );
}

export function IssuesProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspacePersistent, setWorkspacePersistent] = useState(true);
  const [{ items, total }, setIssueList] = useState({ items: [] as Issue[], total: 0 });
  const [filters, setFilters] = useState<IssueFilters>(createEmptyIssueFilters);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedbackState] = useState<Feedback | null>(null);
  const [inspectorState, setInspectorState] = useState(
    createInspectorSequencingState<InspectorEntry>
  );
  const inspector = inspectorState.entry;
  const inspectorRevision = inspectorState.contentRevision;
  const [pendingStatusIds, setPendingStatusIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const workspaceRef = useRef<WorkspaceSnapshot>({ id: "", revision: 0 });
  const filtersRef = useRef(filters);
  const pendingStatusIdsRef = useRef<ReadonlySet<string>>(new Set());
  const listControllerRef = useRef<AbortController | null>(null);
  const listTokenRef = useRef(0);
  const mountedRef = useRef(true);

  const publishFeedback = useCallback((message: string, kind: "success" | "error" = "success") => {
    setFeedbackState({ message, kind });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const onInspect = useCallback((entry: InspectorEntry) => {
    setInspectorState((current) =>
      recordInspectorEntry(
        current,
        {
          sequence: entry.sequence,
          workspaceRevision: entry.workspaceRevision,
          inspect: true
        },
        entry
      )
    );
  }, []);

  const api = useMemo<IssuesApi>(
    () =>
      createIssuesApi({
        baseUrl: getConfiguredApiBaseUrl(),
        getWorkspace: () => workspaceRef.current,
        onInspect
      }),
    [onInspect]
  );

  const loadIssues = useCallback(
    async (options: LoadOptions = {}) => {
      const nextFilters = options.filters ?? filtersRef.current;
      const workspaceAtStart = workspaceRef.current;
      listControllerRef.current?.abort();
      const controller = new AbortController();
      listControllerRef.current = controller;
      const token = ++listTokenRef.current;

      setLoadError(null);
      if (options.refreshing) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await api.list(
          nextFilters,
          controller.signal,
          options.inspect !== false
        );
        if (
          token !== listTokenRef.current ||
          workspaceAtStart.revision !== workspaceRef.current.revision
        ) {
          return false;
        }
        setIssueList({ items: result.items, total: result.total });
        return true;
      } catch (error) {
        if (isAbortError(error) || token !== listTokenRef.current) return false;
        if (workspaceAtStart.revision !== workspaceRef.current.revision) return false;
        const message = getApiErrorMessage(error);
        setIssueList({ items: [], total: 0 });
        setLoadError(message);
        AccessibilityInfo.announceForAccessibility(
          `Не удалось загрузить дефекты. ${message}`
        );
        return false;
      } finally {
        if (token === listTokenRef.current && mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [api]
  );

  useEffect(() => {
    mountedRef.current = true;
    let active = true;

    const initialize = async () => {
      let stored = "";
      let persistent = true;
      try {
        stored = normalizeWorkspaceId(
          (await AsyncStorage.getItem(WORKSPACE_STORAGE_KEY)) ?? ""
        );
      } catch {
        persistent = false;
      }

      const id = isValidUuid(stored) ? stored : Crypto.randomUUID().toLowerCase();
      try {
        await AsyncStorage.setItem(WORKSPACE_STORAGE_KEY, id);
      } catch {
        persistent = false;
      }

      if (!active) return;
      workspaceRef.current = { id, revision: 0 };
      setWorkspaceId(id);
      setWorkspacePersistent(persistent);
      setReady(true);
      if (!persistent) {
        publishFeedback(
          "Workspace действует только до закрытия приложения: локальное сохранение недоступно.",
          "error"
        );
      }
      await loadIssues();
    };

    void initialize();
    return () => {
      active = false;
      mountedRef.current = false;
      listControllerRef.current?.abort();
    };
  }, [loadIssues, publishFeedback]);

  const applyFilters = useCallback(
    async (nextFilters: IssueFilters) => {
      filtersRef.current = nextFilters;
      setFilters(nextFilters);
      return loadIssues({ filters: nextFilters });
    },
    [loadIssues]
  );

  const resetFilters = useCallback(async () => {
    const empty = createEmptyIssueFilters();
    return applyFilters(empty);
  }, [applyFilters]);

  const switchWorkspace = useCallback(
    async (nextWorkspaceId: string) => {
      const normalized = normalizeWorkspaceId(nextWorkspaceId);
      if (normalized === workspaceRef.current.id) return false;

      listControllerRef.current?.abort();
      listTokenRef.current += 1;
      workspaceRef.current = {
        id: normalized,
        revision: workspaceRef.current.revision + 1
      };
      setWorkspaceId(normalized);
      setIssueList({ items: [], total: 0 });
      setLoadError(null);
      pendingStatusIdsRef.current = new Set();
      setPendingStatusIds(pendingStatusIdsRef.current);
      const empty = createEmptyIssueFilters();
      filtersRef.current = empty;
      setFilters(empty);
      setInspectorState(advanceWorkspaceRevision);

      let persistent = true;
      try {
        await AsyncStorage.setItem(WORKSPACE_STORAGE_KEY, normalized);
      } catch {
        persistent = false;
      }
      setWorkspacePersistent(persistent);

      const loaded = await loadIssues({ filters: empty });
      if (!loaded) {
        publishFeedback("Workspace изменён, но загрузить дефекты не удалось.", "error");
      } else if (!persistent) {
        publishFeedback(
          "Workspace изменён только до закрытия приложения: локальное сохранение недоступно.",
          "error"
        );
      } else {
        publishFeedback("Workspace изменён.");
      }
      return true;
    },
    [loadIssues, publishFeedback]
  );

  const applyIssueToCache = useCallback((updatedIssue: Issue) => {
    setIssueList((current) => {
      const withoutIssue = current.items.filter((issue) => issue.id !== updatedIssue.id);
      if (issueMatchesFilters(updatedIssue, filtersRef.current)) {
        withoutIssue.push(updatedIssue);
      }
      const sorted = sortIssues(withoutIssue);
      return { items: sorted, total: sorted.length };
    });
  }, []);

  const removeIssueFromCache = useCallback((issueId: string) => {
    setIssueList((current) => {
      const nextItems = current.items.filter((issue) => issue.id !== issueId);
      if (nextItems.length === current.items.length) return current;
      return { items: nextItems, total: nextItems.length };
    });
  }, []);

  const startRefreshAfterMutation = useCallback(
    (failureMessage: string) => {
      const workspaceAtStart = workspaceRef.current;
      const refresh = loadIssues({ inspect: false, refreshing: true });
      const refreshToken = listTokenRef.current;

      void refresh.then((refreshed) => {
        if (
          refreshed ||
          !mountedRef.current ||
          workspaceAtStart.revision !== workspaceRef.current.revision ||
          refreshToken !== listTokenRef.current
        ) {
          return;
        }
        publishFeedback(failureMessage, "error");
      });
    },
    [loadIssues, publishFeedback]
  );

  const fetchIssue = useCallback(
    (id: string, inspect = true, signal?: AbortSignal) => api.get(id, inspect, signal),
    [api]
  );

  const createIssue = useCallback(
    async (payload: IssueCreatePayload) => {
      const issue = await api.create(payload);
      applyIssueToCache(issue);
      publishFeedback("Дефект создан.");
      startRefreshAfterMutation(
        "Дефект создан, но обновить список не удалось."
      );
      return issue;
    },
    [api, applyIssueToCache, publishFeedback, startRefreshAfterMutation]
  );

  const updateIssue = useCallback(
    async (id: string, payload: IssuePatchPayload) => {
      const issue = await api.update(id, payload);
      applyIssueToCache(issue);
      publishFeedback("Дефект обновлён.");
      startRefreshAfterMutation(
        "Дефект обновлён, но обновить список не удалось."
      );
      return issue;
    },
    [api, applyIssueToCache, publishFeedback, startRefreshAfterMutation]
  );

  const deleteIssue = useCallback(
    async (id: string) => {
      await api.remove(id);
      removeIssueFromCache(id);
      publishFeedback("Дефект удалён.");
      startRefreshAfterMutation(
        "Дефект удалён, но обновить список не удалось."
      );
    },
    [api, publishFeedback, removeIssueFromCache, startRefreshAfterMutation]
  );

  const refreshIssueAfterConflict = useCallback(
    async (id: string) => {
      const latest = await api.get(id, false);
      applyIssueToCache(latest);
      return latest;
    },
    [api, applyIssueToCache]
  );

  const changeIssueStatus = useCallback(
    async (issue: Issue, nextStatus: IssueStatus) => {
      if (pendingStatusIdsRef.current.has(issue.id)) return;
      const workspaceAtStart = workspaceRef.current;
      const listTokenAtStart = listTokenRef.current;
      pendingStatusIdsRef.current = new Set(pendingStatusIdsRef.current).add(issue.id);
      setPendingStatusIds(pendingStatusIdsRef.current);
      setFeedbackState(null);

      try {
        const updated = await api.update(issue.id, { status: nextStatus });
        if (workspaceAtStart.revision !== workspaceRef.current.revision) return;

        if (listTokenAtStart !== listTokenRef.current) {
          await loadIssues({ inspect: false });
        } else {
          applyIssueToCache(updated);
        }

        const hidden = !issueMatchesFilters(updated, filtersRef.current);
        publishFeedback(
          `Статус дефекта «${updated.title}» изменён.` +
            (hidden ? " Карточка скрыта текущим фильтром." : "")
        );
      } catch (error) {
        if (isAbortError(error) || workspaceAtStart.revision !== workspaceRef.current.revision) {
          return;
        }
        if (isStatusTransitionConflict(error)) {
          const refreshed = await loadIssues({ inspect: false });
          publishFeedback(
            refreshed
              ? "Статус дефекта уже изменился. Список обновлён."
              : "Статус дефекта уже изменился, но обновить список не удалось.",
            "error"
          );
          return;
        }
        if (isNotFoundApiError(error)) {
          const refreshed = await loadIssues({ inspect: false });
          publishFeedback(
            refreshed
              ? "Дефект уже удалён. Список обновлён."
              : "Дефект уже удалён, но обновить список не удалось.",
            "error"
          );
          return;
        }
        publishFeedback(
          `Не удалось изменить статус. Сохранён прежний статус. ${getApiErrorMessage(error)}`,
          "error"
        );
      } finally {
        if (workspaceAtStart.revision === workspaceRef.current.revision) {
          const next = new Set(pendingStatusIdsRef.current);
          next.delete(issue.id);
          pendingStatusIdsRef.current = next;
          setPendingStatusIds(next);
        }
      }
    },
    [api, applyIssueToCache, loadIssues, publishFeedback]
  );

  const value = useMemo<IssuesContextValue>(
    () => ({
      ready,
      workspaceId,
      workspacePersistent,
      items,
      total,
      filters,
      loading,
      refreshing,
      loadError,
      feedback,
      inspector,
      inspectorRevision,
      pendingStatusIds,
      applyFilters,
      resetFilters,
      reload: loadIssues,
      switchWorkspace,
      fetchIssue,
      createIssue,
      updateIssue,
      deleteIssue,
      changeIssueStatus,
      refreshIssueAfterConflict,
      applyIssueToCache,
      showFeedback: publishFeedback,
      clearFeedback: () => setFeedbackState(null)
    }),
    [
      applyFilters,
      applyIssueToCache,
      changeIssueStatus,
      createIssue,
      deleteIssue,
      feedback,
      fetchIssue,
      filters,
      inspector,
      inspectorRevision,
      items,
      loadError,
      loadIssues,
      loading,
      pendingStatusIds,
      publishFeedback,
      ready,
      refreshIssueAfterConflict,
      refreshing,
      resetFilters,
      switchWorkspace,
      total,
      updateIssue,
      workspaceId,
      workspacePersistent
    ]
  );

  return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssuesApp() {
  const context = useContext(IssuesContext);
  if (!context) throw new Error("useIssuesApp must be used inside IssuesProvider");
  return context;
}

export function describeIssueCount(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? "дефектов"
    : last === 1
      ? "дефект"
      : last >= 2 && last <= 4
        ? "дефекта"
        : "дефектов";
  return `${count} ${noun}`;
}

export function describeMappedError(error: unknown) {
  return mapApiError(error);
}
