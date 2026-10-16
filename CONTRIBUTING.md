# Contributing

## Running it locally

The plugin is a single TypeScript file with no runtime dependencies, so a working copy is also an
installable one:

```sh
git clone https://github.com/rojosinalma/opencode-diagnostics ~/.config/opencode/plugins/diagnostics
```

Start (or restart) the OpenCode server, open a session in any project and make an edit that breaks
the syntax of a `.rb`, `.js`, `.ts` or `.c` file. The tool result gains a
`[diagnostics] <tool> on <file>:` block. To test option handling, reference the clone from a
`plugins[]` entry in `opencode.jsonc` instead (see `docs/configuration.md`). Plugins are loaded when
a location boots, so restart the server after changing `index.ts`.

Type checking needs the types package once:

```sh
bun install
bun x tsc --noEmit --strict --skipLibCheck --target esnext --module esnext --moduleResolution bundler --types node index.ts
```

## Tests

```sh
bun test
```

`test/index.test.ts` covers the pure parts: option resolution, checker selection by extension and
placeholder resolution (`planFor`), output filters (`findings`), truncation (`cap`), file collection
from tool input (`targetFiles`, `patchPaths`) and result shaping (`appendText`). Tests create a
temporary directory tree and never run a real checker. CI runs the same command on every push and
pull request (`.github/workflows/run-tests.yml`).

## Code style and layout

- `index.ts` — the whole plugin: option resolution, file collection, checker planning, execution,
  filters, result shaping and the `Plugin.Plugin` export at the bottom. Helpers that tests need are
  exported; everything else stays module-private.
- `test/` — `bun:test` suites.
- `docs/` — the documentation (see below).
- TypeScript, strict-friendly, 2-space indent, no semicolons, double quotes. Keep the plugin
  dependency-free at runtime: `@opencode/plugin` is imported as `import type` only.
- New checkers go into `DEFAULT_CHECKERS` and, when their output needs cleaning, a filter in
  `FILTERS` keyed on the command basename, with a test for each.

## Commits and PRs

- Plain, descriptive commit messages in the imperative ("Add py_compile checker"). No attribution
  trailers. Every commit is GPG-signed (`git config commit.gpgsign true`).
- One logical change per commit; `bun test` green before pushing.
- Open a pull request against `main` describing what changed and why. Update the relevant docs in
  the same PR. The `run-tests` check must be green before merging.

## Releasing

Bump `version` in `package.json`, move the `Unreleased` section of `CHANGELOG.md` under the new
version, commit, create a signed tag `vX.Y.Z` and a GitHub release with that changelog section as
its notes.

## Documentation

| file | content |
|---|---|
| `README.md` | what it is, requirements, installation, usage, development, licence — nothing else |
| `docs/configuration.md` | every option, the checker map, placeholders, defaults |
| `docs/SDD.md` | design: hook, data flow, filters, decisions, scope, operations |
| `docs/troubleshooting.md` | symptoms and fixes |
| `CHANGELOG.md` | Keep a Changelog, one entry per release |
| `CONTRIBUTING.md` | this file |
| `SECURITY.md` | how to report a vulnerability, supported versions |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 |
| `LICENSE` | AGPL-3.0 |

New behaviour gets its option documented in `configuration.md` and its reasoning in `SDD.md`.
