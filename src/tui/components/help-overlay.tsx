import React from 'react';
import { Box, Text } from 'ink';

export function HelpOverlay(): React.JSX.Element {
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1}>
      <Text bold>Keyboard shortcuts</Text>
      <Text>j / DownArrow: move down</Text>
      <Text>k / UpArrow: move up</Text>
      <Text>g / G: jump top / bottom</Text>
      <Text>r: refresh</Text>
      <Text>?: toggle help</Text>
      <Text>q: quit</Text>
    </Box>
  );
}
