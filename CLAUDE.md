# DMS — agent configuration

**All documentation lives outside this repo:**
`../docs/frontend/dms-modular-port/` (resolves from the `Repositories/{frontend-modular,docs}`
layout on this machine). Start with `PORT-CHARTER.md`, then the matching `specs/00X-*.md` for
whichever spec is active. This file is the **only** `.md` this repo is allowed to hold — everything
else (reports, audits, decision records) goes in the docs folder.

## What this is

DMS is a fresh Angular 22 application that ports the production app at `../frontend` (read-only
source material) into a modular-monolith architecture, one spec per session, in strict order. See
`PORT-CHARTER.md` §4 for the ten-spec port order and current status.

## Tree (target shape — fills in spec by spec)

```
src/app/
├─ platform/       infra: http, auth, permissions, i18n, errors, realtime, theme,
│                  feedback, navigation, composition, types  (002)
├─ design-system/  presentational, no domain knowledge                          (003)
├─ shared/         domain-free helpers only                                     (003)
├─ modules/        ten business-capability modules, index.ts is the only legal
│                  cross-module import path (boundaries/entry-point, error)     (005-009)
│  ├─ clients/ audit/ approvals/ library/ notifications/                        (005)
│  ├─ people/                                                                   (006)
│  ├─ finance/                                                                  (007)
│  ├─ projects/                                                                 (008)
│  ├─ crm/                                                                      (009)
│  └─ dashboard/                                                                (010)
└─ layouts/        app-shell, client-shell, nav-config, command palette         (004)
```

Normative tree/module-map/boundary config: `../docs/frontend/architecture-review/modular-monolith-plan.md` §2–§7.

## The laws (every session, every spec)

1. **Verbatim-copy law.** Ported code is byte-for-byte except import specifiers, edits the active
   spec explicitly lists, and changes KNOWN-DELTA-1 (Angular 22 bump) forces — each logged.
2. **The repo is ground truth.** Specs carry pre-verified claims; re-verify before acting. On
   contradiction, stop and report rather than improvise.
3. **No behavioral edits** except KNOWN-FIX-1 (the `conditionInt` read-map completion at spec 008).
   Everything else is bug-for-bug compatible with the old app.
4. **Gates after every spec:** `npx tsc --noEmit` (both configs) clean, `npm run lint` 0 errors,
   `npm run lint:px-styles` at its frozen count, `npm test` green. Production `npm run build` at
   004, 008, 010. **Plus a TODO audit** — `grep -rn "TODO(0" src/` and confirm no marker names a
   spec that has already run (added after 004 found an orphaned `TODO(002)` in `app.ts`).
5. **Report, then stop.** No session starts the next spec.
6. **No docs in the repo.** This file is the only exception.

## Gate commands

```bash
npm run build                                              # prod build (004, 008, 010)
npm run lint                                                # eslint . — 0 errors required
npm run lint:px-styles                                      # pera-ds/no-raw-px-styles baseline, must not rise
npm test -- --watch=false                                   # vitest, one-shot
npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.spec.json
                                                              # root tsconfig.json has files: [], so a bare
                                                              # `tsc --noEmit` checks nothing — always use -p
grep -rn "TODO(0" src/                                       # confirm no marker names a spec ≤ the current one
```

## Boundary rules (live at `error` since spec 001)

`eslint-plugin-boundaries` enforces the module map: `platform → platform`; `shared → shared,
platform`; `ds → ds, platform` (no `shared`); `layout`/`app` → everything below them plus modules
via their `index.ts`; `module → platform, shared, ds`, itself freely, and any _other_ module only
through that module's `index.ts` (`boundaries/entry-point`, no transition config, no exceptions).
`eslint-suppressions.json` starts and stays empty except the ~15 a11y/template entries that travel
with ported files — a `boundaries/*` suppression is never acceptable.

Selector prefixes stay `app` and `pera` on every ported component (verbatim law).

Final version of this file lands at spec 010.
