import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  DEFAULT_CHECKERS,
  appendText,
  cap,
  expandHome,
  findings,
  patchPaths,
  planFor,
  resolveOptions,
  targetFiles,
} from "../index"

let root: string

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "diagnostics-test-"))
  mkdirSync(path.join(root, "app", "lib"), { recursive: true })
  mkdirSync(path.join(root, "web", "src"), { recursive: true })
  mkdirSync(path.join(root, "fw", "src"), { recursive: true })
  writeFileSync(path.join(root, "app", "lib", "service.rb"), "puts 1\n")
  writeFileSync(path.join(root, "web", "tsconfig.json"), "{}")
  writeFileSync(path.join(root, "web", "src", "main.ts"), "export const x = 1\n")
  writeFileSync(path.join(root, "fw", "compile_commands.json"), "[]")
  writeFileSync(path.join(root, "fw", "src", "main.c"), "int main(void) { return 0; }\n")
  writeFileSync(path.join(root, "notes.md"), "# notes\n")
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe("resolveOptions", () => {
  test("defaults", () => {
    const o = resolveOptions()
    expect(o.timeoutMs).toBe(15000)
    expect(o.maxLines).toBe(30)
    expect(o.pathPrepend).toEqual([])
    expect(o.checkers).toEqual(DEFAULT_CHECKERS)
  })

  test("merges checker overrides and strips a leading dot", () => {
    const o = resolveOptions({ checkers: { ".py": ["python3", "-m", "py_compile", "{file}"], rb: null } })
    expect(o.checkers.py).toEqual(["python3", "-m", "py_compile", "{file}"])
    expect(o.checkers.rb).toBeNull()
    expect(o.checkers.js).toEqual(DEFAULT_CHECKERS.js)
  })

  test("expands ~ in path_prepend", () => {
    const o = resolveOptions({ path_prepend: ["~/.local/bin", "/opt/bin", "~"] })
    expect(o.pathPrepend).toEqual([path.join(os.homedir(), ".local/bin"), "/opt/bin", os.homedir()])
  })
})

describe("expandHome", () => {
  test("only a leading ~ segment expands", () => {
    expect(expandHome("~/x")).toBe(path.join(os.homedir(), "x"))
    expect(expandHome("~")).toBe(os.homedir())
    expect(expandHome("/a/~/b")).toBe("/a/~/b")
    expect(expandHome("~user/x")).toBe("~user/x")
  })
})

describe("planFor (checker selection)", () => {
  test("ruby: single argv with {file}", () => {
    const file = path.join(root, "app", "lib", "service.rb")
    const plan = planFor(file, DEFAULT_CHECKERS.rb)!
    expect(path.basename(plan.argv[0])).toBe("ruby")
    expect(plan.argv.slice(1)).toEqual(["-wc", file])
    expect(plan.cwd).toBe(path.dirname(file))
  })

  test("typescript: runs from the nearest tsconfig.json", () => {
    const file = path.join(root, "web", "src", "main.ts")
    const plan = planFor(file, DEFAULT_CHECKERS.ts)!
    expect(plan.argv.slice(1)).toEqual(["--noEmit", "--pretty", "false", "-p", path.join(root, "web")])
    expect(plan.cwd).toBe(path.join(root, "web"))
  })

  test("typescript without a tsconfig.json: no plan", () => {
    const file = path.join(root, "app", "lib", "loose.ts")
    expect(planFor(file, DEFAULT_CHECKERS.ts)).toBeUndefined()
  })

  test("c: clangd wins when compile_commands.json exists", () => {
    const file = path.join(root, "fw", "src", "main.c")
    const plan = planFor(file, DEFAULT_CHECKERS.c)!
    expect(path.basename(plan.argv[0])).toBe("clangd")
    expect(plan.argv).toContain(`--compile-commands-dir=${path.join(root, "fw")}`)
    expect(plan.cwd).toBe(path.join(root, "fw"))
  })

  test("c: falls back to gcc without compile_commands.json", () => {
    const file = path.join(root, "app", "lib", "ext.c")
    const plan = planFor(file, DEFAULT_CHECKERS.c)!
    expect(path.basename(plan.argv[0])).toBe("gcc")
    expect(plan.argv.at(-1)).toBe(file)
  })

  test("cpp uses g++", () => {
    const plan = planFor(path.join(root, "app", "x.cpp"), DEFAULT_CHECKERS.cpp)!
    expect(path.basename(plan.argv[0])).toBe("g++")
  })

  test("null or empty spec: no plan", () => {
    expect(planFor(path.join(root, "a.rb"), null)).toBeUndefined()
    expect(planFor(path.join(root, "a.rb"), undefined)).toBeUndefined()
    expect(planFor(path.join(root, "a.rb"), [])).toBeUndefined()
  })

  test("unknown placeholder: no plan", () => {
    expect(planFor(path.join(root, "a.rb"), ["x", "{nope}"])).toBeUndefined()
  })
})

describe("cap (max_lines truncation)", () => {
  test("keeps short lists intact", () => {
    expect(cap(["a", "b"], 2)).toEqual(["a", "b"])
    expect(cap([], 5)).toEqual([])
  })

  test("truncates and reports the remainder", () => {
    const lines = Array.from({ length: 35 }, (_, i) => `line ${i}`)
    const out = cap(lines, 30)
    expect(out).toHaveLength(31)
    expect(out[29]).toBe("line 29")
    expect(out[30]).toBe("… 5 more")
  })
})

describe("findings (per-tool filters)", () => {
  test("ruby drops Syntax OK and the program prefix", () => {
    const run = { code: 1, out: "/usr/bin/ruby: a.rb:3: syntax error, unexpected end\nSyntax OK\n" }
    expect(findings("ruby", run, "a.rb", "/")).toEqual(["a.rb:3: syntax error, unexpected end"])
  })

  test("node drops stack frames and the version footer", () => {
    const run = { code: 1, out: "a.js:1\nfoo(\n    ^\nSyntaxError: Unexpected end of input\n    at wrap\nNode.js v22.0.0\n" }
    expect(findings("node", run, "a.js", "/")).toEqual(["a.js:1", "foo(", "    ^", "SyntaxError: Unexpected end of input"])
  })

  test("tsc keeps only errors located in the checked file", () => {
    const cwd = path.join(root, "web")
    const file = path.join(cwd, "src", "main.ts")
    const run = { code: 2, out: "src/main.ts(1,7): error TS2322: Type 'string' is not assignable.\n  detail\nsrc/other.ts(3,1): error TS1005: ';' expected.\nerror TS18003: No inputs were found.\n" }
    expect(findings("tsc", run, file, cwd)).toEqual([
      "src/main.ts(1,7): error TS2322: Type 'string' is not assignable.",
      "  detail",
      "error TS18003: No inputs were found.",
    ])
  })

  test("gcc keeps located diagnostics only", () => {
    const run = { code: 1, out: "main.c: In function 'main':\nmain.c:2:3: error: expected ';' before '}' token\n" }
    expect(findings("gcc", run, "main.c", "/")).toEqual(["main.c:2:3: error: expected ';' before '}' token"])
  })

  test("clangd lines are rewritten to file:line form", () => {
    const run = { code: 0, out: "I[12:00:00.000] Loading compilation database\nE[12:00:00.001] [expected_semi] Line 2: expected ';'\n" }
    expect(findings("clangd", run, "/src/main.c", "/src")).toEqual(["/src/main.c:2: [expected_semi] expected ';'"])
  })

  test("non-zero exit with nothing matched falls back to the raw output", () => {
    const run = { code: 1, out: "something unexpected\n" }
    expect(findings("gcc", run, "a.c", "/")).toEqual(["something unexpected"])
  })

  test("zero exit with nothing matched stays empty", () => {
    expect(findings("gcc", { code: 0, out: "all good\n" }, "a.c", "/")).toEqual([])
  })
})

describe("targetFiles", () => {
  test("ignores non-edit tools", () => {
    expect(targetFiles("read", { path: path.join(root, "notes.md") }, {}, root)).toEqual([])
  })

  test("resolves write/edit paths against the base dir and drops missing files", () => {
    expect(targetFiles("write", { path: "notes.md" }, {}, root)).toEqual([path.join(root, "notes.md")])
    expect(targetFiles("edit", { filePath: "app/lib/service.rb" }, {}, root)).toEqual([path.join(root, "app", "lib", "service.rb")])
    expect(targetFiles("write", { path: "missing.rb" }, {}, root)).toEqual([])
  })

  test("patch: applied list from the result, deletes excluded", () => {
    const result = { output: { applied: [{ type: "update", target: "notes.md" }, { type: "delete", target: "gone.rb" }] } }
    expect(targetFiles("patch", {}, result, root)).toEqual([path.join(root, "notes.md")])
  })
})

describe("patchPaths", () => {
  test("parses the patch text when the result has no applied list", () => {
    const text = "*** Begin Patch\n*** Add File: a/new.rb\n+x\n*** Update File: b/old.ts\n*** Move to: b/renamed.ts\n*** End Patch\n"
    expect(patchPaths({ patchText: text }, {})).toEqual(["a/new.rb", "b/old.ts", "b/renamed.ts"])
  })
})

describe("appendText", () => {
  test("string content becomes two text blocks", () => {
    const out = appendText({ content: "ok" }, "diag")
    expect(out.content).toEqual([{ type: "text", text: "ok" }, { type: "text", text: "diag" }])
  })

  test("array content is extended", () => {
    const out = appendText({ content: [{ type: "text", text: "a" }] }, "b")
    expect(out.content).toEqual([{ type: "text", text: "a" }, { type: "text", text: "b" }])
  })

  test("bare output is serialised ahead of the block", () => {
    const out = appendText({ output: { n: 1 } }, "b")
    expect(out.content).toEqual([{ type: "text", text: '{"n":1}' }, { type: "text", text: "b" }])
    expect(appendText({}, "b").content).toEqual([{ type: "text", text: "b" }])
  })
})
