import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { ModalService } from '@ds';
import { crmPortalShareAction, PORTAL_SHARE_KIND } from '../../index';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import { PortalShareKind, type PortalShare } from '../../model/portal.model';
import { CrmPortalShareActionComponent } from './portal-share-action.component';
import { CrmPortalShareDialogComponent } from './portal-share-dialog.component';

const shared: PortalShare = {
  id: 'S1',
  projectId: 'P1',
  itemKind: PortalShareKind.SitePhoto,
  itemId: 'L1',
  followLatest: true,
  clientTitle: null,
  clientNote: null,
  sortOrder: 0,
  sharedById: 'E1',
  sharedAtUtc: '',
  isAvailable: true,
  itemName: 'IMG_1.jpg',
  contentType: 'image/jpeg',
  isImage: true,
  version: null,
  stageName: null,
  siteCode: 'SV-001',
};

@Component({
  imports: [CrmPortalShareActionComponent],
  template: `
    @for (id of ids(); track id) {
      <app-crm-portal-share-action
        projectId="P1"
        [kind]="kind"
        [itemId]="id"
        [itemName]="id + '.jpg'"
        [attr.data-item]="id"
      />
    }
  `,
})
class Host {
  readonly ids = signal(['L1', 'L2']);
  readonly kind = PortalShareKind.SitePhoto;
}

/** crmp P2-B: "Share with client" and the "Shared" badge on another module's item rows. */
describe('CrmPortalShareActionComponent (crmp P2-B)', () => {
  let claims: string[];
  let getShares: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    claims = ['crm.portal.manage'];
    getShares = vi.fn(() => of([shared]));
    open = vi.fn(() => ({ afterClosed: async () => true }));
  });

  function render() {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: AuthStore, useValue: { can: (p: string) => claims.includes(p) } },
        { provide: CrmPortalVisibilityService, useValue: { getShares } },
        { provide: ModalService, useValue: { open } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const row = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-item="${id}"]`) as HTMLElement;

  it('reads the project shares once for all rows; a shared item shows the badge', () => {
    const { el } = render();
    expect(getShares).toHaveBeenCalledTimes(1);
    expect(row(el, 'L1').querySelector('[data-testid="portal-shared"]')?.textContent).toContain(
      'Shared with client',
    );
    expect(row(el, 'L1').querySelector('[data-testid="portal-share"]')).toBeNull();
  });

  it('an unshared item offers "Share with client", which opens the create dialog', async () => {
    const { el, fixture } = render();
    (
      row(el, 'L2').querySelector('[data-testid="portal-share"] button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(open.mock.calls[0][0]).toBe(CrmPortalShareDialogComponent);
    expect(open.mock.calls[0][1].data).toEqual({
      mode: 'create',
      projectId: 'P1',
      kind: PortalShareKind.SitePhoto,
      itemId: 'L2',
      itemName: 'L2.jpg',
    });
  });

  it('clients.read alone sees the badge but no share button', () => {
    claims = ['clients.read'];
    const { el } = render();
    expect(row(el, 'L1').querySelector('[data-testid="portal-shared"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="portal-share"]')).toBeNull();
  });

  it('without either read code nothing is read or shown', () => {
    claims = [];
    const { el } = render();
    expect(getShares).not.toHaveBeenCalled();
    expect(
      el.querySelector('[data-testid="portal-shared"], [data-testid="portal-share"]'),
    ).toBeNull();
  });

  it('the barrel hands out a lazy loader and the kind ints', async () => {
    expect(await crmPortalShareAction()).toBe(CrmPortalShareActionComponent);
    expect(PORTAL_SHARE_KIND.SitePhoto).toBe(3);
  });
});
