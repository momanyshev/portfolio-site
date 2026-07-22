import {
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef
} from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { useAppTheme } from "@/providers/theme-provider";

type ModalScreenProps = PropsWithChildren<{
  visible: boolean;
  title: string;
  eyebrow?: string;
  onRequestClose: () => void;
  footer?: ReactNode;
  busy?: boolean;
  testID?: string;
  scroll?: boolean;
  returnFocusRef?: ModalReturnFocusRef;
}>;

export type ModalReturnFocusRef = RefObject<View | null>;

function focusAccessibilityNode(node: View | null) {
  if (Platform.OS === "web") return;
  const reactTag = findNodeHandle(node);
  if (reactTag) AccessibilityInfo.setAccessibilityFocus(reactTag);
}

export function ModalScreen({
  children,
  visible,
  title,
  eyebrow,
  onRequestClose,
  footer,
  busy,
  testID,
  scroll = true,
  returnFocusRef
}: ModalScreenProps) {
  const { theme } = useAppTheme();
  const initialFocusRef = useRef<View>(null);
  const wasVisibleRef = useRef(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocusRefRef = useRef(returnFocusRef);
  returnFocusRefRef.current = returnFocusRef;
  const content = <View style={styles.content}>{children}</View>;

  const scheduleFocus = (node: View | null) => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    if (!node) {
      focusTimerRef.current = null;
      return;
    }
    focusTimerRef.current = setTimeout(() => focusAccessibilityNode(node), 100);
  };

  useEffect(() => {
    if (!visible && wasVisibleRef.current) {
      scheduleFocus(returnFocusRefRef.current?.current ?? null);
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (!wasVisibleRef.current) return;

      const returnFocusNode = returnFocusRefRef.current?.current ?? null;
      if (!returnFocusNode) return;
      focusTimerRef.current = setTimeout(
        () => focusAccessibilityNode(returnFocusNode),
        100
      );
    };
  }, []);

  return (
    <Modal
      animationType="slide"
      onShow={() => scheduleFocus(initialFocusRef.current)}
      onRequestClose={onRequestClose}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      testID={testID}
      visible={visible}
    >
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboard}
        >
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View
              accessibilityLabel={[eyebrow, title].filter(Boolean).join(". ")}
              accessibilityRole="header"
              accessible
              ref={initialFocusRef}
              style={styles.headerCopy}
            >
              {eyebrow ? <AppText variant="eyebrow">{eyebrow}</AppText> : null}
              <AppText variant="heading">{title}</AppText>
            </View>
            <AppButton
              accessibilityLabel="Закрыть"
              disabled={busy}
              onPress={onRequestClose}
              style={styles.close}
              variant="ghost"
            >
              ×
            </AppButton>
          </View>
          {scroll ? (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              testID={testID ? `${testID}-scroll` : undefined}
            >
              {content}
            </ScrollView>
          ) : (
            content
          )}
          {footer ? (
            <View
              accessibilityRole="toolbar"
              style={[
                styles.footer,
                { backgroundColor: theme.background, borderTopColor: theme.border }
              ]}
            >
              {footer}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  header: {
    minHeight: 76,
    borderBottomWidth: 1,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  headerCopy: { flex: 1, gap: 2 },
  close: { width: 48, paddingHorizontal: 0 },
  scrollContent: { padding: 18, paddingBottom: 36 },
  content: { flexGrow: 1 },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 8
  }
});
