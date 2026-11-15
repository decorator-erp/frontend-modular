import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommandItem, CommandPaletteService, CommandSource, fuzzyMatch } from '@ds';
import { ProjectSearchService, ProjectWithCode } from '@modules/projects';
import { PERM, PermissionsService } from '@platform/permissions';

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

  private readonly permissions = inject(PermissionsService);

  /** UI-1: an entry with a `permission` is offered only to a caller who holds it. */
  private readonly items: (CommandItem & { permission?: string })[] = [
    {
      id: 'a:new-project',
      permission: PERM.projects.create,
      label: 'New project',
      icon: 'plus',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/projects/new'),
    },
    {
      id: 'a:open-approvals',
      permission: PERM.approvals.read,
      label: 'Open approvals queue',
      icon: 'check-circle',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/approvals'),
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
      permission: PERM.projects.read,
      label: 'Browse projects',
      icon: 'briefcase',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/projects'),
    },
    {
      id: 'a:open-finance',
      permission: PERM.finance.read,
      label: 'Open finance studio',
      icon: 'briefcase',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/finance'),
    },
    {
      id: 'a:cost-categories',
      permission: PERM.finance.read,
      label: 'Manage cost categories',
      icon: 'folder',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/finance/cost-categories'),
    },
    {
      id: 'a:open-employees',
      permission: PERM.employees.read,
      label: 'Browse employees',
      icon: 'users',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/employees'),
    },
    {
      id: 'a:open-clients',
      permission: PERM.clients.read,
      label: 'Browse clients',
      icon: 'user',
      hint: 'go',
      run: () => void this.router.navigateByUrl('/clients'),
    },
    {
      id: 'a:open-audit',
      permission: PERM.audit.read,
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
    return this.items
      .filter((i) => !i.permission || this.permissions.can(i.permission))
      .filter((i) => fuzzyMatch(i.label, query));
  }
}

/**
 * Project entity source. Loads a recency window of projects on first use and
 * fuzzy-matches by name / code client-side.
 *
 * Per VISION principle 4: "⌘K p al maha opens the project". The cache fills on
 * palette open so first-keystroke search is instant.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsCommandSource implements CommandSource, OnDestroy {
  readonly id = 'projects';
  readonly label = 'Projects';

  private readonly router = inject(Router);
  private readonly palette = inject(CommandPaletteService);
  private readonly api = inject(ProjectSearchService);
  private readonly permissions = inject(PermissionsService);

  private cache: ProjectWithCode[] = [];
  private lastLoadedAt = 0;
  private readonly TTL_MS = 60_000;

  constructor() {
    this.palette.register(this);
    this.refreshIfStale();
  }

  ngOnDestroy(): void {
    this.palette.unregister(this.id);
  }

  search(query: string): CommandItem[] {
    // UI-1: GET /api/projects needs `project.read` — no search, and no 403 toast, without it.
    if (!this.permissions.can(PERM.projects.read)) return [];
    this.refreshIfStale();
    return this.cache
      .filter((p) => fuzzyMatch(`${p.code} ${p.name}`, query))
      .slice(0, 8)
      .map<CommandItem>((p) => ({
        id: 'p:' + p.id,
        label: p.name,
        icon: 'briefcase',
        hint: p.code || p.id.slice(0, 6).toUpperCase(),
        run: () => void this.router.navigate(['/projects', p.id]),
      }));
  }

  private refreshIfStale(): void {
    if (!this.permissions.can(PERM.projects.read)) return;
    const now = Date.now();
    if (now - this.lastLoadedAt < this.TTL_MS && this.cache.length) return;
    this.lastLoadedAt = now;
    this.api.search({ pageSize: 50, sortBy: 'updatedAt', sortDir: 'desc' }).subscribe({
      next: (result) => (this.cache = result.items),
      error: () => {},
    });
  }
}
