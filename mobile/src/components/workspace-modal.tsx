import { useEffect, useState } from "react";
import { AccessibilityInfo, Alert, StyleSheet, View } from "react-native";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { AppTextInput, FormField } from "@/components/ui/form-field";
import {
  ModalScreen,
  type ModalReturnFocusRef
} from "@/components/ui/modal-screen";
import { useIssuesApp } from "@/providers/issues-provider";
import {
  hasUnsavedWorkspaceChanges,
  validateWorkspaceId
} from "@/lib/workspace";

export function WorkspaceModal({
  visible,
  onClose,
  returnFocusRef
}: {
  visible: boolean;
  onClose: () => void;
  returnFocusRef?: ModalReturnFocusRef;
}) {
  const { workspaceId, switchWorkspace, showFeedback } = useIssuesApp();
  const [value, setValue] = useState(workspaceId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setValue(workspaceId);
    setError(null);
  }, [visible, workspaceId]);

  const close = () => {
    if (busy) return;
    if (!hasUnsavedWorkspaceChanges(value, workspaceId)) {
      onClose();
      return;
    }
    Alert.alert(
      "Закрыть без сохранения?",
      "Новый Workspace ID не будет сохранён.",
      [
        { text: "Продолжить работу", style: "cancel" },
        { text: "Закрыть без сохранения", style: "destructive", onPress: onClose }
      ]
    );
  };

  const submit = async () => {
    const validation = validateWorkspaceId(value);
    if (!validation.isValid) {
      setError(validation.error);
      AccessibilityInfo.announceForAccessibility(validation.error);
      return;
    }
    if (validation.value === workspaceId) {
      onClose();
      showFeedback("Workspace не изменён.");
      return;
    }
    setBusy(true);
    try {
      onClose();
      await switchWorkspace(validation.value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalScreen
      busy={busy}
      eyebrow="Демо-пространство"
      footer={
        <View style={styles.actions}>
          <AppButton disabled={busy} onPress={close} style={styles.action}>
            Отмена
          </AppButton>
          <AppButton busy={busy} onPress={() => void submit()} style={styles.action} variant="primary">
            Сохранить и перейти
          </AppButton>
        </View>
      }
      onRequestClose={close}
      returnFocusRef={returnFocusRef}
      testID="workspace-modal"
      title="Изменить Workspace"
      visible={visible}
    >
      <AppText style={styles.lead}>
        Введите UUID пространства, чтобы открыть связанные с ним дефекты. Значение сохранится на этом устройстве.
      </AppText>
      <FormField
        error={error ?? undefined}
        hint="Формат UUID: 123e4567-e89b-12d3-a456-426614174000."
        label="Workspace ID"
      >
        <AppTextInput
          accessibilityLabel="Workspace ID"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          invalid={Boolean(error)}
          onChangeText={(text) => {
            setValue(text);
            setError(null);
          }}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
          selectTextOnFocus
          testID="workspace-input"
          value={value}
        />
      </FormField>
      <View style={styles.note}>
        <AppText>
          <AppText style={styles.strong}>Записи не переносятся. </AppText>
          Вы увидите дефекты выбранного пространства, а текущие останутся доступны по прежнему UUID.
        </AppText>
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  lead: { marginBottom: 24 },
  note: { marginTop: 4 },
  strong: { fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1 }
});
