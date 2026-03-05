# `pi-oh-my` Rework

While creating oh-my-pi I realized that the main value add is not the orchestration of agent personas - instead it is the general architecture of having a dedicated, filesystem based "workspace" for multiple agents to collaborate against. This workspace should have a standard filesystem shape and APIs for interacting with it - especially for "locking" resources. Some API ideas

- locking a resource (like writing to specifica files/folder to prevent merge conflicts)
- pulling context from external systems (linear issues, github PR comments, slack threads, etc)
- creating workspace-scoped plans/task-lists

Basically: we lock all access to the workspace behind `pom`. Within your `pom` settings you can provide agent personas, tools, and skills for adding context to the workspace. `pom` by default only gives tools for managing workspaces (CRUD) and "locking" resources in a workspace.

**this is actually 2 projects: `workspace` and `orchestrator`**

## Workspace

This project is more important:

- `pom init <name>` creates a new workspace with given name
- `pom ls` lists workspaces
- `pom d <name>` deletes a workspace
- `pom attach <name>` launches an `omp` session in the workspace (with limited tools and the `pom` extension preloaded)

We can have a few helper tools for loading the workspace with relevant context in a canonical way:

- `worktree` tool for creating and managing a worktree inside the workspace
- `github` tool for loading and modify the PR for this branch
- `linear` tool for loading and updating issue status
- `doc-saver` tool for pre-loading relevant library docs from the web into the workspace
  - could also just be literally git cloning the library repo down lol
    - then use an agent to make a "map" saying where to find the most useful info in advance
- `global-cache` tool for symlinking reusable docs across all workspaces

These helpers would define a canonical registry of context information like "github PR comments are at `/github/PR/comment/<comment-id>.json`" or "tanstack-router docs are at `/docs/tanstack-router`". Any workspace participants would be encouraged to read from these stores for this context and would only be able to write to the stores using the helpers (to provider easier locking for writes and for maintaining the schema easier)

random notes on the above:

- use transparent tool replacement to nudge all agents to these tools (i.e. `bash grep` -> `<tool grep>`)
- how do human users edit a canonical store? Do they also need to use the write tools?
- this feels vaguely AT-protocol-esque
  - workspace context provider defines a schema and registers it to the workspace
  - agents consume schema registry to know what context is available and how to read/write it
- I would want a global view of all workspace agents and the ability to drop into a chat with any of them
  - general UI might be similar to vscode
    - right sidebar = context explorer (file explorer)
    - bottom panel = tool registry (terminal)
    - left sidebar = agent list ("cmd+l" keybind in cursor)
    - center panel = chat interface (editor buffer)
  - command palette to let me open other center panel "buffers" like a diff viewer, markdown renderer, etc

example workspace:

```plaintext
workspace/
  meta/
    SYSTEM.md (recommended system prompt for any workspace participant)
    tools.json (tool registry)
    registry/ (each participant gets a json file to post it's status to)
      <agent-name>.json (represents the agent's onnline status and current filesystem claims)
    chatroom/
      <message-uuid>.json
      ...
  lockers/
    <agent-name>/ (personal home base for any named agent)
      any_data.md
      ...
  git-repo-worktree/
    ...
  references/
    some-library-cloned/
      MAP.md ("cached" list of relevant filepaths)
      src/ (the remaining content of the repo may be symlinnked to the global cache - but MAP.md is per workspace)
      package.json
      ...
  github/
    MAP.md ("cached" list of open comments and most recent CI status)
    comments/
      <id>.md (comment pre-formatted for agent consumption)
      ...
    ci/
      <commit-run>.json (CI status pre-formatted for agent consumption)
      ...
```

Overall flow:

- I create a new workspace based on some linear issue link
- POM bootstraps the workspace file system and `meta/` folder
- POM uses my `setup-ticket.ts` script to create a branch and put up a draft PR
- POM puts that branch in a worktree and the worktree inside the workspace file system
- `pom attach` to attach an agent to the workspace
  - I need to name the agent so it can join the chatroom
- general agent tools
  - writes to `meta/` totally blocked - can only be written via speciazed tool calls
    - registered schemas like `github/` also blocked for writes and accessible only through tool calls
    - these tool calls provided by the workspace `meta/tools.json`?
    - I'm saying "tools" but really this includes `oh-my-pi` extensions that hook right into the agent harness
  - give agent a `lockers/<agent-name>/` folder - maybe this is where it's system prompt and custom tools list live?
- writes are intercepted by the claims/reservation system
  - agents must declare that some pattern is currently reserved by them before writing to it
  - the `lockers/<agent-name>/` pattern is inherently permanently reserved by the corresponding agent

oh maybe an agent can even create an entire new worktree in its own locker so it can edit files with no worry about write contention from other agents. Then it can merge this worktree back to the workspace level worktree in an atomic way by claiming the whole thing the first chance it gets

### Future work

If this is all local then technically the workspace filesystem is not actually protected; only agents who participate via our `pom` harness will have the necessary safeguards in place. In the future maybe `pom` is an actual gateway to a remote filesystem so your agents literally could not interact with the workspace if not initialized with the `pom` harness. The agent is still running locally but the filesystem with which it interacts (via tool calls) is not there locally so the user couldn't accidentally edit it or attach non-`pom` agents to it.

This also would allow for moving sessions across machines more easily: if your workspace is on the cloud and your agents write checkpoints to their lockers then and agent you started with `pom attach` can be restarted easily on a different machine.

## Orchestrator

The orchestrator's job is to define the exact shape and flow of agent collaboration. This generally includes:

- state machine of agents handing off work to one another
- automated execution->review->execution loops
- schema of registered artifacts
- well scoped agent personas
- a strongly opinionated "workspace" lifecycle

The orchestrator would use `pom attach <name>` to attach one of its agents to the workspace but it would be up to the orchestrator to provide (or remove) tools and update system prompts. Workspace tools like the `github` helpers can be used by the orchestrator agents to keep the workspace up to date.

random notes on this:

- the exact lifecycle will be impossible to pin down: the ability for it to evolve will be important
  - some aspect of the lifecycle must thus live OUTSIDE the workspace
- less important for development right now since I can just manually prompt my way into my current lifecycle
