import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useAppTheme } from "@/providers/theme-provider";

export type Feedback = { message: string; kind?: "success" | "error" };

export function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  const { theme } = useAppTheme();
  if (!feedback) return null;
  const isError = feedback.kind === "error";
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={isError ? "alert" : "summary"}
      style={[
        styles.container,
        {
          backgroundColor: isError ? theme.dangerSurface : theme.successSurface,
          borderColor: isError ? theme.dangerBorder : theme.successBorder
        }
      ]}
    >
      <AppText style={{ color: isError ? theme.dangerText : theme.successText }}>
        {feedback.message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 14 }
});
