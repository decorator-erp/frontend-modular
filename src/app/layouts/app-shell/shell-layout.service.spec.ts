import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellLayoutService } from './shell-layout.service';

/** Stubs matchMedia so the shell sees the given viewport width. */
function viewport(width: number): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
      return {
        matches: width >= min,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }),
  );
}

function key(init: KeyboardEventInit, target?: HTMLElement): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { ...init, cancelable: true });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
}

describe('ShellLayoutService (RD-1)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const create = () => TestBed.inject(ShellLayoutService);

  it('maps the viewport to desktop / tablet / phone and the docked sidebar mode', () => {
    viewport(1440);
    expect(create().dockedMode()).toBe('full');
    TestBed.resetTestingModule();
    viewport(900);
    const tablet = create();
    expect(tablet.device()).toBe('tablet');
    expect(tablet.dockedMode()).toBe('rail');
    TestBed.resetTestingModule();
    viewport(390);
    const phone = create();
    expect(phone.device()).toBe('phone');
    expect(phone.dockedMode()).toBe('none');
  });

  it('desktop: the toggle collapses to the rail and the choice survives a reload', () => {
    viewport(1440);
    const layout = create();
    layout.toggle();
    expect(layout.collapsed()).toBe(true);
    expect(layout.dockedMode()).toBe('rail');
    expect(layout.drawerOpen()).toBe(false);

    TestBed.resetTestingModule();
    viewport(1440);
    expect(create().dockedMode()).toBe('rail');
  });

  it('tablet and phone: the toggle opens and closes the drawer instead', () => {
    viewport(900);
    const layout = create();
    layout.toggle();
    expect(layout.drawerOpen()).toBe(true);
    expect(layout.collapsed()).toBe(false);
    expect(layout.expanded()).toBe(true);
    layout.toggle();
    expect(layout.drawerOpen()).toBe(false);
  });

  it('Ctrl+B and ⌘+B toggle; Escape closes the drawer', () => {
    viewport(1440);
    const layout = create();
    const ctrl = key({ key: 'b', ctrlKey: true });
    expect(layout.handleKey(ctrl)).toBe(true);
    expect(ctrl.defaultPrevented).toBe(true);
    expect(layout.collapsed()).toBe(true);
    expect(layout.handleKey(key({ key: 'B', metaKey: true }))).toBe(true);
    expect(layout.collapsed()).toBe(false);

    layout.device.set('phone');
    layout.openDrawer();
    expect(layout.handleKey(key({ key: 'Escape' }))).toBe(true);
    expect(layout.drawerOpen()).toBe(false);
  });

  it('leaves Ctrl+B alone while the user is typing (it is "bold" in an editor)', () => {
    viewport(1440);
    const layout = create();
    const input = document.createElement('input');
    expect(layout.handleKey(key({ key: 'b', ctrlKey: true }, input))).toBe(false);
    const editor = document.createElement('div');
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    expect(layout.handleKey(key({ key: 'b', ctrlKey: true }, editor))).toBe(false);
    expect(layout.collapsed()).toBe(false);
  });

  it('still works when storage is unavailable', () => {
    viewport(1440);
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const layout = create();
    expect(layout.collapsed()).toBe(false);
    layout.toggle();
    expect(layout.collapsed()).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });
});
