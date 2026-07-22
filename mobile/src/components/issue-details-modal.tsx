import { StyleSheet, View } from "react-native";

import { IssueBadge } from "@/components/issue-badge";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import {
  ModalScreen,
  type ModalReturnFocusRef
} from "@/components/ui/modal-screen";
import type { Issue } from "@/domain/issues";
import { useAppTheme } from "@/providers/theme-provider";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

export function IssueDetailsModal({
  issue,
  visible,
  onClose,
  onEdit,
  onDelete,
  returnFocusRef
}: {
  issue: Issue | null;
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  returnFocusRef?: ModalReturnFocusRef;
}) {
  const { theme } = useAppTheme();
  if (!issue) return null;
  return (
    <ModalScreen
      eyebrow="Карточка дефекта"
      footer={
        <View style={styles.actions}>
          <AppButton onPress={onEdit} style={styles.action}>Редактировать</AppButton>
          <AppButton onPress={onDelete} style={styles.action} variant="danger">Удалить</AppButton>
          <AppButton onPress={onClose} style={styles.action} variant="primary">Закрыть</AppButton>
        </View>
      }
      onRequestClose={onClose}
      returnFocusRef={returnFocusRef}
      testID="issue-details-modal"
      title={issue.title}
      visible={visible}
    >
      <View style={styles.badges}>
        <IssueBadge kind="severity" value={issue.severity} />
        <IssueBadge kind="status" value={issue.status} />
      </View>
      <AppText style={styles.description}>{issue.description}</AppText>
      <View style={[styles.meta, { borderColor: theme.border }]}>
        <Meta label="ID" value={issue.id} code />
        <Meta label="Создан" value={formatDate(issue.createdAt)} />
        <Meta label="Обновлён" value={formatDate(issue.updatedAt)} />
      </View>
    </ModalScreen>
  );
}

function Meta({ label, value, code }: { label: string; value: string; code?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <AppText muted variant="caption">{label}</AppText>
      <AppText selectable variant={code ? "code" : "body"}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  description: { marginTop: 24 },
  meta: { marginTop: 28, paddingTop: 18, borderTopWidth: 1, gap: 16 },
  metaRow: { gap: 4 },
  actions: { gap: 8 },
  action: { width: "100%" }
});
