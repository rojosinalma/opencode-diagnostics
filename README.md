# opencode-diagnostics

[![run-tests](https://github.com/rojosinalma/opencode-diagnostics/actions/workflows/run-tests.yml/badge.svg)](https://github.com/rojosinalma/opencode-diagnostics/actions/workflows/run-tests.yml)
[![release](https://img.shields.io/github/v/release/rojosinalma/opencode-diagnostics)](https://github.com/rojosinalma/opencode-diagnostics/releases)
[![license](https://img.shields.io/github/license/rojosinalma/opencode-diagnostics)](LICENSE)

An [OpenCode](https://opencode.ai) plugin that appends compiler diagnostics to the result of every
`write`, `edit` and `patch` tool call. After the agent changes a file, the matching checker runs on it
(`ruby -wc`, `node --check`, `tsc --noEmit`, `gcc -fsyntax-only` / `g++`, …) and any errors are added
to the tool output, so the model sees a broken edit immediately instead of discovering it at run
time. Nothing is appended when the file is clean. Deliberately not a linter: syntax and type errors
only. Configuration, design and troubleshooting are documented in `docs/`.

## Requirements

- [OpenCode](https://opencode.ai) ≥ 2.0, running on [Bun](https://bun.sh) ≥ 1.4.
- The checker binaries for the file types you want checked, on `PATH` or in `path_prepend`: `ruby`,
  `node`, `tsc`, and `clangd` or `gcc`/`g++` by default. A missing checker is skipped, not an error.

## Installation

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

## Usage

Start (or restart) OpenCode and let the agent edit a file. When the edit breaks the syntax or the
types, the tool result ends with a `[diagnostics] <tool> on <file>:` block listing the checker's
errors; a clean edit gets nothing appended. Disable a file type with `"checkers": { "rb": null }` or
add one with its argv — every option is described in [docs/configuration.md](docs/configuration.md).

## Development

```sh
bun install
bun test
```

Plugins are loaded when a location boots, so restart the OpenCode server after changing `index.ts`.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout, style and how to add a checker.

## License

AGPL-3.0 — see [LICENSE](LICENSE). Copyright (C) 2026 rojosinalma.
