import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ProjectDocumentsService, ProjectService } from '@modules/projects';
import { VariationSignDialogComponent } from './variation-sign-dialog.component';

/** Sync W1-7: the dialog collects SignVariationRequest — the project's client and a document path. */
describe('VariationSignDialogComponent (sync W1-7)', () => {
  function make(clientId: string) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [VariationSignDialogComponent],
      providers: [
        {
          provide: ProjectService,
          useValue: { getById: () => of({ id: 'P1', clientId, clientName: 'Hana Ali' }) },
        },
        {
          provide: ProjectDocumentsService,
          useValue: { getByProject: () => of([{ id: 'D1', fileName: 'signed.pdf' }]) },
        },
        { provide: PeraModalRef, useValue: { close } },
        { provide: PERA_MODAL_DATA, useValue: { projectId: 'P1' } },
      ],
    });
    const fixture = TestBed.createComponent(VariationSignDialogComponent);
    fixture.detectChanges();
    return { c: fixture.componentInstance, close, el: fixture.nativeElement as HTMLElement };
  }

  it("signs as the project's client with the picked document's path", () => {
    const { c, close, el } = make('C1');
    expect(el.querySelector('[data-client]')?.textContent).toContain('Hana Ali');
    c.form.controls.documentId.setValue('D1');
    expect(c.form.controls.signedDocumentPath.value).toBe('project-documents/D1');
    c.submit();
    expect(close).toHaveBeenCalledWith({
      signedByClientId: 'C1',
      signedDocumentPath: 'project-documents/D1',
    });
  });

  it('accepts a typed path', () => {
    const { c, close } = make('C1');
    c.form.controls.signedDocumentPath.setValue('  contracts/var-12.pdf ');
    c.submit();
    expect(close).toHaveBeenCalledWith({
      signedByClientId: 'C1',
      signedDocumentPath: 'contracts/var-12.pdf',
    });
  });

  it('cannot sign without a project client', () => {
    const { c, close, el } = make('');
    c.form.controls.signedDocumentPath.setValue('x.pdf');
    c.submit();
    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector('[data-no-client]')).not.toBeNull();
  });
});
