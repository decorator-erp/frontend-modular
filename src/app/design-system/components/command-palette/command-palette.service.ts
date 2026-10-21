import { Injectable, signal } from '@angular/core';

export interface CommandItem {
  id: string;
  label: string;
  /** Group heading this item belongs to (falls back to the source label). */
  group?: string;
  icon?: string;
  /** Mono hint shown on the right (e.g. a route path or entity code). */
  hint?: string;
  run: () => void;
}

export interface CommandSource {
  id: string;
  label: string;
  /** Return matching items for the (possibly empty) query. */
  search(query: string): CommandItem[];
}

/**
 * Registry behind `<pera-command-palette>`. Features register their own
 * entity-search sources here so the palette can fuzzy-search routes *and*
 * domain entities without the DS knowing about features.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly _sources = signal<CommandSource[]>([]);
  readonly sources = this._sources.asReadonly();
  readonly open = signal(false);

  register(source: CommandSource): void {
    this._sources.update((list) => [...list.filter((s) => s.id !== source.id), source]);
  }

  unregister(id: string): void {
    this._sources.update((list) => list.filter((s) => s.id !== id));
  }

  openPalette(): void {
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }

  toggle(): void {
    this.open.update((o) => !o);
  }
}

/** Case-insensitive subsequence match — "emp" matches "Employees". */
export function fuzzyMatch(haystack: string, query: string): boolean {
  if (!query) return true;
  const h = haystack.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  for (const ch of h) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return q.length === 0;
}
