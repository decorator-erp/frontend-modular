import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PeraChartCardComponent, type ChartCardState } from './pera-chart-card.component';

@Component({
  imports: [PeraChartCardComponent],
  template: `
    <pera-chart-card
      [title]="'Revenue'"
      [period]="period"
      [segments]="['M', 'Q']"
      [state]="state"
      (segmentChange)="last = $event"
    >
      <button actions type="button">Export</button>
      <div class="body">CHART</div>
      <div footer>LEGEND</div>
      <div tooltipSlot class="tip">TIP</div>
    </pera-chart-card>
  `,
})
class Host {
  state: ChartCardState = 'ready';
  period: string | undefined = undefined;
  last: string | null = null;
}

describe('PeraChartCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('renders title, segments, and projected body when ready', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Revenue');
    expect(el.textContent).toContain('CHART');
    expect(el.querySelectorAll('button').length).toBeGreaterThanOrEqual(2); // segments
  });

  it('shows loading state placeholder (hides projected body)', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.state = 'loading';
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-loading]')).toBeTruthy();
    expect(el.querySelector('.body')).toBeNull();
  });

  it('renders the header (title + period chip + segments) in every state', () => {
    for (const state of ['ready', 'loading', 'empty', 'error'] as ChartCardState[]) {
      const f = TestBed.createComponent(Host);
      f.componentInstance.period = 'Last 30 days';
      f.componentInstance.state = state;
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Revenue');
      expect(el.textContent).toContain('Last 30 days');
      // The two segment buttons are always present in the header.
      const segButtons = el.querySelectorAll('[role="group"] button');
      expect(segButtons.length).toBe(2);
      f.destroy();
    }
  });

  it('shows an empty message (no body, no loader) when empty', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.state = 'empty';
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.body')).toBeNull();
    expect(el.querySelector('[data-loading]')).toBeNull();
    expect(el.textContent).toContain('No data to display.');
  });

  it('shows an error alert when in error state', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.state = 'error';
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const alert = el.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(el.querySelector('.body')).toBeNull();
  });

  it('emits segmentChange with the clicked segment label and marks it active', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="group"] button'));

    // First segment is active by default.
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');

    buttons[1].click();
    f.detectChanges();

    expect(f.componentInstance.last).toBe('Q');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('projects header actions, footer legend and the tooltip slot', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('button[actions]')).toBeTruthy();
    expect(el.querySelector('[footer]')?.textContent).toContain('LEGEND');
    expect(el.querySelector('[tooltipSlot]')?.textContent).toContain('TIP');
  });

  it('keeps the tooltip slot mounted while loading (portal target persists)', () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.state = 'loading';
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[tooltipSlot]')).toBeTruthy();
  });

  it('supports overriding the empty and error messages', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PeraChartCardComponent] });
    const f = TestBed.createComponent(PeraChartCardComponent);
    f.componentRef.setInput('title', 'Spend');
    f.componentRef.setInput('emptyMessage', 'Nothing here yet.');
    f.componentRef.setInput('errorMessage', 'Could not load spend.');

    f.componentRef.setInput('state', 'empty');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Nothing here yet.');

    f.componentRef.setInput('state', 'error');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Could not load spend.');
  });

  it('renders no segmented control when segments is empty', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PeraChartCardComponent] });
    const f = TestBed.createComponent(PeraChartCardComponent);
    f.componentRef.setInput('title', 'Spend');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('[role="group"]')).toBeNull();
  });
});
