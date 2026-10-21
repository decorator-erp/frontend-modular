#!/usr/bin/env node
/**
 * Guard for `pera-ds/no-raw-px-styles` (feature 003, Batch 0).
 *
 * The rule ships at WARN, and ESLint's bulk-suppressions file only suppresses
 * ERRORS — so this rule cannot be frozen into `eslint-suppressions.json`. Its
 * baseline lives in `eslint-px-styles-baseline.json` instead, and this script is
 * what keeps it honest: the count may fall, never rise.
 *
 *   node scripts/check-px-styles.mjs           # verify against the baseline
 *   node scripts/check-px-styles.mjs --write   # re-freeze after a reduction
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { ESLint } from 'eslint';

const RULE = 'pera-ds/no-raw-px-styles';
const BASELINE = 'eslint-px-styles-baseline.json';
const root = process.cwd();

const eslint = new ESLint({ errorOnUnmatchedPattern: false });
const results = await eslint.lintFiles(['src/**/*.ts']);

const files = {};
for (const result of results) {
  const count = result.messages.filter((m) => m.ruleId === RULE).length;
  if (count) files[relative(root, result.filePath).replaceAll('\\', '/')] = count;
}
const total = Object.values(files).reduce((a, b) => a + b, 0);

if (process.argv.includes('--write')) {
  const payload = {
    rule: RULE,
    severity: 'warn',
    note:
      "Frozen baseline for the styles-block px rule. ESLint's bulk-suppressions file only " +
      'suppresses errors, so a warn-level rule cannot live in eslint-suppressions.json. This ' +
      'count must never rise; the de-port batches drive it to zero.',
    total,
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(resolve(root, BASELINE), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Froze ${RULE} baseline at ${total} across ${Object.keys(files).length} files.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(resolve(root, BASELINE), 'utf8'));
if (total > baseline.total) {
  console.error(`✗ ${RULE} rose: ${baseline.total} → ${total}. Raw px in component styles is debt;`);
  console.error('  resolve it to a token, or justify and re-freeze with --write.');
  const grown = Object.entries(files).filter(([f, n]) => n > (baseline.files[f] ?? 0));
  for (const [f, n] of grown) console.error(`    ${f}: ${baseline.files[f] ?? 0} → ${n}`);
  process.exit(1);
}

const verb = total < baseline.total ? 'fell' : 'held';
console.log(`✓ ${RULE} ${verb}: ${baseline.total} → ${total}.`);
