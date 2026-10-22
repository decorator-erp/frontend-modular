// @ts-check
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const boundaries = require('eslint-plugin-boundaries');
const importX = require('eslint-plugin-import-x');
const { createTypeScriptImportResolver } = require('eslint-import-resolver-typescript');
const { getTemplateParserServices } = require('@angular-eslint/utils');

/**
 * Local template rule: ban raw `px` values in Angular template attributes
 * (`class`, `style`, and any static attribute value — e.g. Tailwind arbitrary
 * values like `w-[280px]` or `style="gap:12px"`). Design System v2 requires all
 * spacing/size to resolve through tokens (constitution Principle III, FR-012).
 *
 * This rule walks the angular-eslint template AST (`TextAttribute` nodes). Because
 * the `**\/*.ts` config below uses `angular.processInlineTemplates`, the template
 * config's rules ALSO run against inline component templates — so this single rule
 * covers BOTH external `.html` templates and inline TS templates (FR-013), with
 * per-attribute precision and real source locations.
 */
const RAW_PX = /\d[\d.]*px\b/i;
const noRawPxTemplateRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw px values in Angular template attributes; use a design-system spacing token.',
    },
    messages: {
      rawPx: 'Raw px value — use a design-system spacing token via var() or a token-based utility.',
    },
    schema: [],
  },
  /** @param {import('eslint').Rule.RuleContext} context */
  create(context) {
    const parserServices = getTemplateParserServices(context);
    return {
      /** @param {any} node */
      TextAttribute(node) {
        if (typeof node.value === 'string' && RAW_PX.test(node.value)) {
          context.report({
            loc: parserServices.convertNodeSourceSpanToLoc(node.sourceSpan),
            messageId: 'rawPx',
          });
        }
      },
    };
  },
};

/**
 * Companion to the rule above: ban raw `px` inside component `styles:` blocks.
 *
 * `no-raw-px-template` only visits template `TextAttribute` nodes, so it is blind
 * to the CSS an Angular component carries in its `styles:` array — which is where
 * the ported `.dms-*` prototype CSS keeps most of its raw pixels (for example
 * `project-detail.component.ts`: 168 raw px, 0 suppressions). Zero template px
 * therefore does not mean the codebase is px-free (spec SC-003).
 *
 * Ships at WARN with its own frozen baseline (`eslint-px-styles-baseline.json`),
 * so it reports the debt without blocking the build. ESLint's bulk-suppressions
 * file only suppresses ERRORS, so this rule cannot live in
 * `eslint-suppressions.json` while it is a warning — hence the separate artifact.
 *
 * Deliberately not applied to `src/styles/*.css`: that layer defines the tokens,
 * so a px literal there is the point.
 */
const RAW_PX_GLOBAL = /\d[\d.]*px\b/gi;
const noRawPxStylesRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow raw px values inside Angular component `styles:` blocks; use a design-system token.',
    },
    messages: {
      rawPxStyle:
        'Raw px value in component styles — use a design-system token via var() (constitution III).',
    },
    schema: [],
  },
  /** @param {import('eslint').Rule.RuleContext} context */
  create(context) {
    const sourceCode = context.sourceCode;

    /** @param {any} node */
    const scan = (node) => {
      const text = sourceCode.getText(node);
      const offset = node.range[0];
      RAW_PX_GLOBAL.lastIndex = 0;
      let match;
      while ((match = RAW_PX_GLOBAL.exec(text)) !== null) {
        const start = offset + match.index;
        context.report({
          loc: {
            start: sourceCode.getLocFromIndex(start),
            end: sourceCode.getLocFromIndex(start + match[0].length),
          },
          messageId: 'rawPxStyle',
        });
      }
    };

    return {
      'Property[key.name="styles"] TemplateLiteral': scan,
      /** @param {any} node */
      'Property[key.name="styles"] Literal': (node) => {
        if (typeof node.value === 'string') scan(node);
      },
    };
  },
};

/**
 * Flat ESLint config (ESLint 10). Three jobs:
 *  1. angular-eslint + typescript-eslint baselines for Angular/TS correctness.
 *  2. Architectural boundary enforcement (eslint-plugin-boundaries) — the
 *     modular-monolith layering from modular-monolith-plan.md §4.1:
 *       - platform may depend only on platform
 *       - shared may depend on shared + platform
 *       - design-system (ds) may depend on ds, shared, platform (NOT module —
 *         shared→ds was the debt to cut; ds→shared was legal in the old app
 *         and stays legal here, spec 003-T00a)
 *       - layout may depend on layout, module (via index.ts), ds, shared, platform
 *       - app may depend on app, layout, module (via index.ts), ds, shared, platform
 *       - a module may depend on platform, shared, ds, itself freely, and any
 *         OTHER module only through that module's index.ts (boundaries/entry-point)
 *     `boundaries/entry-point` is ON at error from day one (charter §3) — no
 *     transition config, no temporary allowances.
 *  3. Design System v2 raw-value bans (Principle III): raw px in templates is an
 *     ERROR (frozen via eslint-suppressions.json, new violations fail lint —
 *     FR-012/013/014); raw hex + non-whitelisted fonts are retained as WARN
 *     companions ported from the legacy .oxlintrc.json (FR — token adherence).
 *
 * Noisy stylistic rules are downgraded to "warn" so they surface in `npm run lint`
 * without blocking commits via lint-staged (which fails only on errors).
 */
module.exports = tseslint.config(
  {
    // Global ignores (bare `ignores` block = applies to every config below).
    // `.claude/**` excludes Claude Code worktrees/state — those are full repo
    // copies that would otherwise be double-linted and pollute the baseline.
    ignores: ['dist/**', '.angular/**', 'node_modules/**', 'coverage/**', '.claude/**'],
  },
  {
    files: ['**/*.ts'],
    ignores: ['dist/**', '.angular/**', 'node_modules/**'],
    extends: [...tseslint.configs.recommended, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    plugins: {
      boundaries,
      'pera-ds': { rules: { 'no-raw-px-styles': noRawPxStylesRule } },
    },
    settings: {
      'boundaries/include': ['src/app/**/*.ts'],
      // Element descriptors match FOLDERS and are evaluated in order: with
      // `boundaries/elements-single-match` at its default (true) the FIRST
      // matching descriptor wins. `app` is deliberately LAST — it is the
      // catch-all for `src/app` itself; moving it up would swallow
      // platform/shared/ds/layout/modules.
      'boundaries/elements': [
        { type: 'platform', pattern: 'src/app/platform/**' },
        { type: 'shared', pattern: 'src/app/shared/**' },
        { type: 'ds', pattern: 'src/app/design-system/**' },
        { type: 'layout', pattern: 'src/app/layouts/**' },
        // `mode: 'folder'` removed — it is the v7 default; the key only
        // produced a deprecation warning.
        { type: 'module', pattern: 'src/app/modules/*', capture: ['module'] },
        // C4 fix (spec 002 T00c): was `'src/app/*'`, which in folder mode
        // matches SUBFOLDERS of src/app, never the root files themselves —
        // app.ts / app.config.ts / app.routes.ts / app.spec.ts classified as
        // isUnknown and the entire `from: 'app'` policy was dead on arrival
        // (confirmed dead in the OLD app too, under boundaries 5.4.0 — this
        // is an inherited config defect, not something the v7 bump caused).
        // `'src/app'` makes the app shell one element rooted at src/app, so
        // its own root files are finally boundary-checked.
        { type: 'app', pattern: 'src/app' },
      ],
      'import/resolver': {
        typescript: { project: 'tsconfig.app.json' },
      },
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['app', 'pera'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['app', 'pera'], style: 'kebab-case' },
      ],
      // spec 002 T00c: `boundaries/element-types` + `boundaries/entry-point`
      // (both deprecated forerunners of `boundaries/dependencies` in plugin
      // 7.2.0 — same rule factory, `dependencies` a strict superset) collapse
      // into one `boundaries/dependencies` rule. Semantics carried over from
      // modular-monolith-plan.md §4.1, with one amendment (spec 003-T00a):
      // `ds` regains its `shared` allowance — the old matrix already had it
      // (`{ from: 'ds', allow: ['ds', 'shared', 'core'] }`), and the old
      // config's own comment names the real debt as the UPWARD edge
      // (shared→ds), not this one. Denying ds→shared was collateral from an
      // over-correction; `shared`'s own policy still forbids shared→ds, so
      // acyclicity is unaffected. Same foreign-module index-only rule with
      // the `${from.module}`/`!${from.module}` self-exemption (now
      // Handlebars: `{{ from.element.captured.module }}`).
      //
      // Evaluation model (dist/Rules/Dependencies.js#evaluatePolicies):
      // policies are LAST-WRITE-WINS; inside one policy `disallow` beats
      // `allow`. Policies 0-5 (the layer matrix) are mutually exclusive on
      // `from.element.type` so their order doesn't matter; policy 6 (the
      // barrel rule) MUST stay last — it only ever disallows, so last makes
      // the verdict "matrix allows AND barrel allows", exactly the AND of the
      // two rules it replaces. Moved earlier, a matrix `allow` would
      // overwrite it and deep foreign-module imports would pass silently.
      // `platform/bad-platform.ts` (T00a fixture) is the one thing proving
      // this: it imports the `@modules/a` BARREL, which policy 6 selects but
      // does not disallow — if that fixture ever stops erroring, policy 6 has
      // started over-allowing every barrel import the matrix forbids.
      //
      // checkInternals/checkUnknownLocals/checkAllOrigins stay at their
      // `false` defaults: checkInternals:false reproduces both entry-point's
      // `relationship.to !== INTERNAL` guard and the old own-module
      // `allow: '**'` policy; checkUnknownLocals:false matches today's
      // ignore-unclassified-local-targets behavior; checkAllOrigins:false
      // keeps external packages (@angular/*, rxjs) out of scope, as today.
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          // Handlebars replacement for ${file.type}/${dependency.type}. Note
          // `{{dependency.*}}` in this context is dependency METADATA, not
          // the target element — the target is `{{to.*}}`.
          message: '{{from.type}} is not allowed to import {{to.type}}',
          policies: [
            {
              from: { element: { type: 'platform' } },
              allow: { to: { element: { type: ['platform'] } } },
            },
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: ['shared', 'platform'] } } },
            },
            // ds regains its `shared` allowance (spec 003-T00a) — restored from
            // the old app's own matrix. `shared` above still cannot reach `ds`,
            // so the stack stays a strict line: platform <- shared <- ds <- module.
            {
              from: { element: { type: 'ds' } },
              allow: { to: { element: { type: ['ds', 'shared', 'platform'] } } },
            },
            {
              from: { element: { type: 'layout' } },
              allow: {
                to: { element: { type: ['layout', 'module', 'ds', 'shared', 'platform'] } },
              },
            },
            {
              from: { element: { type: 'app' } },
              allow: {
                to: { element: { type: ['app', 'layout', 'module', 'ds', 'shared', 'platform'] } },
              },
            },
            {
              from: { element: { type: 'module' } },
              allow: { to: { element: { type: ['platform', 'shared', 'ds', 'module'] } } },
            },
            // What makes a module a module: only its own index.ts is a legal
            // import path for a FOREIGN module. `!{{ from.element.captured.module }}`
            // is the verified migration of `!${from.module}` — the `!` is
            // micromatch negation on the rendered value and survives
            // templating. For a non-module `from`, the template renders
            // empty, so the selector matches every module, same as today.
            {
              to: {
                element: {
                  type: 'module',
                  captured: { module: '!{{ from.element.captured.module }}' },
                },
              },
              disallow: { to: { element: { fileInternalPath: '!index.ts' } } },
              // Policy-level message is NOT decorative: resolveCustomMessage
              // is `policies[i]?.message ?? options.message`, so without this
              // a barrel violation would print the nonsensical "module is not
              // allowed to import module".
              message:
                'Foreign module "{{to.captured.module}}" may only be imported through its index.ts barrel (got "{{to.internalPath}}")',
            },
          ],
        },
      ],
      // Raw px inside component `styles:` blocks — the surface the template rule
      // cannot see. WARN + its own frozen baseline (eslint-px-styles-baseline.json)
      // so the debt is visible without blocking the build. Driven to zero by the
      // de-port batches; never promoted to `error` inside feature 003.
      'pera-ds/no-raw-px-styles': 'warn',

      // Pragmatic downgrades — surfaced by `npm run lint`, not commit-blocking.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Token-adherence companions ported from the legacy .oxlintrc.json (retained
      // as WARN — they "hold" in the active pipeline without expanding the px
      // freeze). Raw-px in TS *templates* is enforced by the template rule above
      // via processInlineTemplates; TS style-binding px code currently = 0.
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message:
            'Raw hex color — use a design-system color token via var() or a Tailwind alias (bg-ink, text-accent, ...).',
        },
        {
          selector:
            'Literal[value=/font-family\\s*:\\s*(?![\'\\"]?(?:Inter|Noto Sans Arabic|var\\())/i]',
          message:
            'Font not provided by the design system. Use --sans / --arabic / --mono via var() or font-sans / font-arabic / font-mono utilities.',
        },
      ],
    },
  },
  {
    // Legit raw hex, ported from the legacy .oxlintrc.json overrides: the icon
    // registry embeds SVG fill colors and the materials mock carries sample data.
    files: [
      'src/app/design-system/components/icon/icon-registry.ts',
      'src/app/modules/library/ui/materials/mock/materials.mock.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Cycle guard scoped to modules/** — the acyclicity half of the declared
    // dependency graph (plan.md §5). ESLint 10 dropped eslint-plugin-import's
    // support (peers cap at eslint ^9), so this uses eslint-plugin-import-x's
    // no-cycle instead, with the same TypeScript-aware resolver via the newer
    // `import-x/resolver-next` setting (bump ledger L4).
    files: ['src/app/modules/**/*.ts'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: 'tsconfig.app.json' })],
      // import-x's export-map builder defaults 'import-x/extensions' to
      // ['.js', '.mjs', '.cjs'] and silently treats any other extension as
      // 'no export map' (ExportMap.for -> hasValidExtension -> false ->
      // null), which makes no-cycle a no-op on an all-.ts tree with zero
      // warning that it happened. T00b of spec 002 found this the hard way:
      // a two-file cycle through real barrels produced zero messages until
      // this setting was added. Verified against
      // node_modules/eslint-plugin-import-x/lib/utils/ignore.js.
      'import-x/extensions': ['.ts'],
    },
    rules: {
      'import-x/no-cycle': ['warn', { ignoreExternal: true }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    plugins: {
      'pera-ds': { rules: { 'no-raw-px-template': noRawPxTemplateRule } },
    },
    rules: {
      'pera-ds/no-raw-px-template': 'error',
    },
  },
);
