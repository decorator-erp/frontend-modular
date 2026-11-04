import { describe, expect, it } from 'vitest';
import type * as TS from 'typescript';

/**
 * crm-prod R2b-7 / FINDING-P2-15: a `projects.scope.*` error code is spelled once, in the files
 * that define codes — every other source reads it from `SCOPE_ERROR_CODES`, so a rename on the
 * backend is one edit here and a missed reader cannot drift. Scans the sources, the way a lint rule
 * would.
 *
 * FINDING-P2-20: the `.ts` scan reads string tokens from the TypeScript parser, not a comment-
 * stripping regex — a `/*` inside a string (`'/crm/public/*'`) or a line comment opened a fake block
 * comment there that hid the live code after it. Templates (`.html`, R2c-2) carry no comments a code
 * would hide in, so a plain substring search is enough for them.
 */

interface NodeFs {
  readdirSync(path: string, options: { recursive: true }): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

/** The unit-test runner is Node; the module name is a variable so the bundler leaves it alone. */
async function nodeImport<T>(name: string): Promise<T> {
  return (await import(/* @vite-ignore */ name)) as T;
}

const nodeFs = (): Promise<NodeFs> => nodeImport<NodeFs>('node:fs');

/** The compiler API (a devDependency); `default` when loaded as CommonJS through ESM. */
async function typescript(): Promise<typeof TS> {
  const mod = await nodeImport<typeof TS & { default?: typeof TS }>('typescript');
  return mod.default ?? mod;
}

const ROOT = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
const APP = `${ROOT}/src/app`;

/**
 * Files that legitimately spell the codes:
 * - `platform/errors/error-catalog.ts` defines `SCOPE_ERROR_CODES` and the EN/AR messages keyed by
 *   code;
 * - `platform/http/concurrency.ts` defines the set of concurrent-update codes, one per module
 *   (`projects.scope.ConcurrentUpdate` is not a `SCOPE_ERROR_CODES` member — it is a conflict
 *   code, defined there alongside the CRM ones).
 * Specs are excluded: their fixtures spell the wire value on purpose.
 */
const DEFINERS = new Set(['platform/errors/error-catalog.ts', 'platform/http/concurrency.ts']);

const PREFIX = 'projects.scope.';

/** Every string or template-text token in `code` that spells a scope code. Comments never count. */
function scanTs(ts: typeof TS, file: string, code: string): string[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: TS.Node): void => {
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      node.text.includes(PREFIX)
    ) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Templates: every line that spells a scope code. */
function scanHtml(code: string): string[] {
  return code
    .split('\n')
    .filter((line) => line.includes(PREFIX))
    .map((line) => line.trim());
}

describe('projects.scope.* code literals (R2b-7)', () => {
  it('a `/*` inside a string does not hide a later literal (FINDING-P2-20)', async () => {
    const ts = await typescript();
    const fixture = "const a = '/x/*';\nconst b = 'projects.scope.Foo';\n/** doc */\n";
    expect(scanTs(ts, 'fixture.ts', fixture)).toEqual(['projects.scope.Foo']);
  });

  it('a `/*` inside a line comment does not hide a later literal (FINDING-P2-20)', async () => {
    const ts = await typescript();
    const fixture = "// see /api/*\nconst b = 'projects.scope.Foo';\n/** doc */\n";
    expect(scanTs(ts, 'fixture.ts', fixture)).toEqual(['projects.scope.Foo']);
  });

  it('finds the code in template text and double quotes, never in a comment', async () => {
    const ts = await typescript();
    const fixture = [
      '// projects.scope.InComment',
      '/* projects.scope.InBlock */',
      'const a = "projects.scope.Double";',
      'const b = `projects.scope.NoSub`;',
      'const c = `${x}projects.scope.Tail`;',
      'const d = `projects.scope.Head${x}`;',
    ].join('\n');
    expect(scanTs(ts, 'fixture.ts', fixture)).toEqual([
      'projects.scope.Double',
      'projects.scope.NoSub',
      'projects.scope.Tail',
      'projects.scope.Head',
    ]);
  });

  it('finds the code in a template (R2c-2)', () => {
    expect(scanHtml('<p>{{ x }}</p>\n  <p [attr.x]="\'projects.scope.Foo\'"></p>\n')).toEqual([
      `<p [attr.x]="'projects.scope.Foo'"></p>`,
    ]);
  });

  it('appear only in the files that define codes', async () => {
    const [fs, ts] = await Promise.all([nodeFs(), typescript()]);
    const offences = fs
      .readdirSync(APP, { recursive: true })
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !DEFINERS.has(f))
      .flatMap((f) => {
        if (f.endsWith('.html')) {
          return scanHtml(fs.readFileSync(`${APP}/${f}`, 'utf8')).map((m) => `${f}: ${m}`);
        }
        if (!f.endsWith('.ts') || f.endsWith('.spec.ts')) return [];
        return scanTs(ts, f, fs.readFileSync(`${APP}/${f}`, 'utf8')).map((m) => `${f}: ${m}`);
      });
    expect(offences).toEqual([]);
  });

  it('the scan sees the definers (it is not vacuous)', async () => {
    const [fs, ts] = await Promise.all([nodeFs(), typescript()]);
    const file = 'platform/errors/error-catalog.ts';
    expect(scanTs(ts, file, fs.readFileSync(`${APP}/${file}`, 'utf8')).length).toBeGreaterThan(0);
  });
});
