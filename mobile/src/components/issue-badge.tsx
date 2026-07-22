import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { AppText } from "@/components/ui/app-text";
import {
  SEVERITY_LABELS,
  STATUS_LABELS,
  type IssueSeverity,
  type IssueStatus
} from "@/domain/issues";
import { useAppTheme } from "@/providers/theme-provider";
import { radii, severityColors, statusColors } from "@/theme/tokens";

type IssueBadgeProps = (
  | { kind: "severity"; value: IssueSeverity }
  | { kind: "status"; value: IssueStatus }
) & {
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function IssueBadge({ kind, value, style, testID }: IssueBadgeProps) {
  const { theme } = useAppTheme();
  const isSeverity = kind === "severity";
  const label = isSeverity
    ? SEVERITY_LABELS[value as IssueSeverity]
    : STATUS_LABELS[value as IssueStatus];
  const color = isSeverity
    ? severityColors[value as IssueSeverity]
    : statusColors[value as IssueStatus];
  const usesSemanticFill = isSeverity
    ? value === "high" || value === "critical" || value === "blocker"
    : value !== "open";
  const backgroundColor = usesSemanticFill && color ? color : theme.neutralBadge;
  const textColor =
    kind === "status" && value === "testing"
      ? theme.onAmber
      : usesSemanticFill
        ? "#FFFFFF"
        : theme.text;
  const accessibilityLabel = isSeverity
    ? `Критичность: ${label}`
    : `Статус: ${label}`;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible
      style={[styles.badge, { backgroundColor }, style]}
      testID={testID ?? `issue-badge-${kind}-${value}`}
    >
      <AppText style={[styles.label, { color: textColor }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 28,
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.badge
  },
  label: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800"
  }
});
