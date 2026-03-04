#!/usr/bin/env bun

type Command = "init" | "tree" | "attach" | "status" | "help";

function printUsage(): void {
  console.log(`Usage:
  pom init <tree-name>    Initialize a new tree (not yet implemented)
  pom tree [tree-name]    Show tree status (not yet implemented)
  pom attach <session-id> Attach to a Zellij session (not yet implemented)
  pom status              Show all active trees/sessions (not yet implemented)
  pom help                Show this help message`);
}

function handleInit(treeName: string | undefined): void {
  if (!treeName) {
    console.error("Missing required argument: <tree-name>");
    printUsage();
    process.exitCode = 1;
    return;
  }

  console.log(`init "${treeName}" not yet implemented`);
}

function handleTree(treeName: string | undefined): void {
  if (treeName) {
    console.log(`tree "${treeName}" not yet implemented`);
    return;
  }

  console.log("tree not yet implemented");
}

function handleAttach(sessionId: string | undefined): void {
  if (!sessionId) {
    console.error("Missing required argument: <session-id>");
    printUsage();
    process.exitCode = 1;
    return;
  }

  console.log(`attach "${sessionId}" not yet implemented`);
}

function handleStatus(): void {
  console.log("status not yet implemented");
}

function run(): void {
  const commandArg: string | undefined = process.argv[2];
  const command: Command | undefined =
    commandArg === "init" ||
    commandArg === "tree" ||
    commandArg === "attach" ||
    commandArg === "status" ||
    commandArg === "help"
      ? commandArg
      : undefined;
  const valueArg: string | undefined = process.argv[3];

  if (!command) {
    printUsage();
    return;
  }

  switch (command) {
    case "init":
      handleInit(valueArg);
      return;
    case "tree":
      handleTree(valueArg);
      return;
    case "attach":
      handleAttach(valueArg);
      return;
    case "status":
      handleStatus();
      return;
    case "help":
      printUsage();
      return;
  }
}

run();
