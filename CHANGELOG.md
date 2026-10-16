# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Test suite for option resolution, checker selection, output filters, truncation and result
  shaping (`bun test`), run in CI on every push and pull request.
- `docs/configuration.md`, `docs/SDD.md`, `docs/troubleshooting.md`, `CONTRIBUTING.md`.

## [0.1.0]

### Added

- `execute.after` hook on `write`, `edit` and `patch` appending checker output to the tool result.
- Default checkers for Ruby (`ruby -wc`), JavaScript (`node --check`), TypeScript (`tsc --noEmit`)
  and C/C++ (`clangd --check` with a compile database, else `gcc`/`g++ -fsyntax-only`).
- Options `checkers`, `timeout_ms`, `max_lines`, `path_prepend`.
