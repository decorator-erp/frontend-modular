import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService } from '@ds';
import { ProjectAccessStore, ProjectDocumentsService } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { CrmArtifactService } from '../../data/crm-artifact.service';
import type { CrmArtifactLink } from '../../model';
import { ARTIFACT_PAGE_SIZE, CrmArtifactLinksComponent } from './artifact-links.component';

const link = (id: string, by: string | null = 'E-other'): CrmArtifactLink => ({
  id,
  documentId: `D-${id}`,
  briefId: 'B',
  spaceId: null,
  requirementItemId: null,
  meetingId: null,
  addedByEmployeeId: by,
  addedByContactId: null,
});

const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => link(`L${from + i}`));

describe('CrmArtifactLinksComponent (crmp C-7)', () => {
  let perms: Set<string>;
  let api: { listBySubject: ReturnType<typeof vi.fn>; unlink: ReturnType<typeof vi.fn> };
  const confirmOpen = vi.fn();

  function render() {
    TestBed.configureTestingModule({
      imports: [CrmArtifactLinksComponent],
      providers: [
        { provide: CrmArtifactService, useValue: api },
        { provide: PermissionsService, useValue: { can: (p: string) => perms.has(p) } },
        { provide: ConfirmService, useValue: { open: confirmOpen } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ProjectAccessStore, useValue: { ensure: vi.fn(), me: () => 'E-me' } },
        {
          provide: ProjectDocumentsService,
          useValue: {
            getByProject: vi.fn().mockReturnValue(of([{ id: 'D-L1', fileName: 'plan.pdf' }])),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CrmArtifactLinksComponent);
    fixture.componentRef.setInput('subject', 'brief');
    fixture.componentRef.setInput('subjectId', 'B');
    fixture.componentRef.setInput('projectId', 'P');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    perms = new Set(['crm.artifacts.read']);
    confirmOpen.mockReset();
    api = { listBySubject: vi.fn(), unlink: vi.fn().mockReturnValue(of(undefined)) };
  });

  it('pages the list: "Load more" while a page is full, gone after a short page', () => {
    api.listBySubject
      .mockReturnValueOnce(of(page(1, ARTIFACT_PAGE_SIZE)))
      .mockReturnValueOnce(of(page(100, 3)));
    const { fixture, el } = render();
    expect(api.listBySubject).toHaveBeenCalledWith('brief', 'B', 1, ARTIFACT_PAGE_SIZE);
    expect(el.querySelectorAll('[data-link]')).toHaveLength(ARTIFACT_PAGE_SIZE);
    const more = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Load more'),
    );
    more!.click();
    fixture.detectChanges();
    expect(api.listBySubject).toHaveBeenLastCalledWith('brief', 'B', 2, ARTIFACT_PAGE_SIZE);
    expect(el.querySelectorAll('[data-link]')).toHaveLength(ARTIFACT_PAGE_SIZE + 3);
    expect(
      [...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Load more')),
    ).toBe(false);
  });

  it('resolves the document name from the project documents', () => {
    api.listBySubject.mockReturnValue(of([link('L1')]));
    const { el } = render();
    expect(el.textContent).toContain('plan.pdf');
  });

  it('offers unlink only on links the caller made (no crm.artifacts.manage)', () => {
    api.listBySubject.mockReturnValue(of([link('L1', 'E-me'), link('L2', 'E-other')]));
    const { el } = render();
    const unlinks = el.querySelectorAll('button[aria-label^="Unlink"]');
    expect(unlinks).toHaveLength(1);
    expect(unlinks[0].getAttribute('aria-label')).toBe('Unlink plan.pdf');
  });

  it('a crm.artifacts.manage holder may unlink every link', () => {
    perms.add('crm.artifacts.manage');
    api.listBySubject.mockReturnValue(of([link('L1', 'E-me'), link('L2', 'E-other')]));
    const { el } = render();
    expect(el.querySelectorAll('button[aria-label^="Unlink"]')).toHaveLength(2);
  });

  it('unlink removes the row; 403 crm.artifacts.NotLinker shows the catalog message', async () => {
    perms.add('crm.artifacts.manage');
    api.listBySubject.mockReturnValue(of([link('L1'), link('L2')]));
    confirmOpen.mockResolvedValue(true);
    const { fixture, el } = render();
    (el.querySelector('button[aria-label="Unlink plan.pdf"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(api.unlink).toHaveBeenCalledWith('L1'));
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-link]')).toHaveLength(1);

    api.unlink.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { errors: { 'crm.artifacts.NotLinker': ['msg'] } },
          }),
      ),
    );
    (el.querySelector('button[aria-label^="Unlink"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(api.unlink).toHaveBeenCalledTimes(2));
    fixture.detectChanges();
    expect(el.querySelector('pera-alert')?.textContent?.trim().length).toBeGreaterThan(0);
    expect(el.querySelectorAll('[data-link]')).toHaveLength(1);
  });

  it('renders nothing without crm.artifacts.read', () => {
    perms = new Set();
    const { el } = render();
    expect(api.listBySubject).not.toHaveBeenCalled();
    expect(el.querySelector('section')).toBeNull();
  });
});
