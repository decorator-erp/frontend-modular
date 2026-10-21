import { Component, Type } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceHost, WorkspacePanel, resolveWorkspacePanels } from './task-workspace.token';

@Component({ selector: 'app-panel-a', template: '' })
class PanelA {}

@Component({ selector: 'app-panel-b', template: '' })
class PanelB {}

const crmHost = (): WorkspaceHost => ({
  kind: 'stage',
  id: 'stage-1',
  projectId: 'project-1',
  crm: {
    openPeriodId: 'period-1',
    periodStatus: 1,
    closesAtUtc: '2026-07-20T18:00:00Z',
    briefId: 'brief-1',
    briefStatus: 2,
    spaceTotal: 3,
    spacePending: 1,
    itemTotal: 5,
    itemPending: 2,
    meetingsUpcoming: 1,
    unresolvedTotal: 3,
  },
});

/** A stage with `crm: null` is NOT a CRM stage. That is the whole predicate (FR-005). */
const plainHost = (): WorkspaceHost => ({
  kind: 'stage',
  id: 'stage-2',
  projectId: 'project-1',
  crm: null,
});

const panel = (
  over: Partial<WorkspacePanel> & { load: () => Promise<Type<unknown>> },
): WorkspacePanel => ({
  slot: 'stage-main',
  order: 10,
  claims: (h) => !!h.crm,
  ...over,
});

describe('TASK_WORKSPACE registry', () => {
  // The bundle-laziness guarantee (US5 scenario 2). If `claims()` is false, `load()`
  // must never be called — a non-CRM stage must not pay for the CRM chunk.
  it('never load()s a panel whose claims() is false', async () => {
    const load = vi.fn(async () => PanelA as Type<unknown>);
    const panels = [panel({ load, claims: (h) => !!h.crm })];

    const resolved = await resolveWorkspacePanels(panels, 'stage-main', plainHost());

    expect(resolved).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('load()s a panel that claims the host', async () => {
    const load = vi.fn(async () => PanelA as Type<unknown>);
    const panels = [panel({ load })];

    const resolved = await resolveWorkspacePanels(panels, 'stage-main', crmHost());

    expect(load).toHaveBeenCalledOnce();
    expect(resolved).toEqual([{ order: 10, cmp: PanelA }]);
  });

  it('renders two panels in one slot in `order`, not registration order', async () => {
    const panels = [
      panel({ order: 20, load: async () => PanelB as Type<unknown> }),
      panel({ order: 10, load: async () => PanelA as Type<unknown> }),
    ];

    const resolved = await resolveWorkspacePanels(panels, 'stage-main', crmHost());

    expect(resolved.map((p) => p.cmp)).toEqual([PanelA, PanelB]);
  });

  it('yields zero panels for a host with crm: null — the stage is unchanged from today', async () => {
    const panels = [
      panel({ slot: 'stage-main', load: async () => PanelA as Type<unknown> }),
      panel({ slot: 'stage-rail', load: async () => PanelB as Type<unknown> }),
    ];

    expect(await resolveWorkspacePanels(panels, 'stage-main', plainHost())).toEqual([]);
    expect(await resolveWorkspacePanels(panels, 'stage-rail', plainHost())).toEqual([]);
  });

  it('only resolves panels registered for the requested slot', async () => {
    const railLoad = vi.fn(async () => PanelB as Type<unknown>);
    const panels = [
      panel({ slot: 'stage-main', order: 10, load: async () => PanelA as Type<unknown> }),
      panel({ slot: 'stage-rail', order: 10, load: railLoad }),
    ];

    const resolved = await resolveWorkspacePanels(panels, 'stage-main', crmHost());

    expect(resolved).toEqual([{ order: 10, cmp: PanelA }]);
    expect(railLoad).not.toHaveBeenCalled();
  });

  // FR-005 — `claims()` reads `host.crm` and nothing else. This test does not enforce
  // that (a predicate can read anything), but it pins the CONSEQUENCE: CRM-ness is
  // never re-derived from a name, a status or a route param.
  it('treats a non-null crm block as the ONLY signal of CRM-ness', async () => {
    const panels = [panel({ load: async () => PanelA as Type<unknown> })];

    const namedLikeCrm: WorkspaceHost = {
      kind: 'stage',
      id: 'crm-requirement-gathering',
      projectId: 'crm',
      crm: null,
    };

    expect(await resolveWorkspacePanels(panels, 'stage-main', namedLikeCrm)).toEqual([]);
  });
});
