import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationStore } from '@modules/notifications';
import { AppShellComponent } from './app-shell.component';

/**
 * Spec 005 follow-up (review F3): the shell instantiates `NotificationStore` app-wide, so its
 * onInit wires the real-time lifecycle before any bell renders. Only the DI is under test — the
 * template and its imports are stubbed out.
 */
describe('AppShellComponent — the app-wide NotificationStore (005)', () => {
  const created = vi.fn();

  beforeEach(() => {
    created.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: NotificationStore,
          useFactory: () => {
            created();
            return {};
          },
        },
      ],
    });
    TestBed.overrideComponent(AppShellComponent, { set: { imports: [], template: '' } });
  });

  it('injects NotificationStore when the shell is created', () => {
    TestBed.createComponent(AppShellComponent);
    expect(created).toHaveBeenCalledTimes(1);
  });
});

/**
 * RD-1 regression: the shell listens to every keydown for Ctrl/⌘+B and Escape. An Angular event
 * binding that RETURNS false calls preventDefault — and the handler returned false for every other
 * key, so nothing could be typed into any form inside the app.
 */
describe('AppShellComponent — the document keydown listener (RD-1 fix)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: NotificationStore, useValue: {} }],
    });
    TestBed.overrideComponent(AppShellComponent, { set: { imports: [], template: '' } });
  });

  const press = (init: KeyboardEventInit, target: EventTarget = document) => {
    const e = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };

  it('never blocks ordinary typing, in a form field or anywhere else', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    const input = document.createElement('input');
    document.body.appendChild(input);

    expect(press({ key: 'a' }, input).defaultPrevented).toBe(false);
    expect(press({ key: 'Backspace' }, input).defaultPrevented).toBe(false);
    expect(press({ key: '1' }).defaultPrevented).toBe(false);
    // Ctrl+B inside a field is "bold" — left alone too.
    expect(press({ key: 'b', ctrlKey: true }, input).defaultPrevented).toBe(false);

    input.remove();
    fixture.destroy();
  });

  it('still takes Ctrl+B outside a field for the navbar toggle', () => {
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    expect(press({ key: 'b', ctrlKey: true }).defaultPrevented).toBe(true);
    fixture.destroy();
  });
});
