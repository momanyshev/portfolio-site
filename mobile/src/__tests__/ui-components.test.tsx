import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { IssueBadge } from "../components/issue-badge";
import { AppButton } from "../components/ui/app-button";
import { AppThemeProvider } from "../providers/theme-provider";
import { severityColors, themes } from "../theme/tokens";

jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(async () => undefined),
}));

describe("themed UI components", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("exposes AppButton semantics and prevents presses while busy", async () => {
    const onPress = jest.fn();
    const view = await render(
      <AppThemeProvider>
        <AppButton
          accessibilityLabel="Создать дефект"
          onPress={onPress}
          variant="primary"
        >
          Создать
        </AppButton>
      </AppThemeProvider>,
    );

    const button = view.getByRole("button", { name: "Создать дефект" });
    expect(button).toBeEnabled();
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    await view.rerender(
      <AppThemeProvider>
        <AppButton
          accessibilityLabel="Создать дефект"
          busy
          onPress={onPress}
          variant="primary"
        >
          Создать
        </AppButton>
      </AppThemeProvider>,
    );

    const busyButton = view.getByRole("button", { name: "Создать дефект" });
    expect(busyButton).toBeDisabled();
    expect(busyButton.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(view.queryByText("Создать")).toBeNull();
    await fireEvent.press(busyButton);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps a text-derived accessible name while AppButton is busy", async () => {
    const view = await render(
      <AppThemeProvider>
        <AppButton busy onPress={jest.fn()}>
          Сохранить изменения
        </AppButton>
      </AppThemeProvider>,
    );

    expect(
      view.getByRole("button", { name: "Сохранить изменения" }),
    ).toBeDisabled();
  });

  it("renders localized badge text with an accessible semantic label", async () => {
    const view = await render(
      <AppThemeProvider>
        <IssueBadge kind="severity" value="blocker" />
      </AppThemeProvider>,
    );

    expect(view.getByText("Блокер")).toBeOnTheScreen();
    expect(view.getByLabelText("Критичность: Блокер")).toBeOnTheScreen();
  });

  it("keeps the red semantic fill at AA contrast against white text", () => {
    const channel = (hex: string, offset: number) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    const contrastAgainstWhite = (hex: string) => {
      const luminance =
        0.2126 * channel(hex, 1) +
        0.7152 * channel(hex, 3) +
        0.0722 * channel(hex, 5);
      return 1.05 / (luminance + 0.05);
    };

    expect(themes.dark.coral).toBe(severityColors.high);
    expect(contrastAgainstWhite(severityColors.high)).toBeGreaterThanOrEqual(4.5);
  });
});
