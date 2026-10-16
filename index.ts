// Type-only import: the plugin directory may have no node_modules of its own, so nothing is imported at runtime.
// Plugin.define is an identity function, so the plain object is the same definition.
import type { Plugin } from "@opencode/plugin"
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"

type Argv = readonly string[]
export type CheckerSpec = Argv | readonly Argv[] | null
type TextContent = { readonly type: "text"; readonly text: string }
type Content = TextContent | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
type Result = { readonly output?: unknown; readonly content?: string | ReadonlyArray<Content>; readonly metadata?: unknown }

export type Options = {
  checkers: Record<string, CheckerSpec>
  timeoutMs: number
  maxLines: number
  pathPrepend: string[]
}

export type Run = { code: number | null; out: string; failure?: string }
export type Plan = { argv: string[]; cwd: string }

const EDIT_TOOLS = new Set(["write", "edit", "patch"])
const C_FAMILY = (compiler: string): Argv[] => [
  ["clangd", "--check={file}", "--check-locations=false", "--compile-commands-dir={compile_commands_dir}"],
  [compiler, "-fsyntax-only", "-fdiagnostics-color=never", "-fno-diagnostics-show-caret", "{file}"],
]

export const DEFAULT_CHECKERS: Record<string, CheckerSpec> = {
  rb: ["ruby", "-wc", "{file}"],
  js: ["node", "--check", "{file}"],
  mjs: ["node", "--check", "{file}"],
  cjs: ["node", "--check", "{file}"],
  ts: ["tsc", "--noEmit", "--pretty", "false", "-p", "{tsconfig_dir}"],
  tsx: ["tsc", "--noEmit", "--pretty", "false", "-p", "{tsconfig_dir}"],
  mts: ["tsc", "--noEmit", "--pretty", "false", "-p", "{tsconfig_dir}"],
  c: C_FAMILY("gcc"),
  h: C_FAMILY("gcc"),
  cc: C_FAMILY("g++"),
  cpp: C_FAMILY("g++"),
  cxx: C_FAMILY("g++"),
  hpp: C_FAMILY("g++"),
  hh: C_FAMILY("g++"),
}

const PLACEHOLDERS: Record<string, (file: string) => string | undefined> = {
  file: (file) => file,
  dir: (file) => path.dirname(file),
  tsconfig_dir: (file) => findUp(path.dirname(file), "tsconfig.json"),
  compile_commands_dir: (file) => findUp(path.dirname(file), "compile_commands.json"),
}

const FILTERS: Record<string, (lines: string[], file: string, cwd: string) => string[]> = {
  ruby: (lines) => lines.filter((l) => l !== "Syntax OK").map((l) => l.replace(/^\S*ruby: /, "")),
  node: (lines) => lines.filter((l) => !/^\s+at /.test(l) && !/^Node\.js v/.test(l)),
  tsc: filterTsc,
  gcc: filterGcc,
  "g++": filterGcc,
  cc: filterGcc,
  "c++": filterGcc,
  clang: filterGcc,
  "clang++": filterGcc,
  clangd: filterClangd,
}

const PROJECT_WIDE = new Set(["tsc"])

export function resolveOptions(raw: Readonly<Record<string, any>> = {}): Options {
  const overrides = Object.fromEntries(
    Object.entries((raw.checkers ?? {}) as Record<string, CheckerSpec>).map(([ext, spec]) => [ext.replace(/^\./, ""), spec]),
  )
  return {
    checkers: { ...DEFAULT_CHECKERS, ...overrides },
    timeoutMs: Number(raw.timeout_ms ?? 15000),
    maxLines: Number(raw.max_lines ?? 30),
    pathPrepend: ((raw.path_prepend ?? []) as string[]).map(expandHome),
  }
}

export function targetFiles(tool: string, input: unknown, result: Result, baseDir: string): string[] {
  if (!EDIT_TOOLS.has(tool)) return []
  const paths = tool === "patch" ? patchPaths(input, result) : [stringField(input, "path") ?? stringField(input, "filePath")]
  const files = paths.flatMap((p) => (p ? [path.resolve(baseDir, p)] : []))
  return [...new Set(files)].filter((f) => existsSync(f))
}

export async function check(file: string, options: Options, baseDir: string): Promise<string | undefined> {
  const ext = path.extname(file).slice(1).toLowerCase()
  const plan = planFor(file, options.checkers[ext])
  if (!plan) return
  const name = path.basename(plan.argv[0])
  const rel = displayPath(file, baseDir)
  const run = await execute(plan, options)
  if (run.failure) return `[diagnostics] ${name} skipped on ${rel}: ${run.failure}`
  const lines = findings(name, run, file, plan.cwd)
  if (lines.length === 0) return
  return [`[diagnostics] ${name} on ${rel}:`, ...cap(lines, options.maxLines).map((l) => l.replaceAll(file, rel))].join("\n")
}

export function appendText(result: Result, text: string): Result {
  const block: TextContent = { type: "text", text }
  if (typeof result.content === "string") return { ...result, content: [{ type: "text", text: result.content }, block] }
  if (result.content) return { ...result, content: [...result.content, block] }
  const output = result.output === undefined ? [] : [{ type: "text" as const, text: JSON.stringify(result.output) }]
  return { ...result, content: [...output, block] }
}

export function planFor(file: string, spec: CheckerSpec | undefined): Plan | undefined {
  if (!spec || spec.length === 0) return
  const candidates = (typeof spec[0] === "string" ? [spec] : spec) as readonly Argv[]
  for (const argv of candidates) {
    const plan = substitute(argv, file)
    if (plan) return plan
  }
}

function substitute(argv: Argv, file: string): Plan | undefined {
  const resolved: Record<string, string> = {}
  for (const key of new Set(argv.flatMap((arg) => [...arg.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))) {
    const value = PLACEHOLDERS[key]?.(file)
    if (value === undefined) return
    resolved[key] = value
  }
  const out = argv.map((arg) => arg.replace(/\{(\w+)\}/g, (_, key: string) => resolved[key]))
  const cwd = resolved.tsconfig_dir ?? resolved.compile_commands_dir ?? findUp(path.dirname(file), ".git") ?? path.dirname(file)
  return { argv: [localBin(out[0], cwd) ?? out[0], ...out.slice(1)], cwd }
}

function execute(plan: Plan, options: Options): Promise<Run> {
  const env = { ...process.env, PATH: [...options.pathPrepend, process.env.PATH ?? ""].join(path.delimiter), NO_COLOR: "1" }
  return new Promise((resolve) => {
    execFile(
      plan.argv[0],
      plan.argv.slice(1),
      { cwd: plan.cwd, env, timeout: options.timeoutMs, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const out = `${stdout}\n${stderr}`
        if (!error) return resolve({ code: 0, out })
        const err = error as NodeJS.ErrnoException & { killed?: boolean; code?: string | number }
        if (err.code === "ENOENT") return resolve({ code: null, out, failure: "not found on PATH" })
        if (err.killed) return resolve({ code: null, out, failure: `timed out after ${options.timeoutMs}ms` })
        resolve({ code: typeof err.code === "number" ? err.code : 1, out })
      },
    )
  })
}

export function findings(name: string, run: Run, file: string, cwd: string): string[] {
  const lines = run.out.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "")
  const filtered = (FILTERS[name] ?? ((l: string[]) => l))(lines, file, cwd)
  if (filtered.length > 0 || run.code === 0 || PROJECT_WIDE.has(name)) return filtered
  return lines
}

function filterTsc(lines: string[], file: string, cwd: string): string[] {
  const kept: string[] = []
  let keeping = false
  for (const line of lines) {
    const located = line.match(/^(.+?)\(\d+,\d+\): /)
    if (located) keeping = path.resolve(cwd, located[1]) === file
    else if (/^error TS\d+/.test(line)) keeping = true
    else if (!/^\s/.test(line)) keeping = false
    if (keeping) kept.push(line)
  }
  return kept
}

function filterGcc(lines: string[]): string[] {
  return lines.filter((l) => /^\S.*?:\d+(:\d+)?: (fatal error|error|warning|note): /.test(l))
}

function filterClangd(lines: string[], file: string): string[] {
  return lines.flatMap((l) => {
    const m = l.match(/^E\[[^\]]*\] \[([^\]]*)\] Line (\d+): (.*)$/)
    return m ? [`${file}:${m[2]}: [${m[1]}] ${m[3]}`] : []
  })
}

export function patchPaths(input: unknown, result: Result): (string | undefined)[] {
  const applied = (result.output as { applied?: { type?: string; target?: string }[] } | undefined)?.applied
  if (Array.isArray(applied)) return applied.filter((a) => a.type !== "delete").map((a) => a.target)
  const text = stringField(input, "patchText") ?? ""
  return [...text.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)].map((m) => m[1].trim())
}

function stringField(value: unknown, key: string): string | undefined {
  const field = (value as Record<string, unknown> | undefined)?.[key]
  return typeof field === "string" ? field : undefined
}

function findUp(dir: string, name: string): string | undefined {
  for (let current = dir; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, name))) return current
    if (path.dirname(current) === current) return
  }
}

function localBin(command: string, cwd: string): string | undefined {
  if (command.includes(path.sep)) return
  const dir = findUp(cwd, path.join("node_modules", ".bin", command))
  return dir && path.join(dir, "node_modules", ".bin", command)
}

export function cap(lines: string[], max: number): string[] {
  return lines.length <= max ? lines : [...lines.slice(0, max), `… ${lines.length - max} more`]
}

function displayPath(file: string, baseDir: string): string {
  const rel = path.relative(baseDir, file)
  return rel.startsWith("..") || path.isAbsolute(rel) ? file : rel
}

export function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p
}

const plugin: Plugin.Plugin = {
  id: "diagnostics",
  async setup(ctx) {
    const options = resolveOptions(ctx.options)
    const baseDir = ctx.location.directory
    await ctx.tool.hook("execute.after", async (event) => {
      if (event.status !== "completed") return
      try {
        const files = targetFiles(event.tool, event.input, event.result, baseDir)
        const blocks = (await Promise.all(files.map((f) => check(f, options, baseDir)))).filter((b) => b !== undefined)
        if (blocks.length > 0) event.result = appendText(event.result, blocks.join("\n\n")) as typeof event.result
      } catch (error) {
        console.error("[diagnostics] hook failed", error)
      }
    })
  },
}

export default plugin
