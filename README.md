# opencode-diagnostics

An [OpenCode](https://opencode.ai) plugin that appends compiler diagnostics to the result of every
`write`, `edit` and `patch` tool call. After the agent changes a file, the matching checker runs on it
(`ruby -wc`, `node --check`, `tsc --noEmit`, `gcc -fsyntax-only` / `g++`, …) and any errors are added
to the tool output, so the model sees a broken edit immediately instead of discovering it at run
time. Nothing is appended when the file is clean. Deliberately not a linter: syntax and type errors
only. Configuration, design and troubleshooting are documented in `docs/`.

## Requirements

- OpenCode 2.x running on Bun.
- The checker binaries for the file types you want checked, on `PATH` or in `path_prepend`: `ruby`,
  `node`, `tsc`, and `clangd` or `gcc`/`g++` by default. A missing checker is skipped, not an error.

## Setup

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
All options are described in [docs/configuration.md](docs/configuration.md).

## License

MIT — see [LICENSE](LICENSE).
