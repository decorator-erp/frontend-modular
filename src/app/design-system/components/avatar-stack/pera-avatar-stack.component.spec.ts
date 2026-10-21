import { TestBed } from '@angular/core/testing';

import { PeraAvatarStackComponent } from './pera-avatar-stack.component';

describe('PeraAvatarStackComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraAvatarStackComponent],
    }).compileComponents();
  });

  it('renders up to max avatars and a +N overflow chip', () => {
    const f = TestBed.createComponent(PeraAvatarStackComponent);
    f.componentRef.setInput(
      'people',
      [1, 2, 3, 4, 5, 6].map((i) => ({ name: 'P' + i })),
    );
    f.componentRef.setInput('max', 4);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('pera-avatar').length).toBe(4);
    expect(el.textContent).toContain('+2');
  });

  it('renders every avatar and no chip when people fit within max', () => {
    const f = TestBed.createComponent(PeraAvatarStackComponent);
    f.componentRef.setInput(
      'people',
      [1, 2, 3].map((i) => ({ name: 'P' + i })),
    );
    f.componentRef.setInput('max', 4);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('pera-avatar').length).toBe(3);
    expect(el.textContent).not.toContain('+');
  });

  it('maps imageUrl onto the underlying avatar src', () => {
    const f = TestBed.createComponent(PeraAvatarStackComponent);
    f.componentRef.setInput('people', [{ name: 'Ada', imageUrl: 'https://example.test/a.png' }]);
    f.detectChanges();
    const img = (f.nativeElement as HTMLElement).querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.test/a.png');
  });

  it('shows dashed placeholder when unassigned and empty', () => {
    const f = TestBed.createComponent(PeraAvatarStackComponent);
    f.componentRef.setInput('people', []);
    f.componentRef.setInput('unassigned', true);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-unassigned]')).toBeTruthy();
    expect(el.querySelectorAll('pera-avatar').length).toBe(0);
  });

  it('renders nothing when empty and not unassigned', () => {
    const f = TestBed.createComponent(PeraAvatarStackComponent);
    f.componentRef.setInput('people', []);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-unassigned]')).toBeNull();
    expect(el.querySelectorAll('pera-avatar').length).toBe(0);
  });
});
