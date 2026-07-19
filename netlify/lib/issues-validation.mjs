export const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"];
export const ISSUE_STATUSES = ["open", "in_progress", "resolved"];

const MUTABLE_FIELDS = new Set(["title", "description", "severity", "status"]);
const PROTECTED_FIELDS = new Set(["id", "createdAt", "updatedAt"]);
const ALLOWED_QUERY_FIELDS = new Set(["q", "severity", "status"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getTextLength(value) {
  return [...value].length;
}

function validateText(value, field, { min, max, required }, errors) {
  if (value === undefined) {
    if (required) errors[field] = "Field is required";
    return undefined;
  }

  if (typeof value !== "string") {
    errors[field] = "Field must be a string";
    return undefined;
  }

  const normalized = value.trim();
  const length = getTextLength(normalized);

  if (length < min) {
    errors[field] = "Field must contain at least " + min + " characters after trimming";
  } else if (length > max) {
    errors[field] = "Field must contain at most " + max + " characters after trimming";
  }

  return normalized;
}

function validateEnum(value, field, allowedValues, { required }, errors) {
  if (value === undefined) {
    if (required) errors[field] = "Field is required";
    return undefined;
  }

  if (typeof value !== "string" || !allowedValues.includes(value)) {
    errors[field] = "Field must be one of: " + allowedValues.join(", ");
    return undefined;
  }

  return value;
}

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateIssuePayload(payload, { partial = false } = {}) {
  const errors = {};
  const value = {};

  if (!isPlainObject(payload)) {
    return {
      errors: { _body: "Request body must be a JSON object" },
      value
    };
  }

  const keys = Object.keys(payload);

  if (partial && keys.length === 0) {
    errors._body = "PATCH body must contain at least one mutable field";
  }

  for (const field of keys) {
    if (PROTECTED_FIELDS.has(field)) {
      errors[field] = "Field is managed by the server";
    } else if (!MUTABLE_FIELDS.has(field)) {
      errors[field] = "Unknown field";
    }
  }

  const title = validateText(
    payload.title,
    "title",
    { min: 3, max: 120, required: !partial },
    errors
  );
  const description = validateText(
    payload.description,
    "description",
    { min: 10, max: 2000, required: !partial },
    errors
  );
  const severity = validateEnum(
    payload.severity,
    "severity",
    ISSUE_SEVERITIES,
    { required: !partial },
    errors
  );
  const status = validateEnum(
    payload.status,
    "status",
    ISSUE_STATUSES,
    { required: false },
    errors
  );

  if (title !== undefined) value.title = title;
  if (description !== undefined) value.description = description;
  if (severity !== undefined) value.severity = severity;
  if (status !== undefined) value.status = status;

  if (!partial && payload.status === undefined) {
    value.status = "open";
  }

  return { errors, value };
}

export function validateListQuery(searchParams) {
  const errors = {};
  const filters = { q: "", severity: "", status: "" };

  for (const key of new Set(searchParams.keys())) {
    if (!ALLOWED_QUERY_FIELDS.has(key)) {
      errors[key] = "Unknown query parameter";
    } else if (searchParams.getAll(key).length > 1) {
      errors[key] = "Query parameter must not be repeated";
    }
  }

  const q = searchParams.get("q");
  const severity = searchParams.get("severity");
  const status = searchParams.get("status");

  if (q !== null) {
    filters.q = q.trim();
    if (getTextLength(filters.q) > 120) {
      errors.q = "Query must contain at most 120 characters after trimming";
    }
  }

  if (severity !== null) {
    if (!ISSUE_SEVERITIES.includes(severity)) {
      errors.severity = "Query must be one of: " + ISSUE_SEVERITIES.join(", ");
    } else {
      filters.severity = severity;
    }
  }

  if (status !== null) {
    if (!ISSUE_STATUSES.includes(status)) {
      errors.status = "Query must be one of: " + ISSUE_STATUSES.join(", ");
    } else {
      filters.status = status;
    }
  }

  return { errors, filters };
}
