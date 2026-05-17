import { describe, expect, it } from 'vitest';
import { reduceKeyPress } from '../../src/tui/keyboard.js';

describe('tui keyboard reducer', () => {
  it('moves selection down and up within bounds', () => {
    expect(reduceKeyPress({ selectedIndex: 0, helpOpen: false }, 'j', 3)).toEqual({
      selectedIndex: 1,
      helpOpen: false,
      shouldRefresh: false,
      shouldQuit: false,
    });

    expect(reduceKeyPress({ selectedIndex: 1, helpOpen: false }, 'k', 3)).toEqual({
      selectedIndex: 0,
      helpOpen: false,
      shouldRefresh: false,
      shouldQuit: false,
    });
  });

  it('toggles help and handles refresh and quit', () => {
    expect(reduceKeyPress({ selectedIndex: 0, helpOpen: false }, '?', 3).helpOpen).toBe(true);
    expect(reduceKeyPress({ selectedIndex: 0, helpOpen: false }, 'r', 3).shouldRefresh).toBe(true);
    expect(reduceKeyPress({ selectedIndex: 0, helpOpen: false }, 'q', 3).shouldQuit).toBe(true);
  });

  it('supports arrow keys and jump shortcuts', () => {
    expect(reduceKeyPress({ selectedIndex: 0, helpOpen: false }, '\u001B[B', 3).selectedIndex).toBe(1);
    expect(reduceKeyPress({ selectedIndex: 2, helpOpen: false }, '\u001B[A', 3).selectedIndex).toBe(1);
    expect(reduceKeyPress({ selectedIndex: 2, helpOpen: false }, 'g', 3).selectedIndex).toBe(0);
    expect(reduceKeyPress({ selectedIndex: 0, helpOpen: false }, 'G', 3).selectedIndex).toBe(2);
  });
});
