import { TestBed } from '@angular/core/testing';
import { PeraKpiTileComponent } from './pera-kpi-tile.component';

describe('PeraKpiTileComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PeraKpiTileComponent] }).compileComponents();
  });

  it('renders caption + value', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Revenue');
    f.componentRef.setInput('value', '1.2M');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Revenue');
    expect(el.textContent).toContain('1.2M');
    expect(el.querySelector('button')).toBeNull(); // not drillable
  });

  it('becomes a button and emits drill when drillTo is set (keyboard-operable)', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Tasks');
    f.componentRef.setInput('value', 12);
    f.componentRef.setInput('drillTo', { route: '/tasks' });
    let got: unknown = null;
    f.componentInstance.drill.subscribe((v: unknown) => (got = v));
    f.detectChanges();
    const btn = (f.nativeElement as HTMLElement).querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn!.className).toContain('focus-visible:outline-2');
    btn!.click();
    expect(got).toEqual({ route: '/tasks' });
  });

  it('renders a trend arrow only when trend is provided', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Margin');
    f.componentRef.setInput('value', '18%');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('pera-trend-arrow')).toBeNull();

    f.componentRef.setInput('trend', 3.5);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('pera-trend-arrow')).toBeTruthy();
  });

  it('renders a progress bar only when progress is provided', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Budget');
    f.componentRef.setInput('value', '72%');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('pera-progress-bar')).toBeNull();

    f.componentRef.setInput('progress', 72);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('pera-progress-bar')).toBeTruthy();
  });

  it('renders a frac suffix beside the value only when provided', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Tasks');
    f.componentRef.setInput('value', 12);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).not.toContain('over');

    f.componentRef.setInput('frac', '3 over');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('3 over');
  });

  it('dims the progress bar to muted when progressMuted is set', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Actual');
    f.componentRef.setInput('value', '1.2M');
    f.componentRef.setInput('progress', 90);
    f.detectChanges();
    const fill = () => (f.nativeElement as HTMLElement).querySelector('pera-progress-bar span');
    expect(fill()?.className).toContain('bg-accent');

    f.componentRef.setInput('progressMuted', true);
    f.detectChanges();
    expect(fill()?.className).toContain('bg-text-muted');
  });

  it('renders a sparkline polyline with normalised points inside the 0..100 x 0..24 viewBox', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Trend');
    f.componentRef.setInput('value', '9');
    f.componentRef.setInput('sparkline', [0, 10, 5]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const svg = el.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 100 24');
    const polyline = el.querySelector('polyline');
    expect(polyline).toBeTruthy();
    // 3 points: first at x=0 (min ⇒ bottom, y=24), last at x=100 (max ⇒ top, y=0).
    expect(polyline!.getAttribute('points')).toBe('0,24 50,0 100,12');
  });

  it('emits nothing extra when a non-drillable tile has no button', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Static');
    f.componentRef.setInput('value', 5);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('div')).toBeTruthy();
  });

  it('RD-1: an icon adds a coloured chip and turns the trend into a soft pill', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Open leads');
    f.componentRef.setInput('value', 37);
    f.componentRef.setInput('trend', 12);
    f.componentRef.setInput('icon', 'target');
    f.componentRef.setInput('tone', 'info');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const chip = el.querySelector('[data-kpi-icon]')!;
    expect(chip).toBeTruthy();
    expect(chip.className).toContain('bg-info-soft');
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[data-variant="chip"]')).toBeTruthy();
  });

  it('RD-1: without an icon the tile keeps its plain caption and inline trend', () => {
    const f = TestBed.createComponent(PeraKpiTileComponent);
    f.componentRef.setInput('caption', 'Allocated');
    f.componentRef.setInput('value', '1.2M');
    f.componentRef.setInput('trend', -3);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-kpi-icon]')).toBeNull();
    expect(el.querySelector('[data-variant="inline"]')).toBeTruthy();
  });
});
