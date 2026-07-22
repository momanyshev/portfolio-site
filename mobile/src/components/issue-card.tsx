import { StyleSheet, View } from "react-native";

import { IssueBadge } from "@/components/issue-badge";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import {
  STATUS_LABELS,
  formatStatusTransitionHint,
  getEditableStatuses,
  type Issue,
  type IssueStatus
} from "@/domain/issues";
import { PickerField, type PickerOption } from "@/components/ui/picker-field";
import { useAppTheme } from "@/providers/theme-provider";
import { radii, severityColors, spacing } from "@/theme/tokens";

type IssueCardProps = {
  issue: Issue;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (next: IssueStatus) => void;
};

function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function IssueCard({
  issue,
  busy,
  onOpen,
  onEdit,
  onDelete,
  onStatusChange
}: IssueCardProps) {
  const { theme } = useAppTheme();
  const statusOptions: PickerOption<IssueStatus>[] = getEditableStatuses(issue.status).map(
    (status) => ({ label: STATUS_LABELS[status], value: status })
  );
  const updatedAt = formatUpdatedAt(issue.updatedAt);
  const statusHint = formatStatusTransitionHint(issue.status);

  const handleStatusChange = (next: IssueStatus) => {
    if (next !== issue.status) onStatusChange(next);
  };

  return (
    <View
      accessibilityState={{ busy }}
      style={[
        styles.card,
        {
          backgroundColor: theme.surfaceSoft,
          borderColor: theme.border,
          borderLeftColor: severityColors[issue.severity]
        }
      ]}
      testID={`issue-card-${issue.id}`}
    >
      <View style={styles.header}>
        <IssueBadge
          kind="severity"
          testID={`issue-card-severity-${issue.id}`}
          value={issue.severity}
        />
        <AppText
          accessibilityLabel={`Обновлено: ${updatedAt}`}
          muted
          style={styles.updatedAt}
          testID={`issue-card-updated-${issue.id}`}
          variant="caption"
        >
          {updatedAt}
        </AppText>
      </View>

      <AppText
        accessibilityRole="header"
        style={styles.title}
        testID={`issue-card-title-${issue.id}`}
        variant="cardTitle"
      >
        {issue.title}
      </AppText>
      <AppText
        ellipsizeMode="tail"
        muted
        numberOfLines={3}
        style={styles.description}
        testID={`issue-card-description-${issue.id}`}
      >
        {issue.description}
      </AppText>

      <View style={styles.statusField}>
        <AppText style={styles.statusLabel} variant="caption">
          Статус
        </AppText>
        <PickerField
          accessibilityHint={statusHint}
          accessibilityLabel={`Изменить статус дефекта «${issue.title}». Текущий статус: ${STATUS_LABELS[issue.status]}`}
          enabled={!busy}
          onValueChange={handleStatusChange}
          options={statusOptions}
          selectedValue={issue.status}
          testID={`issue-card-status-${issue.id}`}
        />
        <AppText muted variant="caption">{statusHint}</AppText>
      </View>

      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <AppButton
          accessibilityLabel={`Открыть дефект «${issue.title}»`}
          disabled={busy}
          onPress={onOpen}
          style={styles.action}
          testID={`issue-card-open-${issue.id}`}
        >
          Открыть
        </AppButton>
        <AppButton
          accessibilityLabel={`Редактировать дефект «${issue.title}»`}
          disabled={busy}
          onPress={onEdit}
          style={styles.action}
          testID={`issue-card-edit-${issue.id}`}
        >
          Редактировать
        </AppButton>
        <AppButton
          accessibilityLabel={`Удалить дефект «${issue.title}»`}
          disabled={busy}
          onPress={onDelete}
          style={styles.action}
          testID={`issue-card-delete-${issue.id}`}
          variant="danger"
        >
          Удалить
        </AppButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 0,
    padding: 20,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderRadius: radii.card
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  updatedAt: {
    flexShrink: 1,
    textAlign: "right"
  },
  title: {
    marginTop: spacing.xl
  },
  description: {
    marginTop: spacing.sm,
    lineHeight: 25
  },
  statusField: {
    gap: spacing.sm,
    marginTop: spacing.xl
  },
  statusLabel: {
    fontWeight: "800"
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingTop: 16,
    borderTopWidth: 1
  },
  action: {
    minHeight: 48,
    flexBasis: 96,
    flexGrow: 1
  }
});
