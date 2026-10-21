import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PermissionsService } from '@platform/permissions/permissions.service';

export interface TabDef {
  id: string;
  label: string;
  capability?: string;
}

/** underline = page-level sections; pill = a view switch within a panel. */
export type TabsVariant = 'underline' | 'pill';

@Component({
  selector: 'pera-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex gap-1 overflow-x-auto"
      [class.border-b]="variant() === 'underline'"
      [class.border-border]="variant() === 'underline'"
      [class.p-1]="variant() === 'pill'"
      [class.bg-surface-muted]="variant() === 'pill'"
      [class.rounded-lg]="variant() === 'pill'"
      role="tablist"
    >
      @for (tab of visibleTabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="tab.id === activeId()"
          class="px-3 py-2 text-sm whitespace-nowrap cursor-pointer transition-colors
                 outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          [class]="tabClasses(tab.id)"
          (click)="activeChange.emit(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
})
export class PeraTabsComponent {
  private readonly permissions = inject(PermissionsService);

  readonly tabs = input<TabDef[]>([]);
  readonly activeId = input('');
  /** underline (default, page sections) | pill (view switch within a panel). */
  readonly variant = input<TabsVariant>('underline');
  readonly activeChange = output<string>();

  readonly visibleTabs = computed(() =>
    this.tabs().filter((t) => !t.capability || this.permissions.can(t.capability)),
  );

  tabClasses(id: string): string {
    const active = id === this.activeId();
    if (this.variant() === 'pill') {
      return active
        ? 'rounded-md bg-surface text-text-primary font-medium shadow-sm'
        : 'rounded-md text-text-secondary hover:text-text-primary';
    }
    return active
      ? '-mb-px border-b-2 border-accent text-accent font-medium'
      : '-mb-px border-b-2 border-transparent text-text-secondary hover:text-text-primary';
  }
}
