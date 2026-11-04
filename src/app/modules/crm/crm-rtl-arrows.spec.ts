import { describe, expect, it } from 'vitest';

/**
 * crm-prod L-fe-4: a left/right arrow glyph or a `chevron-right` icon in a CRM or projects
 * screen flips in RTL. Each `←`/`→` sits alone in an element carrying `rtl:rotate-180`, and a
 * `chevron-right` icon binds the same class. This scans the sources, the way a lint rule would.
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

async function screens(folder: string): Promise<{ file: string; code: string }[]> {
  const fs = await nodeFs();
  const dir = `${ROOT}/src/app/modules/${folder}`;
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.html')) && !f.endsWith('.spec.ts'))
    .map((f) => ({
      file: `${folder}/${f}`,
      code: stripComments(fs.readFileSync(`${dir}/${f}`, 'utf8')),
    }));
}

/** Drops `/* … *\/` blocks, `<!-- … -->` template comments and `//` line comments. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** An arrow glyph that is the whole content of an element carrying `rtl:rotate-180`. */
const FLIPPING_ARROW = /<span\b[^<>]*\brtl:rotate-180\b[^<>]*>\s*[←→]\s*<\/span/g;
const ANY_ARROW = /[←→]/g;

function unflipped(files: { file: string; code: string }[]): string[] {
  return files.flatMap(({ file, code }) => {
    const all = code.match(ANY_ARROW)?.length ?? 0;
    const flipping = code.match(FLIPPING_ARROW)?.length ?? 0;
    return all === flipping ? [] : [`${file}: ${all - flipping} arrow(s) do not flip in RTL`];
  });
}

describe('RTL-safe arrows (crm-prod L-fe-4)', () => {
  it('every ← / → in a CRM screen flips in RTL', async () => {
    expect(unflipped(await screens('crm/ui'))).toEqual([]);
  });

  it('every ← / → in a projects screen flips in RTL', async () => {
    expect(unflipped(await screens('projects/ui'))).toEqual([]);
  });

  it('a chevron-right icon in a CRM screen binds rtl:rotate-180', async () => {
    const offences = (await screens('crm/ui')).filter(
      ({ code }) => code.includes("'chevron-right'") && !code.includes('rtl:rotate-180'),
    );
    expect(offences.map((f) => f.file)).toEqual([]);
  });
});
