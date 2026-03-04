#!/usr/bin/env bun

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { initSpec } from "./artifacts";
import {
  approve,
  getActiveSession,
  initTree,
  loadTree,
  persistTree,
  spawnSession,
  type ApprovableArtifact,
  type TreeState,
} from "./orchestrator";
import { attachSession, listSessions } from "./zellij";

type Command = "init" | "approve" | "tree" | "attach" | "status" | "help";

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string>;
  booleans: Set<string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const booleans = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        booleans.add(key);
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags, booleans };
}

function printUsage(): void {
  console.log(`Usage:
  pom init <tree-name>    Initialize a new tree
  pom approve <tree-name> <artifact>  Approve artifact and advance workflow
  pom tree [tree-name]    Show tree status (not yet implemented)
  pom attach <tree-name> [session-key]  Attach to active/specific session
  pom status              Show all active trees/sessions
  pom help                Show this help message`);
}

async function handleInit(rawArgs: string[]): Promise<void> {
  const { positional, flags } = parseArgs(rawArgs);
  const treeName: string | undefined = positional[0];
  if (!treeName) {
    console.error("Missing required argument: <tree-name>");
    printUsage();
    process.exit(1);
  }

  const targetRepo: string = flags.repo ? resolve(flags.repo) : process.cwd();

  const check = Bun.spawnSync(["omp", "--version"]);
  if (check.exitCode !== 0) {
    console.error("Error: 'omp' binary not found on PATH. Install oh-my-pi globally.");
    process.exit(1);
  }

  const tree = initTree(treeName, targetRepo);
  initSpec(tree.treeDir);

  const pmContext: string = `You are starting a new workstream named '${treeName}'.
Your tree directory is: ${tree.treeDir}
A SPEC.md template has been created there for you to fill in.`;

  const ref = await spawnSession({ tree, role: "pm", appendContext: pmContext });
  persistTree(tree);

  console.log(`Tree '${treeName}' initialized.
Tree dir: ${tree.treeDir}
PM session: ${ref.zellijSessionName}
Use: pom attach ${treeName} pm --repo ${targetRepo}`);
}

async function handleApprove(rawArgs: string[]): Promise<void> {
  const { positional, flags } = parseArgs(rawArgs);
  const treeName: string | undefined = positional[0];
  const artifact: string | undefined = positional[1];

  if (!treeName || !artifact) {
    console.error("Missing required arguments: <tree-name> <artifact>");
    printUsage();
    process.exit(1);
  }

  const targetRepo: string = flags.repo ? resolve(flags.repo) : process.cwd();
  const tree = loadTree(treeName, targetRepo);
  const updated = await approve(tree, artifact as ApprovableArtifact);

  console.log(`Approved '${artifact}'. Tree '${treeName}' is now in stage: ${updated.stage}`);
  if (artifact === "spec") {
    const sessionName = updated.sessions.architect;
    if (sessionName) {
      console.log(`Architect session: ${sessionName}`);
      console.log(`Use: pom attach ${treeName} architect --repo ${targetRepo}`);
    }
  }

  if (artifact === "blueprint") {
    const solverEntries = Object.entries(updated.sessions)
      .filter(([key]) => key.startsWith("solver-"))
      .sort(([a], [b]) => a.localeCompare(b));

    console.log(`\nSpawned ${solverEntries.length} solver session(s):`);
    for (const [, name] of solverEntries) {
      console.log(`  ${name}`);
    }
    if (solverEntries.length > 0) {
      const [firstKey, firstName] = solverEntries[0];
      console.log(`\nFirst solver session: ${firstName}`);
      console.log(`Use: pom attach ${treeName} ${firstKey} --repo ${targetRepo}`);
      console.log("Use: pom attach <tree-name> solver-<chunk-id> --repo <repo> to switch solvers.");
    }
  }
}

function handleTree(treeName: string | undefined): void {
  if (treeName) {
    console.log(`tree "${treeName}" not yet implemented`);
    return;
  }

  console.log("tree not yet implemented");
}

async function handleAttach(rawArgs: string[]): Promise<void> {
  const { positional, flags } = parseArgs(rawArgs);
  const treeName: string | undefined = positional[0];
  if (!treeName) {
    console.error("Missing required argument: <tree-name>");
    printUsage();
    process.exit(1);
  }

  const targetRepo: string = flags.repo ? resolve(flags.repo) : process.cwd();
  const tree = loadTree(treeName, targetRepo);

  let sessionName: string | undefined;
  const sessionKey: string | undefined = positional[1];
  if (sessionKey) {
    sessionName = tree.sessions[sessionKey];
    if (!sessionName) {
      throw new Error(`No session found for key '${sessionKey}' in tree '${treeName}'`);
    }
  } else {
    sessionName = getActiveSession(tree);
    if (!sessionName) {
      throw new Error(
        `No active session found for tree '${treeName}' in stage '${tree.stage}'.`
      );
    }
  }

  await attachSession(sessionName);
}

async function handleStatus(rawArgs: string[]): Promise<void> {
  const { flags } = parseArgs(rawArgs);
  const targetRepo: string = flags.repo ? resolve(flags.repo) : process.cwd();
  const treesDir: string = resolve(targetRepo, ".pi-oh-my", "trees");
  if (!existsSync(treesDir)) {
    console.log(`No trees found in ${targetRepo}`);
    return;
  }

  const entries = readdirSync(treesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const trees: TreeState[] = [];
  for (const name of entries) {
    try {
      trees.push(loadTree(name, targetRepo));
    } catch {
      // Ignore dirs that do not contain valid state.json.
    }
  }

  if (trees.length === 0) {
    console.log(`No trees found in ${targetRepo}`);
    return;
  }

  const zellijSessions = await listSessions();
  const alive = new Set(
    zellijSessions.filter((session) => session.status === "alive").map((session) => session.name)
  );

  console.log(`Active Trees in ${targetRepo}:\n`);
  for (const tree of trees) {
    const sessionValues = Object.values(tree.sessions);
    const sessionSummary =
      sessionValues.length === 0
        ? "none"
        : sessionValues
            .map((name) => `${name} (${alive.has(name) ? "alive" : "exited"})`)
            .join(", ");
    console.log(`  ${tree.name}   stage: ${tree.stage}   sessions: ${sessionSummary}`);
  }
}

async function run(): Promise<void> {
  const commandArg: string | undefined = process.argv[2];
  const command: Command | undefined =
    commandArg === "init" ||
    commandArg === "approve" ||
    commandArg === "tree" ||
    commandArg === "attach" ||
    commandArg === "status" ||
    commandArg === "help"
      ? commandArg
      : undefined;

  if (!command) {
    printUsage();
    return;
  }

  switch (command) {
    case "init":
      await handleInit(process.argv.slice(3));
      return;
    case "approve":
      await handleApprove(process.argv.slice(3));
      return;
    case "tree":
      handleTree(process.argv[3]);
      return;
    case "attach":
      await handleAttach(process.argv.slice(3));
      return;
    case "status":
      await handleStatus(process.argv.slice(3));
      return;
    case "help":
      printUsage();
      return;
  }
}

run().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
