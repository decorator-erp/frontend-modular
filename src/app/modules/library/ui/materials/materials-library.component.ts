import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MOCK_MATERIALS } from './mock/materials.mock';
import { Material, MaterialDiscipline } from './material.types';

/**
 * Materials library (C-03). Mock data — grid view with real swatch hex.
 * Swatch hex values are the only legitimate exception to "no raw hex".
 */
@Component({
  selector: 'app-materials-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, DecimalPipe],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <header
      class="px-4 md:px-6 lg:px-7 pt-5 pb-3.5 border-b border-border bg-surface flex items-start gap-4"
    >
      <div class="flex-1">
        <h1 class="m-0 fs-h2 font-semibold tracking-tight">Materials</h1>
        <div class="font-mono fs-label text-text-muted mt-1.5 uppercase flex gap-2.5">
          <span>{{ filtered().length }} materials</span>
          <span class="text-border">·</span>
          <span>{{ disciplineCount() }} disciplines</span>
          <span class="text-border">·</span>
          <span>mock data</span>
        </div>
      </div>
    </header>

    <div
      class="px-4 md:px-6 lg:px-7 py-3 border-b border-border bg-surface flex items-center gap-2.5 flex-wrap"
    >
      <select class="border border-border bg-bg px-2 py-1 fs-label" [(ngModel)]="discipline">
        <option [ngValue]="null">Discipline · All</option>
        @for (d of disciplines; track d) {
          <option [ngValue]="d">{{ d }}</option>
        }
      </select>
      <div class="inline-flex items-center gap-2 px-2.5 py-1.5 border border-border bg-bg">
        <input
          type="text"
          placeholder="Filter materials…"
          class="border-0 outline-0 bg-transparent fs-caption w-52"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
        />
      </div>
    </div>

    <div class="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      @for (m of filtered(); track m.id) {
        <a
          [routerLink]="['/library/materials', m.id]"
          class="block bg-surface border border-border rounded-md overflow-hidden hover:shadow-sm transition-shadow"
        >
          <div class="h-32 w-full" [style.background-color]="m.swatchHex"></div>
          <div class="p-3.5">
            <div class="font-mono fs-label text-text-muted">{{ m.code }}</div>
            <div class="fs-body font-semibold leading-tight mt-1 truncate">{{ m.name }}</div>
            <div class="fs-label text-text-secondary mt-0.5">{{ m.brand }}</div>
            <div
              class="mt-2.5 flex items-center justify-between fs-label font-mono text-text-secondary uppercase"
            >
              <span>{{ m.discipline }}</span>
              <span>{{ m.leadTimeDays }}d lead</span>
            </div>
            @if (m.pricePerSqm) {
              <div class="mt-2 font-sans tabular-nums fs-body-sm font-medium">
                EGP {{ m.pricePerSqm | number }}/{{ m.unit }}
              </div>
            }
            <div class="mt-1 font-mono fs-micro text-text-muted uppercase">
              {{ m.vendors.length }} vendor{{ m.vendors.length === 1 ? '' : 's' }} · used in
              {{ m.usedInProjects }}
            </div>
          </div>
        </a>
      } @empty {
        <div class="col-span-full text-center py-12 text-text-muted">
          No materials match these filters.
        </div>
      }
    </div>
  `,
})
export class MaterialsLibraryComponent {
  readonly items = signal<Material[]>(MOCK_MATERIALS);
  readonly discipline = signal<MaterialDiscipline | null>(null);
  readonly search = signal('');
  readonly disciplines: MaterialDiscipline[] = [
    'Stone',
    'Tile',
    'Joinery',
    'Fabric',
    'Paint',
    'Lighting',
    'Hardware',
    'Plumbing',
    'Glass',
    'Wood',
  ];

  readonly filtered = computed(() => {
    const d = this.discipline();
    const term = this.search().trim().toLowerCase();
    return this.items().filter((m) => {
      if (d && m.discipline !== d) return false;
      if (term && !`${m.code} ${m.name} ${m.brand}`.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  readonly disciplineCount = computed(() => new Set(this.items().map((m) => m.discipline)).size);
}
