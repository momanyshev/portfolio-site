export interface RequestTicket {
  readonly sequence: number;
  readonly workspaceRevision: number;
  readonly inspect: boolean;
}

export interface InspectorSequencingState<T> {
  readonly workspaceRevision: number;
  readonly requestSequence: number;
  readonly inspectorSequence: number;
  readonly contentRevision: number;
  readonly entry: T | null;
}

export interface BeginTrackedRequestResult<T> {
  state: InspectorSequencingState<T>;
  ticket: RequestTicket;
}

export function createInspectorSequencingState<T>(): InspectorSequencingState<T> {
  return {
    workspaceRevision: 0,
    requestSequence: 0,
    inspectorSequence: 0,
    contentRevision: 0,
    entry: null,
  };
}

export function beginTrackedRequest<T>(
  state: InspectorSequencingState<T>,
  options: { inspect?: boolean } = {},
): BeginTrackedRequestResult<T> {
  const sequence = state.requestSequence + 1;
  const nextState = { ...state, requestSequence: sequence };

  return {
    state: nextState,
    ticket: {
      sequence,
      workspaceRevision: state.workspaceRevision,
      inspect: options.inspect ?? true,
    },
  };
}

export function canApplyRequestResult<T>(
  state: InspectorSequencingState<T>,
  ticket: RequestTicket,
): boolean {
  return ticket.workspaceRevision === state.workspaceRevision;
}

export function recordInspectorEntry<T>(
  state: InspectorSequencingState<T>,
  ticket: RequestTicket,
  entry: T,
): InspectorSequencingState<T> {
  if (
    !ticket.inspect ||
    !canApplyRequestResult(state, ticket) ||
    ticket.sequence < state.inspectorSequence
  ) {
    return state;
  }

  return {
    ...state,
    inspectorSequence: ticket.sequence,
    contentRevision: state.contentRevision + 1,
    entry,
  };
}

export function advanceWorkspaceRevision<T>(
  state: InspectorSequencingState<T>,
): InspectorSequencingState<T> {
  return {
    ...state,
    workspaceRevision: state.workspaceRevision + 1,
    contentRevision: state.contentRevision + 1,
    entry: null,
  };
}

export function isInspectorContentCurrent<T>(
  state: InspectorSequencingState<T>,
  capturedContentRevision: number,
): boolean {
  return capturedContentRevision === state.contentRevision;
}
