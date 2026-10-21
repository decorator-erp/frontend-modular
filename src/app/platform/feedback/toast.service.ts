import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

/** Optional activate action — makes a toast click/Enter-able (e.g. deep-link a notification). */
export interface ToastAction {
  label?: string;
  run: () => void;
}

export interface Toast {
  id: number;
  tone: ToastTone;
  /** Optional bolder headline above the message. */
  title?: string;
  message: string;
  /** When present, the toast body becomes activatable (stays generic — no router in core). */
  action?: ToastAction;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<Toast[]>([]);
  private seq = 0;

  show(t: Omit<Toast, 'id'>): number {
    const id = ++this.seq;
    this.items.update((a) => [...a, { ...t, id }]);
    setTimeout(() => this.dismiss(id), 5000);
    return id;
  }

  dismiss(id: number): void {
    this.items.update((a) => a.filter((x) => x.id !== id));
  }
}
