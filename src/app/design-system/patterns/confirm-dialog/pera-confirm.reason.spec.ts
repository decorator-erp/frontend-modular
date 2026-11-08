import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '../modal/modal.service';
import { ConfirmOptions, PeraConfirmComponent } from './pera-confirm.component';

/** crmp P1-B: a confirm may carry an optional reason; without one it still answers a boolean. */
describe('PeraConfirmComponent — optional reason', () => {
  function make(opts: ConfirmOptions) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [PeraConfirmComponent],
      providers: [
        { provide: PERA_MODAL_DATA, useValue: opts },
        { provide: PeraModalRef, useValue: { close } },
      ],
    });
    const f = TestBed.createComponent(PeraConfirmComponent);
    f.detectChanges();
    return { f, close };
  }

  it('without reason: no field, closes with a boolean', () => {
    const { f, close } = make({ title: 'T', body: 'B' });
    expect((f.nativeElement as HTMLElement).querySelector('[data-confirm-reason]')).toBeNull();
    f.componentInstance.close(true);
    expect(close).toHaveBeenCalledWith(true);
  });

  it('with reason: shows the field, trims and caps the text, closes with { confirmed, reason }', () => {
    const { f, close } = make({ title: 'T', body: 'B', reason: { label: 'Why', maxLength: 5 } });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-confirm-reason]')?.textContent).toContain('Why');
    f.componentInstance.setReason('  abcdefgh');
    f.componentInstance.close(true);
    expect(close).toHaveBeenCalledWith({ confirmed: true, reason: 'abc' });
    f.componentInstance.setReason('');
    f.componentInstance.close(false);
    expect(close).toHaveBeenLastCalledWith({ confirmed: false, reason: '' });
  });
});
