import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProjectService } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmProjectQuickCreateComponent } from './project-quick-create.component';

function setup() {
  const create = vi.fn(() => of('new-id'));
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [CrmProjectQuickCreateComponent],
    providers: [
      { provide: ProjectService, useValue: { create } },
      { provide: ToastService, useValue: { show: vi.fn() } },
      { provide: PeraModalRef, useValue: { close } },
      { provide: PERA_MODAL_DATA, useValue: { clientId: 'C' } },
    ],
  });
  const fixture = TestBed.createComponent(CrmProjectQuickCreateComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, create, close };
}

describe('CrmProjectQuickCreateComponent — no budget (008b FINDING-6-1)', () => {
  it('has no estimatedBudget control and renders no Budget field', () => {
    const { fixture, c } = setup();
    expect('estimatedBudget' in (c.form.controls as Record<string, unknown>)).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Budget');
  });

  it('submits without a budget', () => {
    const { c, create, close } = setup();
    c.form.patchValue({ name: 'Villa', code: 'VL-01', address: 'New Cairo, Cairo' });
    c.submit();
    expect(create).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith('new-id');
  });
});
