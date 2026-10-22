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
