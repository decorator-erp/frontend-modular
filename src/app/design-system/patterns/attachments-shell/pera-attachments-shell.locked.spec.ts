import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AttachmentItem, PeraAttachmentsShellComponent } from './pera-attachments-shell.component';

const item = (o: Partial<AttachmentItem>): AttachmentItem => ({
  id: 'i1',
  name: 'plan.pdf',
  ext: 'pdf',
  sizeBytes: 10,
  ...o,
});

/** A locked row: lock glyph (caller's label) instead of delete; bulk move/delete withheld. */
describe('PeraAttachmentsShellComponent — locked rows and version tags', () => {
  async function make(items: AttachmentItem[]) {
    TestBed.configureTestingModule({ imports: [PeraAttachmentsShellComponent] });
    const fixture = TestBed.createComponent(PeraAttachmentsShellComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('lockedLabel', 'Locked here');
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  it('shows a lock instead of delete on a locked row, and the version tag', async () => {
    const fixture = await make([
      item({ id: 'a', name: 'a.pdf' }),
      item({ id: 'b', name: 'b.pdf', locked: true, versionLabel: 'v2' }),
    ]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('button[title="Delete"]').length).toBe(1);
    const lock = el.querySelector('[data-locked]');
    expect(lock?.getAttribute('title')).toBe('Locked here');
    expect(el.querySelector('[data-version]')?.textContent?.trim()).toBe('v2');
  });

  it('withholds bulk Move and Delete while a locked row is selected', async () => {
    const fixture = await make([item({ id: 'a' }), item({ id: 'b', locked: true })]);
    const c = fixture.componentInstance;
    c.toggleSelect('a');
    fixture.detectChanges();
    const acts = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.at-bulk .ak')).map((b) =>
        b.textContent?.trim(),
      );
    expect(acts()).toEqual(['Download', 'Move', 'Delete']);
    c.toggleSelect('b');
    fixture.detectChanges();
    expect(acts()).toEqual(['Download']);
  });
});
