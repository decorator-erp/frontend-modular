import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommandItem, CommandPaletteService, CommandSource, fuzzyMatch } from '@ds';
// TODO(008): shared/api/project-search.service.ts moves to modules/projects/data/
// at spec 008 — ProjectsCommandSource below is commented out until then.
// import { ProjectSearchService, ProjectWithCode } from '@modules/projects';

/**
 * Static verb-indexed actions registered against the command palette.
 *
 * Per VISION principle 4: every menu action also lives in ⌘K, indexed by verb.
 * Add new entries here when a new global action ships.
 */
@Injectable({ providedIn: 'root' })
export class GlobalActionsSource implements CommandSource, OnDestroy {
  readonly id = 'global-actions';
  readonly label = 'Actions';

  private readonly router = inject(Router);
  private readonly palette = inject(CommandPaletteService);

  private readonly items: CommandItem[] = [
    {
      id: 'a:new-project',
      label: 'New project',
      icon: 'plus',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/projects/new'),
    },
    {
      id: 'a:open-approvals',
      label: 'Open approvals queue',
      icon: 'check-circle',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/dashboard'),
    },
    {
      id: 'a:open-dashboard',
      label: 'Open dashboard',
      icon: 'home',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/dashboard'),
    },
    {
      id: 'a:open-projects',
      label: 'Browse projects',
      icon: 'briefcase',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/projects'),
    },
    {
      id: 'a:open-finance',
      label: 'Open finance studio',
      icon: 'briefcase',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/finance'),
    },
    {
      id: 'a:cost-categories',
      label: 'Manage cost categories',
      icon: 'folder',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/finance/cost-categories'),
    },
    {
      id: 'a:open-employees',
      label: 'Browse employees',
      icon: 'users',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/employees'),
    },
    {
      id: 'a:open-clients',
      label: 'Browse clients',
      icon: 'user',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/clients'),
    },
    {
      id: 'a:open-audit',
      label: 'Open audit log',
      icon: 'file-text',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/audit'),
    },
    {
      id: 'a:open-profile',
      label: 'My profile',
      icon: 'user',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/profile'),
    },
  ];

  constructor() {
    this.palette.register(this);
  }

  ngOnDestroy(): void {
    this.palette.unregister(this.id);
  }

  search(query: string): CommandItem[] {
    return this.items.filter((i) => fuzzyMatch(i.label, query));
  }
}

/**
 * Project entity source. Loads a recency window of projects on first use and
 * fuzzy-matches by name / code client-side.
 *
 * Per VISION principle 4: "⌘K p al maha opens the project". The cache fills on
 * palette open so first-keystroke search is instant.
 */
// TODO(008): ProjectSearchService lands in modules/projects/data/ at spec 008.
// Restore this class (and the import above) then, and re-wire the
// `projectsSource` inject in app-shell.component.ts.
//
// @Injectable({ providedIn: 'root' })
// export class ProjectsCommandSource implements CommandSource, OnDestroy {
//   readonly id = 'projects';
//   readonly label = 'Projects';
//
//   private readonly router = inject(Router);
//   private readonly palette = inject(CommandPaletteService);
//   private readonly api = inject(ProjectSearchService);
//
//   private cache: ProjectWithCode[] = [];
//   private lastLoadedAt = 0;
//   private readonly TTL_MS = 60_000;
//
//   constructor() {
//     this.palette.register(this);
//     this.refreshIfStale();
//   }
//
//   ngOnDestroy(): void {
//     this.palette.unregister(this.id);
//   }
//
//   search(query: string): CommandItem[] {
//     this.refreshIfStale();
//     return this.cache
//       .filter((p) => fuzzyMatch(`${p.code} ${p.name}`, query))
//       .slice(0, 8)
//       .map<CommandItem>((p) => ({
//         id: 'p:' + p.id,
//         label: p.name,
//         icon: 'briefcase',
//         hint: p.code || p.id.slice(0, 6).toUpperCase(),
//         run: () => void this.router.navigate(['/projects', p.id]),
//       }));
//   }
//
//   private refreshIfStale(): void {
//     const now = Date.now();
//     if (now - this.lastLoadedAt < this.TTL_MS && this.cache.length) return;
//     this.lastLoadedAt = now;
//     this.api.search({ pageSize: 50, sortBy: 'updatedAt', sortDir: 'desc' }).subscribe({
//       next: (result) => (this.cache = result.items),
//       error: () => {},
//     });
//   }
// }
