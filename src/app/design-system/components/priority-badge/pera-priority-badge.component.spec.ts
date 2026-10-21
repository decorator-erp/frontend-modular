import { TestBed } from '@angular/core/testing';
import { PeraPriorityBadgeComponent } from './pera-priority-badge.component';

describe('PeraPriorityBadgeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraPriorityBadgeComponent],
    }).compileComponents();
  });

  it('renders glyph + label for a level', () => {
    const f = TestBed.createComponent(PeraPriorityBadgeComponent);
    f.componentRef.setInput('level', 'urgent');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-glyph]')).toBeTruthy();
    expect(el.textContent?.toLowerCase()).toContain('urgent');
  });

  it('omits label text when label=false', () => {
    const f = TestBed.createComponent(PeraPriorityBadgeComponent);
    f.componentRef.setInput('level', 'high');
    f.componentRef.setInput('label', false);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-glyph]')).toBeTruthy();
    expect(el.textContent?.toLowerCase()).not.toContain('high');
  });

  it('defaults to low with a visible label', () => {
    const f = TestBed.createComponent(PeraPriorityBadgeComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent?.toLowerCase()).toContain('low');
  });

  it('escalates glyph fill weight per level (greyscale-legible)', () => {
    const f = TestBed.createComponent(PeraPriorityBadgeComponent);
    const glyph = () => f.nativeElement.querySelector('[data-glyph]') as HTMLElement;

    f.componentRef.setInput('level', 'low');
    f.detectChanges();
    expect(glyph().className).toContain('border-current');
    expect(glyph().className).not.toContain('bg-current');

    f.componentRef.setInput('level', 'urgent');
    f.detectChanges();
    expect(glyph().className).toContain('bg-current');
    expect(glyph().className).toContain('ring-2');
  });
});
