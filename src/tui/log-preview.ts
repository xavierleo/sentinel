export interface BuildLogPreviewInput {
  containerName: string;
  title: string;
  body: string[];
  maxLines: number;
  unavailableMessage?: string;
}

export interface LogPreviewView {
  containerName: string;
  title: string;
  lines: string[];
  truncated: boolean;
}

export function buildLogPreview(input: BuildLogPreviewInput): LogPreviewView {
  if (input.body.length === 0) {
    return {
      containerName: input.containerName,
      title: input.title,
      lines: [input.unavailableMessage ?? 'No recent events available.'],
      truncated: false,
    };
  }

  return {
    containerName: input.containerName,
    title: input.title,
    lines: input.body.slice(0, input.maxLines),
    truncated: input.body.length > input.maxLines,
  };
}
