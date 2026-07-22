import type { ConfigContext, ExpoConfig } from "expo/config";

const isProduction = process.env.APP_ENV === "production";
const isLocal = !isProduction;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "QA Lab — Трекер дефектов",
  slug: "qa-lab-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "qalab",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "ru.maksim.qalab",
    supportsTablet: true,
    icon: "./assets/images/icon.png"
  },
  android: {
    package: "ru.maksim.qalab",
    adaptiveIcon: {
      backgroundColor: "#10110E",
      foregroundImage: "./assets/images/android-icon-foreground.png"
    },
    predictiveBackGestureEnabled: true
  },
  web: {
    output: "static",
    favicon: "./assets/images/icon.png"
  },
  plugins: [
    "expo-router",
    ...(isLocal ? ["expo-dev-client", "./plugins/with-local-http.js"] : []),
    [
      "expo-splash-screen",
      {
        backgroundColor: "#10110E",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76
      }
    ],
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    appEnvironment: isLocal ? "local" : "production"
  }
});
