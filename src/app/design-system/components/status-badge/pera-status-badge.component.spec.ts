import { TestBed } from '@angular/core/testing';
import { PeraStatusBadgeComponent } from './pera-status-badge.component';

describe('PeraStatusBadgeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraStatusBadgeComponent],
    }).compileComponents();
  });

  it('renders dot + label when dot=true (never colour alone)', () => {
    const f = TestBed.createComponent(PeraStatusBadgeComponent);
    f.componentRef.setInput('tone', 'success');
    f.componentRef.setInput('label', 'Active');
    f.componentRef.setInput('dot', true);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Active'); // label present
    expect(el.querySelector('[data-dot]')).toBeTruthy(); // dot present
  });

  it('hides the dot when dot=false', () => {
    const f = TestBed.createComponent(PeraStatusBadgeComponent);
    f.componentRef.setInput('tone', 'error');
    f.componentRef.setInput('label', 'Failed');
    f.componentRef.setInput('dot', false);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Failed'); // label still present
    expect(el.querySelector('[data-dot]')).toBeNull(); // dot hidden
  });

  it('applies the tinted tone classes (subtle background + matching text)', () => {
    const f = TestBed.createComponent(PeraStatusBadgeComponent);
    f.componentRef.setInput('tone', 'pending');
    f.componentRef.setInput('label', 'Pending');
    f.detectChanges();
    const pill = (f.nativeElement as HTMLElement).querySelector('span > span, span')!;
    const cls = (f.nativeElement as HTMLElement).innerHTML;
    expect(cls).toContain('bg-pending-soft');
    expect(cls).toContain('text-pending');
    expect(pill).toBeTruthy();
  });

  it('RD-1: defaults to the neutral soft-filled pill with no dot (the label carries meaning)', () => {
    const f = TestBed.createComponent(PeraStatusBadgeComponent);
    f.componentRef.setInput('label', 'Draft');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.innerHTML).toContain('bg-surface-muted');
    expect(el.innerHTML).toContain('text-text-secondary');
    expect(el.innerHTML).toContain('rounded-full');
    expect(el.textContent).toContain('Draft');
    expect(el.querySelector('[data-dot]')).toBeNull();
  });

  it('marks the dot as decorative (aria-hidden)', () => {
    const f = TestBed.createComponent(PeraStatusBadgeComponent);
    f.componentRef.setInput('label', 'Active');
    f.componentRef.setInput('dot', true);
    f.detectChanges();
    const dot = (f.nativeElement as HTMLElement).querySelector('[data-dot]')!;
    expect(dot.getAttribute('aria-hidden')).toBe('true');
  });
});
