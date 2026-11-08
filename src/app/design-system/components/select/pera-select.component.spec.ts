import { TestBed } from '@angular/core/testing';
import { PeraSelectComponent } from './pera-select.component';

const OPTIONS = [
  { value: 'a', label: 'Active' },
  { value: 'i', label: 'Inactive' },
];

describe('PeraSelectComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PeraSelectComponent] }).compileComponents();
  });

  function select(variant?: 'field' | 'chip') {
    const f = TestBed.createComponent(PeraSelectComponent);
    f.componentRef.setInput('options', OPTIONS);
    f.componentRef.setInput('placeholder', 'Status');
    if (variant) f.componentRef.setInput('variant', variant);
    f.detectChanges();
    return f;
  }

  it('defaults to the full-width field variant', () => {
    const f = select();
    const host = f.nativeElement as HTMLElement;
    expect(host.classList.contains('block')).toBe(true);
    expect(host.classList.contains('w-full')).toBe(true);
    expect(host.querySelector('button')?.className).toContain('w-full');
  });

  it('renders the chip variant content-sized, never full width', () => {
    const f = select('chip');
    const host = f.nativeElement as HTMLElement;
    expect(host.classList.contains('inline-flex')).toBe(true);
    expect(host.classList.contains('w-full')).toBe(false);
    expect(host.classList.contains('block')).toBe(false);

    const trigger = host.querySelector('button')!;
    expect(trigger.className).not.toContain('w-full');
    expect(trigger.className).toContain('h-8'); // the prototype's 32px chip
  });

  it('shows the placeholder as the chip label and a trailing chevron', () => {
    const f = select('chip');
    const host = f.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Status');
    expect(host.textContent).toContain('▾');
  });

  it('still selects a value in chip mode', () => {
    const f = select('chip');
    let picked: unknown = null;
    f.componentInstance.registerOnChange((v) => (picked = v));
    f.componentInstance.pick(OPTIONS[1]);
    expect(picked).toBe('i');
  });

  it('V-1: an ariaLabel keeps the selected value (or placeholder) in the accessible name', () => {
    const f = select();
    const trigger = () => (f.nativeElement as HTMLElement).querySelector('button')!;
    expect(trigger().hasAttribute('aria-label')).toBe(false); // unset → name is the content
    f.componentRef.setInput('ariaLabel', 'Space – DO-01');
    f.detectChanges();
    expect(trigger().getAttribute('aria-label')).toBe('Space – DO-01: Status');
    f.componentInstance.writeValue('i');
    f.detectChanges();
    expect(trigger().getAttribute('aria-label')).toBe('Space – DO-01: Inactive');
  });
});
