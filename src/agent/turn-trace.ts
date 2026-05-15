export type TurnTraceEntry =
  | { type: 'route_selected'; route: string }
  | { type: 'model_raw_output'; output: string }
  | { type: 'model_parse_error'; message: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; preview: string }
  | { type: 'outcome'; outcome: 'routed_response' | 'model_response' | 'safe_failure' };

export type TurnTraceCallback = (entry: TurnTraceEntry) => void;

export function emitTrace(callback: TurnTraceCallback | undefined, entry: TurnTraceEntry): void {
  callback?.(entry);
}
