import { TestBed } from '@angular/core/testing';
import { PeraTrendArrowComponent } from './pera-trend-arrow.component';

describe('PeraTrendArrowComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraTrendArrowComponent],
    }).compileComponents();
  });

  it('shows up glyph + value for positive value', () => {
    const f = TestBed.createComponent(PeraTrendArrowComponent);
    f.componentRef.setInput('value', 12);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('▲');
    expect(el.textContent).toContain('12');
    expect(el.querySelector('.text-success')).not.toBeNull();
  });

  it('shows down glyph + value with danger tone for negative value', () => {
    const f = TestBed.createComponent(PeraTrendArrowComponent);
    f.componentRef.setInput('value', -8);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('▼');
    expect(el.textContent).toContain('-8');
    expect(el.querySelector('.text-danger')).not.toBeNull();
  });

  it('is neutral within threshold', () => {
    const f = TestBed.createComponent(PeraTrendArrowComponent);
    f.componentRef.setInput('value', 1);
    f.componentRef.setInput('threshold', 5);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('–');
    expect(el.textContent).toContain('1');
    expect(el.querySelector('.text-text-muted')).not.toBeNull();
  });

  it('is neutral exactly at the threshold boundary', () => {
    const f = TestBed.createComponent(PeraTrendArrowComponent);
    f.componentRef.setInput('value', 5);
    f.componentRef.setInput('threshold', 5);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('–');
  });

  it('applies a custom formatter to the value text', () => {
    const f = TestBed.createComponent(PeraTrendArrowComponent);
    f.componentRef.setInput('value', 12);
    f.componentRef.setInput('format', (n: number) => `${n}%`);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('12%');
  });
});
