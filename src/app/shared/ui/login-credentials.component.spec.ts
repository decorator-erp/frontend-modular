import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginCredentialsComponent } from './login-credentials.component';

describe('LoginCredentialsComponent (LC-2)', () => {
  // Replace only navigator.clipboard: stubbing the whole navigator breaks Angular (userAgent).
  const setClipboard = (writeText: ReturnType<typeof vi.fn>) =>
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  afterEach(() =>
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }),
  );

  function render() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    TestBed.configureTestingModule({ imports: [LoginCredentialsComponent] });
    const f = TestBed.createComponent(LoginCredentialsComponent);
    f.componentRef.setInput('login', { email: 'mona@example.com', password: 'Tmp!Pass2wordX9' });
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, writeText };
  }

  it('shows the login email and the temporary password, left-to-right', () => {
    const { el } = render();
    expect(el.querySelector('[data-value="email"]')?.textContent?.trim()).toBe('mona@example.com');
    const pw = el.querySelector('[data-value="password"]')!;
    expect(pw.textContent?.trim()).toBe('Tmp!Pass2wordX9');
    expect(pw.getAttribute('dir')).toBe('ltr');
  });

  it('copies each value, and both together, then says Copied', async () => {
    const { f, el, writeText } = render();
    el.querySelector<HTMLButtonElement>('[data-copy="password"]')!.click();
    await Promise.resolve();
    f.detectChanges();
    expect(writeText).toHaveBeenCalledWith('Tmp!Pass2wordX9');
    expect(el.querySelector('[data-copy="password"]')?.textContent?.trim()).toBe('Copied');

    el.querySelector<HTMLButtonElement>('[data-copy="both"]')!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('mona@example.com'));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('Tmp!Pass2wordX9'));
  });

  it('keeps working when the clipboard is blocked — the values stay on screen', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    TestBed.configureTestingModule({ imports: [LoginCredentialsComponent] });
    const f = TestBed.createComponent(LoginCredentialsComponent);
    f.componentRef.setInput('login', { email: 'a@b.c', password: 'Xx1!xxxx' });
    f.detectChanges();
    await f.componentInstance.copy('password', 'Xx1!xxxx');
    expect(f.componentInstance.copied()).toBeNull();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Xx1!xxxx');
  });
});
