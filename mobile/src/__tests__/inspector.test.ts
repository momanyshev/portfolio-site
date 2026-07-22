import { describe, expect, it } from "@jest/globals";

import {
  advanceWorkspaceRevision,
  beginTrackedRequest,
  canApplyRequestResult,
  createInspectorSequencingState,
  isInspectorContentCurrent,
  recordInspectorEntry,
} from "../lib/inspector";

describe("API inspector sequencing", () => {
  it("does not let an older completion overwrite a newer entry", () => {
    let state = createInspectorSequencingState<string>();
    const first = beginTrackedRequest(state);
    state = first.state;
    const second = beginTrackedRequest(state);
    state = second.state;

    state = recordInspectorEntry(state, second.ticket, "newer");
    const recorded = state;
    state = recordInspectorEntry(state, first.ticket, "older");

    expect(state).toBe(recorded);
    expect(state.entry).toBe("newer");
    expect(state.contentRevision).toBe(1);
  });

  it("keeps a mutation visible when a background refresh is not inspected", () => {
    let state = createInspectorSequencingState<string>();
    const mutation = beginTrackedRequest(state);
    state = mutation.state;
    state = recordInspectorEntry(state, mutation.ticket, "POST /api/issues");
    const mutationRevision = state.contentRevision;

    const refresh = beginTrackedRequest(state, { inspect: false });
    state = refresh.state;
    state = recordInspectorEntry(state, refresh.ticket, "GET /api/issues");

    expect(state.entry).toBe("POST /api/issues");
    expect(state.contentRevision).toBe(mutationRevision);
  });

  it("invalidates old workspace tickets and clears inspector content", () => {
    let state = createInspectorSequencingState<string>();
    const request = beginTrackedRequest(state);
    state = request.state;
    const capturedRevision = state.contentRevision;

    state = advanceWorkspaceRevision(state);

    expect(canApplyRequestResult(state, request.ticket)).toBe(false);
    expect(isInspectorContentCurrent(state, capturedRevision)).toBe(false);
    expect(state.entry).toBeNull();

    const afterOldCompletion = recordInspectorEntry(
      state,
      request.ticket,
      "stale workspace response",
    );
    expect(afterOldCompletion).toBe(state);
  });

  it("accepts a request ticket created after a workspace change", () => {
    let state = advanceWorkspaceRevision(
      createInspectorSequencingState<string>(),
    );
    const current = beginTrackedRequest(state);
    state = current.state;

    expect(canApplyRequestResult(state, current.ticket)).toBe(true);
    expect(recordInspectorEntry(state, current.ticket, "current").entry).toBe(
      "current",
    );
  });
});
