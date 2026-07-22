import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import {
  ModalScreen,
  type ModalReturnFocusRef
} from "@/components/ui/modal-screen";
import type { Issue } from "@/domain/issues";
import { getApiErrorMessage, isNotFoundApiError } from "@/lib/errors";
import { useIssuesApp } from "@/providers/issues-provider";
import { useAppTheme } from "@/providers/theme-provider";

export function DeleteIssueModal({
  issue,
  visible,
  onClose,
  onDeleted,
  returnFocusRef
}: {
  issue: Issue | null;
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
  returnFocusRef?: ModalReturnFocusRef;
}) {
  const { theme } = useAppTheme();
  const { deleteIssue, reload, showFeedback } = useIssuesApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setError(null);
  }, [visible]);

  if (!issue) return null;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteIssue(issue.id);
      onDeleted();
    } catch (caught) {
      if (isNotFoundApiError(caught)) {
        await reload({ inspect: false });
        showFeedback("Дефект уже был удалён. Список обновлён.", "error");
        onDeleted();
      } else {
        const message = getApiErrorMessage(caught);
        setError(message);
        AccessibilityInfo.announceForAccessibility(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalScreen
      busy={busy}
      eyebrow="Необратимое действие"
      footer={
        <View style={styles.actions}>
          <AppButton disabled={busy} onPress={onClose} style={styles.action}>Отмена</AppButton>
          <AppButton busy={busy} onPress={() => void confirm()} style={styles.action} variant="danger">
            Удалить
          </AppButton>
        </View>
      }
      onRequestClose={() => {
        if (!busy) onClose();
      }}
      returnFocusRef={returnFocusRef}
      testID="delete-issue-modal"
      title="Удалить дефект?"
      visible={visible}
    >
      <AppText>
        Дефект «<AppText style={styles.strong}>{issue.title}</AppText>» будет удалён безвозвратно.
      </AppText>
      {error ? (
        <View style={[styles.error, { backgroundColor: theme.dangerSurface, borderColor: theme.dangerBorder }]}>
          <AppText accessibilityRole="alert" style={{ color: theme.dangerText }}>
            {error}
          </AppText>
        </View>
      ) : null}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: "800" },
  error: { marginTop: 18, borderWidth: 1, borderRadius: 8, padding: 14 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1 }
});
