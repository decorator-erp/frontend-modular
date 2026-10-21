import { TestBed } from '@angular/core/testing';
import { PeraFilterBarComponent, type FilterState } from './pera-filter-bar.component';

describe('PeraFilterBarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PeraFilterBarComponent] }).compileComponents();
  });

  it('renders a search field when search=true', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('search', true);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('pera-input')).toBeTruthy();
  });

  it('echoes active facet filters as removable chips and emits clearAll', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('facets', [
      { key: 'status', label: 'Status', options: [{ value: 'open', label: 'Open' }] },
    ]);
    f.componentRef.setInput('value', { facets: { status: ['open'] } } as FilterState);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('pera-chip').length).toBeGreaterThanOrEqual(1);
    let cleared = false;
    f.componentInstance.clearAll.subscribe(() => (cleared = true));
    const clearBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      /clear/i.test(b.textContent || ''),
    );
    expect(clearBtn).toBeTruthy();
    clearBtn!.click();
    expect(cleared).toBe(true);
  });

  it('shows no chips and no clear button when there are no active filters', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('pera-chip').length).toBe(0);
    const clearBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      /clear/i.test(b.textContent || ''),
    );
    expect(clearBtn).toBeFalsy();
  });

  it('renders the facet option label (not the raw value) in the chip', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('facets', [
      { key: 'status', label: 'Status', options: [{ value: 'open', label: 'Open' }] },
    ]);
    f.componentRef.setInput('value', { facets: { status: ['open'] } } as FilterState);
    f.detectChanges();
    const chip = (f.nativeElement as HTMLElement).querySelector('pera-chip');
    expect(chip?.textContent).toContain('Open');
  });

  it('echoes the search term as a chip', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('search', true);
    f.componentRef.setInput('value', { search: 'invoices' } as FilterState);
    f.detectChanges();
    const chip = (f.nativeElement as HTMLElement).querySelector('pera-chip');
    expect(chip?.textContent).toContain('invoices');
  });

  it('removes a single facet value (immutably) when its chip is toggled', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('facets', [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Done' },
        ],
      },
    ]);
    f.componentRef.setInput('value', { facets: { status: ['open', 'done'] } } as FilterState);
    f.detectChanges();

    let emitted: FilterState | undefined;
    f.componentInstance.valueChange.subscribe((v) => (emitted = v));

    const chips = (f.nativeElement as HTMLElement).querySelectorAll('pera-chip');
    expect(chips.length).toBe(2);
    chips[0].querySelector('button')!.click(); // remove "open"

    expect(emitted).toBeDefined();
    expect(emitted!.facets!['status']).toEqual(['done']);
  });

  it('renders one pera-select per facet and a date-range picker when enabled', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('dateRange', true);
    f.componentRef.setInput('facets', [
      { key: 'status', label: 'Status', options: [{ value: 'open', label: 'Open' }] },
      { key: 'owner', label: 'Owner', options: [{ value: 'me', label: 'Me' }] },
    ]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('pera-select').length).toBe(2);
    expect(el.querySelector('pera-date-range-picker')).toBeTruthy();
  });

  it('emits an empty state and clearAll when Clear all is pressed', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('value', { search: 'x', facets: { status: ['open'] } } as FilterState);
    f.detectChanges();

    let emitted: FilterState | undefined;
    let cleared = false;
    f.componentInstance.valueChange.subscribe((v) => (emitted = v));
    f.componentInstance.clearAll.subscribe(() => (cleared = true));

    const clearBtn = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => /clear/i.test(b.textContent || ''),
    );
    clearBtn!.click();

    expect(cleared).toBe(true);
    expect(emitted).toEqual({});
  });

  // --- 003 Batch 3 gate fix: one compact inline row (prototype `.fbar`) --------

  it('renders search, facet chips and Clear all as a single inline row', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('search', true);
    f.componentRef.setInput('facets', [
      { key: 'status', label: 'Status', options: [{ value: 'a', label: 'Active' }] },
      { key: 'type', label: 'Type', options: [{ value: 's', label: 'Stage' }] },
    ]);
    f.componentRef.setInput('value', { search: 'x' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;

    // A single flex row holds every control — not one row per control.
    const row = el.querySelector('div');
    expect(row?.className).toContain('flex');
    expect(row?.querySelectorAll('pera-select').length).toBe(2);
    expect(row?.querySelector('pera-input')).toBeTruthy();

    // Clear all is pushed to the inline end of that same row.
    const clear = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Clear all',
    );
    expect(clear?.className).toContain('ms-auto');
  });

  it('gives its facet selects the chip variant so they are content-sized', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('facets', [
      { key: 'status', label: 'Status', options: [{ value: 'a', label: 'Active' }] },
    ]);
    f.detectChanges();
    const select = (f.nativeElement as HTMLElement).querySelector('pera-select');
    expect(select?.classList.contains('inline-flex')).toBe(true);
    expect(select?.classList.contains('w-full')).toBe(false);
  });

  it('keeps the search field from stretching the row', () => {
    const f = TestBed.createComponent(PeraFilterBarComponent);
    f.componentRef.setInput('search', true);
    f.detectChanges();
    const input = (f.nativeElement as HTMLElement).querySelector('pera-input');
    expect(input?.classList.contains('w-full')).toBe(false);
    expect(input?.className).toContain('w-48');
  });
});
