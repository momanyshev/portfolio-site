import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { AccessibilityInfo } from "react-native";

import {
  type AppTheme,
  type ThemeMode,
  normalizeThemeMode,
  themes
} from "@/theme/tokens";

const THEME_STORAGE_KEY = "qa-lab-theme";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  ready: boolean;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .catch(() => null)
      .then((stored) => {
        if (active) setMode(normalizeThemeMode(stored));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleTheme = useCallback(async () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      AccessibilityInfo.announceForAccessibility(
        "Тема изменена только до закрытия приложения: сохранить настройку не удалось."
      );
    }
  }, [mode]);

  const value = useMemo(
    () => ({ mode, theme: themes[mode], ready, toggleTheme }),
    [mode, ready, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useAppTheme must be used inside AppThemeProvider");
  return context;
}
