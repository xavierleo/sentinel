import React from 'react';
import { Box, Text } from 'ink';
import { Footer } from './components/footer.js';
import { FocusPane } from './components/focus-pane.js';
import { HelpOverlay } from './components/help-overlay.js';
import { InventoryPane } from './components/inventory-pane.js';
import { WatchtowerPane } from './components/watchtower-pane.js';
import type { TuiReadModel } from './types.js';

export interface SentinelTuiAppProps {
  model: TuiReadModel;
  helpOpen: boolean;
}

export function SentinelTuiApp({ model, helpOpen }: SentinelTuiAppProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>Sentinel Console | {model.watchtower.hostname}</Text>
      <Box flexDirection="column" position="relative">
        <Box columnGap={1}>
          <WatchtowerPane view={model.watchtower} />
          <InventoryPane rows={model.inventoryRows} selectedIndex={model.selectedInventoryIndex} />
          <FocusPane service={model.focusService} />
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
    </Box>
  );
}
