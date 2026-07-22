import { act, render } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createRef } from "react";
import { AccessibilityInfo, View } from "react-native";

import { FilterModal } from "../components/filter-modal";
import { AppText } from "../components/ui/app-text";
import { ModalScreen } from "../components/ui/modal-screen";
import { AppThemeProvider } from "../providers/theme-provider";

const mockApplyFilters = jest.fn(async () => true);

jest.mock("react-native", () => {
  const actual = jest.requireActual<typeof import("react-native")>("react-native");
  return new Proxy(actual, {
    get(target, property, receiver) {
      if (property === "findNodeHandle") return () => 73;
      return Reflect.get(target, property, receiver);
    },
  });
});

jest.mock("../providers/issues-provider", () => ({
  useIssuesApp: () => ({
    filters: { q: "", status: [], severity: [] },
    applyFilters: mockApplyFilters,
  }),
}));

describe("ModalScreen accessibility and overflow", () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("restores focus when a visible modal is unmounted directly", async () => {
    jest.useFakeTimers();
    const returnFocusRef = createRef<View>();
    const tree = (showModal: boolean) => (
      <AppThemeProvider>
        <View ref={returnFocusRef} testID="return-focus-target" />
        {showModal ? (
          <ModalScreen
            onRequestClose={jest.fn()}
            returnFocusRef={returnFocusRef}
            title="Детали"
            visible
          >
            <AppText>Содержимое</AppText>
          </ModalScreen>
        ) : null}
      </AppThemeProvider>
    );
    const view = await render(tree(true));

    await view.rerender(tree(false));
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledWith(73);
  });

  it("renders filter options in a scroll view", async () => {
    const view = await render(
      <AppThemeProvider>
        <FilterModal
          kind="status"
          onClose={jest.fn()}
          visible
        />
      </AppThemeProvider>,
    );

    expect(view.getByTestId("filter-modal-status-scroll")).toBeOnTheScreen();
  });
});
