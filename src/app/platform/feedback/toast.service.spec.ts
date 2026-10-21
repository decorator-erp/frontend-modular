import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let svc: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [ToastService] });
    svc = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows a simple {tone, message} toast (existing behaviour unchanged)', () => {
    svc.show({ tone: 'success', message: 'Saved' });
    expect(svc.items()).toHaveLength(1);
    expect(svc.items()[0]).toMatchObject({ tone: 'success', message: 'Saved' });
  });

  it('passes through an optional title and activate action', () => {
    const run = vi.fn();
    svc.show({ tone: 'info', title: 'New task', message: 'Review the drawings', action: { run } });
    const toast = svc.items()[0];
    expect(toast.title).toBe('New task');
    expect(toast.action?.run).toBe(run);
  });

  it('auto-dismisses after the interval', () => {
    svc.show({ tone: 'info', message: 'x' });
    expect(svc.items()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(svc.items()).toHaveLength(0);
  });

  it('dismiss(id) removes a specific toast', () => {
    const id = svc.show({ tone: 'info', message: 'a' });
    svc.show({ tone: 'info', message: 'b' });
    svc.dismiss(id);
    expect(svc.items().map((t) => t.message)).toEqual(['b']);
  });
});
