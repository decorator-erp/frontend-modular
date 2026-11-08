import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { SpaceSelection } from '../../model';
import { CrmSelectionsViewComponent } from './selections-view.component';

const pick = (over: Partial<SpaceSelection>): SpaceSelection => ({
  id: 'x',
  spaceId: 'SP',
  catalogItemId: 'i',
  itemCode: 'SOFA',
  itemNameEn: 'Sofa',
  itemNameAr: 'كنبة',
  quantity: 1.5,
  notes: null,
  sortOrder: 1,
  options: [],
  ...over,
});

// crmp C-6: the brief entry snapshot, read-only (office #34, portal #84).
describe('CrmSelectionsViewComponent (crmp C-6)', () => {
  function render(selections: SpaceSelection[]) {
    TestBed.configureTestingModule({ imports: [CrmSelectionsViewComponent] });
    const fixture = TestBed.createComponent(CrmSelectionsViewComponent);
    fixture.componentRef.setInput('selections', selections);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows name, code, quantity and options, with no controls', () => {
    const el = render([
      pick({
        options: [
          {
            attributeId: 'a',
            attributeNameEn: 'Fabric',
            attributeNameAr: 'قماش',
            optionId: 'o',
            optionCode: 'L',
            optionNameEn: 'Linen',
            optionNameAr: 'كتان',
          },
        ],
        notes: 'office only',
      }),
    ]);
    expect(el.textContent).toContain('Sofa');
    expect(el.textContent).toContain('SOFA');
    expect(el.querySelector('[data-qty]')?.textContent).toContain('1.5');
    expect(el.textContent).toContain('Fabric');
    expect(el.textContent).toContain('Linen');
    expect(el.querySelector('[data-notes]')?.textContent).toContain('office only');
    expect(el.querySelectorAll('button, input, select, textarea')).toHaveLength(0);
  });

  it('a portal pick (notes null) renders no notes line', () => {
    const el = render([pick({ notes: null })]);
    expect(el.querySelector('[data-notes]')).toBeNull();
  });
});
