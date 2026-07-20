import { getStore } from "@netlify/blobs";
import {
  getAllowedIssueStatusTransitions,
  isAllowedIssueStatusTransition
} from "./issues-validation.mjs";

export const MAX_ISSUES_PER_WORKSPACE = 50;
export const WORKSPACE_RETENTION_DAYS = 30;

const STORE_NAME = "qa-lab-issues-v1";
const SCHEMA_VERSION = 1;
const MAX_WRITE_ATTEMPTS = 5;
const RETENTION_MS = WORKSPACE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export class IssueStoreError extends Error {
  constructor(code, message, fields = {}) {
    super(message);
    this.name = "IssueStoreError";
    this.code = code;
    this.fields = fields;
  }
}

function openStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function workspaceKey(workspaceId) {
  return "workspaces/" + workspaceId;
}

function emptyDocument() {
  return { schemaVersion: SCHEMA_VERSION, items: [] };
}

function normalizeDocument(data) {
  if (
    data === null ||
    typeof data !== "object" ||
    data.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(data.items)
  ) {
    throw new Error("Stored workspace document has an unsupported shape");
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    items: data.items
  };
}

function isExpired(metadata) {
  return typeof metadata?.expiresAt === "number" && metadata.expiresAt <= Date.now();
}

async function findListedEtag(store, key) {
  const result = await store.list({ prefix: key });
  return result.blobs.find((blob) => blob.key === key)?.etag;
}

async function getWorkspaceEntry(store, key) {
  let entry = await store.getWithMetadata(key, { type: "json" });

  if (entry === null || (typeof entry.etag === "string" && entry.etag.length > 0)) {
    return entry;
  }

  // Netlify Dev 26 omits ETag on local GET responses. Confirm a stable list ETag
  // around a second read so local conditional writes retain the same CAS semantics.
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const etagBeforeRead = await findListedEtag(store, key);
    entry = await store.getWithMetadata(key, { type: "json" });
    const etagAfterRead = await findListedEtag(store, key);

    if (entry === null) return null;

    if (
      typeof etagBeforeRead === "string" &&
      etagBeforeRead.length > 0 &&
      etagBeforeRead === etagAfterRead
    ) {
      return { ...entry, etag: etagAfterRead };
    }
  }

  throw new IssueStoreError(
    "CONCURRENT_MODIFICATION",
    "The workspace changed concurrently. Retry the request."
  );
}

async function readWorkspace(workspaceId) {
  const store = openStore();
  const key = workspaceKey(workspaceId);
  const entry = await getWorkspaceEntry(store, key);

  if (entry === null) {
    return { document: emptyDocument(), etag: null, store };
  }

  if (isExpired(entry.metadata)) {
    return { document: emptyDocument(), etag: entry.etag, store };
  }

  return {
    document: normalizeDocument(entry.data),
    etag: entry.etag,
    store
  };
}

async function mutateWorkspace(workspaceId, mutator) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { document, etag, store } = await readWorkspace(workspaceId);
    const mutation = mutator(document.items.map((issue) => ({ ...issue })));
    const now = Date.now();
    const condition = etag === null ? { onlyIfNew: true } : { onlyIfMatch: etag };
    const writeResult = await store.set(
      workspaceKey(workspaceId),
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        items: mutation.items
      }),
      {
        ...condition,
        metadata: {
          schemaVersion: SCHEMA_VERSION,
          expiresAt: now + RETENTION_MS,
          lastSeenAt: now
        }
      }
    );

    if (writeResult.modified) {
      return mutation.result;
    }
  }

  throw new IssueStoreError(
    "CONCURRENT_MODIFICATION",
    "The workspace changed concurrently. Retry the request."
  );
}

export async function listIssues(workspaceId) {
  const { document } = await readWorkspace(workspaceId);
  return document.items.map((issue) => ({ ...issue }));
}

export async function getIssue(workspaceId, issueId) {
  const items = await listIssues(workspaceId);
  return items.find((issue) => issue.id === issueId) ?? null;
}

export async function createIssue(workspaceId, issue) {
  return mutateWorkspace(workspaceId, (items) => {
    if (items.length >= MAX_ISSUES_PER_WORKSPACE) {
      throw new IssueStoreError(
        "WORKSPACE_LIMIT_REACHED",
        "A demo workspace can contain at most " + MAX_ISSUES_PER_WORKSPACE + " issues."
      );
    }

    return {
      items: [...items, issue],
      result: { ...issue }
    };
  });
}

export async function updateIssue(workspaceId, issueId, patch) {
  return mutateWorkspace(workspaceId, (items) => {
    const index = items.findIndex((issue) => issue.id === issueId);

    if (index === -1) {
      throw new IssueStoreError("NOT_FOUND", "Issue not found");
    }

    const existing = items[index];
    if (
      patch.status !== undefined &&
      !isAllowedIssueStatusTransition(existing.status, patch.status)
    ) {
      const allowedStatuses = getAllowedIssueStatusTransitions(existing.status);
      throw new IssueStoreError(
        "INVALID_STATUS_TRANSITION",
        "Status transition is not allowed",
        {
          status:
            'Status can only remain "' +
            existing.status +
            '" or change to ' +
            allowedStatuses.map((status) => '"' + status + '"').join(" or ")
        }
      );
    }

    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)
    ).toISOString();
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt
    };
    const nextItems = [...items];
    nextItems[index] = updated;

    return {
      items: nextItems,
      result: { ...updated }
    };
  });
}

export async function deleteIssue(workspaceId, issueId) {
  return mutateWorkspace(workspaceId, (items) => {
    const index = items.findIndex((issue) => issue.id === issueId);

    if (index === -1) {
      throw new IssueStoreError("NOT_FOUND", "Issue not found");
    }

    return {
      items: items.filter((issue) => issue.id !== issueId),
      result: true
    };
  });
}
