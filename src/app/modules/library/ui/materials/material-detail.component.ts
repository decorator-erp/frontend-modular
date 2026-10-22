import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MOCK_MATERIALS } from './mock/materials.mock';

/**
 * Material detail (C-04). Mock data; swatch hex shown as the legitimate
 * real-material-colour exception.
 */
@Component({
  selector: 'app-material-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    @if (material(); as m) {
      <header class="px-7 pt-5 pb-3.5 border-b border-border bg-surface flex items-start gap-5">
        <div class="w-24 h-24 border border-border" [style.background-color]="m.swatchHex"></div>
        <div class="flex-1">
          <a routerLink="/library/materials" class="font-mono fs-label text-accent hover:underline"
            >← Materials</a
          >
          <h1 class="m-0 fs-h2 font-semibold tracking-tight mt-1">{{ m.name }}</h1>
          <div class="font-mono fs-label text-text-muted mt-1.5 uppercase flex gap-2.5">
            <span>{{ m.brand }}</span>
            <span class="text-border">·</span>
            <span>{{ m.code }}</span>
            <span class="text-border">·</span>
            <span>{{ m.discipline }}</span>
            <span class="text-border">·</span>
            <span>{{ m.countryOfOrigin }}</span>
            <span class="text-border">·</span>
            <span
              [class.text-success]="m.status === 'Available'"
              [class.text-warning]="m.status === 'On-order'"
              [class.text-danger]="m.status === 'Discontinued'"
              >{{ m.status }}</span
            >
          </div>
        </div>
      </header>

      <div class="px-7 py-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_var(--w-rail)] gap-5">
        <div>
          <section class="border border-border bg-surface p-5 rounded-md mb-4">
            <div class="font-mono fs-label text-text-muted uppercase mb-3">
              Vendors &amp; pricing
            </div>
            <table class="w-full fs-caption">
              <thead>
                <tr class="font-mono fs-micro text-text-muted uppercase">
                  <th class="text-start py-1.5">Vendor</th>
                  <th class="text-end py-1.5">Price (EGP)</th>
                  <th class="text-end py-1.5">Lead time (days)</th>
                </tr>
              </thead>
              <tbody>
                @for (v of m.vendors; track v.vendorId) {
                  <tr class="border-t border-border-soft">
                    <td class="py-2">{{ v.name }}</td>
                    <td class="text-end font-sans tabular-nums">{{ v.price | number }}</td>
                    <td class="text-end font-sans tabular-nums">{{ v.leadTime }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>

          <section class="border border-border bg-surface p-5 rounded-md">
            <div class="font-mono fs-label text-text-muted uppercase mb-3">Specifications</div>
            <dl class="grid grid-cols-2 gap-y-2.5 gap-x-6 fs-caption">
              <dt class="font-mono fs-label text-text-muted uppercase">Unit</dt>
              <dd>{{ m.unit }}</dd>
              <dt class="font-mono fs-label text-text-muted uppercase">Lead time</dt>
              <dd>{{ m.leadTimeDays }} days</dd>
              <dt class="font-mono fs-label text-text-muted uppercase">Country of origin</dt>
              <dd>{{ m.countryOfOrigin }}</dd>
              @if (m.certifications && m.certifications.length) {
                <dt class="font-mono fs-label text-text-muted uppercase">Certifications</dt>
                <dd>{{ m.certifications.join(', ') }}</dd>
              }
            </dl>
          </section>
        </div>

        <aside class="border border-border bg-surface p-5 rounded-md">
          <div class="font-mono fs-label text-text-muted uppercase mb-2">Usage</div>
          <div class="fs-h1 font-semibold">{{ m.usedInProjects }}</div>
          <div class="font-mono fs-label text-text-muted uppercase">projects</div>
          <div class="mt-4 font-mono fs-label text-text-muted uppercase mb-2">Best price</div>
          <div class="fs-h3 font-semibold tabular-nums">
            EGP {{ bestPrice() | number
            }}<span class="fs-caption text-text-muted">/{{ m.unit }}</span>
          </div>
        </aside>
      </div>
    } @else {
      <div class="p-10 text-center text-text-muted">Material not found.</div>
    }
  `,
})
export class MaterialDetailComponent {
  private readonly route = inject(ActivatedRoute);
  readonly params = toSignal(this.route.paramMap, { requireSync: true });
  readonly material = computed(() => {
    const id = this.params().get('id');
    return MOCK_MATERIALS.find((m) => m.id === id) ?? null;
  });
  readonly bestPrice = computed(() => {
    const m = this.material();
    if (!m) return 0;
    return Math.min(...m.vendors.map((v) => v.price));
  });
}
