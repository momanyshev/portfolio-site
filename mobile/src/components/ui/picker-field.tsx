import { Picker } from "@react-native-picker/picker";
import { Platform, StyleSheet, View } from "react-native";

import { useAppTheme } from "@/providers/theme-provider";

export type PickerOption<T extends string> = { label: string; value: T };

export function PickerField<T extends string>({
  accessibilityLabel,
  accessibilityHint,
  enabled = true,
  onValueChange,
  options,
  selectedValue,
  testID
}: {
  accessibilityLabel: string;
  accessibilityHint?: string;
  enabled?: boolean;
  onValueChange: (value: T) => void;
  options: readonly PickerOption<T>[];
  selectedValue: T;
  testID?: string;
}) {
  const { theme } = useAppTheme();
  return (
    <View
      style={[
        styles.wrapper,
        { backgroundColor: theme.control, borderColor: theme.controlBorder },
        !enabled && styles.disabled
      ]}
    >
      <Picker
        {...(Platform.OS === "web" ? {} : { accessibilityHint })}
        accessibilityLabel={accessibilityLabel}
        dropdownIconColor={theme.text}
        enabled={enabled}
        onValueChange={(value) => onValueChange(value as T)}
        selectedValue={selectedValue}
        style={[styles.picker, { backgroundColor: theme.control, color: theme.text }]}
        testID={testID}
      >
        {options.map((option) => (
          <Picker.Item key={option.value} label={option.label} value={option.value} />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { minHeight: 48, borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  picker: { minHeight: 48 },
  disabled: { opacity: 0.62 }
});
