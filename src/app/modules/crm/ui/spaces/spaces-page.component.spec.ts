import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { ConfirmService } from '@ds';
import type { CrmSpace } from '../../model';
import { SpacesStore } from '../../stores/spaces.store';
import { CrmSpacesPageComponent } from './spaces-page.component';
import { CrmSpaceStorefrontComponent } from './space-storefront.component';
import { CrmArtifactLinksComponent } from '../artifacts/artifact-links.component';

/** crmp C-6: the storefront panel has its own spec; here it is a stub that records its input. */
@Component({ selector: 'app-crm-space-storefront', template: '{{ space().id }}' })
class StorefrontStub {
  readonly space = input.required<CrmSpace>();
}

/** crmp C-7: the artifact list has its own spec. */
@Component({ selector: 'app-crm-artifact-links', template: '{{ subject() }}:{{ subjectId() }}' })
class ArtifactLinksStub {
  readonly subject = input.required<string>();
  readonly subjectId = input.required<string>();
  readonly projectId = input.required<string>();
}

const OTHER = (): CrmSpace => ({ ...SPACE, id: 'S2', name: 'Bath' });

const SPACE: CrmSpace = {
  id: 'S',
  projectId: 'P',
  spaceType: { id: 'T', code: 'kitchen', nameEn: 'Kitchen', nameAr: 'المطبخ' },
  name: 'Kitchen',
  sortOrder: 0,
  isActive: true,
  description: null,
};

// 009b #N-5: no space-item routes exist on the backend, so the board panels are gone.
describe('CrmSpacesPageComponent (009b #N-5)', () => {
  let canManage = true;
  const confirmOpen = vi.fn();
  let store: {
    moveSpace: ReturnType<typeof vi.fn>;
    deleteSpace: ReturnType<typeof vi.fn>;
    setSpaceActive: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    canManage = true;
    confirmOpen.mockReset();
    store = { moveSpace: vi.fn(), deleteSpace: vi.fn(), setSpaceActive: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CrmSpacesPageComponent],
      providers: [
        provideRouter([]),
        { provide: PermissionsService, useValue: { can: () => canManage } },
        { provide: ConfirmService, useValue: { open: confirmOpen } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ projectId: 'P' }) } },
        },
        {
          provide: SpacesStore,
          useValue: {
            load: vi.fn(),
            spaces: signal([SPACE, OTHER()]),
            spaceTypes: signal([]),
            error: signal(null),
            savingSpace: signal(false),
            currentEntryFor: () => undefined,
            // Read only by the pre-#N-5 board panels.
            incompleteSpaceIds: signal(new Set<string>()),
            board: () => [],
            completeness: () => undefined,
            mutatingBySpace: signal({}),
            get moveSpace() {
              return store.moveSpace;
            },
            get deleteSpace() {
              return store.deleteSpace;
            },
            get setSpaceActive() {
              return store.setSpaceActive;
            },
          },
        },
      ],
    });
    TestBed.overrideComponent(CrmSpacesPageComponent, {
      remove: { imports: [CrmSpaceStorefrontComponent, CrmArtifactLinksComponent] },
      add: { imports: [StorefrontStub, ArtifactLinksStub] },
    });
  });

  it('renders the storefront panel for the selected space (crmp C-6)', () => {
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('app-crm-space-storefront');
    expect(panel?.textContent?.trim()).toBe('S');
  });

  it('lists the documents linked to the selected space (crmp C-7, by-space)', () => {
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    const links = (fixture.nativeElement as HTMLElement).querySelector('app-crm-artifact-links');
    expect(links?.textContent?.trim()).toBe('space:S');
  });

  it('keeps the space list and renders no board or completeness panel', () => {
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Kitchen');
    expect(el.querySelector('app-crm-space-brief-note')).not.toBeNull();
    expect(el.querySelector('app-crm-space-board')).toBeNull();
    expect(el.querySelector('app-crm-space-completeness')).toBeNull();
  });

  // crmp C-5: move up/down (real, labelled buttons), rename, activate/deactivate and delete.
  it('offers labelled move up/down, rename, deactivate and delete (crmp C-5)', () => {
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    const byLabel = (l: string) => buttons.find((b) => b.getAttribute('aria-label') === l);

    expect(byLabel('Move Kitchen up')?.disabled).toBe(true);
    expect(byLabel('Move Kitchen down')?.disabled).toBe(false);
    expect(byLabel('Rename Kitchen')).toBeTruthy();
    expect(byLabel('Deactivate')).toBeTruthy();
    expect(byLabel('Delete Kitchen')).toBeTruthy();
  });

  it('move down calls store.moveSpace(id, 1)', () => {
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('button[aria-label="Move Kitchen down"]') as HTMLButtonElement).click();
    expect(store.moveSpace).toHaveBeenCalledWith('S', 1, expect.anything());
  });

  it('a 409 crm.spaces.InUse on delete offers deactivate instead', async () => {
    confirmOpen.mockResolvedValue(true);
    store.deleteSpace.mockImplementation(
      (_id: string, h: { onError: (e: { code: string }) => void }) =>
        h.onError({ code: 'crm.spaces.InUse' }),
    );
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('button[aria-label="Delete Kitchen"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(store.setSpaceActive).toHaveBeenCalledWith('S', false));
    expect(confirmOpen.mock.calls[1][0].confirmLabel).toBe('Deactivate');
  });

  it('hides every write without crm.spaces.manage', () => {
    canManage = false;
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels.filter(Boolean)).toEqual([]);
  });
});
