const WORKSPACE_STORAGE_KEY = "qa-lab-workspace-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTABLE_FIELDS = ["title", "description", "severity", "status"];
const SEVERITY_LABELS = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
  critical: "Критическая"
};
const STATUS_LABELS = {
  open: "Открыт",
  in_progress: "В работе",
  resolved: "Решён"
};

class ApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const state = {
  workspaceId: "",
  workspacePersistent: true,
  items: [],
  total: 0,
  filters: { q: "", status: "", severity: "" },
  selectedIssue: null,
  formSnapshot: null,
  formMode: "create",
  submitting: false,
  deleting: false,
  openingIssue: false,
  listController: null,
  listToken: 0,
  requestSequence: 0,
  inspectorSequence: 0
};

const elements = {
  workspaceId: document.querySelector("[data-workspace-id]"),
  filterForm: document.querySelector("[data-filter-form]"),
  filterQuery: document.querySelector("#filter-query"),
  filterStatus: document.querySelector("#filter-status"),
  filterSeverity: document.querySelector("#filter-severity"),
  retryLoad: document.querySelector("[data-retry-load]"),
  loadError: document.querySelector("[data-load-error]"),
  loadErrorMessage: document.querySelector("[data-load-error-message]"),
  issuesPanel: document.querySelector("[data-issues-panel]"),
  issuesTitle: document.querySelector("#issues-title"),
  resultCount: document.querySelector("[data-result-count]"),
  loadingState: document.querySelector("[data-loading-state]"),
  emptyState: document.querySelector("[data-empty-state]"),
  emptyTitle: document.querySelector("[data-empty-title]"),
  emptyDescription: document.querySelector("[data-empty-description]"),
  resetFilters: document.querySelector("[data-reset-filters]"),
  issueList: document.querySelector("[data-issue-list]"),
  issueTemplate: document.querySelector("#issue-card-template"),
  announcer: document.querySelector("[data-announcer]"),
  operationStatus: document.querySelector("[data-operation-status]"),
  apiEmpty: document.querySelector("[data-api-empty]"),
  apiDetails: document.querySelector("[data-api-details]"),
  requestMethod: document.querySelector("[data-request-method]"),
  requestUrl: document.querySelector("[data-request-url]"),
  responseStatus: document.querySelector("[data-response-status]"),
  requestDuration: document.querySelector("[data-request-duration]"),
  requestBodySection: document.querySelector("[data-request-body-section]"),
  requestJson: document.querySelector("[data-request-json]"),
  responseBodySection: document.querySelector("[data-response-body-section]"),
  responseJson: document.querySelector("[data-response-json]"),
  detailsDialog: document.querySelector("[data-details-dialog]"),
  detailsTitle: document.querySelector("[data-details-title]"),
  detailsDescription: document.querySelector("[data-details-description]"),
  detailsSeverity: document.querySelector("[data-details-severity]"),
  detailsStatus: document.querySelector("[data-details-status]"),
  detailsId: document.querySelector("[data-details-id]"),
  detailsCreated: document.querySelector("[data-details-created]"),
  detailsUpdated: document.querySelector("[data-details-updated]"),
  detailsEdit: document.querySelector("[data-details-edit]"),
  detailsDelete: document.querySelector("[data-details-delete]"),
  issueDialog: document.querySelector("[data-issue-dialog]"),
  issueForm: document.querySelector("[data-issue-form]"),
  dialogEyebrow: document.querySelector("[data-dialog-eyebrow]"),
  dialogTitle: document.querySelector("[data-dialog-title]"),
  formError: document.querySelector("[data-form-error]"),
  titleInput: document.querySelector("#issue-title"),
  descriptionInput: document.querySelector("#issue-description"),
  severityInput: document.querySelector("#issue-severity"),
  statusInput: document.querySelector("#issue-status"),
  descriptionCount: document.querySelector("[data-description-count]"),
  submitIssue: document.querySelector("[data-submit-issue]"),
  unsavedDialog: document.querySelector("[data-unsaved-dialog]"),
  unsavedDescription: document.querySelector("[data-unsaved-description]"),
  continueEditing: document.querySelector("[data-continue-editing]"),
  discardChanges: document.querySelector("[data-discard-changes]"),
  deleteDialog: document.querySelector("[data-delete-dialog]"),
  deleteIssueTitle: document.querySelector("[data-delete-issue-title]"),
  deleteError: document.querySelector("[data-delete-error]"),
  cancelDelete: document.querySelector("[data-cancel-delete]"),
  confirmDelete: document.querySelector("[data-confirm-delete]")
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short"
});

function makeWorkspaceId() {
  return crypto.randomUUID();
}

function initializeWorkspace() {
  try {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    state.workspaceId = saved && UUID_PATTERN.test(saved) ? saved : makeWorkspaceId();
    localStorage.setItem(WORKSPACE_STORAGE_KEY, state.workspaceId);
  } catch {
    state.workspaceId = makeWorkspaceId();
    state.workspacePersistent = false;
  }

  elements.workspaceId.textContent = state.workspaceId;
}

function announce(message) {
  elements.announcer.textContent = "";
  window.setTimeout(() => {
    elements.announcer.textContent = message;
  }, 20);
}

function clearOperationStatus() {
  elements.operationStatus.textContent = "";
  elements.operationStatus.hidden = true;
}

function showOperationStatus(message) {
  elements.operationStatus.textContent = message;
  elements.operationStatus.hidden = false;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function issueWord(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "дефектов";
  if (last === 1) return "дефект";
  if (last >= 2 && last <= 4) return "дефекта";
  return "дефектов";
}

function hasActiveFilters() {
  return Boolean(state.filters.q || state.filters.status || state.filters.severity);
}

function getErrorMessage(error) {
  if (error instanceof ApiError) {
    return error.payload?.error?.message || error.message;
  }
  return "Не удалось связаться с API. Попробуйте ещё раз.";
}

function recordRequest(sequence, details) {
  if (sequence < state.inspectorSequence) return;
  state.inspectorSequence = sequence;
  elements.apiEmpty.hidden = true;
  elements.apiDetails.hidden = false;
  elements.requestMethod.textContent = details.method;
  elements.requestUrl.textContent = details.url;
  elements.responseStatus.textContent = details.statusLabel;
  elements.responseStatus.className =
    "request-status" + (details.ok === false ? " is-error" : "");
  elements.requestDuration.textContent = Math.round(details.duration) + " мс";

  const hasRequestBody = details.requestBody !== undefined;
  elements.requestBodySection.hidden = !hasRequestBody;
  elements.requestJson.textContent = hasRequestBody
    ? JSON.stringify(details.requestBody, null, 2)
    : "";

  const hasResponseBody = details.responseBody !== undefined && details.responseBody !== null;
  elements.responseBodySection.hidden = !hasResponseBody;
  elements.responseJson.textContent = hasResponseBody
    ? typeof details.responseBody === "string"
      ? details.responseBody
      : JSON.stringify(details.responseBody, null, 2)
    : "";
}

async function request(path, { method = "GET", body, signal, inspect = true } = {}) {
  const sequence = ++state.requestSequence;
  const startedAt = performance.now();
  const headers = {
    Accept: "application/json",
    "X-Demo-Workspace-Id": state.workspaceId
  };

  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
    const responseText = await response.text();
    let responseBody = null;

    if (responseText) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }
    }

    if (inspect) {
      recordRequest(sequence, {
        method,
        url: path,
        statusLabel: response.status + (response.statusText ? " " + response.statusText : ""),
        duration: performance.now() - startedAt,
        requestBody: body,
        responseBody,
        ok: response.ok
      });
    }

    if (!response.ok) {
      throw new ApiError(responseBody?.error?.message || "API request failed", {
        status: response.status,
        payload: responseBody
      });
    }

    return responseBody;
  } catch (error) {
    if (error.name === "AbortError") throw error;
    if (error instanceof ApiError) throw error;

    if (inspect) {
      recordRequest(sequence, {
        method,
        url: path,
        statusLabel: "NETWORK ERROR",
        duration: performance.now() - startedAt,
        requestBody: body,
        responseBody: { error: { message: "Network request failed" } },
        ok: false
      });
    }
    throw new ApiError("Network request failed");
  }
}

const api = {
  list(filters, signal, inspectRequest = true) {
    const query = new URLSearchParams();
    if (filters.q) query.set("q", filters.q);
    if (filters.status) query.set("status", filters.status);
    if (filters.severity) query.set("severity", filters.severity);
    const suffix = query.size > 0 ? "?" + query.toString() : "";
    return request("/api/issues" + suffix, { signal, inspect: inspectRequest });
  },
  get(issueId) {
    return request("/api/issues/" + encodeURIComponent(issueId));
  },
  create(payload) {
    return request("/api/issues", { method: "POST", body: payload });
  },
  update(issueId, payload) {
    return request("/api/issues/" + encodeURIComponent(issueId), {
      method: "PATCH",
      body: payload
    });
  },
  remove(issueId) {
    return request("/api/issues/" + encodeURIComponent(issueId), { method: "DELETE" });
  }
};

function setBadge(element, kind, value) {
  const labels = kind === "severity" ? SEVERITY_LABELS : STATUS_LABELS;
  element.dataset.kind = kind;
  element.dataset.value = value;
  element.textContent = labels[value] || value;
}

function renderIssues() {
  elements.issueList.replaceChildren();
  elements.resultCount.textContent = state.total + " " + issueWord(state.total);
  elements.loadingState.hidden = true;
  elements.issuesPanel.setAttribute("aria-busy", "false");

  if (state.items.length === 0) {
    const filtered = hasActiveFilters();
    elements.emptyTitle.textContent = filtered ? "Ничего не найдено" : "Дефектов пока нет";
    elements.emptyDescription.textContent = filtered
      ? "Измените запрос или сбросьте фильтры."
      : "Создайте первую запись, чтобы пройти полный CRUD-сценарий.";
    elements.resetFilters.hidden = !filtered;
    elements.emptyState.hidden = false;
    elements.issueList.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const issue of state.items) {
    const item = elements.issueTemplate.content.cloneNode(true);
    const article = item.querySelector(".issue-card");
    const heading = item.querySelector("[data-issue-title]");
    const headingId = "issue-title-" + issue.id;

    article.dataset.severity = issue.severity;
    article.setAttribute("aria-labelledby", headingId);
    heading.id = headingId;
    heading.textContent = issue.title;
    item.querySelector("[data-issue-description]").textContent = issue.description;
    setBadge(item.querySelector("[data-issue-severity]"), "severity", issue.severity);
    setBadge(item.querySelector("[data-issue-status]"), "status", issue.status);

    const updated = item.querySelector("[data-issue-updated]");
    updated.dateTime = issue.updatedAt;
    updated.textContent = "Обновлён " + formatDate(issue.updatedAt);

    for (const button of item.querySelectorAll("[data-action]")) {
      button.dataset.id = issue.id;
    }

    fragment.append(item);
  }

  elements.issueList.append(fragment);
  elements.emptyState.hidden = true;
  elements.issueList.hidden = false;
}

function setLoading() {
  elements.loadError.hidden = true;
  elements.loadingState.hidden = false;
  elements.emptyState.hidden = true;
  elements.issueList.hidden = true;
  elements.resultCount.textContent = "Загрузка…";
  elements.issuesPanel.setAttribute("aria-busy", "true");
}

async function loadIssues({ inspectRequest = true } = {}) {
  state.listController?.abort();
  state.listController = new AbortController();
  const token = ++state.listToken;
  setLoading();

  try {
    const result = await api.list(
      state.filters,
      state.listController.signal,
      inspectRequest
    );
    if (token !== state.listToken) return false;
    if (!result || !Array.isArray(result.items) || typeof result.total !== "number") {
      throw new ApiError("API вернул неожиданный формат списка");
    }
    state.items = result.items;
    state.total = result.total;
    renderIssues();
    return true;
  } catch (error) {
    if (error.name === "AbortError" || token !== state.listToken) return false;
    elements.loadingState.hidden = true;
    elements.issueList.hidden = true;
    elements.emptyState.hidden = true;
    elements.issuesPanel.setAttribute("aria-busy", "false");
    elements.resultCount.textContent = "Ошибка";
    elements.loadErrorMessage.textContent = getErrorMessage(error);
    elements.loadError.hidden = false;
    return false;
  }
}

function syncFilters() {
  state.filters = {
    q: elements.filterQuery.value.trim(),
    status: elements.filterStatus.value,
    severity: elements.filterSeverity.value
  };
}

function resetFilters() {
  elements.filterForm.reset();
}

function showDialog(dialog, trigger, focusTarget) {
  dialog._returnFocus = trigger instanceof HTMLElement ? trigger : null;
  dialog.showModal();
  window.setTimeout(() => focusTarget?.focus(), 0);
}

function closeDialog(dialog, { restoreFocus = true } = {}) {
  dialog._skipFocusRestore = !restoreFocus;
  if (dialog.open) dialog.close();
}

function restoreDialogFocus(dialog) {
  if (dialog._skipFocusRestore) {
    dialog._skipFocusRestore = false;
    return;
  }
  if (dialog._returnFocus?.isConnected) dialog._returnFocus.focus();
}

function populateDetails(issue) {
  state.selectedIssue = issue;
  elements.detailsTitle.textContent = issue.title;
  elements.detailsDescription.textContent = issue.description;
  setBadge(elements.detailsSeverity, "severity", issue.severity);
  setBadge(elements.detailsStatus, "status", issue.status);
  elements.detailsId.textContent = issue.id;

  for (const [element, value] of [
    [elements.detailsCreated, issue.createdAt],
    [elements.detailsUpdated, issue.updatedAt]
  ]) {
    element.dateTime = value;
    element.textContent = formatDate(value);
  }
}

async function fetchIssueAndOpen(issueId, trigger, mode) {
  if (state.openingIssue) return;
  state.openingIssue = true;
  trigger.disabled = true;
  try {
    const issue = await api.get(issueId);
    if (mode === "details") {
      populateDetails(issue);
      showDialog(elements.detailsDialog, trigger, elements.detailsEdit);
    } else {
      openIssueForm(issue, trigger);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      announce("Дефект уже удалён. Список обновлён.");
      await loadIssues({ inspectRequest: false });
    } else {
      announce(getErrorMessage(error));
    }
  } finally {
    trigger.disabled = false;
    state.openingIssue = false;
  }
}

function clearFieldError(field) {
  const input = elements.issueForm.elements.namedItem(field);
  const message = elements.issueForm.querySelector('[data-field-error="' + field + '"]');
  input?.removeAttribute("aria-invalid");
  if (message) {
    message.textContent = "";
    message.hidden = true;
  }
}

function clearFormErrors() {
  elements.formError.hidden = true;
  elements.formError.textContent = "";
  for (const field of MUTABLE_FIELDS) clearFieldError(field);
}

function showFieldErrors(errors) {
  let firstInvalid = null;
  for (const [field, message] of Object.entries(errors || {})) {
    const input = elements.issueForm.elements.namedItem(field);
    const target = elements.issueForm.querySelector('[data-field-error="' + field + '"]');
    if (!input || !target) continue;
    input.setAttribute("aria-invalid", "true");
    target.textContent = message;
    target.hidden = false;
    firstInvalid ||= input;
  }
  firstInvalid?.focus();
}

function showFormError(message) {
  elements.formError.textContent = message;
  elements.formError.hidden = false;
}

function updateDescriptionCount() {
  elements.descriptionCount.textContent =
    [...elements.descriptionInput.value].length + " / 2000";
}

function issueFormValue({ trimText = true } = {}) {
  return {
    title: trimText ? elements.titleInput.value.trim() : elements.titleInput.value,
    description: trimText
      ? elements.descriptionInput.value.trim()
      : elements.descriptionInput.value,
    severity: elements.severityInput.value,
    status: elements.statusInput.value
  };
}

function issueFormHasChanges() {
  if (!state.formSnapshot) return false;
  const currentValue = issueFormValue({ trimText: false });
  return MUTABLE_FIELDS.some(
    (field) => currentValue[field] !== state.formSnapshot[field]
  );
}

function requestIssueDialogClose() {
  if (state.submitting || !elements.issueDialog.open) return;
  if (elements.unsavedDialog.open) return;

  if (!issueFormHasChanges()) {
    closeDialog(elements.issueDialog);
    return;
  }

  if (state.formMode === "create") {
    elements.unsavedDescription.textContent =
      "Данные нового дефекта ещё не сохранены. Если закрыть форму, они будут потеряны.";
  } else {
    elements.unsavedDescription.textContent =
      "Изменения в дефекте ещё не сохранены. Если закрыть форму, они будут потеряны.";
  }

  const activeElement = document.activeElement;
  const returnFocusTarget =
    activeElement instanceof HTMLElement &&
    activeElement !== elements.issueDialog &&
    elements.issueDialog.contains(activeElement)
      ? activeElement
      : elements.titleInput;
  showDialog(elements.unsavedDialog, returnFocusTarget, elements.continueEditing);
}

function validateClientPayload(payload) {
  const errors = {};
  const titleLength = [...payload.title].length;
  const descriptionLength = [...payload.description].length;

  if (titleLength < 3 || titleLength > 120) {
    errors.title = "Введите от 3 до 120 символов без учёта пробелов по краям.";
  }
  if (descriptionLength < 10 || descriptionLength > 2000) {
    errors.description = "Введите от 10 до 2000 символов без учёта пробелов по краям.";
  }
  if (!Object.hasOwn(SEVERITY_LABELS, payload.severity)) {
    errors.severity = "Выберите допустимую критичность.";
  }
  if (!Object.hasOwn(STATUS_LABELS, payload.status)) {
    errors.status = "Выберите допустимый статус.";
  }
  return errors;
}

function openIssueForm(issue, trigger) {
  clearOperationStatus();
  state.formMode = issue ? "edit" : "create";
  state.selectedIssue = issue || null;
  elements.issueForm.reset();
  clearFormErrors();

  if (issue) {
    elements.dialogEyebrow.textContent = "Редактирование";
    elements.dialogTitle.textContent = "Редактировать дефект";
    elements.submitIssue.textContent = "Сохранить";
    elements.titleInput.value = issue.title;
    elements.descriptionInput.value = issue.description;
    elements.severityInput.value = issue.severity;
    elements.statusInput.value = issue.status;
  } else {
    elements.dialogEyebrow.textContent = "Новый дефект";
    elements.dialogTitle.textContent = "Создать дефект";
    elements.submitIssue.textContent = "Создать";
    elements.severityInput.value = "medium";
    elements.statusInput.value = "open";
  }

  updateDescriptionCount();
  state.formSnapshot = issueFormValue({ trimText: false });
  showDialog(elements.issueDialog, trigger, elements.titleInput);
}

function setFormBusy(isBusy) {
  state.submitting = isBusy;
  elements.issueForm.setAttribute("aria-busy", String(isBusy));
  for (const control of elements.issueForm.elements) control.disabled = isBusy;
  for (const control of elements.issueDialog.querySelectorAll("[data-close-issue-dialog]")) {
    control.disabled = isBusy;
  }
}

async function handleIssueSubmit(event) {
  event.preventDefault();
  if (state.submitting) return;
  clearFormErrors();

  const payload = issueFormValue();
  const clientErrors = validateClientPayload(payload);
  if (Object.keys(clientErrors).length > 0) {
    showFieldErrors(clientErrors);
    return;
  }

  let requestPayload = payload;
  if (state.formMode === "edit") {
    requestPayload = Object.fromEntries(
      MUTABLE_FIELDS.filter((field) => payload[field] !== state.formSnapshot[field])
        .map((field) => [field, payload[field]])
    );
    if (Object.keys(requestPayload).length === 0) {
      showFormError("Измените хотя бы одно поле.");
      return;
    }
  }

  setFormBusy(true);
  try {
    if (state.formMode === "create") {
      await api.create(requestPayload);
    } else {
      await api.update(state.selectedIssue.id, requestPayload);
    }
    const action = state.formMode === "create" ? "создан" : "обновлён";
    closeDialog(elements.issueDialog, { restoreFocus: false });
    const refreshed = await loadIssues({ inspectRequest: false });
    showOperationStatus(
      refreshed
        ? "Дефект " + action + "."
        : "Дефект " + action + ", но обновить список не удалось."
    );
    elements.issuesTitle.focus();
  } catch (error) {
    const fields = error.payload?.error?.fields;
    if (error instanceof ApiError && error.status === 422 && fields) {
      showFieldErrors(fields);
      if (fields._body) showFormError(fields._body);
    } else if (error instanceof ApiError && error.status === 404) {
      closeDialog(elements.issueDialog, { restoreFocus: false });
      await loadIssues({ inspectRequest: false });
      announce("Дефект уже удалён. Список обновлён.");
      elements.issuesTitle.focus();
    } else {
      showFormError(getErrorMessage(error));
    }
  } finally {
    setFormBusy(false);
  }
}

function openDeleteDialog(issue, trigger) {
  clearOperationStatus();
  state.selectedIssue = issue;
  elements.deleteIssueTitle.textContent = issue.title;
  elements.deleteError.hidden = true;
  elements.deleteError.textContent = "";
  showDialog(elements.deleteDialog, trigger, elements.cancelDelete);
}

function setDeleteBusy(isBusy) {
  state.deleting = isBusy;
  elements.cancelDelete.disabled = isBusy;
  elements.confirmDelete.disabled = isBusy;
  elements.deleteDialog.setAttribute("aria-busy", String(isBusy));
}

async function handleDelete() {
  if (state.deleting || !state.selectedIssue) return;
  setDeleteBusy(true);
  try {
    await api.remove(state.selectedIssue.id);
    closeDialog(elements.deleteDialog, { restoreFocus: false });
    const refreshed = await loadIssues({ inspectRequest: false });
    showOperationStatus(
      refreshed
        ? "Дефект удалён."
        : "Дефект удалён, но обновить список не удалось."
    );
    elements.issuesTitle.focus();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      closeDialog(elements.deleteDialog, { restoreFocus: false });
      await loadIssues({ inspectRequest: false });
      announce("Дефект уже был удалён. Список обновлён.");
      elements.issuesTitle.focus();
    } else {
      elements.deleteError.textContent = getErrorMessage(error);
      elements.deleteError.hidden = false;
    }
  } finally {
    setDeleteBusy(false);
  }
}

let searchTimer;

function bindEvents() {
  document.querySelectorAll("[data-open-create]").forEach((button) => {
    button.addEventListener("click", () => openIssueForm(null, button));
  });

  elements.filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    syncFilters();
    loadIssues();
  });

  elements.filterQuery.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      syncFilters();
      loadIssues();
    }, 300);
  });

  for (const select of [elements.filterStatus, elements.filterSeverity]) {
    select.addEventListener("change", () => {
      window.clearTimeout(searchTimer);
      syncFilters();
      loadIssues();
    });
  }

  elements.filterForm.addEventListener("reset", () => {
    window.clearTimeout(searchTimer);
    window.setTimeout(() => {
      syncFilters();
      loadIssues();
    }, 0);
  });

  elements.resetFilters.addEventListener("click", resetFilters);
  elements.retryLoad.addEventListener("click", loadIssues);

  elements.issueList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const issue = state.items.find((item) => item.id === button.dataset.id);
    if (!issue || state.openingIssue) return;

    if (button.dataset.action === "read") {
      await fetchIssueAndOpen(issue.id, button, "details");
    } else if (button.dataset.action === "edit") {
      await fetchIssueAndOpen(issue.id, button, "edit");
    } else {
      openDeleteDialog(issue, button);
    }
  });

  document.querySelectorAll("[data-close-details]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(elements.detailsDialog));
  });
  document.querySelectorAll("[data-close-issue-dialog]").forEach((button) => {
    button.addEventListener("click", requestIssueDialogClose);
  });

  elements.detailsEdit.addEventListener("click", () => {
    const returnTarget = elements.detailsDialog._returnFocus;
    const issue = state.selectedIssue;
    closeDialog(elements.detailsDialog, { restoreFocus: false });
    openIssueForm(issue, returnTarget);
  });

  elements.detailsDelete.addEventListener("click", () => {
    const returnTarget = elements.detailsDialog._returnFocus;
    const issue = state.selectedIssue;
    closeDialog(elements.detailsDialog, { restoreFocus: false });
    openDeleteDialog(issue, returnTarget);
  });

  elements.issueForm.addEventListener("submit", handleIssueSubmit);
  elements.issueForm.addEventListener("input", (event) => {
    if (event.target.name) clearFieldError(event.target.name);
    if (event.target === elements.descriptionInput) updateDescriptionCount();
  });

  elements.continueEditing.addEventListener("click", () => {
    closeDialog(elements.unsavedDialog);
  });
  elements.discardChanges.addEventListener("click", () => {
    closeDialog(elements.unsavedDialog, { restoreFocus: false });
    closeDialog(elements.issueDialog);
  });

  elements.cancelDelete.addEventListener("click", () => {
    if (!state.deleting) closeDialog(elements.deleteDialog);
  });
  elements.confirmDelete.addEventListener("click", handleDelete);

  for (const dialog of [
    elements.detailsDialog,
    elements.issueDialog,
    elements.unsavedDialog,
    elements.deleteDialog
  ]) {
    dialog.addEventListener("close", () => restoreDialogFocus(dialog));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && !state.submitting && !state.deleting) {
        if (dialog === elements.issueDialog) {
          requestIssueDialogClose();
        } else {
          closeDialog(dialog);
        }
      }
    });
  }

  elements.issueDialog.addEventListener("cancel", (event) => {
    if (state.submitting) {
      event.preventDefault();
      return;
    }
    if (issueFormHasChanges()) {
      event.preventDefault();
      requestIssueDialogClose();
    }
  });
  elements.deleteDialog.addEventListener("cancel", (event) => {
    if (state.deleting) event.preventDefault();
  });
}

async function init() {
  initializeWorkspace();
  bindEvents();
  if (!state.workspacePersistent) {
    announce("Идентификатор demo-пространства не сохранится после закрытия страницы.");
  }
  await loadIssues();
}

init();
