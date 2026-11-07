import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ClientService } from '@modules/clients';
import { ProjectSearchService } from '../../data/project-search.service';
import { ProjectsListComponent } from './projects-list.component';

/** crmp P-10: the list filters by client, search and mine — the backend's only filters (ProjectEndpoints.cs:26). */
describe('ProjectsListComponent — filters (crmp P-10)', () => {
  function make() {
    const search = vi.fn(() =>
      of({ items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 }),
    );
    TestBed.configureTestingModule({
      imports: [ProjectsListComponent],
      providers: [
        provideRouter([]),
        { provide: ProjectSearchService, useValue: { search } },
        { provide: ClientService, useValue: { getAll: () => of([]) } },
      ],
    });
    const c = TestBed.createComponent(ProjectsListComponent).componentInstance;
    c.ngOnInit();
    return { c, search };
  }

  it('offers only the client and "mine" facets (no status/type/sort the backend ignores)', () => {
    const { c } = make();
    expect(c.facets().map((f) => f.key)).toEqual(['clientId', 'mine']);
  });

  it('sends clientId and mine from the facets', () => {
    const { c, search } = make();
    c.onFilters({ search: '', facets: { clientId: ['C1'], mine: ['mine'] } });
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientId: 'C1', mine: true, page: 1 }),
    );
  });
});
