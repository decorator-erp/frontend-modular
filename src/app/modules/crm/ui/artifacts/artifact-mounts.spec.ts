import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import { CrmAgendaComponent } from '../scheduler/agenda.component';
import { CrmArtifactLinksComponent } from './artifact-links.component';
import { MeetingStatus, MeetingType } from '../../model/crm-enums';

@Component({
  selector: 'app-crm-artifact-links',
  template: '{{ subject() }}:{{ subjectId() }}:{{ projectId() }}',
})
class LinksStub {
  readonly subject = input('');
  readonly subjectId = input('');
  readonly projectId = input('');
}

/** Sync F4c: a meeting opens its linked documents in place. */
describe('CrmAgendaComponent — linked documents (sync F4c)', () => {
  it('Documents opens the meeting-subject links panel for that meeting', () => {
    TestBed.configureTestingModule({
      imports: [CrmAgendaComponent],
      providers: [{ provide: PermissionsService, useValue: { can: () => true } }],
    });
    TestBed.overrideComponent(CrmAgendaComponent, {
      remove: { imports: [CrmArtifactLinksComponent] },
      add: { imports: [LinksStub] },
    });
    const f = TestBed.createComponent(CrmAgendaComponent);
    f.componentRef.setInput('rows', [
      {
        id: 'm1',
        projectId: 'p1',
        periodId: null,
        title: 'Kickoff',
        type: MeetingType.InOffice,
        status: MeetingStatus.Completed,
        scheduledAtUtc: '2026-10-01T10:00:00Z',
      },
    ]);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('app-crm-artifact-links')).toBeNull();
    (el.querySelector('[data-meeting-docs]') as HTMLElement).click();
    f.detectChanges();
    expect(el.querySelector('app-crm-artifact-links')?.textContent).toBe('meeting:m1:p1');
  });
});
