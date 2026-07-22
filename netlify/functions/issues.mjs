import {
  IssueStoreError,
  createIssue,
  deleteIssue,
  getIssue,
  listIssues,
  updateIssue
} from "../lib/issues-store.mjs";
import {
  isUuid,
  validateIssuePayload,
  validateListQuery
} from "../lib/issues-validation.mjs";

const WORKSPACE_HEADER = "X-Demo-Workspace-Id";

function baseHeaders(requestId) {
  return {
    "Cache-Control": "no-store",
    "Vary": WORKSPACE_HEADER,
    "X-Request-Id": requestId
  };
}

function jsonResponse(body, status, requestId, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...baseHeaders(requestId),
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function errorResponse(status, code, message, requestId, fields = {}, extraHeaders = {}) {
  return jsonResponse(
    {
      error: {
        code,
        message,
        fields,
        requestId
      }
    },
    status,
    requestId,
    extraHeaders
  );
}

function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

function getRouteIssueId(request, context) {
  if (typeof context.params?.id === "string") return context.params.id;

  const pathname = new URL(request.url).pathname;
  const functionPrefix = "/.netlify/functions/issues/";
  const publicPrefix = "/api/issues/";

  if (pathname.startsWith(functionPrefix)) {
    return decodeURIComponent(pathname.slice(functionPrefix.length));
  }

  if (pathname.startsWith(publicPrefix)) {
    return decodeURIComponent(pathname.slice(publicPrefix.length));
  }

  return undefined;
}

async function parseJsonBody(request, requestId) {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (mediaType !== "application/json") {
    return {
      response: errorResponse(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json",
        requestId
      )
    };
  }

  try {
    return { value: await request.json() };
  } catch {
    return {
      response: errorResponse(
        400,
        "MALFORMED_JSON",
        "Request body must contain valid JSON",
        requestId
      )
    };
  }
}

function handleStoreError(error, requestId) {
  if (!(error instanceof IssueStoreError)) return null;

  if (error.code === "NOT_FOUND") {
    return errorResponse(404, "NOT_FOUND", "Issue not found", requestId);
  }

  if (error.code === "WORKSPACE_LIMIT_REACHED") {
    return errorResponse(409, error.code, error.message, requestId);
  }

  if (error.code === "CONCURRENT_MODIFICATION") {
    return errorResponse(409, error.code, error.message, requestId);
  }

  if (error.code === "INVALID_STATUS_TRANSITION") {
    return errorResponse(409, error.code, error.message, requestId, error.fields);
  }

  return null;
}

export default async function handler(request, context) {
  const requestId = crypto.randomUUID();
  const rawIssueId = getRouteIssueId(request, context);
  const isCollection = typeof rawIssueId !== "string";
  const allowedMethods = isCollection ? ["GET", "POST"] : ["GET", "PATCH", "DELETE"];

  if (!allowedMethods.includes(request.method)) {
    return errorResponse(
      405,
      "METHOD_NOT_ALLOWED",
      "HTTP method is not supported for this resource",
      requestId,
      {},
      { Allow: allowedMethods.join(", ") }
    );
  }

  const rawWorkspaceId = request.headers.get(WORKSPACE_HEADER);

  if (!isUuid(rawWorkspaceId)) {
    return errorResponse(
      400,
      "INVALID_WORKSPACE",
      WORKSPACE_HEADER + " must contain a valid UUID",
      requestId,
      { [WORKSPACE_HEADER]: "A valid UUID is required" }
    );
  }

  const workspaceId = rawWorkspaceId.toLowerCase();

  if (!isCollection && !isUuid(rawIssueId)) {
    return errorResponse(
      400,
      "INVALID_ID",
      "Issue id must be a valid UUID",
      requestId,
      { id: "A valid UUID is required" }
    );
  }

  const issueId = rawIssueId?.toLowerCase();

  try {
    if (request.method === "GET" && isCollection) {
      const url = new URL(request.url);
      const { errors, filters } = validateListQuery(url.searchParams);

      if (hasErrors(errors)) {
        return errorResponse(
          400,
          "INVALID_QUERY",
          "Query validation failed",
          requestId,
          errors
        );
      }

      const normalizedQuery = filters.q.toLocaleLowerCase("ru");
      const items = (await listIssues(workspaceId))
        .filter(
          (issue) =>
            filters.status.length === 0 || filters.status.includes(issue.status)
        )
        .filter(
          (issue) =>
            filters.severity.length === 0 ||
            filters.severity.includes(issue.severity)
        )
        .filter((issue) => {
          if (!normalizedQuery) return true;
          return (issue.title + "\n" + issue.description)
            .toLocaleLowerCase("ru")
            .includes(normalizedQuery);
        })
        .sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
        );

      return jsonResponse({ items, total: items.length }, 200, requestId);
    }

    if (request.method === "GET") {
      const issue = await getIssue(workspaceId, issueId);

      if (issue === null) {
        return errorResponse(404, "NOT_FOUND", "Issue not found", requestId);
      }

      return jsonResponse(issue, 200, requestId);
    }

    if (request.method === "POST") {
      const parsed = await parseJsonBody(request, requestId);
      if (parsed.response) return parsed.response;

      const { errors, value } = validateIssuePayload(parsed.value);
      if (hasErrors(errors)) {
        return errorResponse(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          requestId,
          errors
        );
      }

      const now = new Date().toISOString();
      const issue = await createIssue(workspaceId, {
        id: crypto.randomUUID(),
        ...value,
        createdAt: now,
        updatedAt: now
      });

      return jsonResponse(issue, 201, requestId, {
        Location: "/api/issues/" + issue.id
      });
    }

    if (request.method === "PATCH") {
      const parsed = await parseJsonBody(request, requestId);
      if (parsed.response) return parsed.response;

      const { errors, value } = validateIssuePayload(parsed.value, { partial: true });
      if (hasErrors(errors)) {
        return errorResponse(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          requestId,
          errors
        );
      }

      const issue = await updateIssue(workspaceId, issueId, value);
      return jsonResponse(issue, 200, requestId);
    }

    await deleteIssue(workspaceId, issueId);
    return new Response(null, {
      status: 204,
      headers: baseHeaders(requestId)
    });
  } catch (error) {
    const storeResponse = handleStoreError(error, requestId);
    if (storeResponse) return storeResponse;

    console.error("[" + requestId + "] QA Lab API failed", error);
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "The server could not process the request",
      requestId
    );
  }
}
