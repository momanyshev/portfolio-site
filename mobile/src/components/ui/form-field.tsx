import type { PropsWithChildren } from "react";
import { StyleSheet, TextInput, type TextInputProps, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useAppTheme } from "@/providers/theme-provider";

type FormFieldProps = PropsWithChildren<{
  label: string;
  hint?: string;
  error?: string;
  counter?: string;
}>;

export function FormField({ children, label, hint, error, counter }: FormFieldProps) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{label}</AppText>
      {children}
      {hint || counter ? (
        <View style={styles.meta}>
          <AppText muted style={styles.metaText} variant="caption">
            {hint}
          </AppText>
          {counter ? (
            <AppText muted variant="caption">
              {counter}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {error ? (
        <AppText
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={{ color: theme.dangerText }}
          variant="caption"
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

type AppTextInputProps = TextInputProps & { invalid?: boolean };

export function AppTextInput({
  style,
  invalid,
  accessibilityState,
  ...props
}: AppTextInputProps) {
  const { theme } = useAppTheme();
  return (
    <TextInput
      allowFontScaling
      accessibilityState={{
        ...accessibilityState,
        disabled: props.editable === false
      }}
      aria-invalid={invalid || undefined}
      placeholderTextColor={theme.textMuted}
      selectionColor={theme.amber}
      style={[
        styles.input,
        {
          backgroundColor: theme.control,
          borderColor: invalid ? theme.dangerText : theme.controlBorder,
          color: theme.text
        },
        style
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 8, marginBottom: 18 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22
  },
  meta: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  metaText: { flex: 1 }
});
