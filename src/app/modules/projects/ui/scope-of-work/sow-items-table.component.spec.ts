import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EN } from '@platform/i18n/catalog/en';
import { ScopeOfWorkItem } from '../../model/scope-of-work.model';
import { SowItemsTableComponent, SowItemUpdate } from './sow-items-table.component';

function item(over: Partial<ScopeOfWorkItem> = {}): ScopeOfWorkItem {
  return {
    id: 'i1',
    sourceStageId: 's1',
    sourceTemplateName: 'Residential',
    name: 'Concept design',
    description: 'Mood boards',
    order: 1,
    fee: 25000,
    createdStageId: null,
    sourceMissing: false,
    ...over,
  };
}

const ITEMS = [
  item({ id: 'i1', order: 1 }),
  item({ id: 'i2', sourceStageId: 's2', name: 'Execution drawings', order: 2, description: null }),
  item({ id: 'i3', sourceStageId: 's3', name: 'Site supervision', order: 3 }),
];

/** sow #3: items table (B2-B5, B13). */
describe('SowItemsTableComponent (sow #3)', () => {
  let fixture: ComponentFixture<SowItemsTableComponent>;
  let el: HTMLElement;
  let updates: SowItemUpdate[];
  let orders: string[][];
  let removed: string[];

  function render(
    items: ScopeOfWorkItem[],
    opts: { editable?: boolean; confirmed?: boolean } = {},
  ) {
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('editable', opts.editable ?? true);
    fixture.componentRef.setInput('confirmed', opts.confirmed ?? false);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
  }

  const rows = () => Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr'));
  const button = (row: HTMLElement, label: string) =>
    row.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`)!;

  function edit(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SowItemsTableComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(SowItemsTableComponent);
    el = fixture.nativeElement;
    updates = [];
    orders = [];
    removed = [];
    fixture.componentInstance.updateItem.subscribe((u) => updates.push(u));
    fixture.componentInstance.reorder.subscribe((o) => orders.push(o));
    fixture.componentInstance.remove.subscribe((id) => removed.push(id));
  });

  it('FINDING-7-6: after a move reloads, focus returns to the moved item (other arrow at an end)', () => {
    render(ITEMS);
    const down = button(rows()[1], 'Move item 2 down');
    down.focus();
    down.click();
    expect(orders).toEqual([['i1', 'i3', 'i2']]);
    // The reload: i2 is now last, so its Move down is disabled → its Move up takes focus.
    render([ITEMS[0], { ...ITEMS[2], order: 2 }, { ...ITEMS[1], order: 3 }]);
    expect(document.activeElement).toBe(rows()[2].querySelector('[data-action="up"]'));
  });

  it('FINDING-7-6: after a remove reloads, focus goes to the row now at that index', () => {
    render(ITEMS);
    const remove = button(rows()[0], 'Remove item 1');
    remove.focus();
    remove.click();
    render([
      { ...ITEMS[1], order: 1 },
      { ...ITEMS[2], order: 2 },
    ]);
    expect(document.activeElement).toBe(rows()[0].querySelector('[data-action="remove"]'));
  });

  it('FINDING-7-14: a failed move (settled, no reload) drops the target; a later reload keeps focus', () => {
    render(ITEMS);
    const down = button(rows()[1], 'Move item 2 down');
    down.focus();
    down.click();
    fixture.componentRef.setInput('pending', true);
    fixture.detectChanges();
    fixture.componentRef.setInput('pending', false); // failed: no reload
    fixture.detectChanges();
    down.blur();
    render(ITEMS.map((i) => ({ ...i }))); // an unrelated reload, later
    expect(document.activeElement).toBe(document.body);
  });

  it('FINDING-7-14: the reload does not pull focus back once it has left the table', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    try {
      render(ITEMS);
      const down = button(rows()[1], 'Move item 2 down');
      down.focus();
      down.click();
      outside.focus(); // the user moved on while the move was saving
      render([ITEMS[0], { ...ITEMS[2], order: 2 }, { ...ITEMS[1], order: 3 }]);
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it('renders order, name, template and fee per row; "—" when the template is gone', async () => {
    render([...ITEMS.slice(0, 2), item({ id: 'i3', order: 3, sourceTemplateName: null })]);
    await fixture.whenStable(); // ngModel writes the CVA value a microtask later
    fixture.detectChanges();
    expect(rows()).toHaveLength(3);
    expect(rows()[0].textContent).toContain('1');
    expect(rows()[0].textContent).toContain('Residential');
    expect(rows()[2].textContent).toContain('—');
    const name = rows()[1].querySelector<HTMLInputElement>('pera-input input')!;
    expect(name.value).toBe('Execution drawings');
  });

  it('labels every input and action (a11y)', () => {
    render(ITEMS);
    const first = rows()[0];
    const nameInput = first.querySelector('pera-input input')!;
    const feeInput = first.querySelector('pera-money-input input')!;
    expect(nameInput.getAttribute('aria-label')).toBe('Name of item 1');
    expect(feeInput.getAttribute('aria-label')).toBe('Fee of item 1');
    expect(button(first, 'Move item 1 up')).toBeTruthy();
    expect(button(first, 'Move item 1 down')).toBeTruthy();
    expect(button(first, 'Remove item 1')).toBeTruthy();
  });

  it('a name change sends name, the stored description and fee (B3, C §8.4.4)', () => {
    render(ITEMS);
    edit(rows()[0].querySelector<HTMLInputElement>('pera-input input')!, '  Concept  ');
    expect(updates).toEqual([
      { itemId: 'i1', request: { name: 'Concept', description: 'Mood boards', fee: 25000 } },
    ]);
  });

  it('a fee change sends the name, the stored (null) description and the new fee (B3)', () => {
    render(ITEMS);
    edit(rows()[1].querySelector<HTMLInputElement>('pera-money-input input')!, '30,000.5');
    expect(updates).toEqual([
      {
        itemId: 'i2',
        request: { name: 'Execution drawings', description: null, fee: 30000.5 },
      },
    ]);
  });

  it('client checks mirror the server and block the call (name 1..200, fee 0..1e12)', () => {
    render(ITEMS);
    edit(rows()[0].querySelector<HTMLInputElement>('pera-input input')!, '   ');
    edit(rows()[0].querySelector<HTMLInputElement>('pera-input input')!, 'x'.repeat(201));
    edit(rows()[1].querySelector<HTMLInputElement>('pera-money-input input')!, '');
    edit(rows()[1].querySelector<HTMLInputElement>('pera-money-input input')!, '1000000000001');
    expect(updates).toEqual([]);
    expect(rows()[0].textContent).toContain(EN['sow.nameInvalid']);
    expect(rows()[1].textContent).toContain(EN['sow.feeInvalid']);
  });

  it('an unchanged value sends nothing', () => {
    render(ITEMS);
    edit(rows()[0].querySelector<HTMLInputElement>('pera-input input')!, 'Concept design');
    expect(updates).toEqual([]);
  });

  it('move up / move down send every item id in the new order (B4)', () => {
    render(ITEMS);
    button(rows()[1], 'Move item 2 up').click();
    button(rows()[1], 'Move item 2 down').click();
    expect(orders).toEqual([
      ['i2', 'i1', 'i3'],
      ['i1', 'i3', 'i2'],
    ]);
  });

  it('the first row cannot move up and the last cannot move down (B2)', () => {
    render(ITEMS);
    expect(button(rows()[0], 'Move item 1 up').disabled).toBe(true);
    expect(button(rows()[0], 'Move item 1 down').disabled).toBe(false);
    expect(button(rows()[2], 'Move item 3 down').disabled).toBe(true);
  });

  it('remove emits the item id (B5)', () => {
    render(ITEMS);
    button(rows()[2], 'Remove item 3').click();
    expect(removed).toEqual(['i3']);
  });

  it('a sourceMissing row shows the warning (B13)', () => {
    render([item(), item({ id: 'i2', order: 2, sourceMissing: true, sourceTemplateName: null })]);
    expect(rows()[0].textContent).not.toContain(EN['sow.sourceMissing']);
    expect(rows()[1].textContent).toContain(EN['sow.sourceMissing']);
  });

  it('the empty state reads the catalog copy (B2)', () => {
    render([]);
    expect(rows()).toHaveLength(0);
    expect(el.textContent).toContain(EN['sow.empty']);
  });

  it('read-only: inputs disabled, no row actions (B11, B15)', () => {
    render(ITEMS, { editable: false });
    expect(el.querySelectorAll('tbody button')).toHaveLength(0);
    expect(rows()[0].querySelector<HTMLInputElement>('pera-input input')!.disabled).toBe(true);
    expect(rows()[0].querySelector<HTMLInputElement>('pera-money-input input')!.disabled).toBe(
      true,
    );
  });

  it('the created-stage link is hidden until confirmed, then opens the stage (B11)', () => {
    const created = ITEMS.map((i, n) => ({ ...i, createdStageId: `st${n + 1}` }));
    render(created, { editable: true, confirmed: false });
    expect(el.querySelectorAll('a')).toHaveLength(0);

    render(created, { editable: false, confirmed: true });
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('a'));
    expect(links).toHaveLength(3);
    expect(links[1].getAttribute('href')).toBe('/projects/p1/stages/st2');
    expect(links[1].textContent).toContain('Stage 2 created · open');
  });

  it('uses no physical left/right utilities (B16)', () => {
    render(ITEMS);
    expect(el.innerHTML).not.toMatch(/\b(ml|mr|pl|pr|left|right)-\d|text-(left|right)\b/);
  });

  it('does not emit while not editable', () => {
    render(ITEMS, { editable: false });
    const spy = vi.fn();
    fixture.componentInstance.updateItem.subscribe(spy);
    edit(rows()[0].querySelector<HTMLInputElement>('pera-input input')!, 'Other');
    expect(spy).not.toHaveBeenCalled();
  });
});
