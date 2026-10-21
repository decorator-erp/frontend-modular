import { TestBed } from '@angular/core/testing';
import { PeraHealthIndicatorComponent } from './pera-health-indicator.component';

describe('PeraHealthIndicatorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraHealthIndicatorComponent],
    }).compileComponents();
  });

  it('shows dot + label and an aria-label (never colour alone)', () => {
    const f = TestBed.createComponent(PeraHealthIndicatorComponent);
    f.componentRef.setInput('state', 'over');
    f.detectChanges();
    const host = f.nativeElement as HTMLElement;
    expect(host.querySelector('[data-dot]')).toBeTruthy();
    expect(host.textContent).toContain('Over budget');
    expect(host.getAttribute('aria-label')).toContain('Over budget');
  });

  it('accepts a custom label', () => {
    const f = TestBed.createComponent(PeraHealthIndicatorComponent);
    f.componentRef.setInput('state', 'healthy');
    f.componentRef.setInput('label', 'Custom');
    f.detectChanges();
    const host = f.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Custom');
    expect(host.getAttribute('aria-label')).toBe('Custom');
  });

  it('defaults to the healthy state with the derived label and role="img"', () => {
    const f = TestBed.createComponent(PeraHealthIndicatorComponent);
    f.detectChanges();
    const host = f.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('img');
    expect(host.textContent).toContain('Healthy');
    expect(host.getAttribute('aria-label')).toBe('Healthy');
  });

  it('derives the at-risk label from state', () => {
    const f = TestBed.createComponent(PeraHealthIndicatorComponent);
    f.componentRef.setInput('state', 'at-risk');
    f.detectChanges();
    const host = f.nativeElement as HTMLElement;
    expect(host.textContent).toContain('At risk');
    expect(host.getAttribute('aria-label')).toBe('At risk');
  });

  it('applies the tone text colour and matching dot fill per state', () => {
    const f = TestBed.createComponent(PeraHealthIndicatorComponent);
    f.componentRef.setInput('state', 'at-risk');
    f.detectChanges();
    const html = (f.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('text-warning');
    expect(html).toContain('bg-warning');
  });

  it('marks the dot as decorative (aria-hidden)', () => {
    const f = TestBed.createComponent(PeraHealthIndicatorComponent);
    f.detectChanges();
    const dot = (f.nativeElement as HTMLElement).querySelector('[data-dot]')!;
    expect(dot.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to the dot variant (no pill background or padding)', () => {
    const f = TestBed.createComponent(PeraHealthIndicatorComponent);
    f.componentRef.setInput('state', 'over');
    f.detectChanges();
    const html = (f.nativeElement as HTMLElement).innerHTML;
    expect(html).not.toContain('bg-danger-soft');
    expect(html).not.toContain('rounded-full px-2');
  });

  it('renders a soft tinted pill in the pill variant', () => {
    const f = TestBed.createComponent(PeraHealthIndicatorComponent);
    f.componentRef.setInput('state', 'over');
    f.componentRef.setInput('variant', 'pill');
    f.detectChanges();
    const html = (f.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('bg-danger-soft');
    expect(html).toContain('px-2');
    expect(html).toContain('py-0.5');
    expect(html).toContain('rounded-full');
    // signal is still carried by the dot + label, not the pill tint alone
    expect((f.nativeElement as HTMLElement).querySelector('[data-dot]')).toBeTruthy();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Over budget');
  });
});
