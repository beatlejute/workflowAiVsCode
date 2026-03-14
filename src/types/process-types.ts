import { ChildProcess } from 'child_process';

export type SpawnFunction = (
  command: string,
  args: readonly string[],
  options?: any // eslint-disable-line @typescript-eslint/no-explicit-any
) => ChildProcess;
