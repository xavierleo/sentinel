import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

export async function ensureWorkspaceGit(root: string): Promise<void> {
  const git = simpleGit(root);
  try {
    await access(join(root, '.git'));
  } catch {
    await git.init(['-b', 'main']);
  }
  await git.addConfig('user.name', 'Sentinel Agent');
  await git.addConfig('user.email', 'sentinel@localhost');
}

export async function commitWorkspace(root: string, message: string): Promise<void> {
  const git = simpleGit(root);
  await git.add('.');
  const status = await git.status();
  if (status.files.length === 0) {
    return;
  }
  await git.commit(message);
}

export async function workspaceGitStatus(root: string): Promise<{ dirty: boolean; summary: string }> {
  const git = simpleGit(root);
  const status = await git.status();
  return {
    dirty: status.files.length > 0,
    summary: status.files.map((file) => `${file.working_dir || file.index} ${file.path}`.trim()).join('\n'),
  };
}

