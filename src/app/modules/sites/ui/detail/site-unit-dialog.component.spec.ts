import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { EMPTY_UNIT_DATA } from '../../model/site.model';
import {
  SiteUnitDialogComponent,
  cairoToday,
  type SiteUnitDialogData,
} from './site-unit-dialog.component';

describe('SiteUnitDialogComponent (sites S-2 / S-3)', () => {
  let close: ReturnType<typeof vi.fn>;

  function render(data: Partial<SiteUnitDialogData>) {
    TestBed.configureTestingModule({
      imports: [SiteUnitDialogComponent],
      providers: [
        { provide: PeraModalRef, useValue: { close } },
        {
          provide: PERA_MODAL_DATA,
          useValue: { mode: 'create', save: vi.fn(), ...data } as SiteUnitDialogData,
        },
      ],
    });
    const fixture = TestBed.createComponent(SiteUnitDialogComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    close = vi.fn();
  });

  it('create prefills surveyedOn with today (Cairo) and the picked project', () => {
    const cmp = render({
      projects: [{ id: 'P', code: 'PRJ', name: 'N' } as never],
      projectId: 'P',
    });
    expect(cmp.form.getRawValue().surveyedOn).toBe(cairoToday());
    expect(cmp.form.getRawValue().projectId).toBe('P');
  });

  it('blocks the save on a §5 failure (area 0, floor 201) and sends nothing', async () => {
    const save = vi.fn();
    const cmp = render({ mode: 'edit', initial: EMPTY_UNIT_DATA, save });
    cmp.form.patchValue({ areaSqm: '0', floorNo: '201' });
    await cmp.submit();
    expect(save).not.toHaveBeenCalled();
    expect(cmp.errors()['areaSqm']).toBeTruthy();
    expect(cmp.errors()['floorNo']).toBeTruthy();
  });

  it('sends the whole unit data (numbers parsed, blanks null, enums as ints) and closes on ok', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const cmp = render({ mode: 'edit', initial: EMPTY_UNIT_DATA, save });
    cmp.form.patchValue({
      address: ' Maadi ',
      areaSqm: '120.25',
      floorNo: '-5',
      unitType: 2,
      isRented: false,
    });
    await cmp.submit();
    expect(save).toHaveBeenCalledWith('', {
      ...EMPTY_UNIT_DATA,
      address: 'Maadi',
      areaSqm: 120.25,
      floorNo: -5,
      unitType: 2,
      isRented: false,
    });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('shows a refusal inline and keeps the dialog open', async () => {
    const save = vi.fn().mockResolvedValue({
      ok: false,
      message: 'This survey is locked.',
      code: 'sites.SiteLocked',
      fieldErrors: { address: 'x' },
    });
    const cmp = render({ mode: 'edit', initial: EMPTY_UNIT_DATA, save });
    await cmp.submit();
    expect(cmp.banner()).toBe('This survey is locked.');
    expect(cmp.errors()).toEqual({ address: 'x' });
    expect(close).not.toHaveBeenCalled();
  });
});
