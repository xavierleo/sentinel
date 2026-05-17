import React from 'react';
import { Box, Text } from 'ink';
import type { LogPreviewView } from './log-preview.js';
import { Footer } from './components/footer.js';
import { FocusPane } from './components/focus-pane.js';
import { HelpOverlay } from './components/help-overlay.js';
import { InventoryPane } from './components/inventory-pane.js';
import { WatchtowerPane } from './components/watchtower-pane.js';
import type { TuiReadModel } from './types.js';

export interface SentinelTuiAppProps {
  model: TuiReadModel;
  helpOpen: boolean;
  logPreview?: LogPreviewView;
  selectedIndex?: number;
}

export function SentinelTuiApp({
  model,
  helpOpen,
  logPreview,
  selectedIndex = 0,
}: SentinelTuiAppProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>Sentinel Console | {model.watchtower.hostname}</Text>
      <Box columnGap={1}>
        <WatchtowerPane view={model.watchtower} />
        <InventoryPane rows={model.inventoryRows} selectedIndex={selectedIndex} />
        <FocusPane service={model.focusService} logPreview={logPreview} />
      </Box>
      {model.emptyState ? (
        <Box borderStyle="round" flexDirection="column" marginTop={1} paddingX={1}>
          <Text bold>{model.emptyState.title}</Text>
          <Text>{model.emptyState.body}</Text>
        </Box>
      ) : null}
      <Footer view={model.footer} />
      {helpOpen ? <HelpOverlay /> : null}
    </Box>
  );
}
