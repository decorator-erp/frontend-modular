import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ClientService } from '@modules/clients';
import {
  ProjectService,
  ScopeOfWorkService,
  ScopeOfWorkStatus,
  type ScopeOfWorkItem,
} from '@modules/projects';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CrmLeadService } from '../data/crm-lead.service';
import { CrmSiteSurveyService } from '../data/crm-site-survey.service';
import type { IssuedLogin } from '@shared/ui/login-credentials.component';
import {
  CONVERT_STEPS,
  type ConvertPlan,
  type ConvertProgress,
  type ConvertStep,
} from '../model/lead-convert.model';

export type ConvertStepState = 'pending' | 'running' | 'done' | 'failed';

const STORAGE_PREFIX = 'pera.leadConvert.';

const allPending = (): Record<ConvertStep, ConvertStepState> =>
  Object.fromEntries(CONVERT_STEPS.map((s) => [s, 'pending'])) as Record<
    ConvertStep,
    ConvertStepState
  >;

/**
 * LC-1: runs a lead conversion as the existing routes, in order — client, project, scope of work
 * (synced, then confirmed), site survey, and the lead last — and stops at the first failure.
 *
 * Each created id is saved (`sessionStorage`, `pera.leadConvert.{leadId}`) the moment it exists, so a
 * retry skips what is already on the server: nothing is created twice. The scope step always starts from
 * the server's scope (`GET`), adding, removing, re-pricing and re-ordering items to match the wizard, so
 * a retry after a partial scope write lands on the same result. The lead is converted last, so a run that
 * stops halfway leaves it open in the leads list.
 */
@Injectable()
export class LeadConvertRunner {
  private readonly clients = inject(ClientService);
  private readonly projects = inject(ProjectService);
  private readonly scopes = inject(ScopeOfWorkService);
  private readonly sites = inject(CrmSiteSurveyService);
  private readonly leads = inject(CrmLeadService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);

  readonly steps = signal<Record<ConvertStep, ConvertStepState>>(allPending());
  readonly running = signal(false);
  readonly failedStep = signal<ConvertStep | null>(null);
  /** The failed step's message, localized. */
  readonly error = signal<string | null>(null);
  /**
   * LC-2: the portal login this runner created for a new client — email and temporary password —
   * so the wizard can show it once. In memory only: never written to storage.
   */
  readonly issuedLogin = signal<IssuedLogin | null>(null);

  /** What a previous run already created for this lead (empty when nothing, or storage is unavailable). */
  progressOf(leadId: string): ConvertProgress {
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + leadId);
      return raw ? (JSON.parse(raw) as ConvertProgress) : {};
    } catch {
      return {};
    }
  }

  /** Runs (or resumes) the conversion. Resolves to the project id when every step is done, else null. */
  async run(plan: ConvertPlan): Promise<string | null> {
    if (this.running()) return null;
    this.running.set(true);
    this.failedStep.set(null);
    this.error.set(null);
    const progress = this.progressOf(plan.leadId);
    this.steps.set(this.stepsFrom(progress));

    const run: Record<ConvertStep, () => Promise<void>> = {
      client: async () => {
        if (progress.clientId) return;
        if (plan.client.mode === 'existing') {
          progress.clientId = plan.client.clientId;
          return;
        }
        progress.clientId = await firstValueFrom(this.clients.create(plan.client.request));
        this.issuedLogin.set({
          email: plan.client.request.email,
          password: plan.client.request.password,
        });
      },
      project: async () => {
        if (progress.projectId) return;
        progress.projectId = await firstValueFrom(
          this.projects.create({
            code: plan.project.code,
            name: plan.project.name,
            address: plan.project.address,
            clientId: progress.clientId!,
            workflowType: 'Stage',
            description: plan.project.description,
            estimatedStartDate: plan.project.estimatedStartDate,
          }),
        );
      },
      scope: async () => {
        if (progress.scopeConfirmed) return;
        await this.syncAndConfirmScope(progress.projectId!, plan.scope);
        progress.scopeConfirmed = true;
      },
      site: async () => {
        if (progress.siteId) return;
        progress.siteId = await firstValueFrom(
          this.sites.createDraft(progress.projectId!, plan.site),
        );
      },
      lead: async () => {
        if (progress.converted) return;
        await firstValueFrom(
          this.leads.convert(plan.leadId, { existingClientId: progress.clientId! }),
        );
        progress.converted = true;
      },
    };

    try {
      for (const step of CONVERT_STEPS) {
        this.setStep(step, 'running');
        try {
          await run[step]();
        } catch (err) {
          this.setStep(step, 'failed');
          this.failedStep.set(step);
          this.error.set(this.messageOf(err));
          return null;
        } finally {
          this.save(plan.leadId, progress);
        }
        this.setStep(step, 'done');
      }
      this.clear(plan.leadId);
      return progress.projectId ?? null;
    } finally {
      this.running.set(false);
    }
  }

  /**
   * Makes the server's draft match the wizard, then confirms. From the server's own state every time, so
   * a retry after any partial write converges: items the wizard dropped are removed, missing ones added,
   * names, descriptions and fees the server holds differently are rewritten, and the order is set last.
   */
  private async syncAndConfirmScope(projectId: string, scope: ConvertPlan['scope']): Promise<void> {
    const current = await firstValueFrom(this.scopes.getScope(projectId));
    if (current.status === ScopeOfWorkStatus.Confirmed) return;

    await firstValueFrom(this.scopes.updateHeader(projectId, scope.header));

    const wanted = new Set(scope.items.map((i) => i.sourceStageId));
    const kept: ScopeOfWorkItem[] = [];
    for (const item of [...current.items].sort((a, b) => a.order - b.order)) {
      if (wanted.has(item.sourceStageId)) kept.push(item);
      else await firstValueFrom(this.scopes.removeItem(projectId, item.id));
    }

    const missing = scope.items
      .map((i) => i.sourceStageId)
      .filter((id) => !kept.some((k) => k.sourceStageId === id));
    const added = missing.length
      ? await firstValueFrom(this.scopes.addItems(projectId, missing))
      : [];
    const onServer = [...kept, ...added];
    const bySource = new Map(onServer.map((i) => [i.sourceStageId, i]));

    for (const item of scope.items) {
      const server = bySource.get(item.sourceStageId);
      if (!server) continue;
      if (
        server.name !== item.name ||
        (server.description ?? null) !== (item.description ?? null) ||
        server.fee !== item.fee
      ) {
        await firstValueFrom(
          this.scopes.updateItem(projectId, server.id, {
            name: item.name,
            description: item.description,
            fee: item.fee,
          }),
        );
      }
    }

    const desired = scope.items
      .map((i) => bySource.get(i.sourceStageId)?.id)
      .filter((id): id is string => !!id);
    const actual = onServer.map((i) => i.id);
    if (desired.join() !== actual.join()) {
      await firstValueFrom(this.scopes.reorder(projectId, desired));
    }

    await firstValueFrom(this.scopes.confirm(projectId));
  }

  private stepsFrom(progress: ConvertProgress): Record<ConvertStep, ConvertStepState> {
    const done: Record<ConvertStep, boolean> = {
      client: !!progress.clientId,
      project: !!progress.projectId,
      scope: !!progress.scopeConfirmed,
      site: !!progress.siteId,
      lead: !!progress.converted,
    };
    return Object.fromEntries(
      CONVERT_STEPS.map((s) => [s, done[s] ? 'done' : 'pending']),
    ) as Record<ConvertStep, ConvertStepState>;
  }

  private setStep(step: ConvertStep, state: ConvertStepState): void {
    this.steps.update((s) =>
      s[step] === 'done' && state === 'running' ? s : { ...s, [step]: state },
    );
  }

  private messageOf(err: unknown): string {
    if (err instanceof HttpErrorResponse) return friendly(this.errors.parse(err));
    return this.catalog.t('convert.failGeneric');
  }

  private save(leadId: string, progress: ConvertProgress): void {
    try {
      sessionStorage.setItem(STORAGE_PREFIX + leadId, JSON.stringify(progress));
    } catch {
      // No storage (a private window, blocked site data): the run still works, it just can't resume after a reload.
    }
  }

  private clear(leadId: string): void {
    try {
      sessionStorage.removeItem(STORAGE_PREFIX + leadId);
    } catch {
      // As above.
    }
  }
}
