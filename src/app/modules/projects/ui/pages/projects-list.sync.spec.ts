import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ClientService } from '@modules/clients';
import { environment } from '../../../../../environments/environment';
import { ProjectsListComponent } from './projects-list.component';

/** Sync W2-2 (backend S6): client and owner names come on ProjectResponse; there is no budget. */
describe('ProjectsListComponent — names and columns (sync W2-2)', () => {
  function make(items: Record<string, unknown>[]) {
    TestBed.configureTestingModule({
      imports: [ProjectsListComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ClientService,
          useValue: { getAll: () => of([{ id: 'C2', firstName: 'Nour', lastName: 'Saleh' }]) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectsListComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((r) => r.url === `${environment.apiUrl}/projects`)
      .flush({ items, pageNumber: 1, pageSize: 20, totalCount: items.length });
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('reads clientName and ownerName from the response', () => {
    const c = make([
      { id: 'P1', name: 'Villa', clientId: 'C1', clientName: 'Hana Ali', ownerName: 'Omar' },
    ]);
    expect(c.rows()[0].clientName).toBe('Hana Ali');
    expect(c.rows()[0].productOwnerName).toBe('Omar');
  });

  it("falls back to the client filter's list when the response has no clientName", () => {
    const c = make([{ id: 'P1', name: 'Villa', clientId: 'C2' }]);
    expect(c.rows()[0].clientName).toBe('Nour Saleh');
  });

  it('has no Budget column (ProjectResponse carries no budget)', () => {
    const c = make([]);
    expect(c.columns().map((col) => col.header)).not.toContain('Budget');
  });
});
