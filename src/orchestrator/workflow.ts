import {
  blueprintExists,
  blueprintPath,
  chunkExists,
  initBlueprint,
  initChunk,
  parseChunks,
  readBlueprint,
  specExists,
  specPath,
  generateTracker,
} from "../artifacts";
import {
  buildArchitectContext,
  buildEngineerContext,
  buildSolverContext,
  spawnSession,
} from "./session-spawner";
import { persistTree } from "./tree";
import type { TreeState } from "./types";

export type ApprovableArtifact =
  | "spec"
  | "blueprint"
  | `chunk-${string}`
  | "arch-review"
  | "pm-final"
  | "meta";

/**
 * Validates the current stage, validates the artifact exists,
 * advances the workflow, and spawns the next session(s).
 * Mutates and persists the tree state before returning.
 */
export async function approve(
  tree: TreeState,
  artifact: ApprovableArtifact
): Promise<TreeState> {
  if (artifact === "spec") {
    if (tree.stage !== "pm") {
      throw new Error(`Cannot approve 'spec' in stage '${tree.stage}'`);
    }
    if (!specExists(tree.treeDir)) {
      throw new Error(
        `SPEC.md not found or empty at ${specPath(tree.treeDir)}. Have the PM write it first.`
      );
    }

    tree.stage = "architect";
    initBlueprint(tree.treeDir);
    const context: string = buildArchitectContext(tree.treeDir);
    const ref = await spawnSession({ tree, role: "architect", appendContext: context });
    persistTree(tree);
    console.log(
      `Approved spec. Initialized BLUEPRINT.md and spawned architect session: ${ref.zellijSessionName}`
    );
    return tree;
  }

  if (artifact === "blueprint") {
    if (tree.stage !== "architect") {
      throw new Error(`Cannot approve 'blueprint' in stage '${tree.stage}'`);
    }
    if (!blueprintExists(tree.treeDir)) {
      throw new Error(
        `BLUEPRINT.md not found or empty at ${blueprintPath(tree.treeDir)}. Have the architect write it first.`
      );
    }

    const blueprintContent: string = readBlueprint(tree.treeDir);
    const chunks = parseChunks(blueprintContent);
    if (chunks.length === 0) {
      throw new Error("No chunks found in BLUEPRINT.md. Format chunks as '### Chunk N: <name>'.");
    }

    tree.chunks = chunks.map((chunk) => ({
      id: chunk.id,
      name: chunk.name,
      status: "pending",
      attempts: 0,
    }));
    tree.stage = "solver";

    generateTracker(tree.treeDir, tree.name, chunks);

    const solverSessions: string[] = [];
    for (const chunk of chunks) {
      initChunk(tree.treeDir, chunk.id, chunk.name, chunk.content);
      const context: string = buildSolverContext(tree.treeDir, chunk);
      const ref = await spawnSession({
        tree,
        role: "solver",
        chunkId: chunk.id,
        appendContext: context,
      });
      const chunkState = tree.chunks.find((entry) => entry.id === chunk.id);
      if (chunkState) {
        chunkState.status = "planning";
        chunkState.zellijSession = ref.zellijSessionName;
      }
      solverSessions.push(ref.zellijSessionName);
    }

    persistTree(tree);
    console.log(`Approved blueprint. Spawned solver sessions:\n${solverSessions.join("\n")}`);
    return tree;
  }

  if (artifact.startsWith("chunk-")) {
    const chunkId: string = artifact;
    if (tree.stage !== "solver") {
      throw new Error(`Cannot approve '${artifact}' in stage '${tree.stage}'`);
    }

    const chunk = tree.chunks.find((entry) => entry.id === chunkId);
    if (!chunk) {
      throw new Error(`Chunk '${chunkId}' not found in tree state.`);
    }
    if (!chunkExists(tree.treeDir, chunkId)) {
      throw new Error(`CHUNK.md not found for ${chunkId}. Expected file under ${tree.treeDir}.`);
    }

    chunk.status = "approved";

    const hasExecutionRunning: boolean = tree.chunks.some(
      (entry) => entry.status === "executing"
    );
    if (hasExecutionRunning) {
      persistTree(tree);
      console.log(`${chunkId} approved and queued. An execution is already running.`);
      return tree;
    }

    const context: string = buildEngineerContext(tree.treeDir, chunkId);
    const ref = await spawnSession({
      tree,
      role: "engineer",
      chunkId,
      appendContext: context,
    });

    chunk.status = "executing";
    chunk.zellijSession = ref.zellijSessionName;
    chunk.attempts += 1;
    tree.activeChunkId = chunkId;

    const allApprovedOrExecuting: boolean = tree.chunks.every(
      (entry) => entry.status === "approved" || entry.status === "executing"
    );
    if (allApprovedOrExecuting) {
      tree.stage = "execution";
    }

    persistTree(tree);
    return tree;
  }

  if (artifact === "arch-review") {
    tree.stage = "pm-final";
    persistTree(tree);
    console.warn("Stub approval for 'arch-review' applied; fuller transition logic arrives in Phase 3.");
    return tree;
  }

  if (artifact === "pm-final") {
    tree.stage = "meta";
    persistTree(tree);
    console.warn("Stub approval for 'pm-final' applied; fuller transition logic arrives in Phase 3.");
    return tree;
  }

  if (artifact === "meta") {
    tree.stage = "complete";
    persistTree(tree);
    console.warn("Stub approval for 'meta' applied; fuller transition logic arrives in Phase 3.");
    return tree;
  }

  throw new Error(`Unknown artifact: ${artifact}`);
}

/**
 * Returns the Zellij session name for the currently active session in the tree.
 * Used by `pom attach` when no specific role is given.
 */
export function getActiveSession(tree: TreeState): string | undefined {
  if (tree.stage === "pm") {
    return tree.sessions.pm;
  }
  if (tree.stage === "architect") {
    return tree.sessions.architect;
  }
  if (tree.stage === "solver") {
    const solverEntries = Object.entries(tree.sessions).filter(([key]) =>
      key.startsWith("solver-")
    );
    const lastSolver = solverEntries.at(-1);
    return lastSolver?.[1];
  }
  if (tree.stage === "execution") {
    if (!tree.activeChunkId) {
      return undefined;
    }
    return tree.sessions[`engineer-${tree.activeChunkId}`];
  }
  return undefined;
}
