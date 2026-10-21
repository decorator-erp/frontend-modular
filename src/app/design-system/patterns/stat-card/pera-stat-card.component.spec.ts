import { TestBed } from '@angular/core/testing';
import { PeraStatCardComponent } from './pera-stat-card.component';

describe('PeraStatCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PeraStatCardComponent] }).compileComponents();
  });

  it('renders caption, value and a progress bar', () => {
    const f = TestBed.createComponent(PeraStatCardComponent);
    f.componentRef.setInput('caption', 'Budget used');
    f.componentRef.setInput('value', '68%');
    f.componentRef.setInput('progress', 68);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Budget used');
    expect(el.textContent).toContain('68%');
    expect(el.querySelector('pera-progress-bar')).toBeTruthy();
  });

  it('renders breakdown rows', () => {
    const f = TestBed.createComponent(PeraStatCardComponent);
    f.componentRef.setInput('caption', 'X');
    f.componentRef.setInput('value', 1);
    f.componentRef.setInput('progress', 10);
    f.componentRef.setInput('breakdown', [
      { label: 'Labor', value: '12,000' },
      { label: 'Material', value: '8,000' },
    ]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Labor');
    expect(el.textContent).toContain('12,000');
  });

  it('reuses the kpi-tile for the metric header', () => {
    const f = TestBed.createComponent(PeraStatCardComponent);
    f.componentRef.setInput('caption', 'Revenue');
    f.componentRef.setInput('value', '1.2M');
    f.componentRef.setInput('progress', 50);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('pera-kpi-tile')).toBeTruthy();
  });

  it('omits the breakdown list when breakdown is empty', () => {
    const f = TestBed.createComponent(PeraStatCardComponent);
    f.componentRef.setInput('caption', 'Empty');
    f.componentRef.setInput('value', 0);
    f.componentRef.setInput('progress', 0);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    // no breakdown rows rendered
    expect(el.querySelectorAll('.justify-between').length).toBe(0);
  });
});
