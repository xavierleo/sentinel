import { describe, expect, it } from 'vitest';
import { reduceKeyboardState, type KeyboardState } from '../../src/tui/keyboard.js';

function makeState(overrides: Partial<KeyboardState> = {}): KeyboardState {
  return {
    selectedIndex: 0,
    helpVisible: false,
    signal: undefined,
    ...overrides,
  };
}

describe('keyboard reducer', () => {
  it('moves selection down and up within bounds', () => {
    const movedDown = reduceKeyboardState(makeState(), 'j', {}, 3);
    const movedToBottom = reduceKeyboardState(movedDown, '', { downArrow: true }, 3);
    const staysAtBottom = reduceKeyboardState(movedToBottom, 'G', {}, 3);
    const movedUp = reduceKeyboardState(staysAtBottom, 'k', {}, 3);
    const staysAtTop = reduceKeyboardState(
      reduceKeyboardState(reduceKeyboardState(movedUp, 'g', {}, 3), 'k', {}, 3),
      '',
      { upArrow: true },
      3,
    );

    expect(movedDown.selectedIndex).toBe(1);
    expect(movedToBottom.selectedIndex).toBe(2);
    expect(staysAtBottom.selectedIndex).toBe(2);
    expect(movedUp.selectedIndex).toBe(1);
    expect(staysAtTop.selectedIndex).toBe(0);
  });

  it('toggles help when question mark is pressed', () => {
    const opened = reduceKeyboardState(makeState(), '?', {}, 4);
    const closed = reduceKeyboardState(opened, '?', {}, 4);

    expect(opened.helpVisible).toBe(true);
    expect(closed.helpVisible).toBe(false);
  });

  it('emits a refresh signal', () => {
    const nextState = reduceKeyboardState(makeState({ signal: 'quit' }), 'r', {}, 2);

    expect(nextState.signal).toBe('refresh');
  });

  it('emits a quit signal', () => {
    const nextState = reduceKeyboardState(makeState(), 'q', {}, 2);

    expect(nextState.signal).toBe('quit');
  });
});
