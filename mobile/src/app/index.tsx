import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DeleteIssueModal } from "@/components/delete-issue-modal";
import { FilterModal } from "@/components/filter-modal";
import { IssueCard } from "@/components/issue-card";
import { IssueDetailsModal } from "@/components/issue-details-modal";
import { IssueFormModal } from "@/components/issue-form-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { AppTextInput, FormField } from "@/components/ui/form-field";
import { WorkspaceModal } from "@/components/workspace-modal";
import {
  getIssueSearchQueryError,
  hasActiveIssueFilters,
  type IssueFilterKind
} from "@/domain/filters";
import type { Issue } from "@/domain/issues";
import { mapApiError } from "@/lib/errors";
import { describeIssueCount, useIssuesApp } from "@/providers/issues-provider";
import { useAppTheme } from "@/providers/theme-provider";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export default function IssuesScreen() {
  const { theme } = useAppTheme();
  const app = useIssuesApp();
  const applyFilters = app.applyFilters;
  const appliedQuery = app.filters.q;
  const [queryInput, setQueryInput] = useState(app.filters.q);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [filterKind, setFilterKind] = useState<IssueFilterKind | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editIssue, setEditIssue] = useState<Issue | null>(null);
  const [detailsIssue, setDetailsIssue] = useState<Issue | null>(null);
  const [deleteIssue, setDeleteIssue] = useState<Issue | null>(null);
  const [openingIssueId, setOpeningIssueId] = useState<string | null>(null);
  const filtersRef = useRef(app.filters);
  const workspaceIdRef = useRef(app.workspaceId);
  const previousWorkspaceIdRef = useRef(app.workspaceId);
  const openingControllerRef = useRef<AbortController | null>(null);
  const openingIntentRef = useRef(0);
  const screenFocusRef = useRef<View>(null);
  filtersRef.current = app.filters;
  workspaceIdRef.current = app.workspaceId;

  const cancelOpening = useCallback(() => {
    openingIntentRef.current += 1;
    openingControllerRef.current?.abort();
    openingControllerRef.current = null;
    setOpeningIssueId(null);
  }, []);

  useFocusEffect(
    useCallback(
      () => () => {
        cancelOpening();
      },
      [cancelOpening]
    )
  );

  useEffect(() => {
    setQueryInput(app.filters.q);
    setQueryError(null);
  }, [app.filters.q, app.workspaceId]);

  useEffect(() => {
    const previous = previousWorkspaceIdRef.current;
    previousWorkspaceIdRef.current = app.workspaceId;
    if (!previous || previous === app.workspaceId) return;

    cancelOpening();
    setWorkspaceVisible(false);
    setFilterKind(null);
    setFormVisible(false);
    setEditIssue(null);
    setDetailsIssue(null);
    setDeleteIssue(null);
  }, [app.workspaceId, cancelOpening]);

  useEffect(() => {
    if (queryInput === appliedQuery) return;
    cancelOpening();
    const error = getIssueSearchQueryError(queryInput);
    setQueryError(error);
    if (error) return;
    const timer = setTimeout(() => {
      const current = filtersRef.current;
      void applyFilters({ ...current, q: queryInput.trim() });
    }, 300);
    return () => clearTimeout(timer);
  }, [applyFilters, appliedQuery, cancelOpening, queryInput]);

  const activeFilters = hasActiveIssueFilters(app.filters);
  const statusSummary = app.filters.status.length
    ? `Статусы: ${app.filters.status.length}`
    : "Все статусы";
  const severitySummary = app.filters.severity.length
    ? `Критичность: ${app.filters.severity.length}`
    : "Все значения";

  const submitSearch = () => {
    cancelOpening();
    Keyboard.dismiss();
    const error = getIssueSearchQueryError(queryInput);
    setQueryError(error);
    if (error) return;
    void app.applyFilters({ ...filtersRef.current, q: queryInput.trim() });
  };

  const copyWorkspace = async () => {
    const captured = app.workspaceId;
    try {
      await Clipboard.setStringAsync(captured);
      if (captured !== workspaceIdRef.current) return;
      app.showFeedback("Workspace ID скопирован.");
    } catch {
      if (captured !== workspaceIdRef.current) return;
      app.showFeedback("Не удалось скопировать Workspace ID.", "error");
    }
  };

  const fetchAndShow = async (issue: Issue, mode: "details" | "edit") => {
    cancelOpening();
    setWorkspaceVisible(false);
    setFilterKind(null);
    setFormVisible(false);
    setEditIssue(null);
    setDetailsIssue(null);
    setDeleteIssue(null);

    const intent = openingIntentRef.current;
    const workspaceAtStart = app.workspaceId;
    const controller = new AbortController();
    openingControllerRef.current = controller;
    setOpeningIssueId(issue.id);
    app.clearFeedback();

    const isCurrent = () =>
      openingIntentRef.current === intent &&
      openingControllerRef.current === controller &&
      !controller.signal.aborted &&
      workspaceAtStart === workspaceIdRef.current;

    try {
      const latest = await app.fetchIssue(issue.id, true, controller.signal);
      if (!isCurrent()) return;
      if (mode === "details") setDetailsIssue(latest);
      else {
        setEditIssue(latest);
        setFormVisible(true);
      }
    } catch (error) {
      if (
        isAbortError(error) ||
        !isCurrent()
      ) {
        return;
      }
      const mapped = mapApiError(error);
      if (mapped.isNotFound) {
        await app.reload({ inspect: false });
        if (!isCurrent()) return;
        app.showFeedback("Дефект уже удалён. Список обновлён.", "error");
      } else {
        app.showFeedback(mapped.message, "error");
      }
    } finally {
      if (openingControllerRef.current === controller) {
        openingControllerRef.current = null;
        setOpeningIssueId(null);
      }
    }
  };

  const openCreate = () => {
    cancelOpening();
    app.clearFeedback();
    setWorkspaceVisible(false);
    setFilterKind(null);
    setDetailsIssue(null);
    setDeleteIssue(null);
    setEditIssue(null);
    setFormVisible(true);
  };

  const openWorkspace = () => {
    cancelOpening();
    setFilterKind(null);
    setFormVisible(false);
    setEditIssue(null);
    setDetailsIssue(null);
    setDeleteIssue(null);
    setWorkspaceVisible(true);
  };

  const openFilter = (kind: IssueFilterKind) => {
    cancelOpening();
    setWorkspaceVisible(false);
    setFormVisible(false);
    setEditIssue(null);
    setDetailsIssue(null);
    setDeleteIssue(null);
    setFilterKind(kind);
  };

  const openDelete = (issue: Issue) => {
    cancelOpening();
    setWorkspaceVisible(false);
    setFilterKind(null);
    setFormVisible(false);
    setEditIssue(null);
    setDetailsIssue(null);
    setDeleteIssue(issue);
  };

  const reset = async () => {
    cancelOpening();
    setQueryInput("");
    setQueryError(null);
    await app.resetFilters();
  };

  const header = (
      <View style={styles.headerContent}>
        <View style={styles.topBar}>
          <View
            accessibilityLabel="Трекер дефектов"
            accessibilityRole="header"
            accessible
            ref={screenFocusRef}
            style={styles.topBarCopy}
          >
            <AppText variant="eyebrow">QA Lab / REST API</AppText>
            <AppText variant="title">Трекер дефектов</AppText>
          </View>
          <ThemeToggle />
        </View>
        <AppText muted>
          Создавайте, просматривайте, редактируйте и удаляйте дефекты через реальный HTTP API.
        </AppText>
        <AppButton onPress={openCreate} testID="create-issue-button" variant="primary">
          Создать дефект
        </AppButton>

        <View style={[styles.workspaceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppText variant="eyebrow">Демо-пространство</AppText>
          <AppText muted variant="caption">
            Workspace ID разделяет данные, но не является авторизацией.
          </AppText>
          <AppText selectable style={styles.workspaceId} testID="workspace-id" variant="code">
            {app.workspaceId || "создаётся…"}
          </AppText>
          <View style={styles.workspaceActions}>
            <AppButton
              accessibilityLabel="Копировать Workspace ID"
              disabled={!app.workspaceId}
              onPress={() => void copyWorkspace()}
              style={styles.workspaceAction}
            >
              Копировать
            </AppButton>
            <AppButton
              accessibilityLabel="Изменить Workspace ID"
              disabled={!app.workspaceId}
              onPress={openWorkspace}
              style={styles.workspaceAction}
            >
              Изменить
            </AppButton>
          </View>
          <View style={[styles.facts, { borderTopColor: theme.border }]}>
            <AppText muted variant="caption">Лимит: 50 дефектов</AppText>
            <AppText muted variant="caption">Хранение: 30 дней после изменения</AppText>
          </View>
        </View>

        <FeedbackBanner feedback={app.feedback} />

        <View style={[styles.filters, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <FormField error={queryError ?? undefined} label="Поиск">
            <AppTextInput
              accessibilityLabel="Поиск"
              onChangeText={setQueryInput}
              onSubmitEditing={submitSearch}
              placeholder="Название или описание"
              returnKeyType="search"
              testID="issue-search-input"
              value={queryInput}
            />
          </FormField>
          <View style={styles.filterActions}>
            <AppButton onPress={() => openFilter("status")} style={styles.filterAction}>
              {statusSummary}
            </AppButton>
            <AppButton onPress={() => openFilter("severity")} style={styles.filterAction}>
              {severitySummary}
            </AppButton>
          </View>
          <AppButton disabled={!activeFilters} onPress={() => void reset()}>
            Сбросить фильтры
          </AppButton>
        </View>

        <View style={styles.listHeading}>
          <View>
            <AppText variant="eyebrow">Список</AppText>
            <AppText accessibilityRole="header" variant="heading">Дефекты</AppText>
          </View>
          <View style={[styles.resultCount, { backgroundColor: theme.teal }]}>
            <AppText style={styles.resultCountText}>{app.loading ? "Загрузка…" : describeIssueCount(app.total)}</AppText>
          </View>
        </View>

        {app.loadError ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={[styles.loadError, { backgroundColor: theme.dangerSurface, borderColor: theme.dangerBorder }]}
          >
            <AppText style={styles.loadErrorTitle}>Не удалось загрузить дефекты</AppText>
            <AppText style={{ color: theme.dangerText }}>{app.loadError}</AppText>
            <AppButton
              onPress={() => {
                cancelOpening();
                void app.reload();
              }}
              style={styles.retry}
            >
              Повторить
            </AppButton>
          </View>
        ) : null}
        {app.loading && !app.loadError ? (
          <View accessibilityRole="progressbar" style={styles.loading}>
            <ActivityIndicator color={theme.amber} size="large" />
            <AppText muted>Загружаем дефекты…</AppText>
          </View>
        ) : null}
      </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <FlatList
        ListEmptyComponent={
          !app.loading && !app.loadError ? (
            <View style={[styles.empty, { backgroundColor: theme.surfaceSoft, borderColor: theme.border }]}>
              <AppText accessibilityRole="header" variant="cardTitle">
                {activeFilters ? "Ничего не найдено" : "Дефектов пока нет"}
              </AppText>
              <AppText muted>
                {activeFilters
                  ? "Измените запрос или сбросьте фильтры."
                  : "Создайте первую запись, чтобы пройти полный CRUD-сценарий."}
              </AppText>
              {activeFilters ? (
                <AppButton onPress={() => void reset()}>Сбросить фильтры</AppButton>
              ) : (
                <AppButton onPress={openCreate} variant="primary">Создать дефект</AppButton>
              )}
            </View>
          ) : null
        }
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.content}
        data={app.loading ? [] : app.items}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            colors={[theme.amber]}
            onRefresh={() => {
              cancelOpening();
              void app.reload({ refreshing: true });
            }}
            refreshing={app.refreshing}
            tintColor={theme.amber}
          />
        }
        renderItem={({ item }) => (
          <IssueCard
            busy={app.pendingStatusIds.has(item.id) || openingIssueId === item.id}
            issue={item}
            onDelete={() => openDelete(item)}
            onEdit={() => void fetchAndShow(item, "edit")}
            onOpen={() => void fetchAndShow(item, "details")}
            onStatusChange={(status) => {
              cancelOpening();
              void app.changeIssueStatus(item, status);
            }}
          />
        )}
      />

      <WorkspaceModal
        onClose={() => {
          cancelOpening();
          setWorkspaceVisible(false);
        }}
        returnFocusRef={screenFocusRef}
        visible={workspaceVisible}
      />
      <FilterModal
        kind={filterKind}
        onClose={() => {
          cancelOpening();
          setFilterKind(null);
        }}
        returnFocusRef={screenFocusRef}
        visible={Boolean(filterKind)}
      />
      <IssueDetailsModal
        issue={detailsIssue}
        onClose={() => {
          cancelOpening();
          setDetailsIssue(null);
        }}
        onDelete={() => {
          const issue = detailsIssue;
          if (issue) openDelete(issue);
        }}
        onEdit={() => {
          const issue = detailsIssue;
          setDetailsIssue(null);
          if (issue) void fetchAndShow(issue, "edit");
        }}
        returnFocusRef={screenFocusRef}
        visible={Boolean(detailsIssue)}
      />
      <IssueFormModal
        issue={editIssue}
        onClose={() => {
          cancelOpening();
          setFormVisible(false);
          setEditIssue(null);
        }}
        onSaved={() => {
          cancelOpening();
          setFormVisible(false);
          setEditIssue(null);
        }}
        returnFocusRef={screenFocusRef}
        visible={formVisible}
      />
      <DeleteIssueModal
        issue={deleteIssue}
        onClose={() => {
          cancelOpening();
          setDeleteIssue(null);
        }}
        onDeleted={() => {
          cancelOpening();
          setDeleteIssue(null);
        }}
        returnFocusRef={screenFocusRef}
        visible={Boolean(deleteIssue)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 36 },
  headerContent: { paddingTop: 12, paddingBottom: 18, gap: 18 },
  topBar: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  topBarCopy: { flex: 1, gap: 4 },
  workspaceCard: { borderWidth: 1, borderRadius: 8, padding: 18, gap: 10 },
  workspaceId: { marginVertical: 4 },
  workspaceActions: { flexDirection: "row", gap: 8 },
  workspaceAction: { flex: 1 },
  facts: { borderTopWidth: 1, paddingTop: 12, gap: 4 },
  filters: { borderWidth: 1, borderRadius: 8, padding: 16 },
  filterActions: { flexDirection: "row", gap: 8, marginBottom: 8 },
  filterAction: { flex: 1 },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4
  },
  resultCount: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  resultCountText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  loadError: { borderWidth: 1, borderRadius: 8, padding: 16, gap: 8 },
  loadErrorTitle: { fontWeight: "800" },
  retry: { marginTop: 4 },
  loading: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 36 },
  empty: { borderWidth: 1, borderRadius: 8, padding: 24, gap: 14, alignItems: "stretch" },
  separator: { height: 12 }
});
