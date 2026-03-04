import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PersonaRole } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadPrompt(role: PersonaRole): string {
  const promptPath = resolve(__dirname, "prompts", `${role}.md`);
  return readFileSync(promptPath, "utf-8");
}
