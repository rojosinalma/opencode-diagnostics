# Troubleshooting

## No diagnostics appear after an edit

1. The plugin is loaded when a location (project directory) boots. If you installed or changed
   it while OpenCode was running, restart the OpenCode server; existing sessions keep the plugin
   set they started with.
2. Check the extension is in the checker map (`docs/configuration.md` → Default checkers) and not
   disabled with `null`.
3. A clean file produces no block at all — that is the expected quiet path.

## `[diagnostics] <tool> skipped on <file>: not found on PATH`

The checker binary is not visible to the OpenCode server process. Either install it, or add its
directory to `path_prepend` — a server started by a service manager often has a shorter `PATH` than
your interactive shell (version managers like asdf, mise or nvm put shims in `~/.asdf/shims`,
`~/.local/share/mise/shims`, …).

## `[diagnostics] <tool> skipped on <file>: timed out after 15000ms`

The checker ran longer than `timeout_ms`. Project-wide `tsc` on a large tree is the usual case;
raise `timeout_ms` or point the project's `tsconfig.json` at a smaller set of files.

## TypeScript files are never checked

`tsc` runs with `-p {tsconfig_dir}` and the candidate is skipped when no `tsconfig.json` exists
above the file. Add one, or override the checker:

```jsonc
"checkers": { "ts": ["tsc", "--noEmit", "--pretty", "false", "{file}"] }
```

## C/C++ errors reference the wrong flags or includes

Without a `compile_commands.json` the fallback is a bare `gcc -fsyntax-only {file}`, which knows
nothing about your include paths. Generate a compile database (CMake: `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`;
`bear` for Makefiles) and `clangd --check` is used instead.

## The block is truncated

`max_lines` caps the appended lines (default 30) and the rest is summarised as `… N more`. Raise it
if you want everything, but a long block usually means an earlier error cascaded.

## `[diagnostics] hook failed …` in the OpenCode log

Something inside the hook threw. The tool result passed through unchanged. Open an issue with the
log line and the tool call that triggered it.
