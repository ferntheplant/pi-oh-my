import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SPEC_TEMPLATE = `# SPEC: <title>

## Problem Statement

## Goals

## Non-Goals

## User Stories

## Acceptance Criteria

## Open Questions
`;

export const specPath = (treeDir: string): string => join(treeDir, "SPEC.md");

/** Writes the template if the file does not already exist */
export function initSpec(treeDir: string): void {
  const path: string = specPath(treeDir);
  if (!existsSync(path)) {
    writeFileSync(path, SPEC_TEMPLATE);
  }
}

export function readSpec(treeDir: string): string {
  const path: string = specPath(treeDir);
  if (!existsSync(path)) {
    throw new Error(`SPEC.md not found at ${path}`);
  }
  return readFileSync(path, "utf8");
}

/** Returns true if SPEC.md exists and has more than 50 chars of content */
export function specExists(treeDir: string): boolean {
  const path: string = specPath(treeDir);
  if (!existsSync(path)) {
    return false;
  }
  const content: string = readFileSync(path, "utf8").trim();
  return content.length > 50;
}
