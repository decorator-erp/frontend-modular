import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleService } from '@platform/i18n/locale.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ModalService, PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmPortalContentService } from '../../../data/crm-portal-content.service';
import { PortalShareKind, type PortalFile } from '../../../model/portal.model';
import { CrmPortalFilesComponent } from './portal-files.component';
import { CrmPortalGalleryComponent } from './portal-gallery.component';
import { CrmPortalLightboxComponent, type PortalLightboxData } from './portal-lightbox.component';
import {
  CrmPortalSectionTabComponent,
  type PortalListSection,
} from './portal-section-tab.component';
import { PortalBlobUrls } from './portal-format';

const file = (shareId: string, extra: Partial<PortalFile> = {}): PortalFile => ({
  shareId,
  kind: PortalShareKind.Image,
  title: `Photo ${shareId}`,
  note: null,
  fileName: `${shareId}.jpg`,
  contentType: 'image/jpeg',
  fileSizeBytes: 2048,
  isImage: true,
  sortOrder: 0,
  sharedAtUtc: '2026-11-01T10:00:00Z',
  url: '',
  ...extra,
});

let createUrl: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
let revokeUrl: ReturnType<typeof vi.fn<(url: string) => void>>;
const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

beforeEach(() => {
  let n = 0;
  createUrl = vi.fn<(obj: Blob | MediaSource) => string>(() => `blob:${++n}`);
  revokeUrl = vi.fn<(url: string) => void>();
  URL.createObjectURL = createUrl;
  URL.revokeObjectURL = revokeUrl;
});

afterEach(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

describe('CrmPortalFilesComponent — blob download (crmp P2-B)', () => {
  function render(content: Partial<CrmPortalContentService>, readonly = false) {
    const toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CrmPortalFilesComponent],
      providers: [
        { provide: CrmPortalContentService, useValue: content },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(CrmPortalFilesComponent);
    fixture.componentRef.setInput('files', [
      file('S1', {
        kind: PortalShareKind.Document,
        isImage: false,
        fileName: 'plan.pdf',
        fileSizeBytes: 1536,
      }),
    ]);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.componentRef.setInput('readonly', readonly);
    fixture.detectChanges();
    return { fixture, toast, el: fixture.nativeElement as HTMLElement };
  }

  it('lists name and size, and downloads through an authed blob (object URL revoked)', () => {
    const blob = new Blob(['%PDF']);
    const fileBlob = vi.fn(() => of(blob));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { el } = render({ fileBlob });
    expect(el.textContent).toContain('plan.pdf');
    expect(el.textContent).toContain('1.5 KB');
    (el.querySelector('pera-button button') as HTMLButtonElement).click();
    expect(fileBlob).toHaveBeenCalledWith('P1', 'S1');
    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:1');
  });

  it('ignores a second click while the download is in flight', () => {
    const pending = new Subject<Blob>();
    const fileBlob = vi.fn(() => pending.asObservable());
    const { fixture } = render({ fileBlob });
    fixture.componentInstance.download(file('S1'));
    fixture.componentInstance.download(file('S1'));
    expect(fileBlob).toHaveBeenCalledTimes(1);
  });

  it('a failed download shows the catalog message', () => {
    const fileBlob = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 })));
    const { fixture, toast } = render({ fileBlob });
    fixture.componentInstance.download(file('S1'));
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'danger',
      message: 'Could not download the file.',
    });
  });

  it('read-only (the office preview) offers no download', () => {
    const fileBlob = vi.fn();
    const { el, fixture } = render({ fileBlob }, true);
    expect(el.querySelector('pera-button')).toBeNull();
    fixture.componentInstance.download(file('S1'));
    expect(fileBlob).not.toHaveBeenCalled();
  });
});

describe('CrmPortalGalleryComponent — thumbnails and lightbox (crmp P2-B)', () => {
  it('fetches each image once as a blob, opens the lightbox on a tile, revokes on destroy', () => {
    const fileBlob = vi.fn(() => of(new Blob(['x'])));
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [CrmPortalGalleryComponent],
      providers: [
        { provide: CrmPortalContentService, useValue: { fileBlob } },
        { provide: ModalService, useValue: { open } },
      ],
    });
    const fixture = TestBed.createComponent(CrmPortalGalleryComponent);
    fixture.componentRef.setInput('items', [
      file('S1'),
      file('S2', { kind: PortalShareKind.SitePhoto }),
    ]);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(fileBlob.mock.calls).toEqual([
      ['P1', 'S1'],
      ['P1', 'S2'],
    ]);
    expect(el.querySelectorAll('img')).toHaveLength(2);
    expect(el.textContent).toContain('Site photo');
    (el.querySelectorAll('[data-testid="portal-tile"]')[1] as HTMLButtonElement).click();
    expect(open).toHaveBeenCalledTimes(1);
    const config = open.mock.calls[0][1] as { data: PortalLightboxData };
    expect(open.mock.calls[0][0]).toBe(CrmPortalLightboxComponent);
    expect(config.data.index).toBe(1);
    fixture.destroy();
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });

  it('read-only fetches nothing and opens nothing', () => {
    const fileBlob = vi.fn();
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [CrmPortalGalleryComponent],
      providers: [
        { provide: CrmPortalContentService, useValue: { fileBlob } },
        { provide: ModalService, useValue: { open } },
      ],
    });
    const fixture = TestBed.createComponent(CrmPortalGalleryComponent);
    fixture.componentRef.setInput('items', [file('S1')]);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    TestBed.tick();
    fixture.componentInstance.open(0);
    expect(fileBlob).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('CrmPortalLightboxComponent — keyboard and RTL (crmp P2-B)', () => {
  function render(locale: 'en' | 'ar') {
    const blobs = {
      url: vi.fn((k: string) => `blob:${k}`),
      hasFailed: vi.fn(() => false),
      ensure: vi.fn(),
    };
    const close = vi.fn();
    const data: PortalLightboxData = {
      items: [file('S1'), file('S2'), file('S3')],
      index: 1,
      projectId: 'P1',
      blobs: blobs as unknown as PortalBlobUrls,
    };
    TestBed.configureTestingModule({
      imports: [CrmPortalLightboxComponent],
      providers: [
        // A stub: the real LocaleService persists the locale, which would leak into later specs.
        {
          provide: LocaleService,
          useValue: {
            locale: signal(locale),
            direction: signal(locale === 'ar' ? 'rtl' : 'ltr'),
          },
        },
        { provide: PERA_MODAL_DATA, useValue: data },
        { provide: PeraModalRef, useValue: { close } },
        { provide: CrmPortalContentService, useValue: { fileBlob: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(CrmPortalLightboxComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const key = (k: string) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      fixture.detectChanges();
    };
    const position = () =>
      el.querySelector('[data-testid="lightbox-position"]')?.textContent?.trim();
    return { fixture, el, key, position, close, blobs };
  }

  it('shows the opened photo and steps with the buttons', () => {
    const { el, fixture, position } = render('en');
    expect(position()).toBe('Photo 2 of 3');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('blob:S2');
    (el.querySelector('[data-testid="lightbox-next"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(position()).toBe('Photo 3 of 3');
  });

  it('ArrowRight is next and ArrowLeft is previous in LTR', () => {
    const { key, position } = render('en');
    key('ArrowRight');
    expect(position()).toBe('Photo 3 of 3');
    key('ArrowRight');
    expect(position()).toBe('Photo 3 of 3');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(position()).toBe('Photo 1 of 3');
  });

  it('the arrows follow the reading direction in RTL', () => {
    const { key, position } = render('ar');
    key('ArrowLeft');
    expect(position()).toContain('3');
    key('ArrowRight');
    key('ArrowRight');
    expect(position()).toContain('1');
  });
});

@Component({
  template: `<app-crm-portal-section-tab [projectId]="'P1'" [section]="section()" />`,
  imports: [CrmPortalSectionTabComponent],
})
class SectionHost {
  readonly section = signal<PortalListSection>('files');
}

describe('CrmPortalSectionTabComponent — states (crmp P2-B)', () => {
  function render(content: Partial<CrmPortalContentService>, section: PortalListSection) {
    TestBed.configureTestingModule({
      imports: [SectionHost],
      providers: [
        { provide: CrmPortalContentService, useValue: content },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ModalService, useValue: { open: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(SectionHost);
    fixture.componentInstance.section.set(section);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows loading until the list lands', () => {
    const pending = new Subject<PortalFile[]>();
    const { el, fixture } = render({ getFiles: () => pending.asObservable() }, 'files');
    expect(el.querySelector('[data-testid="section-loading"]')).not.toBeNull();
    pending.next([file('S1', { isImage: false })]);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="portal-file"]')).toHaveLength(1);
  });

  it('an empty list shows the empty state', () => {
    const { el } = render({ getTasks: () => of([]) }, 'tasks');
    expect(el.textContent).toContain('No tasks have been shared yet.');
  });

  it('a 404 (the section was switched off) says the section is unavailable', () => {
    const { el } = render(
      {
        getUpdates: () =>
          throwError(
            () =>
              new HttpErrorResponse({
                status: 404,
                error: {
                  errors: { 'crm.portal.NotFound': ['Nothing was found for that request.'] },
                },
              }),
          ),
      },
      'updates',
    );
    expect(el.querySelector('[data-testid="section-unavailable"]')?.textContent).toContain(
      'This section is not available right now.',
    );
  });

  it('any other failure shows an error with a retry that reloads', () => {
    const getGallery = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
      .mockReturnValue(of([]));
    const { el, fixture } = render({ getGallery, fileBlob: vi.fn() }, 'gallery');
    expect(el.querySelector('[data-testid="section-error"]')).not.toBeNull();
    (
      el.querySelector('[data-testid="section-error"] pera-button button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(getGallery).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('No photos have been shared yet.');
  });
});
