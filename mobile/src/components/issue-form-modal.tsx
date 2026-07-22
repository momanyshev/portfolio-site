import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Alert, StyleSheet, View } from "react-native";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { AppTextInput, FormField } from "@/components/ui/form-field";
import {
  ModalScreen,
  type ModalReturnFocusRef
} from "@/components/ui/modal-screen";
import { PickerField, type PickerOption } from "@/components/ui/picker-field";
import {
  getDescriptionCharacterCount,
  hasUnsavedIssueChanges,
  type IssueFormValues,
  type IssueValidationErrors,
  validateCreateIssueForm,
  validateEditIssueForm
} from "@/domain/issue-validation";
import {
  DEFAULT_ISSUE_FORM_VALUES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  SEVERITY_LABELS,
  STATUS_LABELS,
  formatStatusTransitionHint,
  getEditableStatuses,
  type Issue,
  type IssueMutableFields,
  type IssueSeverity,
  type IssueStatus
} from "@/domain/issues";
import { mapApiError } from "@/lib/errors";
import { useIssuesApp } from "@/providers/issues-provider";
import { useAppTheme } from "@/providers/theme-provider";

type IssueFormModalProps = {
  visible: boolean;
  issue: Issue | null;
  onClose: () => void;
  onSaved: (issue: Issue) => void;
  returnFocusRef?: ModalReturnFocusRef;
};

function valuesFromIssue(issue: Issue | null): IssueFormValues {
  const source = issue ?? DEFAULT_ISSUE_FORM_VALUES;
  return {
    title: source.title,
    description: source.description,
    severity: source.severity,
    status: source.status
  };
}

function mutableFromValues(values: IssueFormValues): IssueMutableFields {
  return {
    title: values.title,
    description: values.description,
    severity: values.severity as IssueSeverity,
    status: values.status as IssueStatus
  };
}

export function IssueFormModal({
  visible,
  issue,
  onClose,
  onSaved,
  returnFocusRef
}: IssueFormModalProps) {
  const { theme } = useAppTheme();
  const {
    createIssue,
    updateIssue,
    refreshIssueAfterConflict,
    reload,
    showFeedback
  } = useIssuesApp();
  const [currentIssue, setCurrentIssue] = useState<Issue | null>(issue);
  const [values, setValues] = useState<IssueFormValues>(() => valuesFromIssue(issue));
  const [snapshot, setSnapshot] = useState<IssueFormValues>(() => valuesFromIssue(issue));
  const [errors, setErrors] = useState<IssueValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(currentIssue);

  useEffect(() => {
    if (!visible) return;
    const initial = valuesFromIssue(issue);
    setCurrentIssue(issue);
    setValues(initial);
    setSnapshot(initial);
    setErrors({});
    setFormError(null);
    setBusy(false);
  }, [issue, visible]);

  const statusValues = currentIssue
    ? getEditableStatuses(currentIssue.status)
    : [...ISSUE_STATUSES];
  const severityOptions: PickerOption<IssueSeverity>[] = ISSUE_SEVERITIES.map((value) => ({
    label: SEVERITY_LABELS[value],
    value
  }));
  const statusOptions: PickerOption<IssueStatus>[] = statusValues.map((value) => ({
    label: STATUS_LABELS[value],
    value
  }));
  const statusHint = currentIssue
    ? formatStatusTransitionHint(currentIssue.status)
    : "При создании можно выбрать начальный статус. Дальнейшие изменения выполняются по статусной модели.";
  const count = useMemo(
    () => getDescriptionCharacterCount(values.description),
    [values.description]
  );

  const setField = (field: keyof IssueFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const discardAndClose = () => {
    setValues(snapshot);
    onClose();
  };

  const requestClose = () => {
    if (busy) return;
    if (!hasUnsavedIssueChanges(values, snapshot)) {
      onClose();
      return;
    }
    Alert.alert(
      "Закрыть без сохранения?",
      editing
        ? "Изменения в дефекте ещё не сохранены. Если закрыть форму, они будут потеряны."
        : "Данные нового дефекта ещё не сохранены. Если закрыть форму, они будут потеряны.",
      [
        { text: "Продолжить работу", style: "cancel" },
        { text: "Закрыть без сохранения", style: "destructive", onPress: discardAndClose }
      ]
    );
  };

  const submit = async () => {
    if (busy) return;
    setErrors({});
    setFormError(null);

    setBusy(true);
    try {
      let saved: Issue;
      if (currentIssue) {
        const validation = validateEditIssueForm(values, mutableFromValues(snapshot));
        if (!validation.isValid) {
          setErrors(validation.errors);
          setFormError(validation.errors._form ?? null);
          AccessibilityInfo.announceForAccessibility(
            validation.errors._form ??
              validation.errors.title ??
              validation.errors.description ??
              validation.errors.severity ??
              validation.errors.status ??
              "Проверьте поля формы."
          );
          return;
        }
        saved = await updateIssue(currentIssue.id, validation.value);
      } else {
        const validation = validateCreateIssueForm(values);
        if (!validation.isValid) {
          setErrors(validation.errors);
          setFormError(validation.errors._form ?? null);
          AccessibilityInfo.announceForAccessibility(
            validation.errors._form ??
              validation.errors.title ??
              validation.errors.description ??
              validation.errors.severity ??
              validation.errors.status ??
              "Проверьте поля формы."
          );
          return;
        }
        saved = await createIssue(validation.value);
      }
      onSaved(saved);
    } catch (caught) {
      const mapped = mapApiError(caught);
      if (mapped.isValidationError) {
        const fieldErrors: IssueValidationErrors = {};
        for (const field of ["title", "description", "severity", "status"] as const) {
          if (mapped.fields[field]) fieldErrors[field] = mapped.fields[field];
        }
        setErrors(fieldErrors);
        setFormError(mapped.fields._body ?? mapped.message);
        AccessibilityInfo.announceForAccessibility(mapped.message);
      } else if (mapped.isStatusTransitionConflict && currentIssue) {
        try {
          const latest = await refreshIssueAfterConflict(currentIssue.id);
          setCurrentIssue(latest);
          setValues((current) => ({ ...current, status: latest.status }));
          setSnapshot((current) => ({ ...current, status: latest.status }));
          setErrors({
            status:
              `Статус уже изменился. ${formatStatusTransitionHint(latest.status)} ` +
              "Остальные данные формы сохранены."
          });
          AccessibilityInfo.announceForAccessibility(
            `Статус уже изменился. ${formatStatusTransitionHint(latest.status)}`
          );
        } catch (refreshError) {
          setFormError(
            "Статус уже изменился, но получить актуальные данные не удалось. " +
              mapApiError(refreshError).message
          );
          AccessibilityInfo.announceForAccessibility(
            "Статус уже изменился, но получить актуальные данные не удалось."
          );
        }
      } else if (mapped.isNotFound) {
        onClose();
        await reload({ inspect: false });
        showFeedback("Дефект уже удалён. Список обновлён.", "error");
      } else {
        setFormError(mapped.message);
        AccessibilityInfo.announceForAccessibility(mapped.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalScreen
      busy={busy}
      eyebrow={editing ? "Редактирование" : "Новый дефект"}
      footer={
        <View style={styles.actions}>
          <AppButton disabled={busy} onPress={requestClose} style={styles.action}>Отмена</AppButton>
          <AppButton busy={busy} onPress={() => void submit()} style={styles.action} variant="primary">
            {editing ? "Сохранить" : "Создать"}
          </AppButton>
        </View>
      }
      onRequestClose={requestClose}
      returnFocusRef={returnFocusRef}
      testID="issue-form-modal"
      title={editing ? "Редактировать дефект" : "Создать дефект"}
      visible={visible}
    >
      {formError ? (
        <View style={[styles.formError, { backgroundColor: theme.dangerSurface, borderColor: theme.dangerBorder }]}>
          <AppText accessibilityRole="alert" style={{ color: theme.dangerText }}>
            {formError}
          </AppText>
        </View>
      ) : null}
      <FormField
        error={errors.title}
        hint="От 3 до 120 символов после trim."
        label="Название"
      >
        <AppTextInput
          accessibilityLabel="Название"
          editable={!busy}
          invalid={Boolean(errors.title)}
          onChangeText={(value) => setField("title", value)}
          returnKeyType="next"
          testID="issue-title-input"
          value={values.title}
        />
      </FormField>
      <FormField
        counter={`${count} / 2000`}
        error={errors.description}
        hint="От 10 до 2000 символов после trim."
        label="Описание"
      >
        <AppTextInput
          accessibilityLabel="Описание"
          editable={!busy}
          invalid={Boolean(errors.description)}
          multiline
          onChangeText={(value) => setField("description", value)}
          style={styles.textarea}
          testID="issue-description-input"
          textAlignVertical="top"
          value={values.description}
        />
      </FormField>
      <FormField error={errors.severity} label="Критичность">
        <PickerField
          accessibilityLabel="Критичность"
          enabled={!busy}
          onValueChange={(value) => setField("severity", value)}
          options={severityOptions}
          selectedValue={values.severity as IssueSeverity}
          testID="issue-severity-picker"
        />
      </FormField>
      <FormField error={errors.status} hint={statusHint} label="Статус">
        <PickerField
          accessibilityLabel="Статус"
          enabled={!busy}
          onValueChange={(value) => setField("status", value)}
          options={statusOptions}
          selectedValue={values.status as IssueStatus}
          testID="issue-status-picker"
        />
      </FormField>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  textarea: { minHeight: 156 },
  formError: { marginBottom: 18, borderWidth: 1, borderRadius: 8, padding: 14 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1 }
});
