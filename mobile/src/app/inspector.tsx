import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemeToggle } from "@/components/theme-toggle";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import type { JsonValue } from "@/domain/issues";
import { useIssuesApp } from "@/providers/issues-provider";
import { useAppTheme } from "@/providers/theme-provider";
import { radii, spacing } from "@/theme/tokens";

type CopyTarget = "request" | "response" | "curl";

type CopyFeedback = {
  target: CopyTarget;
  message: string;
  error: boolean;
};

type CodeSectionProps = {
  content: string;
  copyFeedback: CopyFeedback | null;
  copyLabel: string;
  onCopy: () => void;
  revision: number;
  target: CopyTarget;
  title: string;
};

function formatBody(body: JsonValue | string): string {
  return typeof body === "string" ? body : JSON.stringify(body, null, 2);
}

function CodeSection({
  content,
  copyFeedback,
  copyLabel,
  onCopy,
  revision,
  target,
  title
}: CodeSectionProps) {
  const { theme } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const feedback = copyFeedback?.target === target ? copyFeedback : null;

  return (
    <View style={styles.section} testID={`inspector-${target}-section`}>
      <Pressable
        accessibilityLabel={`${expanded ? "Свернуть" : "Развернуть"} раздел «${title}»`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.sectionToggle,
          { borderColor: theme.border },
          pressed && styles.pressed
        ]}
        testID={`inspector-${target}-toggle`}
      >
        <AppText style={styles.sectionTitle}>{title}</AppText>
        <AppText accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {expanded ? "−" : "+"}
        </AppText>
      </Pressable>

      {expanded ? (
        <View
          key={`${target}-${revision}`}
          style={[
            styles.codeBlock,
            { backgroundColor: theme.codeBackground, borderColor: theme.border }
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.codeScrollContent}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator
          >
            <AppText
              accessibilityLabel={`Содержимое раздела «${title}»`}
              selectable
              style={styles.code}
              testID={`inspector-${target}-content`}
              variant="code"
            >
              {content}
            </AppText>
          </ScrollView>
          <View style={styles.copyRow}>
            <AppButton
              accessibilityLabel={copyLabel}
              onPress={onCopy}
              style={styles.copyButton}
              testID={`inspector-${target}-copy`}
            >
              Копировать
            </AppButton>
          </View>
          {feedback ? (
            <AppText
              accessibilityLiveRegion="polite"
              accessibilityRole={feedback.error ? "alert" : "summary"}
              style={[
                styles.copyFeedback,
                { color: feedback.error ? theme.dangerText : theme.successText }
              ]}
              testID={`inspector-${target}-copy-feedback`}
              variant="caption"
            >
              {feedback.message}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function InspectorScreen() {
  const { theme } = useAppTheme();
  const { inspector, inspectorRevision } = useIssuesApp();
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const revisionRef = useRef(inspectorRevision);
  const copyAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  revisionRef.current = inspectorRevision;

  useEffect(() => {
    setCopyFeedback(null);
    copyAttemptRef.current += 1;
  }, [inspectorRevision]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      copyAttemptRef.current += 1;
    };
  }, []);

  const copyContent = async (target: CopyTarget, content: string) => {
    const capturedRevision = inspectorRevision;
    const attempt = ++copyAttemptRef.current;
    const label = {
      request: "Тело запроса",
      response: "Тело ответа",
      curl: "cURL"
    }[target];

    setCopyFeedback(null);

    try {
      await Clipboard.setStringAsync(content);
      if (
        !mountedRef.current ||
        revisionRef.current !== capturedRevision ||
        copyAttemptRef.current !== attempt
      ) {
        return;
      }
      const message = `${label} скопировано.`;
      setCopyFeedback({ target, message, error: false });
      AccessibilityInfo.announceForAccessibility(message);
    } catch {
      if (
        !mountedRef.current ||
        revisionRef.current !== capturedRevision ||
        copyAttemptRef.current !== attempt
      ) {
        return;
      }
      const message = `Не удалось скопировать ${label.toLocaleLowerCase("ru-RU")}.`;
      setCopyFeedback({ target, message, error: true });
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  const consoleBackground = theme.dark ? theme.codeBackground : theme.surface;
  const consoleBorder = theme.dark ? "rgba(255, 255, 255, 0.12)" : theme.border;
  const eyebrowColor = theme.dark ? theme.amber : theme.destructive;

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      testID="api-inspector-screen"
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <View style={styles.topBarCopy}>
            <AppText style={{ color: eyebrowColor }} variant="eyebrow">
              QA Lab / REST API
            </AppText>
            <AppText accessibilityRole="header" variant="heading">
              Последний API-запрос
            </AppText>
          </View>
          <ThemeToggle />
        </View>

        <AppText muted>
          Метод, адрес, ответ и воспроизводимая cURL-команда последней операции.
        </AppText>

        <View
          style={[
            styles.inspector,
            { backgroundColor: consoleBackground, borderColor: consoleBorder }
          ]}
          testID="api-inspector"
        >
          {!inspector ? (
            <View style={styles.empty} testID="api-inspector-empty">
              <AppText style={{ color: eyebrowColor }} variant="eyebrow">
                Инспектор готов
              </AppText>
              <AppText accessibilityRole="header" variant="cardTitle">
                Запросов пока нет
              </AppText>
              <AppText muted>
                Выполните действие в трекере дефектов — здесь появятся детали HTTP-запроса.
              </AppText>
            </View>
          ) : (
            <View key={inspectorRevision}>
              <View style={[styles.metaRow, { borderTopColor: consoleBorder }]}>
                <AppText muted style={styles.metaLabel} variant="caption">
                  Метод
                </AppText>
                <AppText
                  selectable
                  style={styles.metaValueStrong}
                  testID="inspector-method"
                  variant="code"
                >
                  {inspector.method}
                </AppText>
              </View>

              <View style={[styles.metaRow, { borderTopColor: consoleBorder }]}>
                <AppText muted style={styles.metaLabel} variant="caption">
                  URL
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  style={styles.metaScroll}
                >
                  <AppText
                    accessibilityLabel={`Абсолютный URL: ${inspector.url}`}
                    selectable
                    style={styles.metaCodeValue}
                    testID="inspector-url"
                    variant="code"
                  >
                    {inspector.url}
                  </AppText>
                </ScrollView>
              </View>

              <View style={[styles.metaRow, { borderTopColor: consoleBorder }]}>
                <AppText muted style={styles.metaLabel} variant="caption">
                  Статус
                </AppText>
                <View
                  style={[
                    styles.status,
                    {
                      backgroundColor: inspector.ok
                        ? theme.amber
                        : theme.dark
                          ? theme.coral
                          : theme.destructive
                    }
                  ]}
                >
                  <AppText
                    style={[styles.statusText, { color: inspector.ok ? theme.onAmber : "#FFFFFF" }]}
                    testID="inspector-status"
                    variant="caption"
                  >
                    {inspector.statusLabel}
                  </AppText>
                </View>
              </View>

              <View style={[styles.metaRow, { borderTopColor: consoleBorder }]}>
                <AppText muted style={styles.metaLabel} variant="caption">
                  Время
                </AppText>
                <AppText selectable testID="inspector-duration">
                  {Math.max(0, Math.round(inspector.durationMs))} мс
                </AppText>
              </View>

              <View style={styles.sections}>
                {inspector.requestBody !== null ? (
                  <CodeSection
                    content={formatBody(inspector.requestBody)}
                    copyFeedback={copyFeedback}
                    copyLabel="Копировать тело запроса"
                    onCopy={() =>
                      void copyContent("request", formatBody(inspector.requestBody!))
                    }
                    revision={inspectorRevision}
                    target="request"
                    title="Тело запроса"
                  />
                ) : null}
                {inspector.responseBody !== null ? (
                  <CodeSection
                    content={formatBody(inspector.responseBody)}
                    copyFeedback={copyFeedback}
                    copyLabel="Копировать тело ответа"
                    onCopy={() =>
                      void copyContent("response", formatBody(inspector.responseBody!))
                    }
                    revision={inspectorRevision}
                    target="response"
                    title="Тело ответа"
                  />
                ) : null}
                <CodeSection
                  content={inspector.curl}
                  copyFeedback={copyFeedback}
                  copyLabel="Копировать cURL"
                  onCopy={() => void copyContent("curl", inspector.curl)}
                  revision={inspectorRevision}
                  target="curl"
                  title="cURL"
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 36
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  topBarCopy: {
    flex: 1,
    gap: spacing.xs
  },
  inspector: {
    minWidth: 0,
    padding: spacing.xxl,
    borderWidth: 1,
    borderRadius: radii.card
  },
  empty: {
    minHeight: 260,
    justifyContent: "center",
    gap: spacing.md
  },
  metaRow: {
    minWidth: 0,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1
  },
  metaLabel: {
    width: 64
  },
  metaValueStrong: {
    fontWeight: "800"
  },
  metaScroll: {
    minWidth: 0,
    flex: 1
  },
  metaCodeValue: {
    paddingRight: spacing.md
  },
  status: {
    minHeight: 28,
    maxWidth: "100%",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.badge
  },
  statusText: {
    fontWeight: "800"
  },
  sections: {
    gap: spacing.md,
    marginTop: spacing.sm
  },
  section: {
    minWidth: 0
  },
  sectionToggle: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1
  },
  sectionTitle: {
    fontWeight: "700"
  },
  pressed: {
    opacity: 0.72
  },
  codeBlock: {
    minWidth: 0,
    marginTop: spacing.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: radii.control
  },
  codeScrollContent: {
    padding: spacing.lg
  },
  code: {
    flexShrink: 0
  },
  copyRow: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm
  },
  copyButton: {
    minHeight: 48
  },
  copyFeedback: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    fontWeight: "700"
  }
});
