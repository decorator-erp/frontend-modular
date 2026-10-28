import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ClientService } from '@modules/clients';
import { StageTemplatesService } from '@modules/library';
import { ToastService } from '@platform/feedback/toast.service';
import { ProjectService } from '../../data/project.service';
import { ProjectCreateComponent } from './project-create.component';

function setup() {
  const create = vi.fn(() => of('new-id'));
  TestBed.configureTestingModule({
    imports: [ProjectCreateComponent],
    providers: [
      { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      { provide: ProjectService, useValue: { create } },
      { provide: ClientService, useValue: { getAll: () => of([]) } },
      { provide: StageTemplatesService, useValue: { list: () => of([]) } },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(ProjectCreateComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, create };
}

describe('ProjectCreateComponent — no budget/status (008b FINDING-6-1)', () => {
  it('has no estimatedBudget or status control and renders neither field', () => {
    const { fixture, c } = setup();
    const controls = c.form.controls as Record<string, unknown>;
    expect('estimatedBudget' in controls).toBe(false);
    expect('status' in controls).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Estimated budget');
    expect(text).not.toMatch(/\bStatus\b/);
  });

  it('submits without a budget (new projects are always Draft)', () => {
    const { c, create } = setup();
    c.form.patchValue({
      code: 'AM-04',
      name: 'Al Maha',
      address: 'Zamalek, Cairo',
      clientId: 'c1',
      workflowType: 'FreeStyle',
    });
    c.submit();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectCreateComponent — POST body (008b FINDING-6-2)', () => {
  it('sends exactly the CreateProjectRequest keys for a Stage project', () => {
    const { c, create } = setup();
    c.form.patchValue({
      code: ' AM-04 ',
      name: ' Al Maha ',
      address: ' Zamalek, Cairo ',
      clientId: 'c1',
      workflowType: 'Stage',
      stageTemplateId: 't1',
      estimatedStartDate: '2026-07-01',
      estimatedEndDate: '2027-04-12',
      description: ' Scope ',
      notes: ' Internal ',
    });
    c.submit();
    expect(create.mock.calls[0]).toStrictEqual([
      {
        code: 'AM-04',
        name: 'Al Maha',
        address: 'Zamalek, Cairo',
        clientId: 'c1',
        workflowType: 'Stage',
        stageTemplateId: 't1',
        estimatedStartDate: '2026-07-01',
        estimatedEndDate: '2027-04-12',
        description: 'Scope',
        notes: 'Internal',
      },
    ]);
  });

  it('sends nulls for the optional fields of a FreeStyle project', () => {
    const { c, create } = setup();
    c.form.patchValue({
      code: 'AM-04',
      name: 'Al Maha',
      address: 'Zamalek, Cairo',
      clientId: 'c1',
      workflowType: 'FreeStyle',
    });
    c.submit();
    expect(create.mock.calls[0]).toStrictEqual([
      {
        code: 'AM-04',
        name: 'Al Maha',
        address: 'Zamalek, Cairo',
        clientId: 'c1',
        workflowType: 'FreeStyle',
        stageTemplateId: null,
        estimatedStartDate: null,
        estimatedEndDate: null,
        description: null,
        notes: null,
      },
    ]);
  });
});
