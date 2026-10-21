import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  forwardRef,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { PeraMarkdownViewComponent } from './pera-markdown-view.component';

type Mode = 'edit' | 'split' | 'preview';

interface ToolbarAction {
  id: string;
  /** SVG path data for the button glyph. */
  icon: string;
  label: string;
  shortcut?: string;
  /** Wrap the selection (inline) — e.g. `**` … `**`. */
  wrap?: string;
  wrapEnd?: string;
  /** Prefix each selected line (block) — e.g. `# `, `- `, `> `. */
  blockPrefix?: string;
  placeholder?: string;
  /** Render a hairline divider before this button (toolbar grouping). */
  group?: boolean;
}

const ACTIONS: ToolbarAction[] = [
  {
    id: 'h1',
    icon: 'M4 6v12M12 6v12M4 12h8M17 9l3-1.5V18',
    label: 'Heading 1',
    blockPrefix: '# ',
    placeholder: 'Heading',
  },
  {
    id: 'h2',
    icon: 'M4 6v12M11 6v12M4 12h7M15 18c0-2 4-3 4-6a2 2 0 0 0-4 0',
    label: 'Heading 2',
    blockPrefix: '## ',
    placeholder: 'Heading',
  },
  {
    id: 'bold',
    icon: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
    label: 'Bold',
    shortcut: 'Ctrl+B',
    wrap: '**',
    wrapEnd: '**',
    placeholder: 'bold',
    group: true,
  },
  {
    id: 'italic',
    icon: 'M10 5h6M8 19h6M14 5l-4 14',
    label: 'Italic',
    shortcut: 'Ctrl+I',
    wrap: '_',
    wrapEnd: '_',
    placeholder: 'italic',
  },
  {
    id: 'strike',
    icon: 'M5 12h14M16 7a4 3 0 0 0-4-2c-2.5 0-4 1.3-4 3M8 16a4 3 0 0 0 4 2c2.5 0 4-1.3 4-3',
    label: 'Strikethrough',
    wrap: '~~',
    wrapEnd: '~~',
    placeholder: 'text',
  },
  {
    id: 'ul',
    icon: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    label: 'Bulleted list',
    blockPrefix: '- ',
    group: true,
  },
  {
    id: 'ol',
    icon: 'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M4 16h2a1 1 0 0 1 0 2H4l2-2',
    label: 'Numbered list',
    blockPrefix: '1. ',
  },
  {
    id: 'check',
    icon: 'M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 5M3 13l1.5 1.5L7 11',
    label: 'Checklist',
    blockPrefix: '- [ ] ',
  },
  {
    id: 'quote',
    icon: 'M7 7H4v6h4V9M17 7h-3v6h4V9',
    label: 'Quote',
    blockPrefix: '> ',
    group: true,
  },
  {
    id: 'code',
    icon: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
    label: 'Code',
    wrap: '`',
    wrapEnd: '`',
    placeholder: 'code',
  },
  {
    id: 'link',
    icon: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
    label: 'Link',
    shortcut: 'Ctrl+K',
    wrap: '[',
    wrapEnd: '](url)',
    placeholder: 'text',
  },
];

/** Continue/exit list markers on Enter: bullet, ordered, or task item. */
const LIST_RE = /^(\s*)([-*+] \[[ xX]\]|\d+\.|[-*+])(\s+)(.*)$/;

/**
 * Markdown editor — a grouped toolbar over a single auto-growing textarea
 * (Jira-style by default), with an optional Write/Preview switch. Implements
 * ControlValueAccessor; the form value is raw markdown. The preview renders
 * through the shared `pera-markdown-view`, so the editing preview and the read
 * view are byte-for-byte identical.
 *
 * Editing niceties: Tab/Shift+Tab indent, Enter continues (or exits) lists,
 * Ctrl/Cmd+B/I/K format, Ctrl/Cmd+Enter fires `(submit)`. Pass
 * `[showModes]="false"` for a pure single box, `[autofocus]="true"` to focus on
 * mount, or `defaultMode="split"` for side-by-side write/preview.
 */
@Component({
  selector: 'pera-markdown-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PeraMarkdownViewComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PeraMarkdownEditorComponent),
      multi: true,
    },
  ],
  template: `
    <div class="border border-border bg-surface focus-within:border-text-muted transition-colors">
      <!-- toolbar -->
      <div class="flex items-center gap-0.5 px-1.5 py-1 border-b border-border-soft">
        @for (a of actions; track a.id) {
          @if (a.group) {
            <span class="w-px h-4 bg-border-soft mx-1"></span>
          }
          <button
            type="button"
            class="inline-flex items-center justify-center w-7 h-7 text-text-muted hover:text-text-primary hover:bg-surface-muted cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
            [title]="a.shortcut ? a.label + ' (' + a.shortcut + ')' : a.label"
            [attr.aria-label]="a.label"
            [disabled]="disabled() || mode() === 'preview'"
            (mousedown)="$event.preventDefault()"
            (click)="apply(a)"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              aria-hidden="true"
            >
              <path [attr.d]="a.icon" />
            </svg>
          </button>
        }

        @if (showModes()) {
          <span class="flex-1"></span>
          <div class="inline-flex border border-border-soft">
            <button
              type="button"
              class="px-2.5 py-1 fs-label font-medium cursor-pointer transition-colors"
              [class.bg-text-primary]="mode() !== 'preview'"
              [class.text-bg]="mode() !== 'preview'"
              [class.text-text-muted]="mode() === 'preview'"
              (click)="setMode('edit')"
            >
              Write
            </button>
            <button
              type="button"
              class="px-2.5 py-1 fs-label font-medium cursor-pointer transition-colors border-s border-border-soft"
              [class.bg-text-primary]="mode() === 'preview'"
              [class.text-bg]="mode() === 'preview'"
              [class.text-text-muted]="mode() !== 'preview'"
              (click)="setMode('preview')"
            >
              Preview
            </button>
          </div>
        }
      </div>

      <!-- body -->
      <div
        class="grid"
        [class.grid-cols-2]="mode() === 'split'"
        [class.divide-x]="mode() === 'split'"
        [class.divide-border-soft]="mode() === 'split'"
      >
        @if (mode() !== 'preview') {
          <textarea
            #ta
            class="block w-full resize-none overflow-hidden px-3.5 py-3 font-mono fs-caption leading-[1.6] text-text-primary bg-surface outline-none placeholder:text-text-muted"
            [style.minHeight.px]="rows() * 21"
            [disabled]="disabled()"
            [ngModel]="value()"
            (ngModelChange)="onInput($event)"
            (blur)="onTouched()"
            (keydown)="onKey($event)"
            [placeholder]="placeholder()"
          ></textarea>
        }
        @if (mode() !== 'edit') {
          <div class="px-3.5 py-3 overflow-auto min-h-[var(--h-editor)]">
            @if (value().trim()) {
              <pera-markdown-view [markdown]="value()" />
            } @else {
              <p class="m-0 fs-caption text-text-muted">Nothing to preview yet.</p>
            }
          </div>
        }
      </div>

      <!-- footer hint -->
      <div
        class="flex items-center gap-2 px-3.5 py-1.5 border-t border-border-soft fs-label text-text-muted"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          aria-hidden="true"
        >
          <path d="M4 5h16M4 12h16M4 19h10" />
        </svg>
        <span>Markdown supported</span>
        @if (submitHint()) {
          <span class="ms-auto font-mono">{{ submitHint() }}</span>
        }
      </div>
    </div>
  `,
})
export class PeraMarkdownEditorComponent implements ControlValueAccessor {
  private readonly ta = viewChild<ElementRef<HTMLTextAreaElement>>('ta');

  readonly rows = input<number>(10);
  readonly placeholder = input<string>(
    'Write in markdown — supports headings, lists, code, links, tables.',
  );
  /** Initial editor mode. Defaults to `split`; pass `edit` for a single-box (Jira-style) editor. */
  readonly defaultMode = input<Mode>('split');
  /** Show the Write/Preview switch. Set `false` for a Jira-style single box. */
  readonly showModes = input(true);
  /** Focus the textarea when it mounts. */
  readonly autofocus = input(false);
  /** Footer hint for the host's submit shortcut, e.g. "⌘↵ to save". Empty hides it. */
  readonly submitHint = input('');
  /** Fired on Ctrl/Cmd+Enter so the host can save without a button trip. */
  readonly submit = output<void>();

  readonly value = signal('');
  readonly mode = linkedSignal<Mode>(() => (this.showModes() ? this.defaultMode() : 'edit'));
  readonly disabled = signal(false);
  readonly actions = ACTIONS;

  private onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};
  private focused = false;

  constructor() {
    // Keep the textarea sized to its content; focus once on mount when asked.
    effect(() => {
      const el = this.ta()?.nativeElement;
      this.value();
      this.mode();
      if (!el) return;
      queueMicrotask(() => {
        this.grow(el);
        if (this.autofocus() && !this.focused) {
          this.focused = true;
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    });
  }

  writeValue(v: string | null): void {
    this.value.set(v ?? '');
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled.set(d);
  }

  setMode(m: Mode): void {
    this.mode.set(m);
  }

  onInput(v: string): void {
    this.value.set(v);
    this.onChange(v);
  }

  private grow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  onKey(ev: KeyboardEvent): void {
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key === 'Enter') {
      ev.preventDefault();
      this.submit.emit();
      return;
    }
    if (mod) {
      const id =
        ev.key.toLowerCase() === 'b'
          ? 'bold'
          : ev.key.toLowerCase() === 'i'
            ? 'italic'
            : ev.key.toLowerCase() === 'k'
              ? 'link'
              : null;
      const action = id ? ACTIONS.find((a) => a.id === id) : null;
      if (action) {
        ev.preventDefault();
        this.apply(action);
      }
      return;
    }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      this.indent(ev.shiftKey);
      return;
    }
    if (ev.key === 'Enter' && !ev.shiftKey && this.continueList(ev)) return;
  }

  /** Continue or exit a markdown list on Enter. Returns true if handled. */
  private continueList(ev: KeyboardEvent): boolean {
    const el = this.ta()?.nativeElement;
    if (!el || el.selectionStart !== el.selectionEnd) return false;
    const pos = el.selectionStart ?? 0;
    const v = this.value();
    const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
    const m = LIST_RE.exec(v.slice(lineStart, pos));
    if (!m) return false;
    ev.preventDefault();
    const [, indent, marker, gap, content] = m;
    if (content.trim() === '') {
      // Empty item → drop the marker and exit the list.
      const next = v.slice(0, lineStart) + v.slice(pos);
      this.set(next, lineStart);
      return true;
    }
    let nextMarker = marker;
    if (/^\d+\.$/.test(marker)) nextMarker = `${parseInt(marker, 10) + 1}.`;
    else nextMarker = marker.replace(/\[[ xX]\]/, '[ ]');
    const insert = `\n${indent}${nextMarker}${gap}`;
    const next = v.slice(0, pos) + insert + v.slice(pos);
    this.set(next, pos + insert.length);
    return true;
  }

  /** Tab / Shift+Tab over the selected lines (two-space soft indent). */
  private indent(outdent: boolean): void {
    const el = this.ta()?.nativeElement;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const v = this.value();
    const from = v.lastIndexOf('\n', start - 1) + 1;
    const block = v.slice(from, end);
    const lines = block.split('\n');
    let delta = 0;
    const out = lines
      .map((l) => {
        if (outdent) {
          const trimmed = l.replace(/^ {1,2}/, '');
          delta += l.length - trimmed.length;
          return trimmed;
        }
        delta += 2;
        return `  ${l}`;
      })
      .join('\n');
    const next = v.slice(0, from) + out + v.slice(end);
    this.value.set(next);
    this.onChange(next);
    const sign = outdent ? -1 : 1;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(Math.max(from, start + sign * 2), end + sign * delta);
    });
  }

  apply(action: ToolbarAction): void {
    const el = this.ta()?.nativeElement;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const current = this.value();
    const selected = current.slice(start, end);
    let next: string;
    let selFrom: number;
    let selTo: number;

    if (action.blockPrefix) {
      const lineStart = current.lastIndexOf('\n', start - 1) + 1;
      const tail = current.slice(end);
      const nl = tail.indexOf('\n');
      const blockEnd = nl === -1 ? current.length : end + nl;
      const block = current.slice(lineStart, blockEnd);
      const prefix = action.blockPrefix;
      const allPrefixed = block.split('\n').every((l) => l.startsWith(prefix));
      const transformed = block
        .split('\n')
        .map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l))
        .join('\n');
      next = current.slice(0, lineStart) + transformed + current.slice(blockEnd);
      selFrom = lineStart;
      selTo = lineStart + transformed.length;
    } else {
      const before = action.wrap ?? '';
      const after = action.wrapEnd ?? '';
      const inner = selected || action.placeholder || '';
      next = current.slice(0, start) + before + inner + after + current.slice(end);
      selFrom = start + before.length;
      selTo = selFrom + inner.length;
    }

    this.set(next, selFrom, selTo);
  }

  /** Commit a new value and restore the caret/selection on the next tick. */
  private set(next: string, from: number, to = from): void {
    this.value.set(next);
    this.onChange(next);
    const el = this.ta()?.nativeElement;
    queueMicrotask(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(from, to);
      this.grow(el);
    });
  }
}
