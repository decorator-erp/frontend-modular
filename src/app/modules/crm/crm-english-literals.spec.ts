import { describe, expect, it } from 'vitest';
import type * as TS from 'typescript';

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
const CRM = `${ROOT}/src/app/modules/crm`;

async function sources(folder: string): Promise<{ file: string; code: string }[]> {
  const fs = await nodeFs();
  const files = fs
    .readdirSync(`${CRM}/${folder}`, { recursive: true })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  return Promise.all(
    files.map(async (f) => ({
      file: `${folder}/${f}`,
      code: await stripComments(fs.readFileSync(`${CRM}/${folder}/${f}`, 'utf8')),
    })),
  );
}

/**
 * Blanks every comment, and every `<!-- … -->` inside a string or template token, keeping the
 * offsets. FINDING-P2-21: the comment ranges come from the TypeScript parser — a regex that strips
 * `/* … *\/` first let a `/*` inside a string (`'/crm/public/*'`) or a `//` comment open a fake
 * block that hid the live code after it.
 */
async function stripComments(code: string): Promise<string> {
  const ts = await typescript();
  const source = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const blank: [number, number][] = [];
  const visit = (node: TS.Node): void => {
    ts.forEachLeadingCommentRange(code, node.pos, (pos, end) => void blank.push([pos, end]));
    const kind = node.kind;
    if (
      kind === ts.SyntaxKind.StringLiteral ||
      kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      kind === ts.SyntaxKind.TemplateHead ||
      kind === ts.SyntaxKind.TemplateMiddle ||
      kind === ts.SyntaxKind.TemplateTail
    ) {
      const start = node.getStart(source);
      for (const m of code.slice(start, node.end).matchAll(/<!--[\s\S]*?-->/g)) {
        blank.push([start + m.index, start + m.index + m[0].length]);
      }
    }
    node.getChildren(source).forEach(visit);
  };
  visit(source);
  const chars = code.split('');
  for (const [pos, end] of blank) {
    for (let i = pos; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
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
  it('a `/*` inside a string or line comment does not hide later code (FINDING-P2-21)', async () => {
    const fixture = [
      "const a = '/x/*';",
      "this.error.set('Something went wrong');",
      '// see /api/*',
      "const message = 'Could not save it';",
      '/** doc */',
    ].join('\n');
    const files = [{ file: 'fixture.ts', code: await stripComments(fixture) }];
    expect(offences(files, ASSIGNED_TO_ERROR)).toHaveLength(2);
  });

  it('prose in a comment or a template comment is not a literal', async () => {
    const fixture = [
      "// this.error.set('Something went wrong');",
      "/* const message = 'Could not save it'; */",
      "const t = `<!-- error = 'Not a real one' -->`;",
    ].join('\n');
    const files = [{ file: 'fixture.ts', code: await stripComments(fixture) }];
    expect(offences(files, ASSIGNED_TO_ERROR)).toEqual([]);
  });

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
