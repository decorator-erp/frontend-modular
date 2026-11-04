import { describe, expect, it } from 'vitest';

/**
 * crm-prod H4: CRM stores and screens never carry English prose for an error or a message — the
 * text comes from the catalog (`catalog.t(key)`), so an Arabic user (the client in the portal
 * included) never sees English. This scans the sources, the way a lint rule would.
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
const CRM = `${ROOT}/src/app/modules/crm`;

async function sources(folder: string): Promise<{ file: string; code: string }[]> {
  const fs = await nodeFs();
  return fs
    .readdirSync(`${CRM}/${folder}`, { recursive: true })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => ({
      file: `${folder}/${f}`,
      code: stripComments(fs.readFileSync(`${CRM}/${folder}/${f}`, 'utf8')),
    }));
}

/** Drops `/* … *\/` blocks, `<!-- … -->` template comments and whole-line `//` comments. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** A quoted literal that reads as an English sentence: a capitalised word, then two more words. */
const ENGLISH_SENTENCE = /(['"`])([A-Z][a-z]+(?:\s+[A-Za-z][\w'’-]*){2,}[^'"`]*)\1/g;

/**
 * A quoted literal with a space in it assigned (or `.set()`) to an `error` / `message`-style
 * field. A catalog key (`'space.loadFailed'`) has no space, so it passes.
 */
const ASSIGNED_TO_ERROR =
  /\b(?:error|message|generalMessage|\w+Error|\w+Message)\s*(?::|=|\.set\()\s*(['"`])[A-Za-z][^'"`\s]*\s[^'"`]*\1/g;

function offences(files: { file: string; code: string }[], pattern: RegExp): string[] {
  return files.flatMap(({ file, code }) =>
    Array.from(code.matchAll(pattern), (m) => `${file}: ${m[0]}`),
  );
}

describe('CRM English error literals (crm-prod H4)', () => {
  it('no CRM store holds an English sentence', async () => {
    expect(offences(await sources('stores'), ENGLISH_SENTENCE)).toEqual([]);
  });

  it('no CRM store assigns a literal to an error or message', async () => {
    expect(offences(await sources('stores'), ASSIGNED_TO_ERROR)).toEqual([]);
  });

  it('no CRM screen assigns a literal to an error or message, or returns an English sentence', async () => {
    const ui = await sources('ui');
    expect(offences(ui, ASSIGNED_TO_ERROR)).toEqual([]);
    expect(offences(ui, /\breturn\s+(['"`])[A-Z][a-z]+(?:\s+\S+){2,}?[^'"`]*\1/g)).toEqual([]);
  });
});
