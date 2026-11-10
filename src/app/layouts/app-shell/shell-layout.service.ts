import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

export type ShellDevice = 'desktop' | 'tablet' | 'phone';

/** Tailwind's `lg` and `md` — the shell's two breakpoints. */
const DESKTOP_QUERY = '(min-width: 1024px)';
const TABLET_QUERY = '(min-width: 768px)';
const STORAGE_KEY = 'pera-sidebar-collapsed';

/**
 * RD-1: the app shell's navigation state.
 *
 * - Desktop (≥1024px): the dark sidebar is full width; the owner's toggle collapses it to the
 *   icon rail, and the choice is remembered (`localStorage`, `pera-sidebar-collapsed`).
 * - Tablet (768–1023px): the icon rail is always shown; the toggle slides the full sidebar over
 *   the page as a drawer.
 * - Phone (<768px): no sidebar; the bottom tab bar's "More" (or the toggle) opens the drawer.
 *
 * Ctrl/⌘+B toggles, except while the user is typing.
 */
@Injectable({ providedIn: 'root' })
export class ShellLayoutService {
  readonly device = signal<ShellDevice>(this.measure());
  readonly collapsed = signal(this.readCollapsed());
  readonly drawerOpen = signal(false);

  /** What the docked sidebar shows: the full menu, the icon rail, or nothing (phone). */
  readonly dockedMode = computed<'full' | 'rail' | 'none'>(() => {
    const d = this.device();
    if (d === 'phone') return 'none';
    if (d === 'tablet') return 'rail';
    return this.collapsed() ? 'rail' : 'full';
  });

  /** Whether the toggle is "on" (the menu is showing more than the rail). */
  readonly expanded = computed(() =>
    this.device() === 'desktop' ? !this.collapsed() : this.drawerOpen(),
  );

  constructor() {
    const lists = this.mediaLists();
    if (!lists.length) return;
    const onChange = (): void => {
      this.device.set(this.measure());
      this.drawerOpen.set(false);
    };
    for (const list of lists) list.addEventListener?.('change', onChange);
    inject(DestroyRef).onDestroy(() => {
      for (const list of lists) list.removeEventListener?.('change', onChange);
    });
  }

  /** The navbar toggle: collapse/expand on desktop, open/close the drawer elsewhere. */
  toggle(): void {
    if (this.device() === 'desktop') {
      this.collapsed.update((v) => !v);
      this.writeCollapsed(this.collapsed());
    } else {
      this.drawerOpen.update((v) => !v);
    }
  }

  openDrawer(): void {
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  /** Ctrl/⌘+B toggles, Escape closes the drawer. Returns true when the key was handled. */
  handleKey(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.drawerOpen()) {
      this.closeDrawer();
      return true;
    }
    const isToggle =
      (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'b';
    if (!isToggle || isTyping(event.target)) return false;
    event.preventDefault();
    this.toggle();
    return true;
  }

  private mediaLists(): MediaQueryList[] {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return [];
      return [window.matchMedia(DESKTOP_QUERY), window.matchMedia(TABLET_QUERY)];
    } catch {
      return [];
    }
  }

  private measure(): ShellDevice {
    const [desktop, tablet] = this.mediaLists();
    if (!desktop) return 'desktop';
    if (desktop.matches) return 'desktop';
    return tablet?.matches ? 'tablet' : 'phone';
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writeCollapsed(value: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // No storage (a private window, blocked site data): the toggle still works for this visit.
    }
  }
}

/** Ctrl+B is "bold" in a text field or the markdown editor — leave it alone there. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
