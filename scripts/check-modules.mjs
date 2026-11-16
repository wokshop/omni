// Module boundaries (ADR 0035 decision 4). Fails when code crosses a module's edge:
//
// 1. A module's private folder (`packages/db/src/<module>/`) is imported only by that module.
//    Everything else goes through its surface file, `packages/db/src/<module>.ts`.
// 2. A module's tables (`packages/db/src/schema/<module>.ts`) are named only by that module. A
//    schema file may name them in a foreign key; nothing else selects from them, even in a join.
//    A `legacy` module's tables still share a file with platform tables, so until it moves only
//    other modules are held to this for it.
// 3. A module imports another module's code only when it declares it in `uses`, and then only its
//    surface file and contract: CRM may use Mail and Storage, which know nothing of each other.
// 4. A module's Worker folder (`apps/worker/src/<module>/`) is imported only by that module, a
//    module that uses it, and the files that register modules (`app.ts`, `modules.ts`, `mcp/`).
// 5. A laid-out module's tables are named `<module>_*`.
//
// Tests are not checked: a leak test sets up rows the way it must. Files that predate the rule
// are listed in DEBT; an entry that stops failing must be removed, so the list only shrinks.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * The modules, what each may use, and files that belong to one but predate its layout (they sit
 * flat in a package until their rename-only move, ADR 0035 "Rollout" steps 4 and 5).
 */
export const MODULES = {
  mail: {
    uses: [],
    legacy: true,
    files: [
      "packages/db/src/ai-helpdesk.ts",
      "packages/db/src/ai-jobs.ts",
      "packages/db/src/ai-settings.ts",
      "packages/db/src/compose.ts",
      "packages/db/src/conversation-core.ts",
      "packages/db/src/conversation-notes.ts",
      "packages/db/src/conversation-tags.ts",
      "packages/db/src/conversations.ts",
      "packages/db/src/customers.ts",
      "packages/db/src/drafts.ts",
      "packages/db/src/forwarding.ts",
      "packages/db/src/handoff.ts",
      "packages/db/src/inbox-admin.ts",
      "packages/db/src/library.ts",
      "packages/db/src/mail-sync.ts",
      "packages/db/src/mailbox-credentials.ts",
      "packages/db/src/mailbox-teams.ts",
      "packages/db/src/member-mail.ts",
      "packages/db/src/pending-mail-events.ts",
      "packages/db/src/placement.ts",
      "packages/db/src/sla.ts",
      "packages/db/src/system.ts",
      "packages/db/src/thread-filters.ts",
      "packages/db/src/thread-merge.ts",
      "packages/db/src/workspace-mailboxes.ts",
      "packages/db/src/workspace-members.ts",
      "packages/db/src/writers.ts",
    ],
  },
  storage: {
    uses: [],
    legacy: false,
    files: [
      "apps/worker/src/storage.ts",
      "apps/worker/src/storage-billing.ts",
      "apps/worker/src/storage-cron.ts",
      "apps/worker/src/routes/storage.ts",
      "apps/worker/src/routes/storage-changes.ts",
      "apps/worker/src/routes/storage-http.ts",
      "apps/worker/src/routes/storage-shared.ts",
      "apps/worker/src/routes/storage-sharing.ts",
      "apps/worker/src/routes/storage-uploads.ts",
    ],
  },
  crm: { uses: ["mail", "storage"], legacy: false, files: [] },
};

/** Files that register every module, so they may import any module's Worker folder. */
const REGISTRARS = ["apps/worker/src/app.ts", "apps/worker/src/modules.ts", "apps/worker/src/mcp/"];

/** Files that broke a rule before it existed: `file` may break `rule`. Only ever shrinks. */
export const DEBT = [
  // The abandoned sign-up sweep asks whether a person holds files or grants inside its query.
  { file: "packages/db/src/abandoned-sign-ups.ts", rule: "tables" },
];

const SOURCE = /^(packages\/[^/]+\/src|apps\/(worker|mail)\/src)\/.*\.(ts|tsx|mts)$/;
const TEST = /(\.test\.|\/e2e\/)/;

/** Bare package specifiers that resolve inside the paths this check knows. */
const PACKAGES = {
  "@omni/db": "packages/db/src/index.ts",
  "@omni/db/schema": "packages/db/src/schema/index.ts",
  "@omni/contracts": "packages/contracts/src/index.ts",
};

/** The module a file belongs to, and which part of it, or null for platform code. */
export function ownerOf(file, modules = MODULES) {
  for (const [name, module] of Object.entries(modules)) {
    if (module.files.includes(file)) return { module: name, part: "legacy" };
    if (file === `packages/db/src/${name}.ts`) return { module: name, part: "surface" };
    if (file.startsWith(`packages/db/src/${name}/`)) return { module: name, part: "private" };
    if (file === `packages/db/src/schema/${name}.ts`) return { module: name, part: "schema" };
    if (file === `packages/contracts/src/${name}.ts`) return { module: name, part: "contract" };
    if (file.startsWith(`apps/worker/src/${name}/`)) return { module: name, part: "worker" };
  }
  return null;
}

/**
 * Every static and dynamic import or re-export in a source: its specifier, the names it takes
 * from that module (`*` for all of it) and the local name each is bound to.
 */
export function importsOf(source) {
  const found = [];
  const STATIC = /\b(?:import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const [, , clause, specifier] of source.matchAll(STATIC)) {
    const bindings = bindingsOf(clause);
    found.push({ specifier, bindings, names: bindings.map((b) => b.imported) });
  }
  for (const [, specifier] of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push({ specifier, bindings: [{ imported: "*", local: null }], names: ["*"] });
  }
  for (const [, specifier] of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
    found.push({ specifier, bindings: [], names: [] });
  }
  return found;
}

/** What an import clause binds: `{ a, b as c }` gives a→a and b→c; `* as x` gives *→x. */
function bindingsOf(clause) {
  const braces = clause.match(/\{([\s\S]*)\}/);
  const bindings = braces
    ? braces[1]
        .split(",")
        .map((part) => part.trim().replace(/^type\s+/, ""))
        .filter(Boolean)
        .map((part) => {
          const [imported, local = imported] = part.split(/\s+as\s+/).map((x) => x.trim());
          return { imported, local };
        })
    : [];
  const outside = clause.replace(/\{[\s\S]*\}/, "");
  const star = outside.match(/\*\s*(?:as\s+(\w+))?/);
  if (star) bindings.push({ imported: "*", local: star[1] ?? null });
  return bindings;
}

/**
 * Where each name a barrel exports is defined: name → file, following `export *`,
 * `export { a as b } from` and `export * as x from` through the files given.
 */
export function exportOrigins(files, entry, seen = new Set()) {
  const origins = new Map();
  const source = files.get(entry);
  if (!source || seen.has(entry)) return origins;
  seen.add(entry);
  const DECLARED =
    /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+(\w+)/gm;
  for (const [, name] of source.matchAll(DECLARED)) origins.set(name, entry);
  const REEXPORT = /\bexport\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const [, clause, specifier] of source.matchAll(REEXPORT)) {
    const target = resolve(entry, specifier);
    if (!target) continue;
    for (const { imported, local } of bindingsOf(clause)) {
      if (imported !== "*") {
        const inner = exportOrigins(files, target, seen).get(imported);
        origins.set(local, inner ?? target);
      } else if (local) origins.set(local, target);
      else for (const [name, file] of exportOrigins(files, target, seen)) origins.set(name, file);
    }
  }
  return origins;
}

/** The repository path an import specifier points at, or null when it leaves the checked code. */
export function resolve(from, specifier) {
  if (specifier in PACKAGES) return PACKAGES[specifier];
  if (!specifier.startsWith(".")) return null;
  return normalize(join(dirname(from), specifier));
}

/** Each laid-out module's tables: the exported identifier and its SQL name. */
export function tablesOf(files, modules = MODULES) {
  const tables = new Map();
  for (const name of Object.keys(modules)) {
    const source = files.get(`packages/db/src/schema/${name}.ts`);
    if (!source) continue;
    const TABLE = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*["']([^"']+)["']/g;
    for (const [, identifier, sqlName] of source.matchAll(TABLE)) {
      tables.set(identifier, { module: name, sqlName });
    }
  }
  return tables;
}

/**
 * The tables a file names: imported from a schema path, or read as `<x>.<table>` where `x` is
 * `schema` or any name the file bound the schema to (`schema as s`, `* as s`).
 */
function tablesNamedBy(file, source, tables) {
  const named = new Set();
  const aliases = new Set(["schema"]);
  for (const { specifier, bindings } of importsOf(source)) {
    const target = resolve(file, specifier);
    for (const { imported, local } of bindings) {
      if (target === "packages/db/src/index.ts" && imported === "schema") aliases.add(local);
      if (target?.startsWith("packages/db/src/schema/") && imported === "*" && local) {
        aliases.add(local);
      }
    }
  }
  for (const { specifier, names } of importsOf(source)) {
    const target = resolve(file, specifier);
    if (!target?.startsWith("packages/db/src/schema/")) continue;
    // `* as x` of a module's own schema file names all its tables; of the barrel, `x.<table>` does.
    const all = [...tables].filter(([, t]) => target === `packages/db/src/schema/${t.module}.ts`);
    for (const name of names) {
      if (name === "*") all.forEach(([identifier]) => named.add(identifier));
      else if (tables.has(name)) named.add(name);
    }
  }
  for (const alias of aliases) {
    const access = new RegExp(`(?<![\\w.])${alias}\\.(\\w+)`, "g");
    for (const [, identifier] of source.matchAll(access)) {
      if (tables.has(identifier)) named.add(identifier);
    }
  }
  return [...named];
}

/** Barrels a module may import from, whose names are traced back to the file defining them. */
const BARRELS = ["packages/db/src/index.ts", "packages/contracts/src/index.ts"];

/**
 * Names a module file takes from a barrel that belong to a module it does not declare in
 * `uses`: `import { recordCustomer } from "../index.ts"` is still an import of Mail.
 */
function barrelProblems(file, source, owner, origins, modules) {
  if (!owner) return [];
  const foreign = new Set();
  for (const { specifier, names } of importsOf(source)) {
    const barrel = resolve(file, specifier);
    if (!BARRELS.includes(barrel)) continue;
    for (const name of names) {
      const origin = origins(barrel).get(name);
      const to = origin && ownerOf(origin, modules);
      if (!to || to.module === owner.module || to.part === "schema") continue;
      if (!modules[owner.module].uses.includes(to.module)) foreign.add(`${name} (${to.module})`);
    }
  }
  return foreign.size ? [{ file, rule: "uses", message: MESSAGES.barrel([...foreign]) }] : [];
}

/** Whether `importer` may import `target`, by rules 1, 3 and 4; the rule broken, or null. */
function importProblem(importer, target, modules) {
  const to = ownerOf(target, modules);
  if (!to) return null;
  const from = ownerOf(importer, modules);
  if (from?.module === to.module) return null;
  if (to.part === "schema") return null; // rule 2 judges what is named from it
  const registrar = REGISTRARS.some((path) =>
    path.endsWith("/") ? importer.startsWith(path) : importer === path,
  );
  if (to.part === "worker" && registrar) return null;
  if (to.part === "private") return "private";
  if (!from) return to.part === "worker" ? "worker" : null;
  // What is left is a surface, a contract, a Worker folder or a not-yet-moved file.
  return modules[from.module].uses.includes(to.module) ? null : "uses";
}

const MESSAGES = {
  private: (target) =>
    `imports ${target}, a module's private folder; go through its surface file instead`,
  uses: (target) =>
    `imports ${target} from another module it does not declare in \`uses\` (scripts/check-modules.mjs)`,
  worker: (target) =>
    `imports ${target}, another module's Worker folder; call that module's door in @omni/db instead`,
  tables: (tables) =>
    `names another module's tables (${tables.join(", ")}); read them through that module's surface file`,
  barrel: (names) =>
    `imports ${names.join(", ")} through a barrel from a module it does not declare in \`uses\``,
  naming: (table) => `table ${table} must be named <module>_* (ADR 0035 decision 3)`,
};

/**
 * Every boundary problem in `files` (a map of repository path to source). Returns
 * `{ file, rule, message }` entries, debt included; `check` filters debt out.
 */
export function findProblems(files, modules = MODULES) {
  const tables = tablesOf(files, modules);
  const problems = [];
  const cache = new Map();
  const origins = (barrel) => {
    if (!cache.has(barrel)) cache.set(barrel, exportOrigins(files, barrel));
    return cache.get(barrel);
  };
  for (const [file, source] of files) {
    if (TEST.test(file) || !SOURCE.test(file)) continue;
    const owner = ownerOf(file, modules);
    problems.push(...barrelProblems(file, source, owner, origins, modules));
    for (const { specifier } of importsOf(source)) {
      const target = resolve(file, specifier);
      const rule = target && importProblem(file, target, modules);
      if (rule) problems.push({ file, rule, message: MESSAGES[rule](target) });
    }
    if (!file.startsWith("packages/db/src/schema/")) {
      // Platform code may still name a module that is not laid out yet (its tables share a
      // schema file with platform ones until it moves); other modules never may.
      const foreign = tablesNamedBy(file, source, tables).filter((identifier) => {
        const table = tables.get(identifier);
        return table.module !== owner?.module && (owner || !modules[table.module].legacy);
      });
      if (foreign.length)
        problems.push({ file, rule: "tables", message: MESSAGES.tables(foreign) });
    }
  }
  for (const [identifier, { module, sqlName }] of tables) {
    if (!modules[module].legacy && !sqlName.startsWith(`${module}_`)) {
      const file = `packages/db/src/schema/${module}.ts`;
      problems.push({
        file,
        rule: "naming",
        message: MESSAGES.naming(`${identifier} ("${sqlName}")`),
      });
    }
  }
  return problems;
}

/** The problems that are not debt, and the debt entries that no longer fail. */
export function check(files, modules = MODULES, debt = DEBT) {
  const problems = findProblems(files, modules);
  const isDebt = (p) => debt.some((d) => d.file === p.file && d.rule === p.rule);
  const stale = debt.filter((d) => !problems.some((p) => p.file === d.file && p.rule === d.rule));
  return { problems: problems.filter((p) => !isDebt(p)), stale };
}

function main() {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => SOURCE.test(file) && !TEST.test(file));
  const files = new Map();
  for (const path of paths) {
    try {
      files.set(path, readFileSync(path, "utf8"));
    } catch {
      // deleted in the working tree
    }
  }
  const { problems, stale } = check(files);
  const lines = [
    ...problems.map((p) => `${p.file}: ${p.message}`),
    ...stale.map(
      (d) =>
        `scripts/check-modules.mjs: DEBT lists ${d.file} (${d.rule}), which no longer fails; remove it`,
    ),
  ];
  if (lines.length > 0) {
    console.error(lines.join("\n"));
    process.exit(1);
  }
}

if (import.meta.main) main();
