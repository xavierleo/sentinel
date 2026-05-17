import React from 'react';
import { Box, Text } from 'ink';
import type { WatchtowerView } from '../types.js';

export interface WatchtowerPaneProps {
  view: WatchtowerView;
}

export function WatchtowerPane({ view }: WatchtowerPaneProps): React.JSX.Element {
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width={24}>
      <Text bold>Watchtower</Text>
      <Text>{view.hostname}</Text>
      <Text>{view.snapshotAgeLabel}</Text>
      <Text>{view.runningCount} running</Text>
      <Text>{view.stoppedCount} stopped</Text>
      <Text>Docker {view.dockerVersion}</Text>
      <Text>{view.memoryLabel}</Text>
      <Text>{view.diskLabel}</Text>
    </Box>
  );
}
