export type PersonaRole = "pm" | "architect" | "solver" | "engineer" | "qa" | "meta";

export interface PersonaConfig {
  role: PersonaRole;
  displayName: string;
  /** Names of omp tools this persona is allowed to use. Empty array = all tools. */
  allowedTools: string[];
  /** Paths to extensions loaded for this persona (relative to pi-oh-my root) */
  extensions: string[];
  /** Artifacts this persona is allowed to write (glob patterns relative to tree dir) */
  writableArtifacts: string[];
  /** Whether this persona can execute arbitrary code changes in the target repo */
  canModifyCode: boolean;
  /** Whether the operator must be present for this persona's session */
  requiresOperator: boolean;
}

export interface PersonaPrompt {
  role: PersonaRole;
  systemPrompt: string;
  appendPrompt?: string;
}
