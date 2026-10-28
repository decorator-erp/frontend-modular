import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpacesStore } from '../../stores/spaces.store';
import { CrmProvisioningPageComponent } from './provisioning-page.component';

// 009b #N-6: GET …/spaces/provisioning[/summary] have no backend route (EP/CrmSpaceEndpoints.cs:25-71).
describe('CrmProvisioningPageComponent (009b #N-6)', () => {
  const store = {
    setProject: vi.fn(),
    loadProvisioning: vi.fn(),
    loadProvisioningSummary: vi.fn(),
    provisioning: signal([]),
    provisioningSummary: signal([]),
    error: signal(null),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CrmProvisioningPageComponent],
      providers: [
        { provide: SpacesStore, useValue: store },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ projectId: 'P' }) } },
        },
      ],
    });
  });

  it('renders the not-available state and reads nothing', () => {
    const fixture = TestBed.createComponent(CrmProvisioningPageComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Provisioning is not available yet.',
    );
    expect(store.loadProvisioning).not.toHaveBeenCalled();
    expect(store.loadProvisioningSummary).not.toHaveBeenCalled();
  });
});
