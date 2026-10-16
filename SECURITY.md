# Security policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/rojosinalma/opencode-diagnostics/security/advisories/new)
(the Security tab → "Report a vulnerability"). Do not open a public issue. You will get an
acknowledgement within a week and a fix or a statement before any public disclosure.

## Supported versions

Only the latest release receives fixes. Update your clone to the newest `vX.Y.Z` tag before
reporting.

## What the plugin does

opencode-diagnostics runs compiler and syntax checkers (`ruby`, `node`, `tsc`, `clangd`, `gcc`,
or whatever `checkers` configures) on files the agent just edited, inside the OpenCode server
process. Keep in mind:

1. Checker commands come from your own `opencode.jsonc`; the plugin never downloads or installs
   anything.
2. Checkers run with the server's user and environment, with the edited file's project as working
   directory, and a project-local `node_modules/.bin/<command>` is preferred over `PATH`. A
   malicious repository can therefore run code through a checker binary it ships — the same trust
   you already extend to a project whose tests you run.
3. Only the checker's output (capped by `max_lines`) is appended to the tool result; nothing is
   sent anywhere.
