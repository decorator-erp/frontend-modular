import { describe, expect, it } from 'vitest';
import type * as TS from 'typescript';

/**
 * crmp A-2 closing check: no URL string in the projects data layer names a route the backend removed
 * or never had (gap table `008b-2-009c-backend-gaps.md` REMOVED and EXISTS-with-mapping rows). Only
 * string and template literals are scanned, never comments, so a doc comment naming the old route
 * for history does not trip it.
 */

interface NodeFs {
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
  readFileSync(path: string, encoding: 'utf8'): string;
}

async function nodeImport<T>(name: string): Promise<T> {
  return (await import(/* @vite-ignore */ name)) as T;
}

async function typescript(): Promise<typeof TS> {
  const mod = await nodeImport<typeof TS & { default?: typeof TS }>('typescript');
  return mod.default ?? mod;
}

const ROOT = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
// R1-F10: approvals/data too — it held the last PUT /project-stages|tasks/{id}/reject.
// Sync W1-1: projects/ui too (recursively) — a component posted FormData to `${apiUrl}/task-attachments`.
const DATA_DIRS = [
  `${ROOT}/src/app/modules/projects/data`,
  `${ROOT}/src/app/modules/approvals/data`,
  `${ROOT}/src/app/modules/projects/ui`,
];

/** Every non-spec `.ts` file under `dir`, recursively, as a path relative to it. */
function tsFiles(fs: NodeFs, dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = `${dir}/${name}`;
    if (fs.statSync(full).isDirectory()) return tsFiles(fs, full, `${prefix}${name}/`);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [`${prefix}${name}`] : [];
  });
}

/** A literal that builds the URL off `environment.apiUrl` is scanned from the path after it. */
const API_URL_PREFIX = /^\$\{[^}]*apiUrl\}/;

/** Old route prefixes and the row that removed or moved each one. */
const REMOVED: readonly [RegExp, string][] = [
  [/^\/task-attachments\b/, 'P-88..93 → Documents task routes'],
  [/^\/task-comments\b/, 'P-94..97 → /projects/{pid}/tasks/{tid}/comments'],
  [/^\/project-subtasks\b/, 'P-30..35 → /projects/{pid}/tasks/{tid}/sub-tasks'],
  [/^\/stage-gate-conditions\b/, 'P-71..75 → /projects/{pid}/stages/{sid}/gates'],
  [/^\/task-gate-conditions\b/, 'P-98..102 → /projects/{pid}/tasks/{tid}/gates'],
  [/^\/stage-teams\b/, 'P-78..87 → /projects/{pid}/teams'],
  [/^\/project-members\b/, 'E1 → /projects/{pid}/members'],
  [/^\/projects\/search\b/, 'E8 → GET /projects?search'],
  [/^\/projects\/mine\b/, 'E8 → GET /projects?mine'],
  [/^\/project-tasks\/(by-project|by-stage)\b/, 'P-36/37 → /projects/{pid}/tasks'],
  [/^\/project-tasks\/?$/, 'E3 → POST /projects/{pid}/tasks'],
  [
    /^\/project-tasks\/\$\{[^}]+\}(\/(details|assign|start|complete|approve|reject|request-approval))?$/,
    'P-38..44 → /projects/{pid}/tasks/{tid}',
  ],
  [/^\/project-stages\/?$/, 'E2 → POST /projects/{pid}/stages'],
  [
    /^\/project-stages\/\$\{[^}]+\}(\/(details|activate|complete|approve|reject))?$/,
    'P-20..25 → /projects/{pid}/stages/{sid}',
  ],
  [/budget-summary/, 'hint → /projects/{id}/financial/summary'],
];

async function urlLiterals(): Promise<{ file: string; url: string }[]> {
  const fs = await nodeImport<NodeFs>('node:fs');
  const ts = await typescript();
  const out: { file: string; url: string }[] = [];
  for (const dir of DATA_DIRS) {
    for (const file of tsFiles(fs, dir)) {
      const code = fs.readFileSync(`${dir}/${file}`, 'utf8');
      const src = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const visit = (node: TS.Node): void => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateExpression(node)
        ) {
          const text = node.getText(src).slice(1, -1).replace(API_URL_PREFIX, '');
          if (text.startsWith('/')) out.push({ file, url: text });
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(src);
    }
  }
  return out;
}

describe('projects data layer — no removed backend route remains (crmp A-2)', () => {
  it('finds the URL literals (sanity)', async () => {
    const urls = await urlLiterals();
    expect(urls.some((u) => u.url.startsWith('/projects/${projectId}/tasks'))).toBe(true);
  });

  it('calls no route the gap table removed or moved', async () => {
    const offenders = (await urlLiterals()).flatMap(({ file, url }) =>
      REMOVED.filter(([re]) => re.test(url)).map(([, row]) => `${file}: ${url} (${row})`),
    );
    expect(offenders).toEqual([]);
  });
});
