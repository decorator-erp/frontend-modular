import { TestBed } from '@angular/core/testing';
import { PeraListRowComponent } from './pera-list-row.component';

describe('PeraListRowComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PeraListRowComponent] }).compileComponents();
  });

  it('renders primary + secondary and emits action id on click', () => {
    const f = TestBed.createComponent(PeraListRowComponent);
    f.componentRef.setInput('primary', 'Invoice #12');
    f.componentRef.setInput('secondary', 'Pending approval');
    f.componentRef.setInput('actions', [{ id: 'approve', label: 'Approve', icon: 'check' }]);
    let got = '';
    f.componentInstance.action.subscribe((id: string) => (got = id));
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Invoice #12');
    expect(el.textContent).toContain('Pending approval');
    const btn = el.querySelector('button');
    expect(btn).toBeTruthy();
    btn!.click();
    expect(got).toBe('approve');
  });

  it('action button has a focus-ring class and aria-label', () => {
    const f = TestBed.createComponent(PeraListRowComponent);
    f.componentRef.setInput('primary', 'Invoice #12');
    f.componentRef.setInput('actions', [{ id: 'approve', label: 'Approve', icon: 'check' }]);
    f.detectChanges();
    const btn = (f.nativeElement as HTMLElement).querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn!.className).toContain('focus-visible:outline-2');
    expect(btn!.getAttribute('aria-label')).toBe('Approve');
  });

  it('formats a Date age via toLocaleDateString and shows a string age as-is', () => {
    const f = TestBed.createComponent(PeraListRowComponent);
    f.componentRef.setInput('primary', 'Deadline task');
    const d = new Date(2026, 0, 15);
    f.componentRef.setInput('age', d);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain(d.toLocaleDateString());

    f.componentRef.setInput('age', '2h ago');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('2h ago');
  });

  it('renders an action label as text when no icon is provided', () => {
    const f = TestBed.createComponent(PeraListRowComponent);
    f.componentRef.setInput('primary', 'Row');
    f.componentRef.setInput('actions', [{ id: 'open', label: 'Open' }]);
    f.detectChanges();
    const btn = (f.nativeElement as HTMLElement).querySelector('button');
    expect(btn!.textContent).toContain('Open');
    expect(btn!.querySelector('pera-icon')).toBeNull();
  });
});
