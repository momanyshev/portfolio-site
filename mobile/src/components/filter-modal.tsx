import { StyleSheet, View, Pressable } from "react-native";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import {
  ModalScreen,
  type ModalReturnFocusRef
} from "@/components/ui/modal-screen";
import { toggleIssueFilter, type IssueFilterKind } from "@/domain/filters";
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  SEVERITY_LABELS,
  STATUS_LABELS,
  type IssueSeverity,
  type IssueStatus
} from "@/domain/issues";
import { useAppTheme } from "@/providers/theme-provider";
import { useIssuesApp } from "@/providers/issues-provider";

export function FilterModal({
  kind,
  visible,
  onClose,
  returnFocusRef
}: {
  kind: IssueFilterKind | null;
  visible: boolean;
  onClose: () => void;
  returnFocusRef?: ModalReturnFocusRef;
}) {
  const { theme } = useAppTheme();
  const { filters, applyFilters } = useIssuesApp();
  if (!kind) return null;

  const values = kind === "status" ? ISSUE_STATUSES : ISSUE_SEVERITIES;
  const selected = filters[kind];
  const title = kind === "status" ? "Фильтр по статусу" : "Фильтр по критичности";
  const allLabel = kind === "status" ? "Все статусы" : "Все значения";

  const toggle = (value: IssueStatus | IssueSeverity | "all") => {
    const next = kind === "status"
      ? toggleIssueFilter(filters, "status", value as IssueStatus | "all")
      : toggleIssueFilter(filters, "severity", value as IssueSeverity | "all");
    void applyFilters(next);
  };

  return (
    <ModalScreen
      footer={<AppButton onPress={onClose} variant="primary">Готово</AppButton>}
      onRequestClose={onClose}
      returnFocusRef={returnFocusRef}
      testID={`filter-modal-${kind}`}
      title={title}
      visible={visible}
    >
      <View style={styles.list}>
        <FilterRow
          checked={selected.length === 0}
          label={allLabel}
          onPress={() => toggle("all")}
          testID={`filter-${kind}-all`}
        />
        {values.map((value) => (
          <FilterRow
            checked={(selected as readonly string[]).includes(value)}
            key={value}
            label={kind === "status"
              ? STATUS_LABELS[value as IssueStatus]
              : SEVERITY_LABELS[value as IssueSeverity]}
            onPress={() => toggle(value)}
            testID={`filter-${kind}-${value}`}
          />
        ))}
      </View>
      <View style={[styles.help, { borderColor: theme.border }]}>
        <AppText muted variant="caption">
          Можно выбрать несколько значений. Полный набор автоматически превращается в «Все».
        </AppText>
      </View>
    </ModalScreen>
  );
}

function FilterRow({
  checked,
  label,
  onPress,
  testID
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border },
        pressed && styles.pressed
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.checkbox,
          { borderColor: checked ? theme.amber : theme.controlBorder },
          checked && { backgroundColor: theme.amber }
        ]}
      >
        {checked ? <AppText style={{ color: theme.onAmber }}>✓</AppText> : null}
      </View>
      <AppText style={styles.rowLabel}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {},
  row: {
    minHeight: 52,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  rowLabel: { flex: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center"
  },
  pressed: { opacity: 0.7 },
  help: { marginTop: 18, paddingTop: 16, borderTopWidth: 1 }
});
