import { DarkTheme, DefaultTheme, ThemeProvider, Tabs } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet, Text, View, type ColorValue } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { IssuesProvider, useIssuesApp } from "@/providers/issues-provider";
import { AppThemeProvider, useAppTheme } from "@/providers/theme-provider";

void SplashScreen.preventAutoHideAsync();

function AppTabs() {
  const { ready } = useIssuesApp();
  const { mode, theme, ready: themeReady } = useAppTheme();

  useEffect(() => {
    if (ready && themeReady) void SplashScreen.hideAsync();
  }, [ready, themeReady]);

  return (
    <ThemeProvider value={mode === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.background },
          tabBarActiveTintColor: theme.amber,
          tabBarInactiveTintColor: theme.textMuted,
          tabBarStyle: {
            backgroundColor: theme.tabBar,
            borderTopColor: theme.border,
            minHeight: 64,
            paddingTop: 6
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: "700" }
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Дефекты",
            tabBarAccessibilityLabel: "Дефекты",
            tabBarIcon: ({ color }) => <TabIcon color={color}>☷</TabIcon>
          }}
        />
        <Tabs.Screen
          name="inspector"
          options={{
            title: "API-запрос",
            tabBarAccessibilityLabel: "API-запрос",
            tabBarIcon: ({ color }) => <TabIcon color={color}>{"{}"}</TabIcon>
          }}
        />
      </Tabs>
    </ThemeProvider>
  );
}

function TabIcon({ children, color }: { children: string; color: ColorValue }) {
  return (
    <View style={styles.icon}>
      <Text style={[styles.iconText, { color }]}>{children}</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <IssuesProvider>
            <AppTabs />
          </IssuesProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  icon: { width: 28, height: 24, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 18, lineHeight: 22, fontWeight: "800" }
});
