import {
  Children,
  isValidElement,
  type PropsWithChildren,
  type ReactNode
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useAppTheme } from "@/providers/theme-provider";

type AppButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}>;

function getAccessibleText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getAccessibleText(child.props.children);
      }
      return "";
    })
    .join("")
    .trim();
}

export function AppButton({
  children,
  onPress,
  variant = "secondary",
  disabled,
  busy,
  accessibilityLabel,
  testID,
  style
}: AppButtonProps) {
  const { theme } = useAppTheme();
  const palette = {
    primary: { background: theme.amber, border: theme.amber, text: theme.onAmber },
    secondary: { background: theme.control, border: theme.controlBorder, text: theme.text },
    danger: { background: theme.destructive, border: theme.destructive, text: "#FFFFFF" },
    ghost: { background: "transparent", border: "transparent", text: theme.text }
  }[variant];
  const inactive = Boolean(disabled || busy);
  const busyAccessibilityLabel = busy
    ? accessibilityLabel ?? (getAccessibleText(children) || undefined)
    : accessibilityLabel;

  return (
    <Pressable
      accessibilityLabel={busyAccessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: Boolean(busy) }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.background, borderColor: palette.border },
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
        style
      ]}
    >
      {busy ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <AppText style={[styles.label, { color: palette.text }]}>{children}</AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    minWidth: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "800", textAlign: "center" },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.62 }
});
