import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectDocumentsService,
  ProjectService,
  ProjectStageService,
  ProjectTaskService,
} from '@modules/projects';
import { AuthStore } from '@platform/auth/auth.store';
import { ToastService } from '@platform/feedback/toast.service';
import { ConfirmService, ModalService, PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import { CrmSitePhotoService } from '../../data/crm-site-photo.service';
import { PortalShareKind, type PortalPreview, type PortalShare } from '../../model/portal.model';
import { PortalSharesStore } from '../../stores/portal-shares.store';
import { CrmPortalPageComponent } from './portal-page.component';
import { CrmPortalPreviewPanelComponent } from './portal-preview-panel.component';
import { CrmPortalSettingsPanelComponent } from './portal-settings-panel.component';
import { CrmPortalShareDialogComponent } from './portal-share-dialog.component';
import { CrmPortalSharePickerComponent } from './portal-share-picker.component';
import { CrmPortalSharesPanelComponent } from './portal-shares-panel.component';
import { CrmPortalUpdateDialogComponent } from './portal-update-dialog.component';
import { CrmPortalUpdatesPanelComponent } from './portal-updates-panel.component';

const MANAGE = 'crm.portal.manage';

const share = (id: string, extra: Partial<PortalShare> = {}): PortalShare => ({
  id,
  projectId: 'P1',
  itemKind: PortalShareKind.Document,
  itemId: `D-${id}`,
  followLatest: true,
  clientTitle: null,
  clientNote: null,
  sortOrder: 0,
  sharedById: 'E1',
  sharedAtUtc: '2026-11-01T10:00:00Z',
  isAvailable: true,
  itemName: `${id}.pdf`,
  contentType: 'application/pdf',
  isImage: false,
  version: 1,
  stageName: null,
  siteCode: null,
  ...extra,
});

const httpError = (status: number, code: string) =>
  new HttpErrorResponse({ status, error: { errors: { [code]: ['server text'] } } });

let claims: string[];
let api: Record<string, ReturnType<typeof vi.fn>>;
let toast: { show: ReturnType<typeof vi.fn> };
let confirm: { open: ReturnType<typeof vi.fn> };
let modal: { open: ReturnType<typeof vi.fn> };
let modalRef: { close: ReturnType<typeof vi.fn> };

function configure(extra: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { can: (p: string) => claims.includes(p) } },
      { provide: CrmPortalVisibilityService, useValue: api },
      { provide: ToastService, useValue: toast },
      { provide: ConfirmService, useValue: confirm },
      { provide: ModalService, useValue: modal },
      { provide: PeraModalRef, useValue: modalRef },
      ...(extra as never[]),
    ],
  });
}

beforeEach(() => {
  claims = [MANAGE];
  api = {
    getSettings: vi.fn(() =>
      of({
        projectId: 'P1',
        progress: true,
        tasks: false,
        documents: false,
        gallery: false,
        siteSurveys: false,
        updates: false,
      }),
    ),
    saveSettings: vi.fn(() => of(undefined)),
    getShares: vi.fn(() => of([share('S1'), share('S2'), share('S3')])),
    reorderShares: vi.fn(() => of(undefined)),
    deleteShare: vi.fn(() => of(undefined)),
    updateShare: vi.fn(() => of(undefined)),
    createShare: vi.fn(() => of('S9')),
    getUpdates: vi.fn(() => of([])),
    createUpdate: vi.fn(() => of('U9')),
    editUpdate: vi.fn(() => of(undefined)),
    deleteUpdate: vi.fn(() => of(undefined)),
    publishUpdate: vi.fn(() => of(undefined)),
    getPreview: vi.fn(),
  };
  toast = { show: vi.fn() };
  confirm = { open: vi.fn(async () => true) };
  modal = { open: vi.fn(() => ({ afterClosed: async () => true })) };
  modalRef = { close: vi.fn() };
});

const click = (el: HTMLElement, selector: string) =>
  (el.querySelector(`${selector} button, button${selector}`) as HTMLButtonElement).click();

describe('CrmPortalSettingsPanelComponent — section switches (crmp P2-B)', () => {
  function render(canManage = true) {
    configure();
    const fixture = TestBed.createComponent(CrmPortalSettingsPanelComponent);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.componentRef.setInput('canManage', canManage);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  it('loads the six switches and saves all six with PUT; shows the saved state', () => {
    const { fixture, el, cmp } = render();
    expect(api['getSettings']).toHaveBeenCalledWith('P1');
    expect(el.querySelectorAll('[data-section]')).toHaveLength(6);
    cmp.form.controls.gallery.setValue(true);
    fixture.detectChanges();
    click(el, '[data-testid="settings-save"]');
    fixture.detectChanges();
    expect(api['saveSettings']).toHaveBeenCalledWith('P1', {
      progress: true,
      tasks: false,
      documents: false,
      gallery: true,
      siteSurveys: false,
      updates: false,
    });
    expect(el.querySelector('[data-testid="settings-saved"]')?.textContent).toContain(
      'Sections saved.',
    );
  });

  it('a failed save shows the catalog message for its code', () => {
    api['saveSettings'].mockReturnValue(throwError(() => httpError(409, 'crm.projects.Inactive')));
    const { fixture, el, cmp } = render();
    cmp.form.controls.tasks.setValue(true);
    cmp.save();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="settings-error"]')?.textContent).toContain(
      'This project is inactive and takes no new CRM work.',
    );
  });

  it('a concurrent change (SettingsChanged) reloads and toasts', () => {
    api['saveSettings'].mockReturnValue(
      throwError(() => httpError(409, 'crm.portal.SettingsChanged')),
    );
    const { cmp } = render();
    cmp.form.controls.tasks.setValue(true);
    cmp.save();
    expect(api['getSettings']).toHaveBeenCalledTimes(2);
    expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'info' }));
  });

  it('without crm.portal.manage the switches are disabled and there is no save', () => {
    const { el, cmp } = render(false);
    expect(cmp.form.disabled).toBe(true);
    expect(el.querySelector('[data-testid="settings-save"]')).toBeNull();
  });

  it('a 404 emits notFound', () => {
    api['getSettings'].mockReturnValue(throwError(() => httpError(404, 'crm.projects.NotFound')));
    configure();
    const fixture = TestBed.createComponent(CrmPortalSettingsPanelComponent);
    const seen = vi.fn();
    fixture.componentInstance.notFound.subscribe(seen);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.detectChanges();
    TestBed.tick();
    expect(seen).toHaveBeenCalled();
  });
});

describe('CrmPortalSharesPanelComponent — shared with client (crmp P2-B)', () => {
  function render(canManage = true) {
    configure();
    const fixture = TestBed.createComponent(CrmPortalSharesPanelComponent);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.componentRef.setInput('canManage', canManage);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  const names = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-testid="share-name"]')).map((n) => n.textContent?.trim());

  it('lists the shares in order: client title first, then the item name; marks unavailable ones', () => {
    api['getShares'].mockReturnValue(
      of([share('S1', { clientTitle: 'Kitchen plan' }), share('S2', { isAvailable: false })]),
    );
    const { el } = render();
    expect(names(el)).toEqual(['Kitchen plan', 'S2.pdf']);
    expect(el.textContent).toContain('Internal name: S1.pdf');
    expect(el.querySelectorAll('[data-testid="unavailable"]')).toHaveLength(1);
  });

  it('moving a share down writes the whole new order', () => {
    const { el, fixture } = render();
    (el.querySelectorAll('[data-testid="move-down"]')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api['reorderShares']).toHaveBeenCalledWith('P1', ['S2', 'S1', 'S3']);
    expect(names(el)).toEqual(['S2.pdf', 'S1.pdf', 'S3.pdf']);
  });

  it('the first row cannot move up and the last cannot move down', () => {
    const { el } = render();
    const ups = el.querySelectorAll<HTMLButtonElement>('[data-testid="move-up"]');
    const downs = el.querySelectorAll<HTMLButtonElement>('[data-testid="move-down"]');
    expect(ups[0].disabled).toBe(true);
    expect(downs[2].disabled).toBe(true);
  });

  it('a refused order (InvalidOrder) restores the list and shows the message', () => {
    api['reorderShares'].mockReturnValue(
      throwError(() => httpError(400, 'crm.portal.InvalidOrder')),
    );
    const { el, fixture, cmp } = render();
    cmp.move(share('S1'), 1);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="shares-error"]')?.textContent).toContain(
      'The list changed while you were reordering it.',
    );
    expect(api['getShares']).toHaveBeenCalledTimes(2);
  });

  it('unshare asks first, then deletes and re-reads', async () => {
    const { cmp } = render();
    await cmp.unshare(share('S2'));
    expect(confirm.open).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'The client stops seeing "S2.pdf" right away.' }),
    );
    expect(api['deleteShare']).toHaveBeenCalledWith('P1', 'S2');
    expect(api['getShares']).toHaveBeenCalledTimes(2);
  });

  it('a declined confirm deletes nothing', async () => {
    confirm.open.mockResolvedValue(false);
    const { cmp } = render();
    await cmp.unshare(share('S2'));
    expect(api['deleteShare']).not.toHaveBeenCalled();
  });

  it('edit opens the share dialog with the share', async () => {
    const { cmp } = render();
    await cmp.edit(share('S1'));
    expect(modal.open.mock.calls[0][0]).toBe(CrmPortalShareDialogComponent);
    expect(modal.open.mock.calls[0][1].data).toEqual(
      expect.objectContaining({ mode: 'edit', projectId: 'P1' }),
    );
  });

  it('filters by kind', () => {
    api['getShares'].mockReturnValue(
      of([share('S1'), share('S2', { itemKind: PortalShareKind.Task, itemName: 'Paint' })]),
    );
    const { el, fixture, cmp } = render();
    cmp.kindFilter.setValue(PortalShareKind.Task);
    fixture.detectChanges();
    expect(names(el)).toEqual(['Paint']);
  });

  it('without crm.portal.manage: no add, move, edit or unshare', () => {
    const { el } = render(false);
    expect(el.querySelector('[data-testid="add-share"]')).toBeNull();
    expect(el.querySelector('[data-testid="move-up"]')).toBeNull();
    expect(el.querySelector('[data-testid="unshare"]')).toBeNull();
  });

  it('Add opens the picker', async () => {
    const { cmp } = render();
    await cmp.openPicker();
    expect(modal.open.mock.calls[0][0]).toBe(CrmPortalSharePickerComponent);
  });
});

describe('CrmPortalShareDialogComponent — edit (crmp P2-B)', () => {
  function render(data: unknown) {
    configure([{ provide: PERA_MODAL_DATA, useValue: data }]);
    const fixture = TestBed.createComponent(CrmPortalShareDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('edits title, note and follow-latest', () => {
    const fixture = render({ mode: 'edit', projectId: 'P1', share: share('S1') });
    const cmp = fixture.componentInstance;
    cmp.form.patchValue({ clientTitle: 'Plan', clientNote: 'Ground floor', followLatest: false });
    cmp.submit();
    expect(api['updateShare']).toHaveBeenCalledWith('P1', 'S1', {
      clientTitle: 'Plan',
      clientNote: 'Ground floor',
      followLatest: false,
    });
    expect(modalRef.close).toHaveBeenCalledWith(true);
  });

  it('a stage share sends no follow-latest', () => {
    const fixture = render({
      mode: 'edit',
      projectId: 'P1',
      share: share('S1', { itemKind: PortalShareKind.Stage }),
    });
    fixture.componentInstance.submit();
    expect(api['updateShare']).toHaveBeenCalledWith('P1', 'S1', {
      clientTitle: '',
      clientNote: '',
      followLatest: undefined,
    });
  });

  it('create (the item screen action) sends notifyClient; AlreadyShared shows its message', () => {
    api['createShare'].mockReturnValue(
      throwError(() => httpError(409, 'crm.portal.AlreadyShared')),
    );
    const fixture = render({
      mode: 'create',
      projectId: 'P1',
      kind: PortalShareKind.SitePhoto,
      itemId: 'L1',
      itemName: 'IMG_1.jpg',
    });
    const cmp = fixture.componentInstance;
    cmp.form.patchValue({ notifyClient: true });
    cmp.submit();
    expect(api['createShare']).toHaveBeenCalledWith('P1', {
      itemKind: PortalShareKind.SitePhoto,
      itemId: 'L1',
      clientTitle: '',
      clientNote: '',
      followLatest: undefined,
      notifyClient: true,
    });
    expect(cmp.error()).toBe('This item is already shared with the client.');
    expect(modalRef.close).not.toHaveBeenCalled();
  });
});

describe('CrmPortalSharePickerComponent — add to client portal (crmp P2-B)', () => {
  let documents: { getByProject: ReturnType<typeof vi.fn> };
  let stages: { getByProject: ReturnType<typeof vi.fn> };
  let tasks: { getByProject: ReturnType<typeof vi.fn> };
  let sites: { listSites: ReturnType<typeof vi.fn>; documents: ReturnType<typeof vi.fn> };

  function render() {
    documents = {
      getByProject: vi.fn(() =>
        of([
          { id: 'D-S1', fileName: 'plan.pdf', contentType: 'application/pdf' },
          { id: 'D2', fileName: 'tiles.jpg', contentType: 'image/jpeg' },
        ]),
      ),
    };
    stages = { getByProject: vi.fn(() => of([{ id: 'ST1', name: 'Design' }])) };
    tasks = { getByProject: vi.fn(() => of([{ id: 'T1', name: 'Paint' }])) };
    sites = {
      listSites: vi.fn(() => of([{ id: 'SV1', code: 'SV-001' }])),
      documents: vi.fn(() =>
        of([
          { id: 'L1', documentId: 'D2', kind: 3 },
          { id: 'L2', documentId: 'D-S1', kind: 1 },
        ]),
      ),
    };
    configure([
      { provide: PERA_MODAL_DATA, useValue: { projectId: 'P1' } },
      { provide: ProjectDocumentsService, useValue: documents },
      { provide: ProjectStageService, useValue: stages },
      { provide: ProjectTaskService, useValue: tasks },
      { provide: CrmSitePhotoService, useValue: sites },
    ]);
    const fixture = TestBed.createComponent(CrmPortalSharePickerComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance };
  }

  beforeEach(() => {
    claims = [MANAGE, 'documents.read', 'stages.read', 'stage_tasks.read', 'sites.read'];
  });

  it('Document lists the project documents; an already shared one is disabled', () => {
    const { cmp } = render();
    cmp.form.controls.kind.setValue(PortalShareKind.Document);
    expect(documents.getByProject).toHaveBeenCalledWith('P1');
    expect(cmp['itemOptions']()).toEqual([
      { value: 'D-S1', label: 'plan.pdf (already shared)', disabled: true },
      { value: 'D2', label: 'tiles.jpg', disabled: false },
    ]);
  });

  it('Image lists only image/* documents', () => {
    const { cmp } = render();
    cmp.form.controls.kind.setValue(PortalShareKind.Image);
    expect(cmp['itemOptions']().map((o: { value: unknown }) => o.value)).toEqual(['D2']);
  });

  it('Stage and Task list the project stages and tasks', () => {
    const { cmp } = render();
    cmp.form.controls.kind.setValue(PortalShareKind.Stage);
    expect(cmp.items()).toEqual([{ id: 'ST1', label: 'Design' }]);
    cmp.form.controls.kind.setValue(PortalShareKind.Task);
    expect(cmp.items()).toEqual([{ id: 'T1', label: 'Paint' }]);
  });

  it('Site photo lists the surveys, then the Photo links named by their documents', () => {
    const { cmp } = render();
    cmp.form.controls.kind.setValue(PortalShareKind.SitePhoto);
    expect(sites.listSites).toHaveBeenCalledWith('P1');
    expect(cmp.siteOptions()).toEqual([{ value: 'SV1', label: 'SV-001' }]);
    cmp.form.controls.siteId.setValue('SV1');
    expect(sites.documents).toHaveBeenCalledWith('SV1');
    expect(cmp.items()).toEqual([{ id: 'L1', label: 'tiles.jpg' }]);
  });

  it('without the list permission says so and reads nothing', () => {
    claims = [MANAGE];
    const { cmp } = render();
    cmp.form.controls.kind.setValue(PortalShareKind.Task);
    expect(cmp.itemsState()).toBe('noAccess');
    expect(tasks.getByProject).not.toHaveBeenCalled();
  });

  it('shares the picked item with title, note and Notify client', () => {
    const { cmp } = render();
    cmp.form.controls.kind.setValue(PortalShareKind.Task);
    cmp.form.patchValue({ itemId: 'T1', clientTitle: 'Painting', notifyClient: true });
    cmp.submit();
    expect(api['createShare']).toHaveBeenCalledWith('P1', {
      itemKind: PortalShareKind.Task,
      itemId: 'T1',
      clientTitle: 'Painting',
      clientNote: '',
      followLatest: undefined,
      notifyClient: true,
    });
    expect(modalRef.close).toHaveBeenCalledWith(true);
  });

  it('a refused share (NotAnImage) shows its message', () => {
    api['createShare'].mockReturnValue(throwError(() => httpError(400, 'crm.portal.NotAnImage')));
    const { cmp } = render();
    cmp.form.controls.kind.setValue(PortalShareKind.Image);
    cmp.form.patchValue({ itemId: 'D2' });
    cmp.submit();
    expect(cmp.error()).toBe('Only an image file can be shared as an image.');
  });
});

describe('CrmPortalUpdatesPanelComponent and dialog — client updates (crmp P2-B)', () => {
  const draft = {
    id: 'U1',
    projectId: 'P1',
    title: 'Tiles',
    body: 'Installed',
    publishedAtUtc: null,
    authorId: 'E1',
    createdAtUtc: '2026-11-02T10:00:00Z',
    shareIds: ['S1'],
  };

  it('lists drafts and published updates; publish opens the publish dialog', async () => {
    api['getUpdates'].mockReturnValue(
      of([draft, { ...draft, id: 'U2', title: 'Walls', publishedAtUtc: '2026-11-03T10:00:00Z' }]),
    );
    configure();
    const fixture = TestBed.createComponent(CrmPortalUpdatesPanelComponent);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid="update-row"]')).toHaveLength(2);
    expect(el.textContent).toContain('Draft');
    expect(el.textContent).toContain('Published');
    expect(el.querySelectorAll('[data-testid="publish"]')).toHaveLength(1);
    await fixture.componentInstance.publish(draft);
    expect(modal.open.mock.calls[0][0]).toBe(CrmPortalUpdateDialogComponent);
    expect(modal.open.mock.calls[0][1].data).toEqual({
      mode: 'publish',
      projectId: 'P1',
      update: draft,
    });
    expect(api['getUpdates']).toHaveBeenCalledTimes(2);
  });

  it('delete asks first, then deletes', async () => {
    configure();
    const fixture = TestBed.createComponent(CrmPortalUpdatesPanelComponent);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    await fixture.componentInstance.remove(draft);
    expect(api['deleteUpdate']).toHaveBeenCalledWith('P1', 'U1');
  });

  function dialog(data: unknown) {
    configure([{ provide: PERA_MODAL_DATA, useValue: data }]);
    const fixture = TestBed.createComponent(CrmPortalUpdateDialogComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('create sends title, text and the ticked file shares only', () => {
    const cmp = dialog({
      mode: 'create',
      projectId: 'P1',
      shares: [
        share('S1'),
        share('S2', { itemKind: PortalShareKind.Image }),
        share('S3', { itemKind: PortalShareKind.Task }),
      ],
    });
    expect(Object.keys(cmp.attachments.controls)).toEqual(['S1', 'S2']);
    cmp.form.patchValue({ title: 'Tiles', body: 'Done' });
    cmp.attachments.controls['S2'].setValue(true);
    cmp.submit();
    expect(api['createUpdate']).toHaveBeenCalledWith('P1', {
      title: 'Tiles',
      body: 'Done',
      shareIds: ['S2'],
    });
  });

  it('edit keeps the attached shares ticked', () => {
    const cmp = dialog({ mode: 'edit', projectId: 'P1', shares: [share('S1')], update: draft });
    cmp.submit();
    expect(api['editUpdate']).toHaveBeenCalledWith('P1', 'U1', {
      title: 'Tiles',
      body: 'Installed',
      shareIds: ['S1'],
    });
  });

  it('a missing title is not sent', () => {
    const cmp = dialog({ mode: 'create', projectId: 'P1', shares: [] });
    cmp.submit();
    expect(api['createUpdate']).not.toHaveBeenCalled();
  });

  it('publish sends Notify client', () => {
    const cmp = dialog({ mode: 'publish', projectId: 'P1', update: draft });
    cmp.form.controls.notifyClient.setValue(true);
    cmp.submit();
    expect(api['publishUpdate']).toHaveBeenCalledWith('P1', 'U1', true);
    expect(modalRef.close).toHaveBeenCalledWith(true);
  });

  it('an already published update (409) shows its message', () => {
    api['publishUpdate'].mockReturnValue(
      throwError(() => httpError(409, 'crm.portal.AlreadyPublished')),
    );
    const cmp = dialog({ mode: 'publish', projectId: 'P1', update: draft });
    cmp.submit();
    expect(cmp.error()).toBe('This update is already published.');
    expect(modalRef.close).not.toHaveBeenCalled();
  });
});

describe('CrmPortalPreviewPanelComponent — preview as client (crmp P2-B)', () => {
  const preview = (on: boolean): PortalPreview => ({
    overview: {
      projectId: 'P1',
      projectName: 'Villa',
      sections: {
        progress: false,
        tasks: on,
        documents: on,
        gallery: false,
        siteSurveys: false,
        updates: false,
      },
      progress: null,
      counts: { documents: 1, images: null, sitePhotos: null, tasks: 1, updates: null },
    },
    files: on
      ? [
          {
            shareId: 'S1',
            kind: PortalShareKind.Document,
            title: 'Plan',
            note: null,
            fileName: 'plan.pdf',
            contentType: 'application/pdf',
            fileSizeBytes: 10,
            isImage: false,
            sortOrder: 0,
            sharedAtUtc: '',
            url: '',
          },
        ]
      : [],
    gallery: [],
    tasks: on
      ? [
          {
            shareId: 'S4',
            title: 'Paint',
            note: null,
            stageName: null,
            status: 'Completed',
            dueDate: null,
            startedAtUtc: null,
            completedAtUtc: null,
            sortOrder: 0,
          },
        ]
      : [],
    updates: [],
  });

  function render(p: PortalPreview) {
    api['getPreview'].mockReturnValue(of(p));
    configure();
    const fixture = TestBed.createComponent(CrmPortalPreviewPanelComponent);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders the client components read-only, one tab per section that is on', () => {
    const { el, fixture } = render(preview(true));
    expect(fixture.componentInstance.tabs()).toEqual(['files', 'tasks']);
    expect(el.querySelectorAll('[data-testid="portal-file"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="preview-body"] pera-button')).toBeNull();
    fixture.componentInstance.select('tasks');
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="portal-task"]')).toHaveLength(1);
    expect(el.textContent).toContain('Completed');
  });

  it('says so when no section is on', () => {
    const { el } = render(preview(false));
    expect(el.querySelector('[data-testid="preview-none"]')).not.toBeNull();
  });

  it('shows loading while the preview is read', () => {
    api['getPreview'].mockReturnValue(new Subject<PortalPreview>());
    configure();
    const fixture = TestBed.createComponent(CrmPortalPreviewPanelComponent);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="preview-loading"]'),
    ).not.toBeNull();
  });
});

describe('CrmPortalPageComponent — the Client portal tab (crmp P2-B)', () => {
  function render() {
    configure([
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ projectId: 'P1' }) } },
      },
      {
        provide: ProjectService,
        useValue: { getById: vi.fn(() => of({ id: 'P1', name: 'Villa' })) },
      },
    ]);
    const fixture = TestBed.createComponent(CrmPortalPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('opens on the section switches, with the project named', () => {
    const { el } = render();
    expect(el.textContent).toContain('Villa');
    expect(el.querySelector('app-crm-portal-settings-panel')).not.toBeNull();
    expect(el.querySelector('[data-testid="read-only"]')).toBeNull();
  });

  it('clients.read alone is read-only', () => {
    claims = ['clients.read'];
    const { el } = render();
    expect(el.querySelector('[data-testid="read-only"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="settings-save"]')).toBeNull();
  });

  it('an unknown or foreign project shows the 404 state', () => {
    api['getSettings'].mockReturnValue(throwError(() => httpError(404, 'crm.projects.NotFound')));
    const { el } = render();
    expect(el.querySelector('[data-testid="portal-not-found"]')).not.toBeNull();
  });

  it('switches to the shared list', () => {
    const { el, fixture } = render();
    fixture.componentInstance.select('shared');
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="share-row"]')).toHaveLength(3);
    expect(TestBed.inject(PortalSharesStore).state('P1')).toBe('ready');
  });
});
