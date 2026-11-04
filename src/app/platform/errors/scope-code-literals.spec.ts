import { describe, expect, it } from 'vitest';

/**
 * crm-prod R2b-7 / FINDING-P2-15: a `projects.scope.*` error code is spelled once, in the files
 * that define codes — every other source reads it from `SCOPE_ERROR_CODES`, so a rename on the
 * backend is one edit here and a missed reader cannot drift. Scans the sources, the way a lint rule
 * would (same approach as `crm-english-literals.spec.ts`).
 */

interface NodeFs {
  readdirSync(path: string, options: { recursive: true }): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

/** The unit-test runner is Node; the module name is a variable so the bundler leaves it alone. */
async function nodeFs(): Promise<NodeFs> {
  const name = 'node:fs';
  return (await import(/* @vite-ignore */ name)) as NodeFs;
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

/** Drops `/* … *\/` blocks and whole-line `//` comments; a code named in prose is not a literal. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const SCOPE_LITERAL = /(['"`])projects\.scope\.[^'"`]*\1/g;

describe('projects.scope.* code literals (R2b-7)', () => {
  it('appear only in the files that define codes', async () => {
    const fs = await nodeFs();
    const offences = fs
      .readdirSync(APP, { recursive: true })
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !DEFINERS.has(f))
      .flatMap((f) => {
        const code = stripComments(fs.readFileSync(`${APP}/${f}`, 'utf8'));
        return Array.from(code.matchAll(SCOPE_LITERAL), (m) => `${f}: ${m[0]}`);
      });
    expect(offences).toEqual([]);
  });

  it('the scan sees the definers (it is not vacuous)', async () => {
    const fs = await nodeFs();
    const catalog = fs.readFileSync(`${APP}/platform/errors/error-catalog.ts`, 'utf8');
    expect(Array.from(catalog.matchAll(SCOPE_LITERAL)).length).toBeGreaterThan(0);
  });
});
