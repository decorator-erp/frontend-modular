import { InjectionToken, Type } from '@angular/core';

/**
 * `TASK_WORKSPACE` — the core-layer panel registry (FR-006, SC-008).
 *
 * ## Why a token, and not an import
 *
 * CRM panels must render INSIDE two components that live in another feature
 * (`features/projects`' stage- and task-detail hosts). `eslint-plugin-boundaries`
 * forbids that import IN BOTH DIRECTIONS — a feature may import only `core`,
 * `shared`, `design-system`, `layouts` and its OWN feature folder. So
 * `projects → crm` is an error, and `crm → projects` is an error.
 *
 * A core-layer token is the only shape that lets the CRM feature reach the projects
 * hosts while keeping the dependency graph one-way. `features/projects` imports only
 * this file — a type and a token. It never learns that CRM exists.
 *
 * The rejected alternative — hoisting the CRM panels into `shared` or `design-system`
 * — would put CRM domain logic, stores and HTTP calls into a layer that `core` and
 * every other feature can see. It "passes" the lint rule by making the layering
 * meaningless.
 *
 * ## Net-new, deliberately minimal
 *
 * The repo has exactly two `InjectionToken`s and **no `multi: true` provider anywhere**.
 * This is the first, which is why it gets a ratified contract
 * (`specs/004-crm-requirement-gathering/contracts/task-workspace-registry.md`) rather
 * than being invented at build time. `core` imports nothing above it — keep this file
 * free of feature, DS and store imports.
 */

/** Where a panel renders. The HOST owns the slot; the panel only declares which it wants. */
export type WorkspaceSlot = 'stage-main' | 'stage-rail' | 'task-main' | 'task-rail';

/**
 * Structural stand-in for the old `core/models/crm` `CrmStageBlock` / `CrmTaskBlock` (spec
 * 002-platform, edit 2). `platform` may hold zero domain imports, so this file cannot reach
 * `CrmStageBlock`/`CrmTaskBlock` themselves or the two enums two of their fields are typed with
 * (`ApprovalState`, `RequirementPeriodStatus`, both in `core/models/enums.ts`).
 *
 * Field names and types are copied verbatim from the old `core/models/crm/index.ts` definitions
 * (L547-571 at SOURCE_SHA), with exactly one widening: `periodStatus`/`briefStatus` go from their
 * enum types to `number`. A TS numeric enum member is assignable to `number`, so the real
 * `CrmStageBlock`/`CrmTaskBlock` (built in `modules/crm` at spec 009) stay structurally assignable
 * to these — see the 002 session report §7, which this comment mirrors; that section is the
 * contract 009 must satisfy.
 */
export interface WorkspaceCrmStageBlock {
  openPeriodId: string | null;
  periodStatus: number | null; // RequirementPeriodStatus, once modules/crm exists (009)
  closesAtUtc: string | null;
  briefId: string | null;
  briefStatus: number | null; // ApprovalState, once modules/crm exists (009)
  /** Note: 'space', not 'entry', on the STAGE block. */
  spaceTotal: number;
  spacePending: number;
  itemTotal: number;
  itemPending: number;
  meetingsUpcoming: number;
  unresolvedTotal: number;
}

export interface WorkspaceCrmTaskBlock {
  briefId: string | null;
  briefStatus: number | null; // ApprovalState, once modules/crm exists (009)
  /** Note: 'entry', not 'space', on the TASK block. */
  entryTotal: number;
  entryPending: number;
  itemTotal: number;
  itemPending: number;
  unresolvedTotal: number;
  meetingsUpcoming: number;
}

/**
 * The host's identity, narrowed to what a panel is allowed to see. Deliberately NOT
 * the full details DTO — a panel must not reach into the host's model.
 */
export interface WorkspaceHost {
  readonly kind: 'stage' | 'task';
  readonly id: string;
  readonly projectId: string;
  /**
   * The optional CRM block. **Non-null ⇔ this host is CRM** (FR-005).
   *
   * ⚠️ Served on the DETAILS DTOs only. It is absent from `ProjectTaskResponse`,
   * `ProjectStageListResponse` and `ProjectTaskListResponse` — so no CRM affordance
   * may be rendered from a list row: there is no signal there, and inventing one is
   * exactly what FR-005 exists to prevent.
   */
  readonly crm: WorkspaceCrmStageBlock | WorkspaceCrmTaskBlock | null;
}

export interface WorkspacePanel {
  readonly slot: WorkspaceSlot;
  /** Ascending. Panels from different features may share a slot; `order` breaks the tie. */
  readonly order: number;
  /**
   * True iff this panel claims the host. For CRM this is `!!host.crm` and NOTHING else
   * — never a name, a template id, a status, or a route param (FR-005).
   */
  claims(host: WorkspaceHost): boolean;
  /**
   * Lazy — a dynamic import. The CRM bundle must never load on a non-CRM stage or task,
   * so the host calls this only for panels whose `claims()` already returned true.
   */
  load(): Promise<Type<unknown>>;
}

export const TASK_WORKSPACE = new InjectionToken<readonly WorkspacePanel[]>('TASK_WORKSPACE');

/**
 * Resolve the panels that claim `host` in `slot`, in `order`, loading each panel's
 * component lazily. A panel whose `claims()` is false is NEVER `load()`ed — that is
 * the bundle-laziness guarantee (US5 scenario 2).
 *
 * The host must hold the result in a **signal**: under zoneless change detection
 * nothing re-renders when a bare promise settles, so an `effect()` has to `set()` the
 * resolved panels for `*ngComponentOutlet` to pick them up.
 */
export async function resolveWorkspacePanels(
  panels: readonly WorkspacePanel[],
  slot: WorkspaceSlot,
  host: WorkspaceHost,
): Promise<readonly ResolvedWorkspacePanel[]> {
  const winners = panels.filter((panel) => panel.slot === slot && panel.claims(host));

  const loaded = await Promise.all(
    winners.map(async (panel) => ({ order: panel.order, cmp: await panel.load() })),
  );

  return loaded.sort((a, b) => a.order - b.order);
}

export interface ResolvedWorkspacePanel {
  readonly order: number;
  readonly cmp: Type<unknown>;
}
