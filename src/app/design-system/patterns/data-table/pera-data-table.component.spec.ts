import { TestBed } from '@angular/core/testing';
import { PeraDataTableComponent } from './pera-data-table.component';
import { ColumnDef } from './column-def';

interface Row {
  id: string;
  name: string;
  dept: string;
}

const ROWS: Row[] = [{ id: '1', name: 'Sara Mohamed', dept: 'Architecture' }];

// A sortable column and a non-sortable one: the two render through different
// branches, which is exactly where the header casing used to diverge.
const COLUMNS: ColumnDef<Row>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'dept', header: 'Department' },
];

describe('PeraDataTableComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PeraDataTableComponent] }).compileComponents();
  });

  function table(density?: 'default' | 'comfortable' | 'compact') {
    const f = TestBed.createComponent<PeraDataTableComponent<Row>>(PeraDataTableComponent);
    f.componentRef.setInput('columns', COLUMNS);
    f.componentRef.setInput('rows', ROWS);
    if (density) f.componentRef.setInput('density', density);
    f.detectChanges();
    return f;
  }

  it('gives every column header the label tier, sortable or not', () => {
    const el = table().nativeElement as HTMLElement;
    const headers = Array.from(el.querySelectorAll('thead th'));
    expect(headers.length).toBe(2);
    for (const th of headers) {
      // The class sits on the rendered text, not only on the `th` — a <button>
      // does not reliably inherit text-transform.
      const rendered = th.querySelector('button, span')!;
      expect(rendered.className).toContain('uppercase');
      expect(rendered.className).toContain('fs-label');
      expect(rendered.className).toContain('font-semibold');
    }
  });

  it('keeps ColumnDef.header strings as Sentence-case data', () => {
    const el = table().nativeElement as HTMLElement;
    const text = Array.from(el.querySelectorAll('thead th')).map((h) => h.textContent?.trim());
    expect(text).toEqual(['Name', 'Department']);
  });

  it('RD-1: defaults to comfortable rows — taller, zebra-striped, accent hover', () => {
    const f = table();
    expect(f.componentInstance.effectiveDensity()).toBe('comfortable');
    const row = (f.nativeElement as HTMLElement).querySelector('tbody tr')!;
    expect(row.className).toContain('h-11');
    expect(row.className).toContain('odd:bg-surface-muted/60');
    expect(row.className).toContain('hover:bg-accent-soft');
    const cell = row.querySelector('td')!;
    expect(cell.className).toContain('text-sm');
  });

  it('`default` density keeps the original rhythm untouched', () => {
    const f = table('default');
    const row = (f.nativeElement as HTMLElement).querySelector('tbody tr')!;
    expect(row.className).toContain('h-8');
    expect(row.className).not.toContain('odd:bg-surface-muted/60');
    const cell = row.querySelector('td')!;
    expect(cell.className).toContain('text-sm');
    expect(cell.getAttribute('style') ?? '').not.toContain('--space-');
  });

  it('compact density uses the caption step and token-based cell padding', () => {
    const f = table('compact');
    const cell = (f.nativeElement as HTMLElement).querySelector('tbody td')!;
    expect(cell.className).toContain('fs-caption');
    expect(cell.className).not.toContain('text-sm');
    // 8px block / 12px inline, snapped to the spacing ladder — never raw px.
    expect(cell.getAttribute('style')).toContain('var(--space-2) var(--space-3)');
  });

  it('emits sortChange from a sortable header and never sorts rows itself', () => {
    const f = table();
    const emitted: unknown[] = [];
    f.componentInstance.sortChange.subscribe((s) => emitted.push(s));
    f.componentInstance.toggleSort('name');
    expect(emitted).toEqual([{ sortBy: 'name', sortDir: 'asc' }]);
    expect(f.componentInstance.rows()).toEqual(ROWS);
  });
});
