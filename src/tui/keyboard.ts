export type KeyboardSignal = 'refresh' | 'quit';

export interface KeyboardState {
  selectedIndex: number;
  helpVisible: boolean;
  signal?: KeyboardSignal;
}

export interface KeyboardKey {
  upArrow?: boolean;
  downArrow?: boolean;
}

function clampSelection(selectedIndex: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(selectedIndex, itemCount - 1));
}

export function reduceKeyboardState(
  state: KeyboardState,
  input: string,
  key: KeyboardKey,
  itemCount: number,
): KeyboardState {
  if (input === 'q') {
    return { ...state, signal: 'quit' };
  }

  if (input === 'r') {
    return { ...state, signal: 'refresh' };
  }

  if (input === '?') {
    return { ...state, helpVisible: !state.helpVisible, signal: undefined };
  }

  if (input === 'g') {
    return { ...state, selectedIndex: 0, signal: undefined };
  }

  if (input === 'G') {
    return { ...state, selectedIndex: clampSelection(itemCount - 1, itemCount), signal: undefined };
  }

  if (input === 'j' || key.downArrow) {
    return {
      ...state,
      selectedIndex: clampSelection(state.selectedIndex + 1, itemCount),
      signal: undefined,
    };
  }

  if (input === 'k' || key.upArrow) {
    return {
      ...state,
      selectedIndex: clampSelection(state.selectedIndex - 1, itemCount),
      signal: undefined,
    };
  }

  return { ...state, signal: undefined };
}
