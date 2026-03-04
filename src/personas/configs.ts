import type { PersonaConfig, PersonaRole } from "./types";

const RESEARCH_TOOLS: string[] = ["read", "bash", "grep", "find", "ls"];
const RESEARCH_WITH_WEB_TOOLS: string[] = [...RESEARCH_TOOLS, "web_search", "fetch_content"];
const DISABLE_PLAN_MODE_EXTENSION: string[] = ["extensions/disable-plan-mode.ts"];

export const PERSONA_CONFIGS: Record<PersonaRole, PersonaConfig> = {
  pm: {
    role: "pm",
    displayName: "PM",
    allowedTools: RESEARCH_WITH_WEB_TOOLS,
    extensions: DISABLE_PLAN_MODE_EXTENSION,
    writableArtifacts: ["SPEC.md"],
    canModifyCode: false,
    requiresOperator: true,
  },
  architect: {
    role: "architect",
    displayName: "Architect",
    allowedTools: RESEARCH_WITH_WEB_TOOLS,
    extensions: DISABLE_PLAN_MODE_EXTENSION,
    writableArtifacts: ["BLUEPRINT.md"],
    canModifyCode: false,
    requiresOperator: true,
  },
  solver: {
    role: "solver",
    displayName: "Solver",
    allowedTools: RESEARCH_TOOLS,
    extensions: DISABLE_PLAN_MODE_EXTENSION,
    writableArtifacts: ["chunk-*/CHUNK.md"],
    canModifyCode: false,
    requiresOperator: true,
  },
  engineer: {
    role: "engineer",
    displayName: "Engineer",
    allowedTools: [],
    extensions: DISABLE_PLAN_MODE_EXTENSION,
    writableArtifacts: ["**/*"],
    canModifyCode: true,
    requiresOperator: false,
  },
  qa: {
    role: "qa",
    displayName: "QA",
    allowedTools: RESEARCH_TOOLS,
    extensions: DISABLE_PLAN_MODE_EXTENSION,
    writableArtifacts: [],
    canModifyCode: false,
    requiresOperator: false,
  },
  meta: {
    role: "meta",
    displayName: "Meta",
    allowedTools: RESEARCH_TOOLS,
    extensions: DISABLE_PLAN_MODE_EXTENSION,
    writableArtifacts: ["RETRO.md"],
    canModifyCode: false,
    requiresOperator: true,
  },
};
