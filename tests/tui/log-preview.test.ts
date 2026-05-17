import { describe, expect, it } from 'vitest';
import { buildLogPreview } from '../../src/tui/log-preview.js';

describe('tui log preview', () => {
  it('clips long logs to the requested number of lines', () => {
    const preview = buildLogPreview({
      containerName: 'sonarr',
      title: 'Recent logs for sonarr',
      body: ['a', 'b', 'c', 'd', 'e'],
      maxLines: 3,
    });

    expect(preview.containerName).toBe('sonarr');
    expect(preview.title).toBe('Recent logs for sonarr');
    expect(preview.lines).toEqual(['a', 'b', 'c']);
    expect(preview.truncated).toBe(true);
  });

  it('renders a graceful unavailable state', () => {
    const preview = buildLogPreview({
      containerName: 'paperless',
      title: 'Recent logs for paperless',
      body: [],
      maxLines: 3,
      unavailableMessage: 'Logs unavailable.',
    });

    expect(preview.containerName).toBe('paperless');
    expect(preview.title).toBe('Recent logs for paperless');
    expect(preview.lines).toEqual(['Logs unavailable.']);
    expect(preview.truncated).toBe(false);
  });
});
