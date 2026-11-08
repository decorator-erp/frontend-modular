import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuditService } from '../data/audit.service';
import type { AuditLogResponse } from '../model/audit.model';
import { AuditLogComponent } from './audit-log.component';

const entry: AuditLogResponse = {
  id: 'L1',
  userId: 'U1',
  userName: null,
  userEmail: 'mona@example.com',
  ipAddress: '10.0.0.1',
  action: 'Update',
  entityName: 'Project',
  entityId: 'P1',
  module: 'Projects',
  description: null,
  outcome: '',
  failureReason: null,
  oldValues: null,
  newValues: null,
  changedColumns: null,
  requestPath: null,
  requestMethod: null,
  durationMs: null,
  timestamp: '2026-11-07T10:00:00Z',
};

/** Sync W2-7: AuditLogResponse has no outcome (NotificationContracts.cs) — no always-empty column. */
describe('AuditLogComponent (sync W2-7)', () => {
  it('shows the action name and no Outcome column', () => {
    TestBed.configureTestingModule({
      imports: [AuditLogComponent],
      providers: [
        {
          provide: AuditService,
          useValue: {
            getLogs: () =>
              of({ items: [entry], totalCount: 1, page: 1, pageSize: 30, totalPages: 1 }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AuditLogComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const headers = Array.from(el.querySelectorAll('th')).map((t) => t.textContent?.trim());
    expect(headers).not.toContain('Outcome');
    expect(el.querySelector('tbody')?.textContent).toContain('Update');
  });
});
