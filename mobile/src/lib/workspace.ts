export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const WORKSPACE_UUID_FORMAT_EXAMPLE =
  "123e4567-e89b-12d3-a456-426614174000";

export type WorkspaceValidationResult =
  | { isValid: true; value: string; error: null }
  | { isValid: false; value: null; error: string };

export function normalizeWorkspaceId(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateWorkspaceId(value: string): WorkspaceValidationResult {
  const normalized = normalizeWorkspaceId(value);

  if (!normalized) {
    return { isValid: false, value: null, error: "Введите Workspace ID." };
  }

  if (!isValidUuid(normalized)) {
    return {
      isValid: false,
      value: null,
      error: `Введите UUID в формате ${WORKSPACE_UUID_FORMAT_EXAMPLE}.`,
    };
  }

  return { isValid: true, value: normalized, error: null };
}

export function isSameWorkspaceId(current: string, candidate: string): boolean {
  return normalizeWorkspaceId(current) === normalizeWorkspaceId(candidate);
}

export function hasUnsavedWorkspaceChanges(
  inputValue: string,
  activeWorkspaceId: string,
): boolean {
  return !isSameWorkspaceId(inputValue, activeWorkspaceId);
}
