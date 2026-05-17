import React from 'react';
import { Box, Text } from 'ink';
import type { FooterView } from '../types.js';

export interface FooterProps {
  view: FooterView;
}

export function Footer({ view }: FooterProps): React.JSX.Element {
  return (
    <Box borderStyle="round" paddingX={1}>
      <Text>
        {view.safetyLabel} | {view.snapshotAgeLabel} | {view.keyHints}
      </Text>
    </Box>
  );
}
