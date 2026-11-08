import { describe, expect, it } from 'vitest';
import { FINISH, KIND, OPT_OLD, SECRET, WIDTH, cell, pivotRow } from '../testing/site-fixtures';
import {
  blankRow,
  bulkBody,
  draftFromPivot,
  duplicateRow,
  mapSaveErrors,
  nextLabel,
  precheck,
  type DraftRow,
  type MapContext,
} from './site-grid';

const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}${JSON.stringify(p)}` : k);
const visible = [WIDTH, KIND];
const hidden = [SECRET, FINISH];

function row(patch: Partial<DraftRow>): DraftRow {
  return {
    key: patch.key ?? 'k',
    recordId: null,
    label: 'D-01',
    spaceId: null,
    spaceName: null,
    catalogItemId: null,
    note: '',
    values: { [WIDTH.itemId]: 90, [KIND.itemId]: null },
    hidden: [],
    ...patch,
  };
}

describe('site-grid — draft and body (sites S-5)', () => {
  it('DEVIATION-17: a stored hidden value is resent unchanged; the UI rows hold visible values only', () => {
    const pivot = [
      pivotRow({
        recordId: 'R1',
        cells: {
          width_cm: cell({ valueNumber: 90 }),
          kind: cell({ optionId: 'O-a' }),
          secret: cell({ valueText: 'kept' }),
          finish: cell({ optionId: 'O-a' }),
          detached_code: cell({ valueNumber: 5 }),
        },
      }),
    ];
    const { rows, unreadable } = draftFromPivot(pivot, visible, hidden, new Map([['R1', 'C1']]));
    expect(unreadable).toBe(0);
    expect(rows[0].values).toEqual({ [WIDTH.itemId]: 90, [KIND.itemId]: 'O-a' });
    expect(rows[0].hidden).toEqual([
      { itemId: SECRET.itemId, valueText: 'kept' },
      { itemId: FINISH.itemId, optionId: 'O-a' },
    ]);
    expect(rows[0].catalogItemId).toBe('C1');
    const body = bulkBody(rows, 'M1', visible);
    expect(body[0].values).toEqual([
      { itemId: WIDTH.itemId, valueNumber: 90 },
      { itemId: KIND.itemId, optionId: 'O-a' },
      { itemId: SECRET.itemId, valueText: 'kept' },
      { itemId: FINISH.itemId, optionId: 'O-a' },
    ]);
    // a detached item's value is never sent (the server keeps it, B-S-H2)
    expect(JSON.stringify(body)).not.toContain('detached');
  });

  it('a hidden stored option no longer active cannot be resent: left out and counted', () => {
    const f = { ...FINISH, options: [OPT_OLD] };
    const { rows, unreadable } = draftFromPivot(
      [pivotRow({ cells: { finish: cell({ optionId: 'O-old' }) } })],
      visible,
      [f],
      new Map(),
    );
    expect(unreadable).toBe(1);
    expect(rows[0].hidden).toEqual([]);
  });

  it('the body: every row, sortOrder index+1, moduleId, trimmed label, null note, only set values', () => {
    const body = bulkBody(
      [row({ key: 'a', recordId: 'R1', label: ' B ', note: ' ' }), row({ key: 'b', values: {} })],
      'M1',
      visible,
    );
    expect(body.map((r) => [r.recordId, r.sortOrder, r.moduleId, r.label, r.note])).toEqual([
      ['R1', 1, 'M1', 'B', null],
      [null, 2, 'M1', 'D-01', null],
    ]);
    expect(body[1].values).toEqual([]);
  });

  it('new and duplicated rows carry no hidden values and get the next free label', () => {
    const src = row({
      key: 'a',
      recordId: 'R1',
      label: 'WI-01',
      hidden: [{ itemId: 'x', valueText: 'y' }],
    });
    const dup = duplicateRow(src, 'WIDTH', [src]);
    expect(dup).toMatchObject({ recordId: null, label: 'WI-02', hidden: [] });
    expect(dup.values).toEqual(src.values);
    expect(blankRow('DOORS', [src], visible).label).toBe('DO-01');
    expect(nextLabel('DOORS', [{ label: 'do-01' }, { label: 'DO-02' }])).toBe('DO-03');
  });
});

describe('site-grid — pre-check (sites S-5)', () => {
  it('label swaps inside one save pass (final labels only)', () => {
    const rows = [
      row({ key: 'a', recordId: 'R1', label: 'D-02' }),
      row({ key: 'b', recordId: 'R2', label: 'D-01' }),
    ];
    expect(precheck(rows, visible, t, 500)).toEqual({});
  });

  it('duplicate final labels (trimmed, case-insensitive) mark every colliding cell', () => {
    const errs = precheck(
      [row({ key: 'a', label: 'd-1 ' }), row({ key: 'b', label: 'D-1' })],
      visible,
      t,
      500,
    );
    expect(errs).toEqual({
      'a:label': 'sv.err.labelDuplicate',
      'b:label': 'sv.err.labelDuplicate',
    });
  });

  it('cell rules: required, min/max, select options; label 201 and __; note cap', () => {
    const errs = precheck(
      [
        row({ key: 'a', label: 'x'.repeat(201), values: { [WIDTH.itemId]: null } }),
        row({
          key: 'b',
          label: '__b',
          values: { [WIDTH.itemId]: 401, [KIND.itemId]: 'O-zzz' },
          note: 'n'.repeat(501),
        }),
        row({ key: 'c', label: 'x'.repeat(200), values: { [WIDTH.itemId]: 10 } }),
      ],
      visible,
      t,
      500,
    );
    expect(errs['a:label']).toBe('sv.err.labelLong200');
    expect(errs[`a:${WIDTH.itemId}`]).toBe('sv.err.required');
    expect(errs['b:label']).toBe('sv.err.labelReserved');
    expect(errs[`b:${WIDTH.itemId}`]).toBe('sv.err.max{"v":400}');
    expect(errs[`b:${KIND.itemId}`]).toBe('sv.err.option');
    expect(errs['b:note']).toBe('sv.err.textLong{"n":500}');
    expect(Object.keys(errs).filter((k) => k.startsWith('c:'))).toEqual([]);
  });
});

describe('site-grid — mapping a refused save (sites S-5)', () => {
  const rows = [
    row({
      key: 'a',
      recordId: 'R1',
      label: 'D-01',
      values: { [WIDTH.itemId]: 90, [KIND.itemId]: 'O-a' },
    }),
    row({
      key: 'b',
      label: 'D-02',
      spaceId: 'SP-x',
      catalogItemId: 'C-x',
      values: { [WIDTH.itemId]: 500, [KIND.itemId]: null },
    }),
  ];
  const ctx = (patch: Partial<MapContext> = {}): MapContext => ({
    rows,
    visible,
    hidden,
    sent: bulkBody(rows, 'M1', visible),
    otherLabels: [],
    spaceIds: new Set(['SP-1']),
    catalogItemIds: new Set(['C-1']),
    t,
    fieldName: (f) => f.nameEn,
    ...patch,
  });

  it('Request.Records[i].Label / .Values[j] → that row / that cell', () => {
    const m = mapSaveErrors(
      {
        'Request.Records[1].Label': ['Label bad'],
        'Request.Records[0].Values[1].OptionId': ['Option bad'],
      },
      null,
      'fallback',
      ctx(),
    );
    expect(m.cells).toEqual({ 'b:label': 'Label bad', [`a:${KIND.itemId}`]: 'Option bad' });
    expect(m.banner).toBeNull();
  });

  it('S-09: Values[j] indexes the SENT body — a stored hidden value appended after the visible ones → banner; an unknown row → banner', () => {
    const withHidden = [
      { ...rows[0], hidden: [{ itemId: SECRET.itemId, valueText: 'kept' }] },
      rows[1],
    ];
    const sent = bulkBody(withHidden, 'M1', visible);
    expect(sent[0].values.map((v) => v.itemId)).toEqual([WIDTH.itemId, KIND.itemId, SECRET.itemId]);
    const m = mapSaveErrors(
      {
        'Request.Records[0].Values[2].ValueText': ['Hidden bad'],
        'Request.Records[0].Values[0].ValueNumber': ['Width bad'],
        'Request.Records[7].Label': ['No such row'],
      },
      null,
      'fallback',
      ctx({ rows: withHidden, sent }),
    );
    expect(m.cells).toEqual({ [`a:${WIDTH.itemId}`]: 'Width bad' });
    expect(m.banner).toContain('Hidden bad');
    expect(m.banner).toContain('No such row');
  });

  it('sites.validation.<code>.<rule> → the first row failing it locally, else a banner', () => {
    let m = mapSaveErrors(
      { 'sites.validation.width_cm.Max': ['m'] },
      'sites.validation.width_cm.Max',
      'fb',
      ctx(),
    );
    expect(m.cells).toEqual({ [`b:${WIDTH.itemId}`]: 'sv.err.max{"v":400}' });
    m = mapSaveErrors(
      { 'sites.validation.width_cm.Min': ['m'] },
      'sites.validation.width_cm.Min',
      'fb',
      ctx(),
    );
    expect(m.cells).toEqual({});
    expect(m.banner).toContain('width_cm');
    // a hidden required field the grid cannot show → banner naming it
    m = mapSaveErrors(
      { 'sites.validation.secret.Required': ['m'] },
      'sites.validation.secret.Required',
      'fb',
      ctx(),
    );
    expect(m.banner).toBe('secret: sv.err.required');
  });

  it('LabelTaken → the colliding label cells, else a banner', () => {
    let m = mapSaveErrors(
      { 'sites.LabelTaken': ['x'] },
      'sites.LabelTaken',
      'Taken',
      ctx({ otherLabels: ['d-02'] }),
    );
    expect(m.cells).toEqual({ 'b:label': 'Taken' });
    m = mapSaveErrors({ 'sites.LabelTaken': ['x'] }, 'sites.LabelTaken', 'Taken', ctx());
    expect(m.banner).toBe('Taken');
  });

  it('OptionNotOfItem → the first row with an option not in the field; ValueTypeMismatch → wrong type', () => {
    const odd = [
      rows[0],
      { ...rows[1], values: { [WIDTH.itemId]: 'abc', [KIND.itemId]: 'O-gone' } },
    ];
    let m = mapSaveErrors(
      { 'sites.OptionNotOfItem': ['x'] },
      'sites.OptionNotOfItem',
      'Opt',
      ctx({ rows: odd }),
    );
    expect(m.cells).toEqual({ [`b:${KIND.itemId}`]: 'Opt' });
    m = mapSaveErrors(
      { 'sites.ValueTypeMismatch': ['x'] },
      'sites.ValueTypeMismatch',
      'Type',
      ctx({ rows: odd }),
    );
    expect(m.cells).toEqual({ [`b:${WIDTH.itemId}`]: 'Type' });
    m = mapSaveErrors(
      { 'sites.ValueTypeMismatch': ['x'] },
      'sites.ValueTypeMismatch',
      'Type',
      ctx(),
    );
    expect(m.banner).toBe('Type');
  });

  it('CatalogItemNotFound / SpaceNotFound / SpaceNotInProject → the first row with an unknown id', () => {
    let m = mapSaveErrors(
      { 'sites.CatalogItemNotFound': ['x'] },
      'sites.CatalogItemNotFound',
      'Cat',
      ctx(),
    );
    expect(m.cells).toEqual({ 'b:catalog': 'Cat' });
    m = mapSaveErrors({ 'sites.SpaceNotInProject': ['x'] }, 'sites.SpaceNotInProject', 'Sp', ctx());
    expect(m.cells).toEqual({ 'b:space': 'Sp' });
    m = mapSaveErrors(
      { 'sites.SpaceNotFound': ['x'] },
      'sites.SpaceNotFound',
      'Sp',
      ctx({ rows: [rows[0]] }),
    );
    expect(m.banner).toBe('Sp');
  });

  it('anything unmapped → banner', () => {
    const m = mapSaveErrors(
      { 'sites.RecordNotFound': ['x'] },
      'sites.RecordNotFound',
      'Gone',
      ctx(),
    );
    expect(m).toEqual({ cells: {}, banner: 'Gone' });
  });
});
