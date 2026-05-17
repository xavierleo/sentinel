import React from 'react';
import { Box, Text } from 'ink';
import type { InventoryRowView } from '../types.js';

export interface InventoryPaneProps {
  rows: InventoryRowView[];
  selectedIndex?: number;
}

export function InventoryPane({ rows, selectedIndex }: InventoryPaneProps): React.JSX.Element {
  return (
    <Box borderStyle="round" flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold>Runtime Inventory</Text>
      {rows.length === 0 ? <Text dimColor>No services in the latest snapshot.</Text> : null}
      {rows.map((row, index) => {
        const selected = index === selectedIndex;
        const prefix = selected ? '>' : ' ';

        return (
          <Text key={row.containerName} inverse={selected}>
            {prefix} {row.containerName} | {row.status} | {row.health} | {row.portsLabel} | {row.composeProjectLabel}
          </Text>
        );
      })}
    </Box>
  );
}
