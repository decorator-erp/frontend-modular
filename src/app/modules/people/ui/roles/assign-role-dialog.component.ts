import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RoleService } from '../../data/role.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { EmployeeService } from '../../data/employee.service';
import { EmployeeListItem } from '../../model/employee.model';
import {
  PERA_MODAL_DATA,
  PeraAvatarComponent,
  PeraButtonComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraSpinnerComponent,
} from '@ds';

export interface AssignRoleDialogData {
  roleId: string;
  roleName: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraAvatarComponent,
    PeraButtonComponent,
    PeraInputComponent,
    PeraSpinnerComponent,
  ],
  template: `
    <pera-modal [title]="'Assign “' + data.roleName + '”'" size="md">
      <div class="flex flex-col gap-3">
        <pera-input
          iconStart="search"
          placeholder="Search employee"
          [ngModel]="term()"
          (ngModelChange)="term.set($event)"
        />
        @if (loading()) {
          <div class="flex justify-center py-8"><pera-spinner size="md" tone="accent" /></div>
        } @else {
          <div
            class="flex flex-col max-h-80 overflow-auto border border-border rounded-md divide-y divide-border"
          >
            @for (person of filtered(); track person.trackKey) {
              <div class="flex items-center gap-3 px-3 py-2">
                <pera-avatar [name]="person.fullName" size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium truncate">{{ person.fullName }}</div>
                  <div class="text-xs text-text-muted truncate">{{ person.email }}</div>
                </div>
                <pera-button
                  size="xs"
                  variant="secondary"
                  [loading]="assigning() === person.userId"
                  [disabled]="assigned().has(person.userId)"
                  (click)="assign(person)"
                  >{{ assigned().has(person.userId) ? 'Assigned' : 'Assign' }}</pera-button
                >
              </div>
            } @empty {
              <p class="m-0 p-4 text-sm text-text-muted text-center">No employees match.</p>
            }
          </div>
        }
      </div>
      <div peraModalFooter>
        <pera-button variant="ghost" (click)="close()">Done</pera-button>
      </div>
    </pera-modal>
  `,
})
export class AssignRoleDialogComponent implements OnInit {
  private readonly directory = inject(EmployeeService);
  private readonly roles = inject(RoleService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as AssignRoleDialogData;

  readonly loading = signal(true);
  readonly term = signal('');
  readonly assigning = signal<string | null>(null);
  readonly assigned = signal<Set<string>>(new Set());
  private readonly all = signal<EmployeeListItem[]>([]);
  private changed = false;

  readonly filtered = computed(() => {
    const t = this.term().trim().toLowerCase();
    const rows = this.all();
    if (!t) return rows.slice(0, 50);
    return rows
      .filter((e) => e.fullName.toLowerCase().includes(t) || e.email.toLowerCase().includes(t))
      .slice(0, 50);
  });

  ngOnInit(): void {
    // TODO(backend-gap): nothing lists the members OF a role — `GET /api/roles/users/{userId}` is
    // per-user, and asking it for every row would be a request per employee. So `assigned` starts
    // empty and only tracks what THIS dialog session assigned: a user who already holds the role
    // still shows "Assign", and the duplicate is reported by the server on click rather than
    // prevented up front. Seed it properly if a members-of-a-role route ever ships.
    this.directory.listPaged({ page: 1, pageSize: 500, isActive: true }).subscribe({
      next: (paged) => {
        this.all.set(paged.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  assign(person: EmployeeListItem): void {
    this.assigning.set(person.userId);
    this.roles.assignToUser(person.userId, this.data.roleId).subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `${this.data.roleName} assigned to ${person.fullName}`,
        });
        this.assigned.update((s) => new Set(s).add(person.userId));
        this.assigning.set(null);
        this.changed = true;
      },
      error: (err: HttpErrorResponse) => {
        this.assigning.set(null);
        // Was swallowed entirely, so an already-assigned user looked like a dead button.
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  close(): void {
    this.modalRef.close(this.changed);
  }
}
