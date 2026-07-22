import type { PropsWithChildren } from "react";
import { Platform, StyleSheet, Text, type TextProps } from "react-native";

import { useAppTheme } from "@/providers/theme-provider";

type AppTextProps = PropsWithChildren<
  TextProps & {
    variant?: "body" | "caption" | "eyebrow" | "title" | "heading" | "cardTitle" | "code";
    muted?: boolean;
  }
>;

export function AppText({ children, style, variant = "body", muted, ...props }: AppTextProps) {
  const { theme } = useAppTheme();
  return (
    <Text
      allowFontScaling
      style={[
        styles.base,
        styles[variant],
        { color: muted ? theme.textMuted : theme.text },
        style
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: 16, lineHeight: 24 },
  body: { fontWeight: "400" },
  caption: { fontSize: 13, lineHeight: 18 },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase"
  },
  title: { fontSize: 40, lineHeight: 44, fontWeight: "800" },
  heading: { fontSize: 28, lineHeight: 34, fontWeight: "800" },
  cardTitle: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  code: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: "ui-monospace", default: "monospace" })
  }
});
