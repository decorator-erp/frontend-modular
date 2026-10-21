import { Injectable, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Single render pipeline for user-authored markdown.
 *
 * NEVER bypass this with `[innerHTML]` — DOMPurify strips script/style/iframe
 * before SafeHtml is minted, so the trust boundary is here, not at the template.
 */
@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly sanitizer = inject(DomSanitizer);

  render(markdown: string | null | undefined): SafeHtml {
    if (!markdown) return '';
    const rawHtml = marked.parse(markdown, { breaks: true, gfm: true, async: false }) as string;
    const clean = DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
