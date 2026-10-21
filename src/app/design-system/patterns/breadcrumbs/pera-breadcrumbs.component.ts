import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';

export interface BreadcrumbItem {
  label: string;
  route?: string;
}

@Component({
  selector: 'pera-breadcrumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PeraIconComponent],
  host: { class: 'block' },
  template: `
    <nav aria-label="Breadcrumb">
      <ol class="flex items-center gap-1 m-0 p-0 list-none fs-body-sm">
        @for (item of items(); track $index; let last = $last) {
          <li class="flex items-center gap-1 min-w-0">
            @if (!last && item.route) {
              <a
                [routerLink]="item.route"
                class="text-text-muted hover:text-text-primary hover:underline truncate"
                >{{ item.label }}</a
              >
            } @else {
              <span
                class="truncate"
                [class.text-text-primary]="last"
                [class.font-medium]="last"
                [class.text-text-muted]="!last"
                [attr.aria-current]="last ? 'page' : null"
              >
                {{ item.label }}
              </span>
            }
            @if (!last) {
              <pera-icon name="chevron-right" [size]="14" class="text-text-muted rtl:rotate-180" />
            }
          </li>
        }
      </ol>
    </nav>
  `,
})
export class PeraBreadcrumbsComponent {
  readonly items = input<BreadcrumbItem[]>([]);
}
