import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { SiteDecideDialogComponent } from './site-decide-dialog.component';

describe('SiteDecideDialogComponent (sites S-4)', () => {
  function render(save = vi.fn().mockResolvedValue({ ok: true })) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [SiteDecideDialogComponent],
      providers: [
        { provide: PeraModalRef, useValue: { close } },
        { provide: PERA_MODAL_DATA, useValue: { approve: false, code: 'SITE-1', save } },
      ],
    });
    const fixture = TestBed.createComponent(SiteDecideDialogComponent);
    fixture.detectChanges();
    return { cmp: fixture.componentInstance, close, save };
  }

  it('note ≤1000: 1001 blocks the call, 1000 goes through (trimmed, empty → null)', async () => {
    const { cmp, save, close } = render();
    cmp.note.set('a'.repeat(1001));
    await cmp.submit();
    expect(save).not.toHaveBeenCalled();
    expect(cmp.noteError()).toBe('At most 1000 characters.');
    cmp.note.set('a'.repeat(1000));
    await cmp.submit();
    expect(save).toHaveBeenCalledWith('a'.repeat(1000));
    expect(close).toHaveBeenCalledWith(true);
  });

  it('a refusal stays inline', async () => {
    const { cmp, close } = render(
      vi
        .fn()
        .mockResolvedValue({ ok: false, message: 'Not you', code: 'sites.SelfApprovalNotAllowed' }),
    );
    cmp.note.set('  ');
    await cmp.submit();
    expect(cmp.banner()).toBe('Not you');
    expect(cmp.bannerCode()).toBe('sites.SelfApprovalNotAllowed');
    expect(close).not.toHaveBeenCalled();
  });
});
