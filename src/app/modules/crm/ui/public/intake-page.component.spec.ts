import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EN } from '@platform/i18n/catalog/en';
import { PublicIntakeApi } from '../../data/crm-public-intake.service';
import {
  FinishingPurpose,
  PastExperience,
  ProjectSector,
  UnitCondition,
  UnitType,
} from '../../model/crm-enums';
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

describe('IntakePageComponent — public lead intake (LI-1: the client answers the project questions)', () => {
  it('sends the details and notes with no intake when no project question is answered', () => {
    const submit = vi.fn().mockReturnValue(of(null));
    const { c } = make(submit);
    c.form.controls.notes.setValue('  Call after 5pm ');
    c.submit();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toEqual({
      firstName: 'Mona',
      lastName: 'Adel',
      email: null,
      phone: '0512345678',
      notes: 'Call after 5pm',
      intake: null,
    });
  });

  it('sends every project answer as the intake, residential block included', () => {
    const submit = vi.fn().mockReturnValue(of(null));
    const { c } = make(submit);
    c.form.patchValue({
      jobTitle: ' Doctor ',
      clientAddress: 'Zamalek',
      projectSector: String(ProjectSector.Residential),
      unitAddress: 'New Cairo',
      areaSqm: '180.5',
      usedDesignerBefore: true,
    });
    c.form.patchValue({
      designerExperience: PastExperience.Bad,
      designerExperienceReason: 'Late',
      unitType: String(UnitType.Villa),
      unitCondition: String(UnitCondition.SemiFinished),
      isLicensed: true,
      isRented: false,
      finishingPurpose: String(FinishingPurpose.TurnkeyDelivery),
    });
    c.submit();

    expect(submit.mock.calls[0][0]).toEqual({
      firstName: 'Mona',
      lastName: 'Adel',
      email: null,
      phone: '0512345678',
      notes: null,
      intake: {
        jobTitle: 'Doctor',
        clientAddress: 'Zamalek',
        sector: ProjectSector.Residential,
        unitAddress: 'New Cairo',
        areaSqm: 180.5,
        usedDesignerBefore: true,
        designerExperience: PastExperience.Bad,
        designerExperienceReason: 'Late',
        residential: {
          unitType: UnitType.Villa,
          unitCondition: UnitCondition.SemiFinished,
          isLicensed: true,
          isRented: false,
          finishingPurpose: FinishingPurpose.TurnkeyDelivery,
        },
      },
    });
  });

  it('sends no residential block for another sector, and no experience without "used a designer"', () => {
    const submit = vi.fn().mockReturnValue(of(null));
    const { c } = make(submit);
    c.form.patchValue({ projectSector: String(ProjectSector.Retail), usedDesignerBefore: false });
    c.submit();

    expect(submit.mock.calls[0][0].intake).toEqual({
      jobTitle: null,
      clientAddress: null,
      sector: ProjectSector.Retail,
      unitAddress: null,
      areaSqm: null,
      usedDesignerBefore: false,
      designerExperience: null,
      designerExperienceReason: null,
      residential: null,
    });
  });

  it('shows the project questions on step 2, and the residential ones only for Residential', () => {
    const { fixture, c } = make(vi.fn());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain(EN['intake.fSector']);
    expect(el.textContent).toContain(EN['intake.fJobTitle']);
    expect(el.textContent).toContain(EN['intake.fUnitAddress']);
    expect(el.textContent).toContain(EN['intake.usedDesignerBefore']);
    expect(el.textContent).toContain(EN['public.notes']);
    // Not 'intake.fUnit' ("Unit"): it is a substring of "Unit address".
    expect(el.textContent).not.toContain(EN['intake.fCondition']);
    expect(el.textContent).not.toContain(EN['brief.fFinishingPurpose']);

    c.form.controls.projectSector.setValue(String(ProjectSector.Residential));
    fixture.detectChanges();
    expect(el.textContent).toContain(EN['intake.fCondition']);
    expect(el.textContent).toContain(EN['brief.fFinishingPurpose']);
  });

  it('shows the failure message for a 400 on a project answer, which has no inline control', () => {
    const problem = new HttpErrorResponse({
      status: 400,
      error: { status: 400, title: 'Validation', errors: { 'Intake.JobTitle': ['Too long'] } },
    });
    const { fixture, c } = make(vi.fn().mockReturnValue(throwError(() => problem)));
    c.submit();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(EN['public.failTitle']);
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
