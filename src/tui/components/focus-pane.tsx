import React from 'react';
import { Box, Text } from 'ink';
import type { FocusServiceView } from '../types.js';

export interface FocusPaneProps {
  service: FocusServiceView | undefined;
}

export function FocusPane({ service }: FocusPaneProps): React.JSX.Element {
  if (!service) {
    return (
      <Box borderStyle="round" flexDirection="column" flexGrow={1} paddingX={1}>
        <Text bold>Focus</Text>
        <Text dimColor>No service selected.</Text>
      </Box>
    );
  }

  const logPreview =
    service.logPreview?.containerName === service.containerName ? service.logPreview : undefined;

  return (
    <Box borderStyle="round" flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold>Focus</Text>
      <Text>{service.displayName}</Text>
      <Text>{service.image}</Text>
      <Text>
        {service.status} | {service.health}
      </Text>
      <Text>
        {service.composeProjectLabel}/{service.composeServiceLabel}
      </Text>
      <Text>{service.stackDirLabel}</Text>
      <Text>restart {service.restartPolicy}</Text>
      <Text>ports {service.portsLabel}</Text>
      <Text>mounts {service.mountsLabel}</Text>
      <Text>networks {service.networksLabel}</Text>
      <Text bold>{logPreview?.title ?? `Recent logs for ${service.containerName}`}</Text>
      {(logPreview?.lines ?? ['No recent events available.']).map((line, index) => (
        <Text key={`${service.containerName}-log-${index}`}>{line}</Text>
      ))}
      {logPreview?.truncated ? <Text dimColor>...</Text> : null}
    </Box>
  );
}
