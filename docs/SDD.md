# Software design document

## Purpose

Give the model immediate feedback on a broken edit. Every time a `write`, `edit` or `patch` tool
call completes, the plugin runs the compiler or syntax checker that matches the touched file and
appends its findings to the tool result the model reads next. The scope is syntax and type errors
only; style and lint rules are left to dedicated tooling so the appended block stays short and
actionable.

## Architecture

One file, `index.ts`, exporting a plain `Plugin.Plugin` object (`id: "diagnostics"`). It talks to
OpenCode through a single hook and to the outside world through child processes:

```
OpenCode tool call completes
  └─ ctx.tool.hook("execute.after")          index.ts  setup()
       ├─ targetFiles()      which files were touched
       ├─ check() per file   pick checker → execute() → findings() → cap()
       └─ appendText()       add a text block to event.result
```

- `setup(ctx)` resolves the options once (`resolveOptions`) and remembers `ctx.location.directory`
  as the base for relative paths, then registers the hook.
- The hook ignores events whose `status` is not `completed` and tools other than
  `write`/`edit`/`patch`. Everything inside it is wrapped in `try/catch`; a failure is logged as
  `[diagnostics] hook failed` and the tool result is left untouched. The plugin never blocks or
  fails a tool call.
- Checkers run via `node:child_process.execFile` with a timeout (`SIGKILL`), a 4 MiB output buffer,
  `NO_COLOR=1`, and `PATH` prefixed with `path_prepend`.

`@opencode/plugin` is imported as a type only, so the plugin has no runtime dependency and needs no
`bun install`; `Plugin.define` is an identity function, which is why a plain object is enough.

## Data model / storage

None. The plugin keeps no state between hook invocations and writes nothing to disk. Options live
in `opencode.jsonc` and are read once per plugin load.

## Key flows

### 1. Collecting the touched files (`targetFiles`)

- `write`/`edit`: the `path` (or `filePath`) field of the tool input.
- `patch`: the `applied` list in the tool output (every entry whose `type` is not `delete`); when
  that list is absent, the `*** Add File:` / `*** Update File:` / `*** Move to:` headers of the
  patch text are parsed instead (`patchPaths`).
- Paths are resolved against the location directory, deduplicated, and files that do not exist
  (deleted, renamed away) are dropped.

### 2. Picking and preparing a checker (`planFor`, `substitute`)

The lower-cased extension selects a `CheckerSpec` from the merged checker map. A spec is an argv, a
list of candidate argvs, or `null`. For each candidate the `{placeholder}` tokens are resolved
(`file`, `dir`, `tsconfig_dir`, `compile_commands_dir`); if any placeholder cannot be resolved —
no `tsconfig.json` upwards, for instance — the candidate is skipped and the next one is tried.
That ordering is how `clangd --check` is preferred over `gcc -fsyntax-only` only when a
`compile_commands.json` exists.

The working directory is the resolved `tsconfig_dir` or `compile_commands_dir`, else the nearest
`.git` parent, else the file's directory. The command is swapped for `node_modules/.bin/<command>`
when one is found upwards from that directory, so a project-pinned `tsc` beats a global one.

### 3. Running and filtering (`execute`, `findings`)

`execute` returns `{code, out}` or a `failure` string: `not found on PATH` (`ENOENT`) or `timed out
after Nms`. Failures are reported as a one-line `[diagnostics] <tool> skipped on <file>: <reason>`
block so the model knows the check did not happen.

`findings` splits stdout+stderr into non-empty lines and applies a per-command filter keyed on the
command basename:

| command | filter |
|---|---|
| `ruby` | drops `Syntax OK`, strips the `…ruby: ` prefix |
| `node` | drops stack frames (`    at …`) and the `Node.js vX` footer |
| `tsc` | keeps only diagnostics located in the edited file (plus their indented continuation lines) and file-less `error TSxxxx` lines — `tsc` is project-wide and would otherwise report every file |
| `gcc`, `g++`, `cc`, `c++`, `clang`, `clang++` | keeps `file:line[:col]: (error|warning|note|fatal error):` lines |
| `clangd` | rewrites `E[…] [check] Line N: msg` to `file:N: [check] msg` |

If the filter leaves nothing but the checker exited non-zero (and is not project-wide), the raw
lines are appended instead, so an unexpected failure mode is never swallowed.

### 4. Appending (`cap`, `appendText`)

Lines are capped at `max_lines` with a trailing `… N more`, absolute paths are rewritten relative
to the location directory, and the block is added as a `{type: "text"}` content item. `appendText`
handles the three result shapes: string content (becomes two text blocks), array content (extended),
and a bare `output` (serialised to JSON ahead of the block). Multiple files produce one block each,
joined by a blank line.

## Configuration surface

`checkers`, `timeout_ms`, `max_lines`, `path_prepend` — see
[configuration.md](configuration.md). Overrides are merged over `DEFAULT_CHECKERS` so one key
changes one extension; a leading dot in a key is tolerated; `~` in `path_prepend` expands to the
home directory.

## Decisions and rationale

- **Hook, not a separate tool.** The model never has to remember to run a check; it happens on
  every edit and the result arrives in the same tool output it already reads.
- **Syntax and types only, no linters.** A lint run on every edit produces long, opinionated output
  that drowns the one error that matters. Projects that want linting can add a checker for it via
  `checkers`, but the defaults stay narrow.
- **Silent skip on a missing binary.** A machine without `ruby` should not see a failure on every
  `.rb` edit; the one-line skip notice is enough to explain why no diagnostics appeared.
- **Candidate lists with placeholder resolution** instead of per-tool detection code: `clangd` vs
  `gcc` and `tsc` needing a `tsconfig.json` are expressed in the checker map itself and can be
  overridden the same way.
- **Per-file filtering of `tsc`.** `tsc` only runs project-wide; without the filter an edit to one
  file would surface every pre-existing error in the project.
- **Type-only import of `@opencode/plugin`.** Keeps the plugin dependency-free so a bare
  `git clone` into the plugins directory works.
- **Fail open.** Any exception inside the hook is logged and the tool result passes through
  unchanged; a diagnostics helper must never break the edit it is annotating.

## Current scope and non-goals

- Checks the file types in `DEFAULT_CHECKERS` plus whatever `checkers` adds; it runs whatever argv
  it is given, so any command-line checker with file-based output fits.
- Runs on `write`, `edit` and `patch`; shell-driven edits (`sed -i`, heredocs) are not observed.
- Appends text; it does not block the tool call, edit the file or retry.
- One checker invocation per touched file per call; no caching or incremental mode.

## Operations

- **Logs:** the only log line is `[diagnostics] hook failed <error>` on OpenCode's stderr/journal
  when the hook itself throws. Checker failures are visible to the model in the tool output
  (`skipped on … : not found on PATH` / `timed out`).
- **Health:** edit a file with a deliberate syntax error in a session and confirm the
  `[diagnostics] <tool> on <file>:` block appears in the tool result.
- **Upgrade:** `git pull` in the plugin directory. OpenCode loads plugins when a location boots,
  so an already-running location picks up the new code after the OpenCode server restarts.
- **Tests:** `bun test` (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
