import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Toast, ToastService } from '@platform/feedback/toast.service';
import { PeraToastContainerComponent } from './pera-toast-container.component';

function setup(toasts: Toast[]) {
  const items = signal<Toast[]>(toasts);
  const dismiss = vi.fn();
  TestBed.configureTestingModule({
    imports: [PeraToastContainerComponent],
    providers: [{ provide: ToastService, useValue: { items, dismiss } }],
  });
  const fixture = TestBed.createComponent(PeraToastContainerComponent);
  fixture.detectChanges();
  return { fixture, dismiss, el: fixture.nativeElement as HTMLElement };
}

describe('PeraToastContainerComponent', () => {
  it('announces politely and renders a simple toast', () => {
    const { el } = setup([{ id: 1, tone: 'info', message: 'Hello' }]);
    expect(el.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(el.textContent).toContain('Hello');
  });

  it('renders an optional title above the message', () => {
    const { el } = setup([{ id: 1, tone: 'info', title: 'New task', message: 'body' }]);
    expect(el.textContent).toContain('New task');
    expect(el.textContent).toContain('body');
  });

  it('renders a non-button body when there is no action (dismiss only)', () => {
    const { el } = setup([{ id: 1, tone: 'info', message: 'x' }]);
    expect(el.querySelectorAll('button')).toHaveLength(1); // just the dismiss control
  });

  it('an action toast is activatable — click runs the action and dismisses it', () => {
    const run = vi.fn();
    const { el, dismiss } = setup([{ id: 7, tone: 'info', message: 'Go', action: { run } }]);
    const contentButton = el.querySelectorAll('button')[0]; // content precedes dismiss in the DOM
    contentButton.click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith(7);
  });

  it('does not steal focus on arrival (A1)', () => {
    const { el } = setup([{ id: 1, tone: 'info', message: 'x', action: { run: vi.fn() } }]);
    expect(document.activeElement).not.toBe(el.querySelector('button'));
  });
});
