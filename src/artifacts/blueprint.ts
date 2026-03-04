import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BLUEPRINT_TEMPLATE = `# BLUEPRINT: <title>

## Technical Approach

## Architecture Decisions

## Chunk Overview

### Chunk 1: <name>
- Goal:
- Dependencies: none
- Files likely touched:

## Risk & Unknowns
`;

export interface ChunkInfo {
  /** e.g. "chunk-1" */
  id: string;
  /** Display name from "### Chunk N: <name>" heading */
  name: string;
  /** Full text of this chunk's section (from its heading to the next) */
  content: string;
}

export const blueprintPath = (treeDir: string): string => join(treeDir, "BLUEPRINT.md");

export function initBlueprint(treeDir: string): void {
  const path: string = blueprintPath(treeDir);
  if (!existsSync(path)) {
    writeFileSync(path, BLUEPRINT_TEMPLATE);
  }
}

export function readBlueprint(treeDir: string): string {
  const path: string = blueprintPath(treeDir);
  if (!existsSync(path)) {
    throw new Error(`BLUEPRINT.md not found at ${path}`);
  }
  return readFileSync(path, "utf8");
}

export function blueprintExists(treeDir: string): boolean {
  const path: string = blueprintPath(treeDir);
  if (!existsSync(path)) {
    return false;
  }
  const content: string = readFileSync(path, "utf8").trim();
  return content.length > 50;
}

/**
 * Parses "### Chunk N: <name>" sections from blueprint content.
 * Returns [] if no chunks found.
 */
export function parseChunks(blueprintContent: string): ChunkInfo[] {
  const chunkHeadingRegex: RegExp = /^### Chunk (\d+): (.+)$/gm;
  const matches: Array<{ index: number; id: string; name: string }> = [];

  let match: RegExpExecArray | null = chunkHeadingRegex.exec(blueprintContent);
  while (match) {
    matches.push({
      index: match.index,
      id: `chunk-${match[1]}`,
      name: match[2].trim(),
    });
    match = chunkHeadingRegex.exec(blueprintContent);
  }

  if (matches.length === 0) {
    return [];
  }

  return matches.map((current, idx) => {
    const next: { index: number } | undefined = matches[idx + 1];
    const endIndex: number = next ? next.index : blueprintContent.length;
    return {
      id: current.id,
      name: current.name,
      content: blueprintContent.slice(current.index, endIndex).trim(),
    };
  });
}
