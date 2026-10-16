# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-10-16

### Added

- Test suite for option resolution, checker selection, output filters, truncation and result
  shaping (`bun test`), run in CI on every push to `main` and every pull request.
- `docs/configuration.md`, `docs/SDD.md`, `docs/troubleshooting.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue and pull request templates.
- Tracked `bun.lock`; CI installs with `--frozen-lockfile`. Dependabot for npm and GitHub Actions.

### Changed

- Licence to AGPL-3.0.
- README reorganised: requirements with minimum versions, installation, usage, development.

## [0.1.0] - 2026-10-15

### Added

- `execute.after` hook on `write`, `edit` and `patch` appending checker output to the tool result.
- Default checkers for Ruby (`ruby -wc`), JavaScript (`node --check`), TypeScript (`tsc --noEmit`)
  and C/C++ (`clangd --check` with a compile database, else `gcc`/`g++ -fsyntax-only`).
- Options `checkers`, `timeout_ms`, `max_lines`, `path_prepend`.

[Unreleased]: https://github.com/rojosinalma/opencode-diagnostics/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/rojosinalma/opencode-diagnostics/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rojosinalma/opencode-diagnostics/releases/tag/v0.1.0
