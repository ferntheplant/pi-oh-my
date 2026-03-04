import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const trackerPath = (treeDir: string): string => join(treeDir, "TRACKER.md");

/**
 * Creates TRACKER.md. All chunks start with status "pending".
 * treeName is included in the file header.
 */
export function generateTracker(
  treeDir: string,
  treeName: string,
  chunks: Array<{ id: string; name: string }>
): void {
  const rows: string = chunks
    .map((chunk) => `| ${chunk.id} | ${chunk.name} | pending | 0 |`)
    .join("\n");

  const content: string = `# TRACKER: ${treeName}

Generated from BLUEPRINT.md. Updated automatically as chunks complete.

## Chunks

| Chunk   | Name            | Status  | Attempts |
|---------|-----------------|---------|----------|
${rows}
`;

  writeFileSync(trackerPath(treeDir), content);
}

export function readTracker(treeDir: string): string {
  return readFileSync(trackerPath(treeDir), "utf8");
}
