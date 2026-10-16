# Configuration

Options go in the plugin's `plugins[]` entry in `opencode.jsonc`:

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

A plugin cloned into `~/.config/opencode/plugins/` without a `plugins[]` entry runs with the
defaults below.

| key | default | meaning |
|---|---|---|
| `checkers` | built-in map (`rb`, `js`/`mjs`/`cjs`, `ts`/`tsx`/`mts`, `c`/`h`, `cc`/`cpp`/`cxx`/`hpp`/`hh`) | extension → argv (or array of argvs, first found wins). `null` disables an extension. Placeholders: `{file}`, `{dir}`, `{tsconfig_dir}`, `{compile_commands_dir}`. |
| `timeout_ms` | `15000` | per-checker wall clock; a checker that runs longer is killed and reported as timed out |
| `max_lines` | `30` | cap on appended diagnostic lines; the remainder is summarised as `… N more` |
| `path_prepend` | `[]` | directories put in front of `PATH` for the checkers (`~` expands) |

## Checkers

`checkers` is merged over the defaults, so one key only changes that extension. Keys are file
extensions without the dot (a leading dot is tolerated). Each value is one of:

- an argv array, e.g. `["python3", "-m", "py_compile", "{file}"]`;
- an array of argv arrays — candidates are tried in order and the first whose placeholders all
  resolve is used (this is how the C-family default prefers `clangd` when a `compile_commands.json`
  exists and falls back to `gcc` otherwise);
- `null` to disable checking for that extension.

Placeholders:

| placeholder | value |
|---|---|
| `{file}` | absolute path of the edited file |
| `{dir}` | its directory |
| `{tsconfig_dir}` | nearest directory upwards containing `tsconfig.json`; unresolvable without one, so the candidate is skipped |
| `{compile_commands_dir}` | nearest directory upwards containing `compile_commands.json`; same skip rule |

The checker runs with its working directory set to the `tsconfig_dir` or `compile_commands_dir` when
one was resolved, else the nearest git root, else the file's directory. If `node_modules/.bin/<command>`
exists in that directory or above it, that local binary is preferred over `PATH` (so a project's own
`tsc` wins).

## Default checkers

| extension | argv |
|---|---|
| `rb` | `ruby -wc {file}` |
| `js`, `mjs`, `cjs` | `node --check {file}` |
| `ts`, `tsx`, `mts` | `tsc --noEmit --pretty false -p {tsconfig_dir}` |
| `c`, `h` | `clangd --check={file} --check-locations=false --compile-commands-dir={compile_commands_dir}`, then `gcc -fsyntax-only -fdiagnostics-color=never -fno-diagnostics-show-caret {file}` |
| `cc`, `cpp`, `cxx`, `hpp`, `hh` | same as above with `g++` |

Output filtering is keyed on the command's basename: `ruby`, `node`, `tsc`, `gcc`/`g++`/`cc`/`c++`/
`clang`/`clang++` and `clangd` have filters that drop noise (see [SDD.md](SDD.md)); any other
command's output is appended as is when it exits non-zero.
