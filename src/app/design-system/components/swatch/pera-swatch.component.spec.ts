import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PeraSwatchComponent, swatchIndex } from './pera-swatch.component';

describe('PeraSwatchComponent (OS-3 stand-in thumbnail)', () => {
  it('gives the same seed the same colour every time', () => {
    expect(swatchIndex('p-123')).toBe(swatchIndex('p-123'));
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => swatchIndex(s)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('shows the initials and hides itself from screen readers', () => {
    const f = TestBed.createComponent(PeraSwatchComponent);
    f.componentRef.setInput('seed', 'p-1');
    f.componentRef.setInput('label', 'Villa Hamdan renovation');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('VR');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});
