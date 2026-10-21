import { TestBed } from '@angular/core/testing';
import { PeraDateRangePickerComponent } from './pera-date-range-picker.component';

describe('PeraDateRangePickerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraDateRangePickerComponent],
    }).compileComponents();
  });

  it('renders two date inputs', () => {
    const f = TestBed.createComponent(PeraDateRangePickerComponent);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelectorAll('pera-date-input').length).toBe(2);
  });

  it('renders preset buttons and applies one (emits rangeChange)', () => {
    const f = TestBed.createComponent(PeraDateRangePickerComponent);
    const start = new Date(2026, 0, 1),
      end = new Date(2026, 0, 7);
    f.componentRef.setInput('presets', [{ label: 'Wk', range: { start, end } }]);
    let emitted: unknown = null;
    f.componentInstance.rangeChange.subscribe((v: unknown) => (emitted = v));
    f.detectChanges();
    const btn = (f.nativeElement as HTMLElement).querySelector('button');
    expect(btn).toBeTruthy();
    btn!.click();
    f.detectChanges();
    expect(emitted).toBeTruthy();
  });

  it('is a ControlValueAccessor: writeValue fills the inputs and onChange fires', () => {
    const f = TestBed.createComponent(PeraDateRangePickerComponent);
    f.detectChanges();
    const c = f.componentInstance;

    let captured: { start: Date | null; end: Date | null } | null = null;
    c.registerOnChange((v) => (captured = v));

    c.writeValue({ start: new Date(2026, 0, 1), end: new Date(2026, 0, 7) });
    f.detectChanges();
    expect(captured).toBeNull(); // writeValue must not re-notify the form

    // Round-trip: setting via a preset notifies with Date boundaries.
    f.componentRef.setInput('presets', [
      { label: 'Wk', range: { start: new Date(2026, 0, 1), end: new Date(2026, 0, 7) } },
    ]);
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(captured).not.toBeNull();
    expect(captured!.start instanceof Date).toBe(true);
    expect(captured!.end instanceof Date).toBe(true);
  });

  it('setDisabledState disables the preset buttons', () => {
    const f = TestBed.createComponent(PeraDateRangePickerComponent);
    f.componentRef.setInput('presets', [
      { label: 'Wk', range: { start: new Date(2026, 0, 1), end: new Date(2026, 0, 7) } },
    ]);
    f.componentInstance.setDisabledState(true);
    f.detectChanges();
    const btn = (f.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // --- 003 Batch 0: static, non-emitting pill mode ---------------------------

  const pill = () => {
    const f = TestBed.createComponent(PeraDateRangePickerComponent);
    f.componentRef.setInput('mode', 'pill');
    return f;
  };

  it('pill mode renders label, value and a chevron — and no date inputs', () => {
    const f = pill();
    f.componentRef.setInput('presetLabel', 'Period');
    f.componentInstance.writeValue({ start: new Date(2026, 3, 1), end: new Date(2026, 5, 16) });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('pera-date-input').length).toBe(0);
    expect(el.textContent).toContain('Period');
    expect(el.textContent).toContain('Apr 1');
    expect(el.textContent).toContain('Jun 16');
    expect(el.textContent).toContain('▾');
  });

  it('pill mode is not a button and takes no focus', () => {
    const f = pill();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('[tabindex]')).toBeNull();
  });

  it('pill mode ignores presets and error', () => {
    const f = pill();
    f.componentRef.setInput('presets', [
      { label: 'Wk', range: { start: new Date(2026, 0, 1), end: new Date(2026, 0, 7) } },
    ]);
    f.componentRef.setInput('error', 'boom');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).not.toContain('Wk');
    expect(el.textContent).not.toContain('boom');
  });

  it('pill mode emits nothing on click', () => {
    const f = pill();
    let emissions = 0;
    let cvaCalls = 0;
    f.componentInstance.rangeChange.subscribe(() => emissions++);
    f.componentInstance.registerOnChange(() => cvaCalls++);
    f.detectChanges();
    const root = (f.nativeElement as HTMLElement).firstElementChild as HTMLElement;
    root.click();
    f.detectChanges();
    expect(emissions).toBe(0);
    expect(cvaCalls).toBe(0);
  });

  it('pill mode shows an em dash when no range is set', () => {
    const f = pill();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('—');
  });

  it('mode="input" is unchanged and still renders the editable control', () => {
    const f = TestBed.createComponent(PeraDateRangePickerComponent);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelectorAll('pera-date-input').length).toBe(2);
  });
});
