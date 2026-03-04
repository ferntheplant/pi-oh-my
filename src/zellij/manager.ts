import { zellijExec } from "./exec";
import type { SpawnPaneOptions, ZellijSession, ZellijSessionStatus } from "./types";

function formatZellijError(action: string, stderr: string, exitCode: number): Error {
  const details: string = stderr.trim();
  const suffix: string = details ? `: ${details}` : "";
  return new Error(`zellij ${action} failed with exit code ${exitCode}${suffix}`);
}

export async function createSession(name: string): Promise<void> {
  const result = await zellijExec(["attach", "-b", name]);

  if (result.exitCode === 0) {
    return;
  }

  const alreadyExists: boolean = /already exists/i.test(result.stderr);
  if (alreadyExists) {
    return;
  }

  throw formatZellijError(`attach -b ${name}`, result.stderr, result.exitCode);
}

export async function listSessions(): Promise<ZellijSession[]> {
  const result = await zellijExec(["list-sessions", "-n"]);

  if (result.exitCode !== 0) {
    return [];
  }

  const trimmed: string = result.stdout.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split("\n")
    .map((line: string): ZellijSession | null => {
      const normalized: string = line.trim();
      if (!normalized) {
        return null;
      }

      const name: string | undefined = normalized.split(/\s+/)[0];
      if (!name) {
        return null;
      }

      const status: ZellijSessionStatus = normalized.includes("(EXITED") ? "exited" : "alive";
      return { name, status };
    })
    .filter((session: ZellijSession | null): session is ZellijSession => session !== null);
}

export async function sessionExists(name: string): Promise<boolean> {
  const sessions = await listSessions();
  return sessions.some((session) => session.name === name);
}

export async function attachSession(name: string): Promise<void> {
  const exists = await sessionExists(name);
  if (!exists) {
    throw new Error(`Zellij session "${name}" does not exist`);
  }

  const proc = Bun.spawn(["zellij", "attach", name], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`zellij attach ${name} failed with exit code ${exitCode}`);
  }
}

export async function killSession(name: string): Promise<void> {
  await zellijExec(["kill-session", name]);
}

export async function spawnPane(
  sessionName: string,
  command: string[],
  options?: SpawnPaneOptions,
): Promise<void> {
  const args: string[] = ["-s", sessionName, "action", "new-pane"];

  if (options?.paneName) {
    args.push("-n", options.paneName);
  }

  if (options?.direction) {
    args.push("-d", options.direction);
  }

  if (options?.closeOnExit) {
    args.push("-c");
  }

  if (options?.cwd) {
    args.push("--cwd", options.cwd);
  }

  args.push("--", ...command);

  const result = await zellijExec(args);
  if (result.exitCode !== 0) {
    throw formatZellijError(`new-pane in ${sessionName}`, result.stderr, result.exitCode);
  }
}

export async function writeChars(sessionName: string, text: string): Promise<void> {
  const result = await zellijExec(["-s", sessionName, "action", "write-chars", text]);

  if (result.exitCode !== 0) {
    throw formatZellijError(`write-chars in ${sessionName}`, result.stderr, result.exitCode);
  }
}

export async function dumpScreen(sessionName: string, outputPath: string): Promise<void> {
  const result = await zellijExec(["-s", sessionName, "action", "dump-screen", outputPath]);

  if (result.exitCode !== 0) {
    throw formatZellijError(`dump-screen in ${sessionName}`, result.stderr, result.exitCode);
  }
}
