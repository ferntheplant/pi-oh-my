import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TreeState } from "./types";

const TREE_NAME_REGEX = /^[a-z0-9][a-z0-9_-]*$/;

export function getTreeDir(name: string, targetRepo: string): string {
  return resolve(targetRepo, ".pi-oh-my", "trees", name);
}

export function initTree(name: string, targetRepo: string): TreeState {
  if (!TREE_NAME_REGEX.test(name)) {
    throw new Error("Tree name must be lowercase alphanumeric with hyphens/underscores");
  }

  if (!existsSync(targetRepo)) {
    throw new Error(`Target repo not found: ${targetRepo}`);
  }

  const treeDir: string = getTreeDir(name, targetRepo);
  const statePath: string = join(treeDir, "state.json");
  if (existsSync(statePath)) {
    throw new Error(`Tree '${name}' already exists at ${treeDir}`);
  }

  mkdirSync(treeDir, { recursive: true });

  const now: string = new Date().toISOString();
  const state: TreeState = {
    name,
    targetRepo,
    treeDir,
    stage: "pm",
    chunks: [],
    createdAt: now,
    updatedAt: now,
    sessions: {},
  };

  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return state;
}

export function loadTree(name: string, targetRepo: string): TreeState {
  const treeDir: string = getTreeDir(name, targetRepo);
  const statePath: string = join(treeDir, "state.json");
  if (!existsSync(statePath)) {
    throw new Error(`Tree '${name}' not found. Run 'pom init ${name}' first.`);
  }

  const raw: string = readFileSync(statePath, "utf8");
  return JSON.parse(raw) as TreeState;
}

export function persistTree(state: TreeState): void {
  state.updatedAt = new Date().toISOString();
  const statePath: string = join(state.treeDir, "state.json");
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}
