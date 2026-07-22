import { describe, expect, it } from "@jest/globals";

import type { ApiErrorResponse } from "../domain/issues";
import {
  ApiError,
  getApiErrorMessage,
  isApiErrorResponse,
  isNotFoundApiError,
  isStatusTransitionConflict,
  mapApiError,
} from "../lib/errors";

function errorPayload(
  code: ApiErrorResponse["error"]["code"],
  message = "Server message",
  fields: Record<string, string> = {},
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      fields,
      requestId: "123e4567-e89b-12d3-a456-426614174000",
    },
  };
}

describe("API error mapping", () => {
  it("strictly recognizes the common error contract", () => {
    expect(isApiErrorResponse(errorPayload("NOT_FOUND"))).toBe(true);
    expect(
      isApiErrorResponse({
        error: {
          code: "UNKNOWN_ERROR",
          message: "No",
          fields: {},
          requestId: "request-id",
        },
      }),
    ).toBe(false);
    expect(
      isApiErrorResponse({
        error: {
          code: "VALIDATION_ERROR",
          message: "No",
          fields: { title: 42 },
          requestId: "request-id",
        },
      }),
    ).toBe(false);
  });

  it("preserves server text and maps validation fields", () => {
    const payload = errorPayload(
      "VALIDATION_ERROR",
      "Request validation failed",
      { title: "Field must contain at least 3 characters" },
    );
    const mapped = mapApiError(
      new ApiError(payload.error.message, { status: 422, payload }),
    );

    expect(mapped).toMatchObject({
      kind: "api",
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      serverMessage: "Request validation failed",
      fields: { title: "Field must contain at least 3 characters" },
      isValidationError: true,
    });
  });

  it("accepts an unknown raw payload in ApiError but exposes only a validated one", () => {
    const valid = errorPayload("NOT_FOUND", "Issue not found");
    const validError = new ApiError("Issue not found", {
      status: 404,
      payload: valid as unknown,
    });
    const invalidError = new ApiError("Broken response", {
      status: 500,
      payload: { error: { message: "missing common fields" } },
    });

    expect(validError.payload).toEqual(valid);
    expect(invalidError.payload).toBeNull();
    expect(invalidError.rawPayload).toEqual({
      error: { message: "missing common fields" },
    });
  });

  it("uses a localized fallback when the server message is empty", () => {
    expect(mapApiError(errorPayload("WORKSPACE_LIMIT_REACHED", "")).message).toBe(
      "В Workspace уже создано 50 дефектов.",
    );
  });

  it("marks recoverable conflicts and status/not-found branches", () => {
    const concurrent = mapApiError(
      new ApiError("Conflict", {
        status: 409,
        payload: errorPayload("CONCURRENT_MODIFICATION"),
      }),
    );
    const transition = new ApiError("Conflict", {
      status: 409,
      payload: errorPayload("INVALID_STATUS_TRANSITION"),
    });
    const notFound = new ApiError("Missing", {
      status: 404,
      payload: errorPayload("NOT_FOUND"),
    });

    expect(concurrent.retryable).toBe(true);
    expect(isStatusTransitionConflict(transition)).toBe(true);
    expect(isNotFoundApiError(notFound)).toBe(true);
  });

  it("maps fetch failures to a stable Russian network message", () => {
    expect(mapApiError(new TypeError("Failed to fetch"))).toMatchObject({
      kind: "network",
      retryable: true,
      message: "Не удалось связаться с API. Попробуйте ещё раз.",
    });
    expect(getApiErrorMessage(new ApiError("Network request failed"))).toBe(
      "Не удалось связаться с API. Попробуйте ещё раз.",
    );
  });

  it("does not expose arbitrary errors as user-facing text", () => {
    expect(mapApiError(new Error("internal implementation detail"))).toMatchObject({
      kind: "unknown",
      message: "Не удалось выполнить операцию. Попробуйте ещё раз.",
      retryable: false,
    });
  });
});
