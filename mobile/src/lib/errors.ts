import {
  isApiErrorCode,
  type ApiErrorCode,
  type ApiErrorResponse,
  type ApiFieldErrors,
} from "../domain/issues";
import { isValidUuid } from "./workspace";

export const API_ERROR_FALLBACK_MESSAGES = {
  INVALID_WORKSPACE: "Указан некорректный Workspace ID.",
  INVALID_ID: "Указан некорректный ID дефекта.",
  INVALID_QUERY: "Параметры поиска или фильтров некорректны.",
  MALFORMED_JSON: "Не удалось прочитать тело запроса.",
  UNSUPPORTED_MEDIA_TYPE: "API ожидает данные в формате JSON.",
  VALIDATION_ERROR: "Проверьте заполненные поля.",
  NOT_FOUND: "Дефект не найден.",
  METHOD_NOT_ALLOWED: "Операция не поддерживается API.",
  WORKSPACE_LIMIT_REACHED: "В Workspace уже создано 50 дефектов.",
  CONCURRENT_MODIFICATION:
    "Данные изменились параллельно. Повторите операцию.",
  INVALID_STATUS_TRANSITION: "Этот переход статуса больше недоступен.",
  INTERNAL_ERROR: "API не смог обработать запрос.",
} as const satisfies Record<ApiErrorCode, string>;

const NETWORK_ERROR_MESSAGE =
  "Не удалось связаться с API. Попробуйте ещё раз.";
const UNKNOWN_ERROR_MESSAGE = "Не удалось выполнить операцию. Попробуйте ещё раз.";

export interface ApiErrorOptions {
  status?: number;
  payload?: unknown;
  isNetworkFailure?: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorResponse | null;
  readonly rawPayload: unknown;
  readonly isNetworkFailure: boolean;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.rawPayload = options.payload ?? null;
    this.payload = isApiErrorResponse(this.rawPayload) ? this.rawPayload : null;
    this.isNetworkFailure =
      options.isNetworkFailure ??
      (this.status === 0 && message === "Network request failed");
  }

  static network(message = "Network request failed"): ApiError {
    return new ApiError(message, { isNetworkFailure: true });
  }
}

export interface MappedApiError {
  kind: "api" | "network" | "unknown";
  status: number | null;
  code: ApiErrorCode | null;
  message: string;
  serverMessage: string | null;
  fields: ApiFieldErrors;
  requestId: string | null;
  retryable: boolean;
  isValidationError: boolean;
  isNotFound: boolean;
  isStatusTransitionConflict: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((fieldValue) => typeof fieldValue === "string")
  );
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["error"]) ||
    !isRecord(value.error)
  ) {
    return false;
  }

  const detail = value.error;
  return (
    hasExactKeys(detail, ["code", "message", "fields", "requestId"]) &&
    isApiErrorCode(detail.code) &&
    typeof detail.message === "string" &&
    isStringRecord(detail.fields) &&
    isValidUuid(detail.requestId)
  );
}

function mapPayload(
  payload: ApiErrorResponse,
  status: number | null,
): MappedApiError {
  const { code, fields, message, requestId } = payload.error;
  const serverMessage = message.trim() || null;

  return {
    kind: "api",
    status,
    code,
    message: serverMessage ?? API_ERROR_FALLBACK_MESSAGES[code],
    serverMessage,
    fields: { ...fields },
    requestId,
    retryable:
      code === "CONCURRENT_MODIFICATION" ||
      code === "INTERNAL_ERROR" ||
      (status !== null && status >= 500),
    isValidationError: code === "VALIDATION_ERROR",
    isNotFound: code === "NOT_FOUND",
    isStatusTransitionConflict: code === "INVALID_STATUS_TRANSITION",
  };
}

export function mapApiError(error: unknown): MappedApiError {
  if (error instanceof ApiError) {
    if (error.payload) {
      return mapPayload(error.payload, error.status);
    }

    if (error.isNetworkFailure) {
      return {
        kind: "network",
        status: null,
        code: null,
        message: NETWORK_ERROR_MESSAGE,
        serverMessage: null,
        fields: {},
        requestId: null,
        retryable: true,
        isValidationError: false,
        isNotFound: false,
        isStatusTransitionConflict: false,
      };
    }

    return {
      kind: "api",
      status: error.status || null,
      code: null,
      message: error.message || UNKNOWN_ERROR_MESSAGE,
      serverMessage: null,
      fields: {},
      requestId: null,
      retryable: error.status >= 500,
      isValidationError: false,
      isNotFound: error.status === 404,
      isStatusTransitionConflict: false,
    };
  }

  if (isApiErrorResponse(error)) {
    return mapPayload(error, null);
  }

  if (error instanceof TypeError) {
    return {
      kind: "network",
      status: null,
      code: null,
      message: NETWORK_ERROR_MESSAGE,
      serverMessage: null,
      fields: {},
      requestId: null,
      retryable: true,
      isValidationError: false,
      isNotFound: false,
      isStatusTransitionConflict: false,
    };
  }

  return {
    kind: "unknown",
    status: null,
    code: null,
    message: UNKNOWN_ERROR_MESSAGE,
    serverMessage: null,
    fields: {},
    requestId: null,
    retryable: false,
    isValidationError: false,
    isNotFound: false,
    isStatusTransitionConflict: false,
  };
}

export function isStatusTransitionConflict(error: unknown): boolean {
  return mapApiError(error).isStatusTransitionConflict;
}

export function isNotFoundApiError(error: unknown): boolean {
  return mapApiError(error).isNotFound;
}

export function getApiErrorMessage(error: unknown): string {
  return mapApiError(error).message;
}
