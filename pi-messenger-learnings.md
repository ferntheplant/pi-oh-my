# pi-messenger: Architecture & Concurrency Learnings

A reference document capturing how `pi-messenger` handles multi-agent coordination and file write
reservations, intended as a baseline for designing a more sophisticated protocol.

---

## System Overview

Multiple headless `pi` processes share a working directory via the filesystem at
`~/.pi/agent/messenger/`. There is **no central broker daemon** — all coordination is
file-system-based. Each agent runs the same extension code (`index.ts`) which hooks into tool
calls and manages local state.

```
~/.pi/agent/messenger/
  swarm.lock              ← cross-process mutex for shared aggregated files
  claims.json             ← task claims (read-modify-write under swarm lock)
  completions.json        ← task completions (read-modify-write under swarm lock)
  registry/
    AgentName.json        ← one file per agent; agent owns it exclusively
  inbox/
    AgentName/
      {ts}-{rand}.json    ← one file per message; no lock needed

{cwd}/.pi/messenger/crew/
  plan.json               ← single writer (planner); atomic writes
  tasks/
    task-N.json           ← one file per task; atomic writes
    task-N.md             ← task spec; atomic writes
```

---

## Concurrency Mechanisms (Layered)

### 1. `withSwarmLock` — Cross-Process Mutex (`store.ts:101-157`)

Guards `claims.json` and `completions.json`, the only files with multiple concurrent writers.

**Primitive:** `fs.openSync(lockPath, O_CREAT | O_EXCL | O_RDWR)` — a single atomic POSIX
syscall. Only one process can create the file; all others get `EEXIST`.

- PID is written inside the lock file for liveness checking.
- Staleness recovery: if lock age > 10s, check `process.kill(pid, 0)`; delete if process is dead.
- Retry policy: up to 50 × 100ms = 5 seconds before throwing.
- Lock is always released in a `finally` block.

```
acquire → O_CREAT|O_EXCL → EEXIST? retry with backoff
                         → success? write PID, run fn(), unlink in finally
```

### 2. Atomic Writes via Temp File + `rename` (`store.ts:667-681`, `crew/store.ts:52-73`)

All JSON/MD writes use write-to-temp-then-`rename`. On POSIX, `rename(2)` is atomic — readers
always see either the old or the new file, never a partial write.

Temp file naming: `{target}.tmp-{process.pid}-{Date.now()}` — prevents two concurrent processes
from clobbering each other's temp files.

**Note:** `updateRegistration` (which persists reservations into registry files) does **not** use
this pattern — it does a plain `writeFileSync` directly. Partial reads of reservation state are
theoretically possible, though low-risk in practice.

### 3. Structural Isolation — One File Per Entity

A large fraction of safety comes from schema design rather than locks:

| Entity | Storage | Contention |
|---|---|---|
| Agent registry | `registry/{AgentName}.json` | Zero — each agent exclusively owns its file |
| Task files | `tasks/task-N.json` | Zero — different agents work on different tasks |
| Inbox messages | `inbox/{Agent}/{ts}-{rand}.json` | Zero — each message is a new file |

### 4. In-Process Guards (`store.ts:50-57`, `942-993`)

Within a single Node.js process, re-entrant calls to `processAllPendingMessages` are prevented
by a module-level boolean flag plus a single-slot pending queue:

```
isProcessingMessages = true
→ concurrent call: store args in pendingProcessArgs, return early
→ finally: set false, if pendingProcessArgs, drain it
```

### 5. FS Watch Debounce (`store.ts:1054-1063`)

`fs.watch` on the inbox directory fires on every OS-level inode event. Rapid bursts are collapsed
into a single deferred call with a 50ms `setTimeout` cancel/reschedule.

### 6. Optimistic Concurrency for Registration (`store.ts:369-408`)

Registration does not use the swarm lock. Instead: write the registry file, then immediately read
it back and verify `written.pid === process.pid`. If another agent raced and overwrote it, retry
with a fresh name. Same pattern used in `renameAgent`.

---

## The Reservation System

### Purpose

Prevents two agents from simultaneously editing the **same files in the user's workspace** — a
higher-level problem than the swarm-state coordination above.

### How It Works

**Publishing a reservation:**

1. Agent calls `pi_messenger({ action: "reserve", patterns: ["src/api/**"] })`.
2. `executeReserve` (`handlers.ts:383`) updates in-memory `state.reservations`.
3. `store.updateRegistration` writes the updated registry file (`registry/{AgentName}.json`),
   which now includes the `reservations` array.

**Consuming reservations:**

1. Another agent's `tool_call` hook fires for any `edit` or `write` call.
2. `store.getConflictsWithOtherAgents` calls `getActiveAgents`, which reads **all
   `registry/*.json` files off disk** and garbage-collects dead PIDs.
3. If the target file path matches any reservation pattern (via `pathMatchesReservation`), the
   tool call is **blocked** and the agent receives a message like:
   ```
   Reserved by: AgentB (in my-project on main)
   Reason: "implementing auth middleware"
   Coordinate via pi_messenger({ action: "send", to: "AgentB", message: "..." })
   ```

**Registry read caching:** `getActiveAgents` caches results for `AGENTS_CACHE_TTL_MS`. A freshly
published reservation may not be immediately visible to other agents.

### Key Weakness: No Conflict Check on `reserve` Itself

`executeReserve` does **not** check whether another agent has already reserved the same pattern.
Any agent can unconditionally write a reservation. The conflict check only exists on the write
side (the `tool_call` hook). Two agents can hold reservations on the same file simultaneously.

---

## Deadlock Analysis

### Classical Deadlock Is Possible

The system has no mechanical deadlock prevention. Consider:

- **Agent A** reserves `src/types.ts`, then tries to edit `src/api/routes.ts` → blocked by B
- **Agent B** reserves `src/api/routes.ts`, then tries to edit `src/types.ts` → blocked by A

Both agents are now stalled. The only resolution path is **social/LLM-level**: the blocked agent
is prompted to send a DM to the reservation holder to negotiate. There is:

- No timeout on reservations
- No priority ordering between agents
- No watchdog that detects a stalemate and intervenes
- No automatic backoff/retry for blocked writes

### Mitigating Factors (Why It's Rare in Practice)

- **Task assignment is non-overlapping by design** — the planner assigns agents to tasks with
  disjoint file sets when possible.
- **Agents are not truly blocked** — a blocked `edit` just returns an error; the LLM can continue
  doing other work and retry.
- **Message budgets** (5–10 per session) incentivize quick resolution.
- **Dead agent GC** — `getActiveAgents` calls `isProcessAlive(reg.pid)` and deletes stale
  registry files, so crashed agents' reservations are automatically cleared.

---

## Design Gaps to Address in a Successor Protocol

1. **Reservation acquisition should be atomic and exclusive** — `reserve` should fail (or queue)
   if another agent already holds a conflicting reservation, rather than silently writing over it.

2. **Deadlock detection** — a watchdog could scan the registry periodically and detect cycles
   (agent A blocked on B's reservation, B blocked on A's) and intervene (e.g. by priority,
   creation time, or task dependency order).

3. **Reservation timeouts** — reservations should carry a TTL or heartbeat requirement. A
   reservation not refreshed within N seconds is considered abandoned.

4. **Atomic reservation writes** — `updateRegistration` should use the temp+rename pattern like
   all other writes, not a direct `writeFileSync`.

5. **Reservation cache invalidation** — the TTL cache on `getActiveAgents` creates a window where
   conflicts aren't detected. Consider a shorter TTL or an event-based invalidation signal.

6. **Reservation granted/denied response** — agents should receive explicit confirmation that
   their reservation was granted and no conflict exists, rather than discovering the conflict only
   when a write is attempted.

7. **Structured negotiation protocol** — rather than relying on LLM social coordination, a
   formal request/grant/deny/transfer protocol for file ownership would be more reliable and
   auditable.
