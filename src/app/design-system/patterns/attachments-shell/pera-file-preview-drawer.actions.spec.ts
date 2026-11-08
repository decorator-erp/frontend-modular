import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PERA_MODAL_DATA, PeraModalRef } from '../modal/modal.service';
import {
  FilePreviewData,
  PeraFilePreviewDrawerComponent,
} from './pera-file-preview-drawer.component';

/** Sync F2: host-supplied footer actions close the drawer, then run. */
describe('PeraFilePreviewDrawerComponent — actions', () => {
  it('renders each action before Download and closes before running it', () => {
    const order: string[] = [];
    const data: FilePreviewData = {
      id: 'd1',
      name: 'plan.pdf',
      ext: 'txt',
      sizeBytes: 1,
      fetchBlob: () => of(new Blob(['x'])),
      actions: [{ label: 'Versions', run: () => order.push('run') }],
    };
    TestBed.configureTestingModule({
      imports: [PeraFilePreviewDrawerComponent],
      providers: [
        { provide: PERA_MODAL_DATA, useValue: data },
        { provide: PeraModalRef, useValue: { close: () => order.push('close') } },
      ],
    });
    const f = TestBed.createComponent(PeraFilePreviewDrawerComponent);
    f.detectChanges();
    const buttons = [...f.nativeElement.querySelectorAll('.pv-act button')] as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Versions', 'Download', 'Close']);
    buttons[0].click();
    expect(order).toEqual(['close', 'run']);
  });
});
