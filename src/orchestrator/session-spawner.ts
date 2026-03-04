import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readChunk, readSpec, type ChunkInfo } from "../artifacts";
import { PERSONA_CONFIGS } from "../personas/configs";
import type { PersonaRole } from "../personas/types";
import { createSession, spawnPane } from "../zellij";
import type { SessionRef, TreeState } from "./types";

// session-spawner.ts lives at src/orchestrator/ — two levels up is pi-oh-my/
const POM_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface SpawnSessionOptions {
  tree: TreeState;
  role: PersonaRole;
  /** For solver/engineer/qa: which chunk this session is for */
  chunkId?: string;
  /** Text appended to system prompt (persona-specific context) */
  appendContext?: string;
  /** If true, passes --continue to resume the most recent session in sessionDir */
  resume?: boolean;
}

export async function spawnSession(options: SpawnSessionOptions): Promise<SessionRef> {
  const sessionKey: string = options.chunkId
    ? `${options.role}-${options.chunkId}`
    : options.role;
  // Zellij session names cannot contain "/".
  const zellijSessionName: string = `${options.tree.name}__${sessionKey}`;
  const sessionDir: string = resolve(options.tree.treeDir, sessionKey);

  mkdirSync(sessionDir, { recursive: true });

  const config = PERSONA_CONFIGS[options.role];
  const ompArgs: string[] = [
    "--system-prompt",
    resolve(POM_ROOT, "src", "personas", "prompts", `${options.role}.md`),
    "--session-dir",
    sessionDir,
  ];

  for (const ext of config.extensions) {
    ompArgs.push("-e", resolve(POM_ROOT, ext));
  }

  if (config.allowedTools.length > 0) {
    ompArgs.push("--tools", config.allowedTools.join(","));
  }

  if (options.appendContext) {
    ompArgs.push("--append-system-prompt", options.appendContext);
  }

  if (options.resume) {
    ompArgs.push("--continue");
  }

  await createSession(zellijSessionName);
  await spawnPane(zellijSessionName, ["omp", ...ompArgs], { paneName: "agent" });

  options.tree.sessions[sessionKey] = zellijSessionName;

  return { zellijSessionName, sessionDir };
}

/**
 * Context injected into the Architect session.
 * Includes the approved SPEC.md and the tree directory path.
 */
export function buildArchitectContext(treeDir: string): string {
  try {
    const specContent: string = readSpec(treeDir);
    return `Tree directory: ${treeDir}

Approved SPEC.md:

${specContent}`;
  } catch {
    return "";
  }
}

/**
 * Context injected into each Solver session.
 * Includes SPEC.md, the solver's chunk section from BLUEPRINT.md,
 * and the tree directory path.
 */
export function buildSolverContext(treeDir: string, chunk: ChunkInfo): string {
  try {
    const specContent: string = readSpec(treeDir);
    return `Tree directory: ${treeDir}

SPEC.md:

${specContent}

Assigned BLUEPRINT chunk (${chunk.id}):

${chunk.content}`;
  } catch {
    return "";
  }
}

/**
 * Context injected into the Engineer session.
 * Includes the full CHUNK.md content and the chunk directory path.
 */
export function buildEngineerContext(treeDir: string, chunkId: string): string {
  try {
    const chunkContent: string = readChunk(treeDir, chunkId);
    const chunkDirectory: string = resolve(treeDir, chunkId);
    return `Tree directory: ${treeDir}
Chunk directory: ${chunkDirectory}

Assigned CHUNK.md:

${chunkContent}`;
  } catch {
    return "";
  }
}
