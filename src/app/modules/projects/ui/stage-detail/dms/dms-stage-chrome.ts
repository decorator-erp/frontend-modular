/**
 * Shared chrome for the nine-component stage-detail bundle (feature 003, Batch 4b).
 *
 * Before this file, `dms-stage-detail` carried ~870 lines of verbatim-ported CSS
 * under a `.dms-stage` wrapper with `ViewEncapsulation.None`, and its eight
 * children wrote markup against that vocabulary (`.pnl`, `.pnl-h`, `.pnl-b`,
 * `.bt`, `.dms-st`, `.av`, `.pri`, `.code-c`) without owning a single rule for
 * it. Removing the parent's CSS broke all eight at once — which is why the
 * bundle had to move together.
 *
 * The vocabulary now lives here as Tailwind class recipes. Every component
 * imports what it needs, keeps Angular's default (emulated) encapsulation, and
 * carries **zero raw pixels**: sizes come from the `.fs-*` token utilities and
 * the `--space-*` ladder.
 */

/** Panel shell — the shared card chrome every gated section sits in. */
export const PNL = 'border border-border bg-surface';

/** Panel header row. */
export const PNL_H = 'px-4 py-3 border-b border-border flex justify-between items-center gap-2.5';

/** Panel header title. */
export const PNL_H_T = 'flex items-baseline gap-2 font-semibold tracking-[-0.01em] fs-body-sm';

/** The muted count beside a panel title. */
export const PNL_H_C = 'font-normal text-text-muted tabular-nums fs-label';

/** Panel body padding. */
export const PNL_B = 'p-4';

/** A header link (Edit / Save / Cancel). */
export const HLK =
  'fs-label text-text-secondary cursor-pointer bg-transparent border-0 p-0 font-[inherit] hover:not-disabled:underline hover:not-disabled:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed';

const BT_BASE =
  'inline-flex items-center justify-center gap-2 border border-transparent font-medium cursor-pointer whitespace-nowrap no-underline transition-colors disabled:opacity-55 disabled:cursor-not-allowed';

/** Button — `variant` maps to the ported `.bt.pri` / `.sec` / `.gh` / `.dgr` / `.ok`. */
export type StageBtnVariant = 'pri' | 'sec' | 'gh' | 'dgr' | 'ok';

const BT_VARIANT: Record<StageBtnVariant, string> = {
  pri: 'bg-accent border-accent text-on-accent hover:not-disabled:bg-accent-hover',
  sec: 'bg-surface border-border-strong text-text-primary hover:not-disabled:bg-hover',
  gh: 'bg-transparent border-transparent text-text-secondary hover:bg-hover hover:text-text-primary',
  dgr: 'bg-surface border-border-strong text-danger hover:not-disabled:bg-danger-soft hover:not-disabled:border-danger',
  ok: 'bg-success-soft border-success text-success hover:not-disabled:brightness-97',
};

/** `bt(variant)` = full size; `bt(variant, true)` = the ported `.bt.sm`. */
export function bt(variant: StageBtnVariant, small = false): string {
  const size = small ? 'px-3 py-1.5 fs-label' : 'px-3 py-2 fs-caption';
  return `${BT_BASE} ${size} ${BT_VARIANT[variant]}`;
}

/** Round initials avatar. `s24` is the default; `s20` is the dense variant. */
export function av(size: 20 | 24 = 24, alt = false): string {
  const dims = size === 20 ? 'w-5 h-5 fs-micro' : 'w-6 h-6 fs-micro';
  return `rounded-full ${alt ? 'bg-text-muted' : 'bg-text-primary'} text-bg inline-flex items-center justify-center font-medium shrink-0 ${dims}`;
}

/** Monospace-ish code / id cell. */
export const CODE_C = 'tabular-nums text-text-muted fs-label';

/** Task priority chip: a ringed dot plus its label, coloured by the `--pri-*` ramp. */
export const PRI =
  'inline-flex items-center gap-2 fs-caption text-text-primary whitespace-nowrap font-medium';

/**
 * The dot inside {@link PRI}. Uses the `--pri-low/-medium/-high/-urgent` tokens
 * published in Batch 0 — Low/Medium are outlined, High is a thick ring, Urgent
 * is solid, so the four levels read by shape as well as by colour (FR-014).
 */
export function priDot(priority: string): string {
  const base = 'w-2.5 h-2.5 rounded-full shrink-0 border-2';
  switch (priority) {
    case 'Urgent':
      return `${base} border-transparent bg-[var(--pri-urgent)]`;
    case 'High':
      return `${base} border-[var(--pri-high)] bg-transparent ring-1 ring-inset ring-[var(--pri-high)]`;
    case 'Medium':
      return `${base} border-[var(--pri-medium)] bg-transparent`;
    default:
      return `${base} border-[var(--pri-low)] bg-transparent`;
  }
}
