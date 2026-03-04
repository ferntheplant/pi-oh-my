import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const chunkDir = (treeDir: string, chunkId: string): string =>
  join(treeDir, chunkId);

export const chunkPath = (treeDir: string, chunkId: string): string =>
  join(chunkDir(treeDir, chunkId), "CHUNK.md");

/**
 * Returns a filled CHUNK.md template.
 * chunkNumber is derived from chunkId: "chunk-1" → 1
 * blueprintContext is the chunk's content section from BLUEPRINT.md
 */
export function chunkTemplate(
  chunkId: string,
  chunkName: string,
  blueprintContext: string
): string {
  const match: RegExpMatchArray | null = chunkId.match(/^chunk-(\d+)$/);
  const chunkNumber: string = match ? match[1] : chunkId;
  return `# CHUNK ${chunkNumber}: ${chunkName}

## Context (from BLUEPRINT.md)

${blueprintContext}

## Goal

## Tasks

- [ ] Task 1: description (file: \`path/to/file.ts\`, lines ~X-Y)

## Verification
`;
}

/** Creates <treeDir>/<chunkId>/ dir and writes template CHUNK.md */
export function initChunk(
  treeDir: string,
  chunkId: string,
  chunkName: string,
  blueprintContext: string
): void {
  const dir: string = chunkDir(treeDir, chunkId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(chunkPath(treeDir, chunkId), chunkTemplate(chunkId, chunkName, blueprintContext));
}

export function readChunk(treeDir: string, chunkId: string): string {
  const path: string = chunkPath(treeDir, chunkId);
  if (!existsSync(path)) {
    throw new Error(`CHUNK.md not found at ${path}`);
  }
  return readFileSync(path, "utf8");
}

export function chunkExists(treeDir: string, chunkId: string): boolean {
  return existsSync(chunkPath(treeDir, chunkId));
}
