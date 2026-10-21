import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  input,
} from '@angular/core';
import { MarkdownService } from '@shared/markdown/markdown.service';

/**
 * Rendered-markdown view — the single styling surface for user-authored markdown
 * (`marked` + DOMPurify via `MarkdownService`). Sanitised HTML is injected with
 * `[innerHTML]`, so the heading/list/code rules must reach nodes that carry no
 * Angular `_ngcontent` attribute: this component is intentionally
 * `ViewEncapsulation.None` and scopes every rule under a unique `.pera-md` class
 * so the styles stay global-but-namespaced (the only reliable way to style
 * injected HTML — emulated/scoped CSS and Tailwind `[&_h1]` variants don't match
 * it). Used by both the read view and the editor preview so they stay identical.
 */
@Component({
  selector: 'pera-markdown-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<div class="pera-md" [innerHTML]="html()"></div>`,
  styles: [
    `
      .pera-md {
        font-size: 13px;
        line-height: 1.65;
        color: var(--color-text-secondary);
        word-break: break-word;
      }
      .pera-md > :first-child {
        margin-top: 0;
      }
      .pera-md > :last-child {
        margin-bottom: 0;
      }

      .pera-md h1,
      .pera-md h2,
      .pera-md h3,
      .pera-md h4,
      .pera-md h5,
      .pera-md h6 {
        color: var(--color-text-primary);
        font-weight: 600;
        line-height: 1.25;
        margin: 18px 0 8px;
      }
      .pera-md h1 {
        font-size: 20px;
        letter-spacing: -0.01em;
      }
      .pera-md h2 {
        font-size: 16px;
      }
      .pera-md h3 {
        font-size: 14px;
      }
      .pera-md h4 {
        font-size: 13px;
      }
      .pera-md h5,
      .pera-md h6 {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-muted);
      }

      .pera-md p {
        margin: 0 0 10px;
      }
      .pera-md strong {
        color: var(--color-text-primary);
        font-weight: 600;
      }
      .pera-md em {
        font-style: italic;
      }
      .pera-md del {
        color: var(--color-text-muted);
      }
      .pera-md a {
        color: var(--color-accent);
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .pera-md ul,
      .pera-md ol {
        margin: 0 0 10px;
        padding-inline-start: 20px;
      }
      .pera-md ul {
        list-style: disc;
      }
      .pera-md ol {
        list-style: decimal;
      }
      .pera-md li {
        margin: 2px 0;
      }
      .pera-md li > ul,
      .pera-md li > ol {
        margin-bottom: 0;
      }
      .pera-md li::marker {
        color: var(--color-text-muted);
      }

      .pera-md code {
        font-family: var(--mono);
        font-size: 12px;
        background: var(--color-border-soft);
        padding: 1px 5px;
      }
      .pera-md pre {
        background: var(--color-border-soft);
        border: 1px solid var(--color-border);
        padding: 10px 12px;
        overflow: auto;
        margin: 0 0 10px;
      }
      .pera-md pre code {
        background: transparent;
        padding: 0;
        font-size: 12px;
        line-height: 1.5;
      }

      .pera-md blockquote {
        border-inline-start: 2px solid var(--color-border);
        padding-inline-start: 12px;
        margin: 10px 0;
        color: var(--color-text-muted);
      }
      .pera-md hr {
        border: 0;
        border-top: 1px solid var(--color-border);
        margin: 16px 0;
      }
      .pera-md img {
        max-width: 100%;
        height: auto;
      }

      .pera-md table {
        border-collapse: collapse;
        margin: 0 0 10px;
        font-size: 12.5px;
      }
      .pera-md th,
      .pera-md td {
        border: 1px solid var(--color-border);
        padding: 5px 9px;
        text-align: start;
      }
      .pera-md th {
        background: var(--color-border-soft);
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .pera-md input[type='checkbox'] {
        margin-inline-end: 6px;
        vertical-align: middle;
      }
      .pera-md li:has(> input[type='checkbox']) {
        list-style: none;
        margin-inline-start: -16px;
      }
    `,
  ],
})
export class PeraMarkdownViewComponent {
  private readonly md = inject(MarkdownService);
  readonly markdown = input<string | null | undefined>('');
  readonly html = computed(() => this.md.render(this.markdown() ?? ''));
}
