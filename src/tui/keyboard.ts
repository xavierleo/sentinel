export interface KeyboardState {
  selectedIndex: number;
  helpOpen: boolean;
}

export interface KeyboardResult extends KeyboardState {
  shouldRefresh: boolean;
  shouldQuit: boolean;
}

export function reduceKeyPress(state: KeyboardState, input: string, rowCount: number): KeyboardResult {
  const maxIndex = Math.max(0, rowCount - 1);

  if (input === 'j' || input === '\u001B[B') {
    return {
      selectedIndex: Math.min(maxIndex, state.selectedIndex + 1),
      helpOpen: state.helpOpen,
      shouldRefresh: false,
      shouldQuit: false,
    };
  }

  if (input === 'k' || input === '\u001B[A') {
    return {
      selectedIndex: Math.max(0, state.selectedIndex - 1),
      helpOpen: state.helpOpen,
      shouldRefresh: false,
      shouldQuit: false,
    };
  }

  if (input === 'g') {
    return {
      selectedIndex: 0,
      helpOpen: state.helpOpen,
      shouldRefresh: false,
      shouldQuit: false,
    };
  }

  if (input === 'G') {
    return {
      selectedIndex: maxIndex,
      helpOpen: state.helpOpen,
      shouldRefresh: false,
      shouldQuit: false,
    };
  }

  if (input === '?') {
    return {
      selectedIndex: state.selectedIndex,
      helpOpen: !state.helpOpen,
      shouldRefresh: false,
      shouldQuit: false,
    };
  }

  if (input === 'r') {
    return {
      selectedIndex: state.selectedIndex,
      helpOpen: state.helpOpen,
      shouldRefresh: true,
      shouldQuit: false,
    };
  }

  if (input === 'q') {
    return {
      selectedIndex: state.selectedIndex,
      helpOpen: state.helpOpen,
      shouldRefresh: false,
      shouldQuit: true,
    };
  }

  return {
    selectedIndex: state.selectedIndex,
    helpOpen: state.helpOpen,
    shouldRefresh: false,
    shouldQuit: false,
  };
}
