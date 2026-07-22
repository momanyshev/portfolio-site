import type { ColorSchemeName } from "react-native";

export type ThemeMode = "dark" | "light";

export type AppTheme = {
  mode: ThemeMode;
  dark: boolean;
  background: string;
  header: string;
  surface: string;
  surfaceSoft: string;
  border: string;
  control: string;
  controlBorder: string;
  codeBackground: string;
  neutralBadge: string;
  text: string;
  textMuted: string;
  amber: string;
  onAmber: string;
  teal: string;
  blue: string;
  coral: string;
  destructive: string;
  successText: string;
  successSurface: string;
  successBorder: string;
  dangerText: string;
  dangerSurface: string;
  dangerBorder: string;
  tabBar: string;
};

const shared = {
  amber: "#E1B74D",
  onAmber: "#15130E",
  teal: "#0C7167",
  blue: "#2457A4",
  coral: "#C64F38",
  destructive: "#A6382C"
};

export const themes: Record<ThemeMode, AppTheme> = {
  dark: {
    ...shared,
    mode: "dark",
    dark: true,
    background: "#10110E",
    header: "#141510",
    surface: "#181915",
    surfaceSoft: "#20211C",
    border: "#3A3C34",
    control: "#22231E",
    controlBorder: "#505249",
    codeBackground: "#0B0C0A",
    neutralBadge: "#2B2C26",
    text: "#F2EEE5",
    textMuted: "#AAA9A1",
    successText: "#9BD8B9",
    successSurface: "#18271F",
    successBorder: "#365E49",
    dangerText: "#FFAAA0",
    dangerSurface: "#321A17",
    dangerBorder: "#71362F",
    tabBar: "#181915"
  },
  light: {
    ...shared,
    mode: "light",
    dark: false,
    background: "#F5F3EC",
    header: "#F8F7F1",
    surface: "#FFFFFF",
    surfaceSoft: "#FBFAF6",
    border: "#DDD8C8",
    control: "#FFFFFF",
    controlBorder: "#C9C4B6",
    codeBackground: "#FBFAF6",
    neutralBadge: "#E9E7DE",
    text: "#151515",
    textMuted: "#62645D",
    successText: "#145B42",
    successSurface: "#E8F6EF",
    successBorder: "#A9D2BD",
    dangerText: "#7B241C",
    dangerSurface: "#FFF0ED",
    dangerBorder: "#D6A29B",
    tabBar: "#F8F7F1"
  }
};

export function normalizeThemeMode(value: string | null): ThemeMode {
  return value === "light" ? "light" : "dark";
}

export function themeToColorScheme(mode: ThemeMode): ColorSchemeName {
  return mode;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  xxl: 21,
  section: 28
} as const;

export const radii = {
  badge: 6,
  control: 8,
  card: 8,
  modal: 12
} as const;

export const severityColors = {
  low: "#6D7F45",
  medium: "#2457A4",
  high: "#C64F38",
  critical: "#8F251F",
  blocker: "#4B0D0D"
} as const;

export const statusColors = {
  open: null,
  in_progress: "#2457A4",
  testing: "#E1B74D",
  resolved: "#0C7167"
} as const;
