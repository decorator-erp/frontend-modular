import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { CanDirective, PERM } from '@platform/permissions';
import { CrmContact, CrmContactService } from '../../data/crm-contact.service';
import { CrmNote, CrmNoteService } from '../../data/crm-note.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import {
  ColumnDef,
  ConfirmService,
  ModalService,
  PeraButtonComponent,
  PeraCardComponent,
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraStatusBadgeComponent,
  TableRowAction,
} from '@ds';
import { ClientHubStore } from '../../stores/client-hub.store';
import { CrmContactFormComponent } from './contact-form.component';
import { CrmEditContactFormComponent } from './edit-contact-form.component';
import { CrmNoteFormComponent } from './note-form.component';

/** Overview tab (B3) — full contact management + client-level internal notes. */
@Component({
  selector: 'app-client-hub-overview-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PeraButtonComponent,
    PeraCardComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraStatusBadgeComponent,
  ],
  template: `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <pera-card>
        <div class="flex items-center gap-3 p-1">
          <span class="font-semibold fs-body-sm text-text-primary flex-1">{{
            catalog.t('hub.contacts')
          }}</span>
          <pera-button
            variant="secondary"
            size="sm"
            *peraCan="PERM.crm.contacts.create"
            (click)="addContact()"
            >{{ catalog.t('hub.addContact') }}</pera-button
          >
        </div>
        <pera-data-table
          [columns]="contactColumns()"
          [rows]="store.contacts()"
          [rowActions]="contactActions"
          [empty]="{ title: catalog.t('hub.noContacts') }"
        />
        <ng-template #nameTpl let-row>
          <div class="flex items-center gap-2">
            <span>{{ row.firstName }} {{ row.lastName }}</span>
            @if (row.isPrimary) {
              <pera-status-badge tone="info" [label]="catalog.t('client.primaryChip')" />
            }
          </div>
        </ng-template>
        <ng-template #contactTpl let-row>
          <div class="flex flex-col fs-caption text-text-secondary" dir="ltr">
            @if (row.email) {
              <span>{{ row.email }}</span>
            }
            @if (row.phone) {
              <span>{{ row.phone }}</span>
            }
          </div>
        </ng-template>
      </pera-card>

      <pera-card>
        <div class="flex items-center gap-3 p-1">
          <span class="font-semibold fs-body-sm text-text-primary flex-1">{{
            catalog.t('hub.internalNotes')
          }}</span>
          <pera-button
            variant="secondary"
            size="sm"
            *peraCan="PERM.crm.notes.create"
            (click)="addNote()"
            >{{ catalog.t('hub.addNote') }}</pera-button
          >
        </div>
        @if (store.notes().length) {
          <ul class="flex flex-col gap-2 p-1 m-0 list-none">
            @for (note of store.notes(); track note.id) {
              <li class="flex items-start gap-2 p-2 border border-border rounded-sm">
                <div class="flex-1 min-w-0">
                  <p class="fs-body-sm text-text-primary m-0 whitespace-pre-wrap">
                    {{ note.content }}
                  </p>
                  <span class="fs-label text-text-muted">{{ dateLabel(note.createdAtUtc) }}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0" *peraCan="PERM.crm.notes.update">
                  <button
                    type="button"
                    class="fs-caption text-text-secondary cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
                    (click)="editNote(note)"
                  >
                    {{ catalog.t('common.edit') }}
                  </button>
                  <button
                    type="button"
                    class="fs-caption text-danger cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
                    *peraCan="PERM.crm.notes.delete"
                    (click)="deleteNote(note)"
                  >
                    {{ catalog.t('common.delete') }}
                  </button>
                </div>
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('hub.noNotes')" />
        }
      </pera-card>
    </div>
  `,
})
export class ClientHubOverviewTabComponent {
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly contactsApi = inject(CrmContactService);
  private readonly notesApi = inject(CrmNoteService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(ClientHubStore);
  protected readonly PERM = PERM;

  private readonly nameTpl = viewChild.required<TemplateRef<unknown>>('nameTpl');
  private readonly contactTpl = viewChild.required<TemplateRef<unknown>>('contactTpl');

  protected readonly contactColumns = computed<ColumnDef<CrmContact>[]>(() => [
    { key: 'name', header: this.catalog.t('brief.fClient'), template: this.nameTpl() },
    { key: 'contact', header: this.catalog.t('hub.contactInfo'), template: this.contactTpl() },
  ]);

  protected readonly contactActions: TableRowAction<CrmContact>[] = [
    {
      label: this.catalog.t('common.edit'),
      capability: PERM.crm.contacts.update,
      action: (row) => this.editContact(row),
    },
    {
      label: this.catalog.t('hub.setPrimary'),
      capability: PERM.crm.contacts.setPrimary,
      visible: (row) => !row.isPrimary,
      action: (row) => this.setPrimary(row),
    },
  ];

  protected dateLabel(iso: string): string {
    return formatCairoDate(iso, this.catalog.locale());
  }

  protected async addContact(): Promise<void> {
    const client = this.store.client();
    if (!client) return;
    const ok = await this.modal
      .open<boolean>(CrmContactFormComponent, {
        size: 'md',
        data: { clientId: client.id, clientName: `${client.firstName} ${client.lastName}` },
      })
      .afterClosed();
    if (ok) this.store.reloadContacts();
  }

  protected async editContact(contact: CrmContact): Promise<void> {
    const client = this.store.client();
    if (!client) return;
    const ok = await this.modal
      .open<boolean>(CrmEditContactFormComponent, {
        size: 'md',
        data: { clientId: client.id, contact },
      })
      .afterClosed();
    if (ok) this.store.reloadContacts();
  }

  protected setPrimary(contact: CrmContact): void {
    const client = this.store.client();
    if (!client) return;
    this.contactsApi.setPrimary(client.id, contact.id).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('common.saved') });
        this.store.reloadContacts();
      },
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.toast.show({ tone: 'danger', message: friendly(parsed) });
      },
    });
  }

  protected async addNote(): Promise<void> {
    const client = this.store.client();
    if (!client) return;
    const ok = await this.modal
      .open<boolean>(CrmNoteFormComponent, {
        size: 'md',
        data: { clientId: client.id, projectId: this.store.selectedProjectId() },
      })
      .afterClosed();
    if (ok) this.store.reloadNotes();
  }

  protected async editNote(note: CrmNote): Promise<void> {
    const client = this.store.client();
    if (!client) return;
    const ok = await this.modal
      .open<boolean>(CrmNoteFormComponent, {
        size: 'md',
        data: { clientId: client.id, noteId: note.id, initialContent: note.content },
      })
      .afterClosed();
    if (ok) this.store.reloadNotes();
  }

  protected async deleteNote(note: CrmNote): Promise<void> {
    const ok = await this.confirm.open({
      title: this.catalog.t('common.delete'),
      body: this.catalog.t('hub.deleteNoteConfirm'),
      tone: 'danger',
      confirmLabel: this.catalog.t('common.delete'),
    });
    if (!ok) return;
    this.notesApi.remove(note.id).subscribe({
      next: () => this.store.reloadNotes(),
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.toast.show({ tone: 'danger', message: friendly(parsed) });
      },
    });
  }
}
