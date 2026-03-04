# Custom "Pi-Oh-My" Coding Agent harness

- based on `pi` harness
- uses oh-my-pi custom tools like:
  - hash-line edits
  - lsp integration
  - ttsr
  - ask tool
  - web-search
- includes pi extensions:
  - markdown renderer
  - web access
  - pi-guardrails (within `/pi-extensions`)
- will implement my custom SDLC personas and agent orchestration
  - all orchestration lives within files checked into git rather than internal plan files like with oh-my-pi

## Vocabulary

- **Personas**: roles individual agents take on:. Options are:
  - Product Manager (PM)
  - Architect
  - Solver
  - Engineer
  - QA
  - Meta
- **Workstream**: an end-to-end workflow of agents that produces a final PR merged to main
- **Tree**: the collection of agents orchestrated to execute a workstream end-to-end
- **Session**: a specific instantiation of an agent persona into a coding harness for human interaction
- **Operator**: the human managing the tree

## Big Idea

The operator should be present and watching the tree of agents at all time. There is very minimal parallelism. The overall flow looks like:

1. Operator creates a tree and initiates a chat with the PM
    - this tree is associated with a specific branch of the repo being worked on, say `feat-foo`
    - all the tree's metadata will be saved to `./.pi-oh-my/trees/feat-foo`
2. PM goes back and forth with operator building `SPEC.md` (located at `./pi-oh-my/trees/feat-foo/SPEC.md`)
    - `SPEC.md` lays out the full requirements of the workstream and is phrased in terms of end result value-add rather than any code implementation details
    - if the goal is a refactor then the `SPEC.md` may reference more code specifics
    - PM agent has access to research sub-agents to explore the codebase and search the web to understand the current state of affairs and the space of possibilities
3. Operator signs off on the `SPEC.md` and moves to a new session with the Architect
4. Architect goes back and forth with the operator building `BLUEPRINT.md` (located at `./pi-oh-my/trees/feat-foo/BLUEPRINT.md`)
    - `BLUEPRINT.md` outlines a high level implementation plan with the explicit goal of providing "chunks" of work to be full fleshed out later
    - The overall `BLUEPRINT.md` has an end-goal of having a PR that is merged to main and deployed to prod but leaves slots for chunks with goals that are individual commits or branch-PRs that implement some part of the final solution
    - The Architect does NOT fully flesh out each chunk and instead outlines the chunks and how they fit together
    - Architect agent has access to research sub-agents to explore the codebase and search the web to undestand the current state of affairs and the space of possibilities
5. Operator signs off on the `BLUEPRINT.md` and a `TRACKER.md` is generated (located at `./pi-oh-my/trees/feat-foo/TRACKER.md`)
    - the `TRACKER.md` simply provides a metadata store for tracking which chunks have been completed
6. pi-oh-my spawns one new session for every chunk with a Solver
    - The Solver sessions can run in parallel
7. Each Solver goes back and forth with the Operator building its own `CHUNK.md` (located at `./pi-oh-my/trees/feat-foo/chunk-N/CHUNK.md`)
    - `CHUNK.md` plans are highly specific to the level on including specific files or lines of code that need to be adjusted
    - The `CHUNK.md` plan should lead to a valid commit that would be reasonable to push to `feat-foo` and be meaningfully reviewed
    - `CHUNK.md` includes individual task items that can be checked off like a TODO list
8. Operator signs off on each `CHUNK.md` plan and so each Solver starts an "Execution Loop"
    - to avoid merge conflict issues **only 1 execution loop may run at a time**
    - parallelism among Solvers was ok because each solver was only writing to its own `CHUNK.md`
    - the execution loop will be on its own branch like `feat-foo/chunk-N` with a PR against the original `feat-foo` branch
9. An initial Engineer agent works autonomously without human intervention to execute the `CHUNK.md` plan
    - if the `CHUNK.md` included any human-lead operation like installing a package then this should be called out by the Solver and the Engineer then has permission to ask for human intervention
    - the Engineer also updates `CHUNK.md` to checkoff task items it has completed
10. Once the Engineer says it has completed it's work it commits to the branch with a message like `chunk-n: attempt 1`
11. Then a QA session is spawned with instructions to aggressively review the Engineer's code leaving comments and calling out test coverage
    - comments are tracked via the GitHub PR comments and posted and reviewed via the GitHub CLI
12. Another Engineer session is spawned with the context of completed tasks in `CHUNK.md` and review comments from the QA agent
13. Once the Engineer says it has completed addressing the review comments it commits to the branch with a message like `chunk-n: attempt 2`
    - comments are viewed and resolved via the GitHub CLI
14. This cycle (steps 10-13) continues until the QA agent has no comments left and approves of the current code
15. The Execution Loop squash-merges the `feat-foo/chunk-N` branch back into `feat-foo` and closes allowing the next Solver to begin its Execution Loop
    - With the chunk being complete we also update `TRACKER.md`
16. Once all execution loops complete the Architect is called upon to confirm the `TRACKER.md` is complete and the `BLUEPRINT.md` is satisfied
17. Once the Architect signs off the PM is brought back to confirm with the operator that the end-to-end solution looks good
18. Once the PM signs off the `feat-foo` PR is merged and it is up to the operator to complete any final deployment steps that may have been called out by the PM or Architect
19. At the end of the workstream a Meta agent reviews all `.md` artifacts, review comments, and user messages
    - It proposes any changes to the SDLC structure, agent persona prompts, or harness tools to optimize the flow in the future
    - Only after the Meta agent's proposals are reviewed by the operator is the Tree marked as complete

As such the UX looks like:

- large window with sidebar of the agent tree
  - Root of tree is the PM
  - Just under the PM is the architect
  - Under the Architect is N Solver children
  - Within each Solver is a list of Eng->QA->Eng->QA... children
  - at the bottom there is another "root" agent for Meta
- the main content is the chat
  - for `.md` based agents (PM, architect, solver) the content has 2 panes: the chat and a md renderer
  - for coding agents (engineer and QA) the content panes are: chat and diff viewer
  - the Meta agent has just a chat pane

## Runtime details

Each session needs its own instance of `pi` running end to end

- give each a Zellij session with name like `<tree-name>/<agent-name>`
- the overall "viewport" can then attach to these zellij sessions to give the user the abiility to interact with the agent

The overall tree needs a persisten "dev environment" that consists of the code repo, a running dev server, and scripts for interacting with `pi` itself and the GitHub CLI

- GitHub CLI interaction can be encoded as agent skills (given only the Engineer and QA agents)
- we can have a zellij session like `<tree-name>/dev` that hosts a running instance of the dev server that can also be attached to for checking on
- `pi` specific interactions like spawning new sessions should be done directly in `pi` via built-in `pi` extensions that will setup the zellij sessions

### Nicities to Note

- An agent "Session" corresponds exactly with a Zellij session
- Using github as a review "backend" is incidental so the GitHub CLI tooling lives as agent skills rather than inside of `pi`
  - we can reuse my github tooling from `~/dotfiles/scripts/setup-ticket.ts`
