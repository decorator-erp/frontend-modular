import { TestBed } from '@angular/core/testing';
import { PeraProgressBarComponent } from './pera-progress-bar.component';

describe('PeraProgressBarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraProgressBarComponent],
    }).compileComponents();
  });

  it('renders a single clamped fill when no segments are given', () => {
    const fixture = TestBed.createComponent(PeraProgressBarComponent);
    fixture.componentRef.setInput('value', 140);
    fixture.detectChanges();
    const spans = fixture.nativeElement.querySelectorAll('span') as NodeListOf<HTMLElement>;
    expect(spans.length).toBe(1);
    expect(spans[0].style.width).toBe('100%');
  });

  it('renders one span per segment with clamped widths and tone classes', () => {
    const fixture = TestBed.createComponent(PeraProgressBarComponent);
    fixture.componentRef.setInput('segments', [
      { value: 30, tone: 'muted' },
      { value: 150, tone: 'ink' },
    ]);
    fixture.detectChanges();
    const spans = fixture.nativeElement.querySelectorAll('span') as NodeListOf<HTMLElement>;
    expect(spans.length).toBe(2);
    expect(spans[0].style.width).toBe('30%');
    expect(spans[0].className).toContain('bg-text-muted');
    expect(spans[1].style.width).toBe('100%');
    expect(spans[1].className).toContain('bg-text-primary');
  });
});
