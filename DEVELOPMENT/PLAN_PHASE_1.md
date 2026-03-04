# Phase 1: Foundation

## Context

`pi-oh-my` is a TypeScript CLI tool that orchestrates multiple `omp` (oh-my-pi) agent sessions using Zellij terminal multiplexer. Each session runs as a separate `omp` process with persona-specific system prompts and extensions loaded via CLI flags.

The `pi-oh-my/` directory currently contains only `.git/` and `.gitignore`. Everything needs to be scaffolded from scratch.

### Key Reference Points

- **oh-my-pi** (`../oh-my-pi/`): The upstream agent harness. Published as `@oh-my-pi/pi-coding-agent`. Uses bun runtime. Extensions are TS modules exporting a default function that receives `ExtensionAPI`.
- **Extension API types**: `oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts` — the full `ExtensionAPI` interface, event types, tool registration types.
- **Example plan-mode extension**: `oh-my-pi/packages/coding-agent/examples/extensions/plan-mode.ts` — a ~550 line extension that demonstrates `registerCommand`, `registerFlag`, `registerShortcut`, `setActiveTools`, `on("tool_call")`, `on("before_agent_start")`, `on("session_start")`, `on("agent_end")`, `sendMessage`, `appendEntry`.
- **pi-web-access** (`../pi-web-access/`): Example of `registerTool()` with TypeBox schemas.
- **pi-guardrails** (via `../pi-extensions/`): Example of `tool_call` blocking via `{ block: true, reason }`.

### Runtime Assumptions

- **bun** is the runtime (consistent with omp which has `"engines": { "bun": ">=1.3.7" }`)
- The `omp` binary is globally installed and available on `$PATH`
- **zellij 0.43.1** is installed at `/opt/homebrew/bin/zellij`
- Extensions are loaded into `omp` via the `-e <path>` flag at process launch time

---

## Task 0: Project Scaffolding

> **Human step**: Run `bun init` inside `pi-oh-my/` to create the initial `package.json` and `tsconfig.json`. Accept defaults. Then return to the agent.

After the human runs `bun init`, the agent should:

- [ ] **0.1** — Edit `package.json` to set:
  ```json
  {
    "name": "pi-oh-my",
    "type": "module",
    "bin": {
      "pom": "./src/cli.ts"
    },
    "scripts": {
      "dev": "bun src/cli.ts",
      "check": "bun x tsc --noEmit"
    },
    "devDependencies": {
      "@oh-my-pi/pi-coding-agent": "latest",
      "@types/bun": "latest"
    }
  }
  ```
  Keep any fields `bun init` generated that don't conflict (like `version`, `module`, etc). Installing `@oh-my-pi/pi-coding-agent` as a **devDependency** gives us `ExtensionAPI` types for extension authoring without relying on a local sibling checkout.

- [ ] **0.2** — Edit `tsconfig.json` to use these settings:
  ```json
  {
    "compilerOptions": {
      "lib": ["ESNext"],
      "target": "ESNext",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "outDir": "./dist",
      "rootDir": ".",
      "declaration": true,
      "resolveJsonModule": true,
      "types": ["bun-types"]
    },
    "include": ["src/**/*.ts", "extensions/**/*.ts"],
    "exclude": ["node_modules", "dist"]
  }
  ```
  Type resolution for `import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent"` should come from the installed dev dependency, not a relative `../oh-my-pi` path mapping.

  Add `src/types/assets.d.ts` with:
  ```typescript
  declare module "*.md" {
    const content: string;
    export default content;
  }
  declare module "*.txt" {
    const content: string;
    export default content;
  }
  declare module "*.py" {
    const content: string;
    export default content;
  }
  ```
  The coding-agent package currently exports source files that import prompt/assets directly; these declarations keep project typechecking stable without local API shims.

- [ ] **0.3** — Install the dev dependency:
  ```bash
  bun add -d @types/bun @oh-my-pi/pi-coding-agent
  ```
  `@oh-my-pi/pi-coding-agent` is used for compile-time types only in this repo. Runtime sessions still execute through the globally installed `omp`.

- [ ] **0.4** — Create the source directory structure. Create empty directories with placeholder `index.ts` barrel files where noted:
  ```
  src/
    cli.ts              (placeholder: just `export {}`)
    orchestrator/       (empty dir — placeholder for Phase 2)
    personas/
    types/
    zellij/
  extensions/
  ```

- [ ] **0.5** — Append to `.gitignore`:
  ```
  *.log
  bun.lock
  ```

### Verification & Commit

```bash
bun x tsc --noEmit   # zero errors (only placeholder files exist)
```

Commit with message: `[phase-1/task-0]: scaffold project with bun, tsconfig, and directory structure`

---

## Task 1: CLI Entry Point Skeleton

Create the `pom` CLI that will later orchestrate trees. For now, stub the commands with TODO placeholders so the binary is runnable.

- [ ] **1.1** — Create `src/cli.ts`:
  ```typescript
  #!/usr/bin/env bun
  ```
  Parse `process.argv` manually (no framework dependency). Support these subcommands:
  - `pom init <tree-name>` — initialize a new tree (stub: print "not yet implemented")
  - `pom tree [tree-name]` — show tree status (stub)
  - `pom attach <session-id>` — attach to a Zellij session (stub)
  - `pom status` — show all active trees/sessions (stub)
  - `pom help` — print usage
  - Running `pom` with no args should print usage.

  Keep it simple: a `switch` on `process.argv[2]` routing to handler functions. Each handler function should be in-file for now.

- [ ] **1.2** — Verify the CLI runs:
  ```bash
  bun src/cli.ts help
  bun src/cli.ts init test-tree
  ```
  Both should print output without errors. The `init` command should print a "not yet implemented" message.

### Verification & Commit

```bash
bun src/cli.ts help        # prints usage summary
bun src/cli.ts init foo    # prints "not yet implemented"
bun x tsc --noEmit         # passes
```

Commit with message: `[phase-1/task-1]: stub pom CLI with init, tree, attach, status, help commands`

---

## Task 2: Zellij Manager

Build the module that creates, lists, attaches to, and destroys Zellij sessions programmatically. All operations shell out to the `zellij` CLI via `Bun.spawn`.

### Zellij CLI Reference (v0.43.1)

The following commands are the primitives we'll use. All were verified against the locally installed Zellij.

**Session lifecycle:**

| Command | What it does |
|---------|-------------|
| `zellij attach -b <name>` | Create a named session **in the background** without attaching. `-b` is `--create-background`. If the session already exists, this is a no-op. |
| `zellij attach <name>` | Attach the current terminal to an existing session. Takes over stdin/stdout. |
| `zellij kill-session <name>` | Kill (destroy) a session and all its panes/processes. |
| `zellij list-sessions -ns` | List session names only, one per line, no ANSI formatting. Short + parseable. |
| `zellij list-sessions -n` | List sessions with metadata, no ANSI. Format: `<name> [Created <age>]` for alive sessions, `<name> [Created <age>] (EXITED - attach to resurrect)` for dead ones. |

**Running commands inside a session (from outside):**

| Command | What it does |
|---------|-------------|
| `zellij -s <session> action new-pane -n <pane-name> -- <cmd...>` | Open a new pane in the target session running `<cmd>`. The pane stays open after the command exits (shows exit code, press Enter to re-run). `-n` sets the pane's display name. |
| `zellij -s <session> action new-pane -c -- <cmd...>` | Same but `--close-on-exit` — the pane auto-closes when the command finishes. |
| `zellij -s <session> action new-pane -d <dir> -- <cmd...>` | Same but `-d` sets the direction (`right`, `down`) for pane placement. |

**Pane and tab management (from outside):**

| Command | What it does |
|---------|-------------|
| `zellij -s <session> action new-tab -n <tab-name>` | Create a new tab with a display name. |
| `zellij -s <session> action write-chars "<text>"` | Send keystrokes to the focused pane in the session. |
| `zellij -s <session> action dump-screen <path>` | Dump the focused pane's scrollback to a file. |

### Session Creation Strategy

The orchestrator creates one Zellij session per agent persona instance. The naming convention is `<tree-name>/<persona>-<id>` (e.g., `feat-foo/pm`, `feat-foo/engineer-1`).

**Two-step creation pattern:**

```bash
# Step 1: Create a background session (starts with a default shell pane)
zellij attach -b feat-foo/pm

# Step 2: Open a new pane in that session running omp
zellij -s feat-foo/pm action new-pane -n "agent" -- omp \
  --system-prompt ./personas/prompts/pm.md \
  --session-dir .pi-oh-my/trees/feat-foo/pm \
  -e ./extensions/disable-plan-mode.ts
```

This gives the operator two panes when they attach: a shell for manual commands (git, file inspection) and the omp agent pane. This is intentional — the shell pane serves as the "dev environment" companion.

**Why not a KDL layout?** Layouts can define pane arrangements declaratively, but `zellij -s <name> --layout <path>` would start a new session and attach (taking over the terminal). There's no `--layout` flag for `attach -b`. We can revisit layouts in Phase 4 for more polished UX, but for Phase 1 the two-step pattern is simpler and fully functional.

### Implementation

- [ ] **2.1** — Create `src/zellij/exec.ts` — a shared helper that wraps `Bun.spawn` for Zellij commands:

  ```typescript
  export interface ZellijExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
  }

  export async function zellijExec(args: string[]): Promise<ZellijExecResult>
  ```

  Implementation:
  - Spawn `zellij` with the given args using `Bun.spawn`
  - Collect stdout and stderr by reading the streams into strings
  - Await the process exit code via `proc.exited`
  - Return `{ stdout, stderr, exitCode }`
  - Log the command at debug level: `console.debug("[zellij]", "zellij", ...args)`

- [ ] **2.2** — Create `src/zellij/types.ts`:

  ```typescript
  export type ZellijSessionStatus = "alive" | "exited";

  export interface ZellijSession {
    name: string;
    status: ZellijSessionStatus;
  }

  export interface SpawnPaneOptions {
    /** Display name for the pane (appears in Zellij frame) */
    paneName?: string;
    /** Direction for pane placement: "right" | "down". Omit for automatic. */
    direction?: "right" | "down";
    /** Whether to close the pane when the command exits */
    closeOnExit?: boolean;
    /** Working directory for the command */
    cwd?: string;
  }
  ```

- [ ] **2.3** — Create `src/zellij/manager.ts` with these exported functions:

  **`createSession(name: string): Promise<void>`**
  - Run: `zellij attach -b <name>`
  - This creates a background session with a default shell pane. If the session already exists, it's a no-op.
  - Throw if `exitCode !== 0` and the error isn't "session already exists".

  **`listSessions(): Promise<ZellijSession[]>`**
  - Run: `zellij list-sessions -n`
  - Parse each line: the session name is the first whitespace-delimited token. If the line contains `(EXITED`, the status is `"exited"`, otherwise `"alive"`.
  - Return an empty array if `zellij list-sessions` exits non-zero (means no server running / no sessions).
  - Handle edge case: stdout is empty or only whitespace → return `[]`.

  **`sessionExists(name: string): Promise<boolean>`**
  - Call `listSessions()` and check if any session has the matching name.

  **`attachSession(name: string): Promise<void>`**
  - First call `sessionExists(name)` — throw a descriptive error if false.
  - Spawn `zellij attach <name>` with `stdio: "inherit"` so it takes over the current terminal. This is a blocking call that returns when the operator detaches.
  - Use `Bun.spawn` with `{ stdin: "inherit", stdout: "inherit", stderr: "inherit" }` and await the process exit.

  **`killSession(name: string): Promise<void>`**
  - Run: `zellij kill-session <name>`
  - Ignore exit code — killing a non-existent session is not an error for our purposes.

  **`spawnPane(sessionName: string, command: string[], options?: SpawnPaneOptions): Promise<void>`**
  - Build the args array:
    ```
    ["-s", sessionName, "action", "new-pane"]
    ```
  - Append optional flags based on `options`:
    - `paneName` → `-n <paneName>`
    - `direction` → `-d <direction>`
    - `closeOnExit` → `-c`
    - `cwd` → `--cwd <cwd>`
  - Append `-- <command...>` at the end.
  - Run via `zellijExec(args)`. Throw if exit code is non-zero.

  **`writeChars(sessionName: string, text: string): Promise<void>`**
  - Run: `zellij -s <sessionName> action write-chars "<text>"`
  - Useful for sending input to the focused pane (e.g., responding to omp prompts programmatically).

  **`dumpScreen(sessionName: string, outputPath: string): Promise<void>`**
  - Run: `zellij -s <sessionName> action dump-screen <outputPath>`
  - Useful for reading what's currently displayed in a pane without attaching.

- [ ] **2.4** — Create `src/zellij/index.ts` that re-exports everything from `manager.ts`, `types.ts`, and `exec.ts`.

### Verification & Commit

Run a quick integration test (requires Zellij to be installed):
```bash
# Type check
bun x tsc --noEmit

# Functional test: list sessions (should return array, possibly empty)
bun -e "import { listSessions } from './src/zellij'; console.log(await listSessions())"

# Functional test: create and kill a test session
bun -e "
import { createSession, listSessions, killSession } from './src/zellij';
await createSession('pom-test-session');
const sessions = await listSessions();
console.log('sessions after create:', sessions);
await killSession('pom-test-session');
const after = await listSessions();
console.log('sessions after kill:', after);
"
```

The create/list/kill cycle should work without errors. The test session should appear in `listSessions()` after creation and be gone after killing.

Commit with message: `[phase-1/task-2]: zellij session manager with create, list, attach, kill, spawnPane`

---

## Task 3: Disable Plan Mode Extension

oh-my-pi has a built-in plan mode (see `oh-my-pi/packages/coding-agent/src/plan-mode/`). It gates write tools behind an approval flow. For pi-oh-my, we manage workflow differently — each persona has explicit tool restrictions. This extension disables the built-in plan mode entirely.

Reference: The example plan-mode extension at `oh-my-pi/packages/coding-agent/examples/extensions/plan-mode.ts` shows how plan mode works. We need to do the opposite — ensure it's _never_ active.

- [ ] **3.1** — Create `extensions/disable-plan-mode.ts`:
  ```typescript
  import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

  export default function disablePlanMode(pi: ExtensionAPI) {
    // ... implementation
  }
  ```

  The extension must:

  1. **On `session_start`**: ensure plan mode state is not enabled. The built-in plan mode is toggled via the `/plan` command and persisted in session entries with `customType: "plan-mode"`. Our extension should counteract it by appending a `plan-mode` entry with `{ enabled: false }`:
     ```typescript
     pi.on("session_start", async (_event, ctx) => {
       pi.appendEntry("plan-mode", { enabled: false });
     });
     ```

  2. **On `before_agent_start`**: if the built-in plan mode somehow injected a system prompt about plan mode, override it. Return a result that strips any plan-mode instructions:
     ```typescript
     pi.on("before_agent_start", async (event) => {
       if (event.systemPrompt.includes("plan mode") || event.systemPrompt.includes("Plan Mode")) {
         return {
           systemPrompt: event.systemPrompt
             .replace(/\[PLAN MODE[^\]]*\][^]*/m, "")
         };
       }
     });
     ```

  3. **Override `/plan` command**: Register our own `/plan` command that simply notifies the user it's disabled:
     ```typescript
     pi.registerCommand("plan", {
       description: "Plan mode is disabled in pi-oh-my sessions",
       handler: async (_args, ctx) => {
         ctx.ui.notify("Plan mode is disabled. Workflow is managed by pi-oh-my.", "info");
       },
     });
     ```

  4. **Block the `exit_plan_mode` tool**: Use the `tool_call` hook to block it:
     ```typescript
     pi.on("tool_call", async (event) => {
       if (event.toolName === "exit_plan_mode") {
         return { block: true, reason: "Plan mode is disabled in pi-oh-my sessions." };
       }
     });
     ```

- [ ] **3.2** — Verify the extension is syntactically valid:
  ```bash
  bun x tsc --noEmit
  ```
  This relies on the Task 0 dev dependency (`@oh-my-pi/pi-coding-agent`) to resolve `ExtensionAPI` types.

### Verification & Commit

```bash
bun x tsc --noEmit   # passes, extension types resolve correctly
```

Manual testing with a live omp instance will happen in Phase 2 when session spawning is wired up.

Commit with message: `[phase-1/task-3]: disable-plan-mode omp extension`

---

## Task 4: Persona Type Definitions and Configs

Define the TypeScript types that describe personas, their capabilities, and their tool restrictions. These types are used by the orchestrator to configure each `omp` session.

- [ ] **4.1** — Create `src/personas/types.ts` with:

  ```typescript
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
  ```

- [ ] **4.2** — Create `src/personas/configs.ts` with a `PERSONA_CONFIGS: Record<PersonaRole, PersonaConfig>` constant:

  | Role | Allowed Tools | Writable Artifacts | Can Modify Code | Requires Operator |
  |------|--------------|-------------------|----------------|------------------|
  | PM | `read`, `bash`, `grep`, `find`, `ls`, `web_search`, `fetch_content` | `SPEC.md` | No | Yes |
  | Architect | `read`, `bash`, `grep`, `find`, `ls`, `web_search`, `fetch_content` | `BLUEPRINT.md` | No | Yes |
  | Solver | `read`, `bash`, `grep`, `find`, `ls` | `chunk-*/CHUNK.md` | No | Yes |
  | Engineer | _(empty array = all tools)_ | _(all files)_ | Yes | No (autonomous) |
  | QA | `read`, `bash`, `grep`, `find`, `ls` | _(empty — reviews via GH CLI)_ | No | No (autonomous) |
  | Meta | `read`, `bash`, `grep`, `find`, `ls` | `RETRO.md` | No | Yes |

  All personas get `["extensions/disable-plan-mode.ts"]` in their `extensions` array. Additional extensions will be added in later phases.

- [ ] **4.3** — Create `src/personas/index.ts` that re-exports from `types.ts` and `configs.ts`.

### Verification & Commit

```bash
bun x tsc --noEmit   # passes
```

Commit with message: `[phase-1/task-4]: persona type definitions and config table`

---

## Task 5: Persona System Prompts

Create markdown system prompt files for each persona. These are loaded at runtime and passed to `omp` via `--system-prompt <path>`.

The prompts define the persona's role, constraints, and expected behavior. They should reference the artifact the persona is responsible for and explain the pi-oh-my workflow context.

- [ ] **5.1** — Create `src/personas/prompts/` directory.

- [ ] **5.2** — Create `src/personas/prompts/pm.md`:
  The PM system prompt should convey:
  - You are the Product Manager for a pi-oh-my workstream.
  - Your job is to work with the operator to produce a `SPEC.md` that fully captures the requirements.
  - `SPEC.md` should describe value-add and end-user outcomes, NOT implementation details.
  - You may use research tools (read, search, grep) to explore the codebase and understand current state.
  - You CANNOT modify code files. You can only write to `SPEC.md` in the tree directory.
  - When you believe the spec is complete, tell the operator and ask for sign-off.
  - Include a `SPEC.md` template at the end showing expected structure:
    ```
    # SPEC: <title>
    ## Problem Statement
    ## Goals
    ## Non-Goals
    ## User Stories
    ## Acceptance Criteria
    ## Open Questions
    ```

- [ ] **5.3** — Create `src/personas/prompts/architect.md`:
  The Architect prompt should convey:
  - You are the Architect for a pi-oh-my workstream.
  - You have already been given a signed-off `SPEC.md` (it will be in your context).
  - Your job is to produce a `BLUEPRINT.md` that breaks the spec into implementable chunks.
  - Each chunk should be a coherent unit of work that results in a single reviewable commit.
  - Outline chunks and their dependencies but do NOT fully flesh out each chunk — that's the Solver's job.
  - `BLUEPRINT.md` should describe the overall technical approach, then list chunks with goals, dependencies, and ordering.
  - You may use research tools to explore the codebase.
  - You CANNOT modify code files. You can only write `BLUEPRINT.md`.
  - Include a `BLUEPRINT.md` template:
    ```
    # BLUEPRINT: <title>
    ## Technical Approach
    ## Architecture Decisions
    ## Chunk Overview
    ### Chunk 1: <name>
    - Goal:
    - Dependencies: none | chunk-N
    - Files likely touched:
    ### Chunk 2: <name>
    ...
    ## Risk & Unknowns
    ```

- [ ] **5.4** — Create `src/personas/prompts/solver.md`:
  The Solver prompt should convey:
  - You are a Solver for chunk N of a pi-oh-my workstream.
  - You have been given `SPEC.md`, `BLUEPRINT.md`, and the chunk overview from the blueprint.
  - Your job is to produce a detailed `CHUNK.md` plan for your specific chunk.
  - `CHUNK.md` must be highly specific: exact file paths, function names, line ranges, and a checklist of tasks.
  - Each task should be small enough that an autonomous Engineer agent can execute it without ambiguity.
  - You may use research tools to explore the codebase in detail.
  - You CANNOT modify code files. You can only write `CHUNK.md`.
  - If any task requires human intervention (package install, env setup, etc.), flag it with `[HUMAN]` prefix.
  - Include a `CHUNK.md` template:
    ```
    # CHUNK <N>: <name>
    ## Context
    ## Goal
    ## Tasks
    - [ ] Task 1: description (file: `path/to/file.ts`, lines ~X-Y)
    - [ ] Task 2: ...
    - [ ] [HUMAN] Task 3: run `npm install ...`
    ## Verification
    ```

- [ ] **5.5** — Create `src/personas/prompts/engineer.md`:
  The Engineer prompt should convey:
  - You are an Engineer executing a `CHUNK.md` plan.
  - You have full tool access: read, write, edit, bash, grep, find, ls.
  - Work through the tasks in `CHUNK.md` in order. After completing each task, update `CHUNK.md` to check it off.
  - If you encounter a `[HUMAN]` task, stop and ask the operator for help.
  - Write clean, well-typed code. Follow existing project conventions.
  - When all tasks are complete, commit your changes with a message like `chunk-N: attempt M`.
  - Do NOT make changes beyond what the `CHUNK.md` specifies unless strictly necessary for correctness.

- [ ] **5.6** — Create `src/personas/prompts/qa.md`:
  The QA prompt should convey:
  - You are the QA reviewer for a completed chunk.
  - Your job is to aggressively review the Engineer's code changes.
  - Use `gh pr diff` and `gh pr view` to inspect the PR.
  - Post review comments via `gh pr review` with specific, actionable feedback.
  - Check for: correctness, type safety, edge cases, test coverage, code style, security concerns.
  - If everything looks good, approve the PR via `gh pr review --approve`.
  - You CANNOT modify code files directly. You interact only through GitHub PR review comments.

- [ ] **5.7** — Create `src/personas/prompts/meta.md`:
  The Meta prompt should convey:
  - You are the Meta agent performing a retrospective on a completed workstream.
  - Review all artifacts: `SPEC.md`, `BLUEPRINT.md`, all `CHUNK.md` files, `TRACKER.md`, and PR review threads.
  - Propose improvements to: the SDLC process, prompt templates, tool configurations, or extension behavior.
  - Write your proposals to `RETRO.md` in the tree directory.
  - Be specific and actionable. Reference concrete examples from this workstream.

- [ ] **5.8** — Create a prompt loader utility `src/personas/load-prompt.ts`:
  ```typescript
  import { readFileSync } from "node:fs";
  import { resolve, dirname } from "node:path";
  import { fileURLToPath } from "node:url";

  const __dirname = dirname(fileURLToPath(import.meta.url));

  export function loadPrompt(role: PersonaRole): string {
    const promptPath = resolve(__dirname, "prompts", `${role}.md`);
    return readFileSync(promptPath, "utf-8");
  }
  ```

- [ ] **5.9** — Update `src/personas/index.ts` to also re-export `loadPrompt` from `load-prompt.ts`.

### Verification & Commit

```bash
bun x tsc --noEmit   # passes

# Functional test: load each prompt
bun -e "
import { loadPrompt } from './src/personas';
for (const role of ['pm', 'architect', 'solver', 'engineer', 'qa', 'meta']) {
  const prompt = loadPrompt(role);
  console.log(role + ':', prompt.length, 'chars');
}
"
```

All six prompts should load and print their character counts.

Commit with message: `[phase-1/task-5]: persona system prompts and prompt loader`

---

## Final Structure

After all tasks are complete, the project should look like:

```
pi-oh-my/
  package.json
  tsconfig.json
  .gitignore
  src/
    cli.ts
    orchestrator/           (empty, placeholder for Phase 2)
    personas/
      types.ts
      configs.ts
      load-prompt.ts
      index.ts
      prompts/
        pm.md
        architect.md
        solver.md
        engineer.md
        qa.md
        meta.md
    zellij/
      types.ts
      exec.ts
      manager.ts
      index.ts
  extensions/
    disable-plan-mode.ts
```

Commits (6 total):
0. `[phase-1/task-0]: scaffold project with bun, tsconfig, and directory structure`
1. `[phase-1/task-1]: stub pom CLI with init, tree, attach, status, help commands`
2. `[phase-1/task-2]: zellij session manager with create, list, attach, kill, spawnPane`
3. `[phase-1/task-3]: disable-plan-mode omp extension`
4. `[phase-1/task-4]: persona type definitions and config table`
5. `[phase-1/task-5]: persona system prompts and prompt loader`
