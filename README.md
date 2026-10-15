# opencode-diagnostics

An [OpenCode](https://opencode.ai) plugin that appends compiler diagnostics to the result of every
`write`, `edit` and `patch` tool call. After the agent changes a file, the matching checker runs on it
(`ruby -wc`, `node --check`, `tsc --noEmit`, `gcc -fsyntax-only` / `g++`, …) and any errors are added
to the tool output, so the model sees a broken edit immediately instead of discovering it at run
time. Nothing is appended when the file is clean. Deliberately not a linter: syntax and type errors
only.

## Install

Clone into the global plugins directory (auto-discovered, no config needed):

```sh
git clone https://github.com/rojosinalma/opencode-diagnostics ~/.config/opencode/plugins/diagnostics
```

Or reference it from `opencode.jsonc` when you need options:

```jsonc
{
  "plugins": [
    {
      "package": "./plugins/diagnostics",
      "options": {
        "timeout_ms": 15000,
        "max_lines": 30,
        "path_prepend": ["~/.local/bin"],
        "checkers": { "rb": null, "py": ["python3", "-m", "py_compile", "{file}"] }
      }
    }
  ]
}
```

No runtime dependencies: `@opencode/plugin` is imported as types only, so no `bun install` is needed.

## Options

| key | default | meaning |
|---|---|---|
| `checkers` | built-in map (`rb`, `js`/`mjs`/`cjs`, `ts`/`tsx`/`mts`, `c`/`h`, `cc`/`cpp`/`cxx`/`hpp`/`hh`) | extension → argv (or array of argvs, first found wins). `null` disables an extension. Placeholders: `{file}`, `{dir}`, `{tsconfig_dir}`, `{compile_commands_dir}`. |
| `timeout_ms` | `15000` | per-checker wall clock |
| `max_lines` | `30` | cap on appended diagnostic lines |
| `path_prepend` | `[]` | directories put in front of `PATH` for the checkers (`~` expands) |

Overrides are merged over the defaults, so one key only changes that extension.

## How it works

1. `ctx.tool.hook("execute.after")` on `write`/`edit`/`patch` collects the touched paths (patches are parsed for theirs).
2. The extension picks a checker; `tsc` runs project-wide from the nearest `tsconfig.json`, C-family checkers prefer `clangd --check` when a `compile_commands.json` is found.
3. Output is filtered per tool (noise like `Syntax OK` or stack frames is dropped) and appended as a text block to the tool result.

## Caveats

- A plugin is loaded per location boot; a running location picks up changes only after a restart.
- The checker binaries must be on `PATH` (or `path_prepend`); a missing one is skipped silently.
