import { Injectable, computed, signal, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type Locale = 'en' | 'ar';

const STORAGE_KEY = 'pera-locale';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly doc = inject(DOCUMENT);

  readonly locale = signal<Locale>(this.initial());
  readonly direction = computed(() => (this.locale() === 'ar' ? 'rtl' : 'ltr'));

  constructor() {
    effect(() => {
      const loc = this.locale();
      const isRtl = loc === 'ar';
      this.doc.documentElement.setAttribute('lang', loc);
      this.doc.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
      localStorage.setItem(STORAGE_KEY, loc);
    });
  }

  toggle(): void {
    this.locale.set(this.locale() === 'en' ? 'ar' : 'en');
  }

  private initial(): Locale {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === 'en' || stored === 'ar') return stored;
    return navigator.language.startsWith('ar') ? 'ar' : 'en';
  }
}
