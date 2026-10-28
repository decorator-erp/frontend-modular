import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { CrmMyGatheringWorkService } from '../../data/crm-my-gathering-work.service';
import { CrmMyWorkComponent } from './my-work.component';

// 009b #N-4: GET /api/crm/my-gathering-work has no backend route (no Map* in src/Modules).
describe('CrmMyWorkComponent (009b #N-4)', () => {
  const list = vi.fn().mockReturnValue(of([]));

  beforeEach(() => {
    list.mockClear();
    TestBed.configureTestingModule({
      imports: [CrmMyWorkComponent],
      providers: [{ provide: CrmMyGatheringWorkService, useValue: { list } }],
    });
  });

  it('renders the not-available state and reads nothing', () => {
    const fixture = TestBed.createComponent(CrmMyWorkComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('My gathering tasks');
    expect(text).toContain('Gathering tasks are not available yet.');
    expect(list).not.toHaveBeenCalled();
  });
});
