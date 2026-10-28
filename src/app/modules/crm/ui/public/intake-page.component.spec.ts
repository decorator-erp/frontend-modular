import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EN } from '@platform/i18n/catalog/en';
import { PublicIntakeApi } from '../../data/crm-public-intake.service';
import { IntakePageComponent } from './intake-page.component';

function make(submit: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [IntakePageComponent],
    providers: [{ provide: PublicIntakeApi, useValue: { submit } }],
  });
  const fixture = TestBed.createComponent(IntakePageComponent);
  const c = fixture.componentInstance;
  c.form.patchValue({ firstName: 'Mona', lastName: 'Adel', phone: '0512345678', email: '' });
  c.submit(); // step 1 → step 2
  return { fixture, c };
}

const failure = (status: number) =>
  throwError(() => new HttpErrorResponse({ status, error: null, statusText: 'x' }));

describe('IntakePageComponent — public lead intake (009b #8, D-a)', () => {
  it('submits exactly firstName, lastName, email, phone, notes (no intake, no honeypot)', () => {
    const submit = vi.fn().mockReturnValue(of(null));
    const { c } = make(submit);
    c.submit();

    expect(submit).toHaveBeenCalledTimes(1);
    const body = submit.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['email', 'firstName', 'lastName', 'notes', 'phone']);
    expect(body).toEqual({
      firstName: 'Mona',
      lastName: 'Adel',
      email: null,
      phone: '0512345678',
      notes: null,
    });
  });

  it('hides the intake questions on the project step', () => {
    const { fixture } = make(vi.fn());
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain(EN['intake.fSector']);
    expect(text).toContain(EN['public.projectLater']);
  });

  it.each([
    [503, 'public.unavailableTitle'],
    [413, 'public.tooLargeTitle'],
    [429, 'public.rlTitle'],
  ] as const)('renders the inline %i state', (status, key) => {
    const { fixture, c } = make(vi.fn().mockReturnValue(failure(status)));
    c.submit();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(EN[key]);
  });
});
