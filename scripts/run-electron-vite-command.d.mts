export const SUPPORTED_ELECTRON_VITE_COMMANDS: readonly ['dev', 'preview']

export interface ElectronViteCommandResult {
  status?: number | null
  signal?: string | null
  error?: Error
}

export interface RunElectronViteCommandOptions {
  commandName: string
  forwardedArgs?: string[]
  platform?: string
}

export interface RunElectronViteCommandDeps {
  env?: NodeJS.ProcessEnv
  baseEnv?: NodeJS.ProcessEnv
  spawnImpl?: (commandName: string, args: string[], options: object) => {
    once(event: string, listener: (...args: any[]) => void): unknown
  }
}

export function normalizeElectronViteCommand(commandName: string): 'dev' | 'preview'
export function createElectronViteArgs(commandName: string, forwardedArgs?: string[]): string[]
export function createElectronViteEnv(
  platform?: string,
  env?: NodeJS.ProcessEnv
): NodeJS.ProcessEnv
export function runElectronViteCommand(
  options: RunElectronViteCommandOptions,
  deps?: RunElectronViteCommandDeps
): Promise<ElectronViteCommandResult>
