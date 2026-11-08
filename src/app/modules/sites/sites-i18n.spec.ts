import { describe, expect, it } from 'vitest';
import { AR } from '@platform/i18n/catalog/ar';
import { EN } from '@platform/i18n/catalog/en';

/**
 * sites S-11 (spec §9 i18n): every `sv.*` key the module names exists in EN and AR, the two catalogs
 * hold the same `sv.*` set, and the module's templates use logical (start/end) spacing and alignment
 * only — no physical `ml-`/`mr-`/`pl-`/`pr-`/`left`/`right` — so the grids mirror under RTL.
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

async function sources(): Promise<{ file: string; code: string }[]> {
  const fs = await nodeFs();
  const dir = `${ROOT}/src/app/modules/sites`;
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.includes('testing/'))
    .map((f) => ({ file: f, code: fs.readFileSync(`${dir}/${f}`, 'utf8') }));
}

const en = EN as Record<string, string>;
const ar = AR as Record<string, string | undefined>;
const svKeys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => k.startsWith('sv.'));

describe('sites i18n and RTL (S-11)', () => {
  it('every literal sv.* key used by modules/sites exists in EN and AR', async () => {
    const missing: string[] = [];
    for (const { file, code } of await sources()) {
      for (const m of code.matchAll(/'(sv\.[A-Za-z0-9_.]+)'/g)) {
        const key = m[1];
        // A label-family prefix (`labels('sv.e.SiteStatus', …)`) is checked by its members.
        if (!en[key] && svKeys(en).some((k) => k.startsWith(`${key}.`))) continue;
        if (!en[key] || !ar[key]) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('the dynamic key families resolve in both catalogs', () => {
    const families = [
      ...['overview', 'capture', 'spaces', 'families', 'boq', 'documents'].map(
        (t) => `sv.tab.${t}`,
      ),
      ...['exact', 'size', 'custom'].map((m) => `sv.fam.${m}`),
      ...['Viewer', 'Editor', 'Manager'].map((l) => `sv.e.ProjectLevel.${l}`),
    ];
    for (const k of families) {
      expect(en[k], k).toBeTruthy();
      expect(ar[k], k).toBeTruthy();
    }
  });

  it('EN and AR hold the same sv.* keys, none empty', () => {
    const e = svKeys(en).sort();
    const a = svKeys(ar as Record<string, unknown>).sort();
    expect(a).toEqual(e);
    expect(e.filter((k) => !ar[k]?.trim())).toEqual([]);
  });

  it('no physical left/right spacing or alignment in the module', async () => {
    const physical =
      /(?<![\w-])(?:-?m[lr]-|p[lr]-|text-left|text-right|left-\d|right-\d|border-[lr](?:-|\s|"))/;
    const hits = (await sources())
      .flatMap(({ file, code }) =>
        code.split('\n').map((line, i) => ({ file, line: i + 1, text: line })),
      )
      .filter((l) => physical.test(l.text))
      .map((l) => `${l.file}:${l.line} ${l.text.trim()}`);
    expect(hits).toEqual([]);
  });

  it('a chevron-right icon mirrors under RTL', async () => {
    const bad = (await sources()).filter(
      ({ code }) =>
        code.includes('name="chevron-right"') &&
        !/name="chevron-right"[^>]*rtl:rotate-180/.test(code),
    );
    expect(bad.map((b) => b.file)).toEqual([]);
  });
});
