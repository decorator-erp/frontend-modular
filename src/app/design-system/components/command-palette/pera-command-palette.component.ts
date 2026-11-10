import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, Routes } from '@angular/router';
import { PeraIconComponent } from '../icon/pera-icon.component';
import { PeraKbdComponent } from '../kbd/pera-kbd.component';
import { CommandItem, CommandPaletteService, fuzzyMatch } from './command-palette.service';
import { CatalogService } from '@platform/i18n/catalog.service';

/**
 * `⌘K` command palette. Renders a modal overlay that fuzzy-searches the app's
 * routes plus any entity sources features have registered on
 * {@link CommandPaletteService}. Mount once in the app shell.
 */
@Component({
  selector: 'pera-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PeraIconComponent, PeraKbdComponent],
  host: { '(document:keydown)': 'onGlobalKey($event)' },
  template: `
    @if (palette.open()) {
      <div
        class="fixed inset-0 z-[100] flex items-start justify-center"
        role="dialog"
        aria-modal="true"
      >
        <!-- backdrop -->
        <button
          type="button"
          class="absolute inset-0 bg-black/40 cursor-default"
          aria-label="Close command palette"
          (click)="palette.close()"
        ></button>

        <!-- panel -->
        <div
          class="relative mt-[12vh] w-full max-w-xl bg-surface border border-border rounded-lg shadow-lg"
        >
          <div class="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
            <pera-icon name="search" [size]="15" class="text-text-muted shrink-0" />
            <input
              #searchInput
              type="text"
              placeholder="Search pages and records…"
              [(ngModel)]="query"
              (keydown)="onInputKey($event)"
              class="flex-1 min-w-0 bg-transparent border-0 outline-0 fs-body-sm text-text-primary"
            />
            <pera-kbd>ESC</pera-kbd>
          </div>

          <div class="max-h-80 overflow-auto py-1">
            @for (group of groups(); track group.label) {
              <div class="px-3.5 pt-2 pb-1 font-mono fs-micro text-text-muted">
                {{ group.label }}
              </div>
              @for (item of group.items; track item.id) {
                <button
                  type="button"
                  class="w-full text-start px-3.5 py-2 flex items-center gap-2.5 cursor-pointer"
                  [class.bg-accent-soft]="item.id === activeId()"
                  (mouseenter)="setActive(item.id)"
                  (click)="run(item)"
                >
                  @if (item.icon) {
                    <pera-icon [name]="item.icon" [size]="14" class="text-text-muted shrink-0" />
                  }
                  <span class="flex-1 truncate fs-caption text-text-primary">{{ item.label }}</span>
                  @if (item.hint) {
                    <span class="font-mono fs-label text-text-muted shrink-0">{{ item.hint }}</span>
                  }
                </button>
              }
            } @empty {
              <div class="px-3.5 py-6 text-center fs-caption text-text-muted">No results</div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class PeraCommandPaletteComponent {
  readonly palette = inject(CommandPaletteService);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly query = signal('');
  readonly activeId = signal<string | null>(null);

  private readonly routeItems = this.buildRouteItems();

  readonly groups = computed(() => {
    const q = this.query().trim();
    const routeGroup = {
      label: 'Navigate',
      items: this.routeItems.filter((i) => fuzzyMatch(i.label, q)).slice(0, 8),
    };
    const featureGroups = this.palette
      .sources()
      .map((src) => ({ label: src.label, items: src.search(q).slice(0, 8) }))
      .filter((g) => g.items.length);
    return [routeGroup, ...featureGroups].filter((g) => g.items.length);
  });

  private readonly flat = computed(() => this.groups().flatMap((g) => g.items));

  constructor() {
    // Focus the input and reset state whenever the palette opens.
    effect(() => {
      if (this.palette.open()) {
        this.query.set('');
        queueMicrotask(() => {
          this.searchInput()?.nativeElement.focus();
          this.activeId.set(this.flat()[0]?.id ?? null);
        });
      }
    });
  }

  setActive(id: string): void {
    this.activeId.set(id);
  }

  run(item: CommandItem): void {
    this.palette.close();
    item.run();
  }

  onGlobalKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
    } else if (event.key === 'Escape' && this.palette.open()) {
      this.palette.close();
    }
  }

  onInputKey(event: KeyboardEvent): void {
    const items = this.flat();
    if (!items.length) return;
    const idx = items.findIndex((i) => i.id === this.activeId());
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeId.set(items[Math.min(idx + 1, items.length - 1)].id);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeId.set(items[Math.max(idx - 1, 0)].id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[idx] ?? items[0];
      if (item) this.run(item);
    }
  }

  /** Flatten the router config into navigable items (skips param/lazy routes). */
  private buildRouteItems(): CommandItem[] {
    const router = this.router;
    const walk = (routes: Routes | undefined, prefix: string): CommandItem[] => {
      const out: CommandItem[] = [];
      for (const r of routes ?? []) {
        const seg = r.path ?? '';
        if (seg.includes(':') || seg === '**') {
          out.push(...walk(r.children, prefix));
          continue;
        }
        const full = [prefix, seg].filter(Boolean).join('/');
        const title =
          typeof r.title === 'string' ? r.title : (r.data?.['breadcrumb'] as string | undefined);
        if (seg && title) {
          out.push({
            id: full,
            label: this.catalog.label(title),
            group: 'Navigate',
            icon: 'arrow-right',
            hint: '/' + full,
            run: () => void router.navigateByUrl('/' + full),
          });
        }
        out.push(...walk(r.children, full));
      }
      return out;
    };
    return walk(router.config, '');
  }
}
