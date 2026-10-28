import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CrmApprovalsInboxComponent } from './approvals-inbox.component';

/** The `/portal/approvals` nav destination (T104/T119) — hosts the real inbox. */
@Component({
  selector: 'app-crm-client-approvals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CrmApprovalsInboxComponent],
  host: { class: 'block' },
  template: `<app-crm-approvals-inbox />`,
})
export class CrmClientApprovalsPageComponent {}
