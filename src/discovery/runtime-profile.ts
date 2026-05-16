export interface DockerContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  health?: string;
  labels: Record<string, string>;
  ports: RuntimeServicePort[];
  mounts: RuntimeServiceMount[];
  networks: string[];
  restartPolicy: string;
  createdAt: string;
}

export interface RuntimeServicePort {
  host: number;
  container: number;
  protocol: 'tcp' | 'udp';
}

export interface RuntimeServiceMount {
  host: string;
  container: string;
  mode: string;
}

export interface RuntimeServiceProfile {
  id: string;
  displayName: string;
  source: string;
  containerName: string;
  image: string;
  status: string;
  health: string;
  composeProject?: string;
  composeService?: string;
  stackDir?: string;
  ports: RuntimeServicePort[];
  mounts: RuntimeServiceMount[];
  networks: string[];
  restartPolicy: string;
  createdBySentinel: boolean;
  lastSeenAt: string;
}

function cleanContainerName(name: string): string {
  return name.replace(/^\//, '');
}

function toDisplayName(name: string): string {
  return name
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildRuntimeProfile(container: DockerContainerSummary): RuntimeServiceProfile {
  const containerName = cleanContainerName(container.name);
  const profile: RuntimeServiceProfile = {
    id: containerName,
    displayName: toDisplayName(containerName),
    source: 'runtime_discovery',
    containerName,
    image: container.image,
    status: container.state,
    health: container.health ?? 'unknown',
    ports: container.ports.map((port) => ({ ...port })),
    mounts: container.mounts.map((mount) => ({ ...mount })),
    networks: [...container.networks],
    restartPolicy: container.restartPolicy,
    createdBySentinel: false,
    lastSeenAt: new Date().toISOString(),
  };

  const composeProject = container.labels['com.docker.compose.project'];
  if (composeProject) {
    profile.composeProject = composeProject;
  }

  const composeService = container.labels['com.docker.compose.service'];
  if (composeService) {
    profile.composeService = composeService;
  }

  const stackDir = container.labels['com.docker.compose.project.working_dir'];
  if (stackDir) {
    profile.stackDir = stackDir;
  }

  return profile;
}
