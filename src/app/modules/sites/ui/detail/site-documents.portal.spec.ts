import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { environment } from '../../../../../environments/environment';
import { SiteLookupService } from '../../data/site-lookup.service';
import { SiteService } from '../../data/site.service';
import { SiteDocumentKind } from '../../model/site-enums';
import { SiteDetailStore } from '../../stores/site-detail.store';
import { SiteDocumentsComponent } from './site-documents.component';

const link = (id: string, kind: SiteDocumentKind) => ({
  id,
  documentId: `D-${id}`,
  siteId: 'SV1',
  recordId: null,
  kind,
  addedById: 'E1',
  createdAtUtc: '2026-11-01T10:00:00Z',
});

/** crmp P2-B: a survey's photo cards carry CRM's "Share with client" action / "Shared" badge. */
describe('SiteDocumentsComponent — share a photo with the client (crmp P2-B)', () => {
  async function render(claims: string[]) {
    TestBed.configureTestingModule({
      imports: [SiteDocumentsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { can: (p: string) => claims.includes(p) } },
        {
          provide: SiteService,
          useValue: {
            documents: () =>
              of([link('L1', SiteDocumentKind.Photo), link('L2', SiteDocumentKind.Sketch)]),
            grouped: () => of({ groups: [] }),
          },
        },
        {
          provide: SiteLookupService,
          useValue: {
            employeeName: () => of('Sara'),
            projectDocuments: () =>
              of([
                { id: 'D-L1', fileName: 'living.jpg', contentType: 'image/jpeg', sizeBytes: 1 },
                {
                  id: 'D-L2',
                  fileName: 'sketch.pdf',
                  contentType: 'application/pdf',
                  sizeBytes: 1,
                },
              ]),
          },
        },
        {
          provide: SiteDetailStore,
          useValue: {
            site: signal({ id: 'SV1', projectId: 'P1' }),
            // crmp P1-B: the documents claim check reads the project's myAccess; null = token claims only.
            project: signal(null),
            caps: signal({ edit: false }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SiteDocumentsComponent);
    fixture.detectChanges();
    // The action is a lazy chunk: let the dynamic import settle, then render its outlet.
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      TestBed.tick();
    }
    return {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      http: TestBed.inject(HttpTestingController),
    };
  }

  it('only the Photo card gets the action; the project shares are read once', async () => {
    const { fixture, el, http } = await render(['crm.portal.manage', 'documents.read']);
    const req = http.expectOne(
      (r) => r.url === `${environment.apiUrl}/crm/projects/P1/portal/shares`,
    );
    req.flush([]);
    fixture.detectChanges();
    const photo = el.querySelector('[data-link="L1"]') as HTMLElement;
    const sketch = el.querySelector('[data-link="L2"]') as HTMLElement;
    expect(photo.querySelector('app-crm-portal-share-action')).not.toBeNull();
    expect(photo.textContent).toContain('Share with client');
    expect(sketch.querySelector('app-crm-portal-share-action')).toBeNull();
    http.verify();
  });

  it('an already shared photo shows the badge', async () => {
    const { fixture, el, http } = await render(['clients.read']);
    http
      .expectOne((r) => r.url === `${environment.apiUrl}/crm/projects/P1/portal/shares`)
      .flush([{ id: 'S1', itemKind: 3, itemId: 'L1', isAvailable: true }]);
    fixture.detectChanges();
    expect((el.querySelector('[data-link="L1"]') as HTMLElement).textContent).toContain(
      'Shared with client',
    );
  });

  it('without a portal read code nothing loads or renders', async () => {
    const { el, http } = await render(['documents.read']);
    http.expectNone((r) => r.url.includes('/portal/'));
    expect(el.querySelector('app-crm-portal-share-action')).toBeNull();
  });
});
