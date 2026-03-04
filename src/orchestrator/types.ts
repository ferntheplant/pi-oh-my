export type WorkflowStage =
  | "pm" // PM writing SPEC.md
  | "architect" // Architect writing BLUEPRINT.md
  | "solver" // Solvers writing CHUNK.md files (parallel)
  | "execution" // Engineer/QA cycle running (sequential)
  | "arch-review" // Architect reviewing completed work
  | "pm-final" // PM final sign-off
  | "meta" // Meta retrospective
  | "complete"; // Done

export type ChunkStatus =
  | "pending" // Chunk created but solver not yet approved
  | "planning" // Solver session active
  | "approved" // Operator approved CHUNK.md, queued for execution
  | "executing" // Engineer session active
  | "complete"; // Engineer/QA cycle finished, squash-merged

export interface ChunkState {
  /** e.g. "chunk-1", "chunk-2" */
  id: string;
  /** Display name from BLUEPRINT.md "### Chunk N: <name>" */
  name: string;
  status: ChunkStatus;
  /** Number of engineer/QA cycles attempted */
  attempts: number;
  /** Active Zellij session name when in planning or executing state */
  zellijSession?: string;
}

export interface TreeState {
  name: string;
  /** Absolute path to the target git repo root */
  targetRepo: string;
  /** Absolute path to <targetRepo>/.pi-oh-my/trees/<name> */
  treeDir: string;
  stage: WorkflowStage;
  chunks: ChunkState[];
  /** Which chunk is currently running the execution loop */
  activeChunkId?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Maps session key → Zellij session name.
   * Session key format: "<role>" or "<role>-<chunkId>" (e.g. "pm", "solver-1", "engineer-1")
   */
  sessions: Record<string, string>;
}

export interface SessionRef {
  zellijSessionName: string;
  /** Absolute path to directory where omp writes JSONL session files */
  sessionDir: string;
}
