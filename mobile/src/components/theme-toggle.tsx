import { AppButton } from "@/components/ui/app-button";
import { useAppTheme } from "@/providers/theme-provider";

export function ThemeToggle() {
  const { mode, toggleTheme } = useAppTheme();
  const label = mode === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
  return (
    <AppButton
      accessibilityLabel={label}
      onPress={() => void toggleTheme()}
      variant="ghost"
      style={{ width: 48, paddingHorizontal: 0 }}
    >
      {mode === "dark" ? "☾" : "☀"}
    </AppButton>
  );
}
