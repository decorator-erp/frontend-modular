import { describe, expect, it } from 'vitest';
import type * as TS from 'typescript';

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

async function screens(folder: string): Promise<{ file: string; code: string }[]> {
  const fs = await nodeFs();
  const dir = `${ROOT}/src/app/modules/${folder}`;
  const files = fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.html')) && !f.endsWith('.spec.ts'));
  return Promise.all(
    files.map(async (f) => ({
      file: `${folder}/${f}`,
      code: await stripComments(fs.readFileSync(`${dir}/${f}`, 'utf8'), f.endsWith('.html')),
    })),
  );
}

/**
 * Blanks comments, keeping offsets. A `.html` template loses only its `<!-- … -->` comments. A
 * `.ts` file loses the comment ranges the TypeScript parser reports, plus `<!-- … -->` inside a
 * string or template token (an inline template). FINDING-P2-26: the old regex stripped `/* … *\/`
 * first, so a `/*` inside a string (`'/crm/public/*'`) opened a fake block that hid live code.
 */
async function stripComments(code: string, html = false): Promise<string> {
  const blank: [number, number][] = [];
  const htmlComments = (from: number, text: string): void => {
    for (const m of text.matchAll(/<!--[\s\S]*?-->/g)) {
      blank.push([from + m.index, from + m.index + m[0].length]);
    }
  };
  if (html) {
    htmlComments(0, code);
  } else {
    const ts = await typescript();
    const source = ts.createSourceFile(
      'x.ts',
      code,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );
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
        htmlComments(start, code.slice(start, node.end));
      }
      node.getChildren(source).forEach(visit);
    };
    visit(source);
  }
  const chars = code.split('');
  for (const [pos, end] of blank) {
    for (let i = pos; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
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
  it('a `/*` inside a string does not hide a later unflipped arrow (FINDING-P2-26)', async () => {
    const code = await stripComments(
      "const url = '/crm/public/*';\nconst tpl = `<span>→</span>`;\n// a real comment → ignored\n/* end */",
    );
    expect(unflipped([{ file: 'fixture.ts', code }])).toEqual([
      'fixture.ts: 1 arrow(s) do not flip in RTL',
    ]);
  });

  it('a template comment is still ignored (FINDING-P2-26)', async () => {
    const code = await stripComments('<p>ok</p><!-- old ← arrow -->', true);
    expect(unflipped([{ file: 'fixture.html', code }])).toEqual([]);
  });

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
