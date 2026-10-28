import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import { BriefStore } from '../../stores/brief.store';
import { CrmBriefCreateComponent } from './brief-create.component';

describe('CrmBriefCreateComponent (009b #10)', () => {
  let store: {
    error: ReturnType<typeof signal<string | null>>;
    creating: ReturnType<typeof signal<boolean>>;
    createBrief: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    store = { error: signal(null), creating: signal(false), createBrief: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CrmBriefCreateComponent],
      providers: [
        { provide: BriefStore, useValue: store },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
  });

  function render(stageId: string | null) {
    const fixture = TestBed.createComponent(CrmBriefCreateComponent);
    fixture.componentRef.setInput('stageId', stageId);
    fixture.detectChanges();
    return fixture;
  }

  it('asks for a stage when none is picked, with no create action', () => {
    const el = render(null).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pick a stage to create its brief.');
    expect(el.querySelector('pera-button')).toBeNull();
  });

  it('creates the stage brief, unit details left to the lead intake (0) by default', () => {
    const fixture = render('S2');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No brief yet');

    fixture.componentInstance['create']('S2');

    expect(store.createBrief).toHaveBeenCalledWith('S2', { unitType: 0, unitCondition: 0 });
  });

  it('sends the picked unit type and condition', () => {
    const fixture = render('S2');
    fixture.componentInstance['unitType'].set('2');
    fixture.componentInstance['unitCondition'].set('3');

    fixture.componentInstance['create']('S2');

    expect(store.createBrief).toHaveBeenCalledWith('S2', { unitType: 2, unitCondition: 3 });
  });
});
