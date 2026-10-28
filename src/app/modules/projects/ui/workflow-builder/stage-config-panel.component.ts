import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectStage, StageKind } from '../../model/project.model';
import { PeraRadioComponent, RadioOption } from '@ds';

const KIND_OPTIONS: RadioOption[] = [
  { value: 'Task', label: 'Task', description: 'Work owned by a person' },
  { value: 'Gate', label: 'Gate', description: 'Blocks downstream until passed' },
  { value: 'Approval', label: 'Approval', description: 'Sign-off by named approvers' },
  { value: 'Milestone', label: 'Milestone', description: 'Marker — no duration' },
];

/** Translates prototype .wb-cfg — right rail with stage configuration form. */
@Component({
  selector: 'app-stage-config-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PeraRadioComponent],
  host: { class: 'block border-s border-border bg-surface overflow-y-auto w-[312px]' },
  template: `
    @if (stage(); as s) {
      <div class="p-4 border-b border-border">
        <div class="font-mono fs-micro text-text-muted flex items-center gap-2 uppercase">
          @switch (kindOf(s)) {
            @case ('Gate') {
              <span
                class="w-2.5 h-2.5 rotate-45 border-[length:var(--hairline-strong)] border-accent"
              ></span>
            }
            @case ('Milestone') {
              <span class="w-2.5 h-2.5 rotate-45 bg-accent"></span>
            }
            @case ('Approval') {
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
              >
                <path d="M5 12l4 4L19 6" />
              </svg>
            }
            @default {
              <span class="w-2.5 h-2.5 border-[length:var(--hairline-strong)] border-accent"></span>
            }
          }
          {{ kindOf(s) }} · Stage configuration
        </div>
        <h3 class="fs-body font-semibold mt-2">{{ s.name }}</h3>
      </div>
      <div class="p-4 flex flex-col gap-4">
        <label class="block">
          <div class="font-mono fs-micro text-text-muted mb-1.5 uppercase">Stage name</div>
          <input
            type="text"
            class="w-full border border-border bg-bg px-2.5 py-1.5 fs-caption text-text-primary outline-none focus:border-accent"
            [ngModel]="nameDraft()"
            (ngModelChange)="nameDraft.set($event)"
          />
        </label>
        <label class="block">
          <div class="font-mono fs-micro text-text-muted mb-1.5 uppercase">Stage name (Arabic)</div>
          <input
            type="text"
            dir="rtl"
            class="w-full border border-border bg-bg px-2.5 py-1.5 fs-caption text-text-primary outline-none focus:border-accent"
            [ngModel]="nameArDraft()"
            (ngModelChange)="nameArDraft.set($event)"
          />
        </label>
        <div>
          <div class="font-mono fs-micro text-text-muted mb-1.5 uppercase">Kind</div>
          <pera-radio
            [options]="kindOptions"
            [ngModel]="kindOf(s)"
            (ngModelChange)="changeKind.emit({ id: s.id, kind: $event })"
          />
          <p class="m-0 mt-2 font-mono fs-micro text-text-muted">
            Local hint — backend stages have no kind field yet.
          </p>
        </div>
        <div>
          <div class="font-mono fs-micro text-text-muted mb-1.5 uppercase">Status</div>
          <div class="font-mono fs-label text-text-secondary">{{ s.status.toUpperCase() }}</div>
        </div>
        <div>
          <div class="font-mono fs-micro text-text-muted mb-1.5 uppercase">Dependencies</div>
          @if (dependencies().length === 0) {
            <div class="fs-label text-text-muted">No dependencies.</div>
          } @else {
            @for (d of dependencies(); track d.id) {
              <div
                class="flex items-center gap-2 fs-label py-1.5 border-b border-border last:border-b-0"
              >
                <span>{{ d.name }}</span>
                <span class="ms-auto font-mono fs-micro text-text-muted uppercase">precedes</span>
              </div>
            }
          }
        </div>

        <div class="flex items-center gap-2 pt-2 border-t border-border">
          <button
            type="button"
            class="flex-1 px-3 py-1.5 border border-accent bg-accent text-text-on-accent fs-label font-medium cursor-pointer hover:bg-accent-hover"
            [disabled]="!dirty()"
            [class.opacity-40]="!dirty()"
            [class.cursor-not-allowed]="!dirty()"
            (click)="commit(s)"
          >
            Save
          </button>
          <button
            type="button"
            class="px-3 py-1.5 border border-danger bg-bg text-danger fs-label cursor-pointer hover:bg-danger-soft"
            (click)="deleteStage.emit({ id: s.id })"
          >
            Delete
          </button>
        </div>
      </div>
    } @else {
      <div class="p-6 text-center text-sm text-text-muted">
        Select a stage on the canvas to configure it.
      </div>
    }
  `,
})
export class StageConfigPanelComponent {
  readonly stage = input<ProjectStage | null>(null);
  readonly allStages = input<ProjectStage[]>([]);

  readonly save = output<{ id: string; name: string; nameAr: string }>();
  readonly changeKind = output<{ id: string; kind: StageKind }>();
  readonly deleteStage = output<{ id: string }>();

  readonly kindOptions = KIND_OPTIONS;
  readonly nameDraft = signal('');
  readonly nameArDraft = signal('');

  readonly dirty = computed(() => {
    const s = this.stage();
    if (!s) return false;
    return this.nameDraft() !== s.name || this.nameArDraft() !== (s.nameAr ?? '');
  });

  readonly dependencies = computed(() => {
    const s = this.stage();
    if (!s) return [];
    return this.allStages().filter((x) => x.order < s.order);
  });

  constructor() {
    // Re-seed drafts whenever the selected stage changes.
    effect(
      () => {
        const s = this.stage();
        if (!s) return;
        this.nameDraft.set(s.name);
        this.nameArDraft.set(s.nameAr ?? '');
      },
      { allowSignalWrites: true },
    );
  }

  kindOf(s: ProjectStage): StageKind {
    return s.kind ?? 'Task';
  }

  commit(s: ProjectStage): void {
    this.save.emit({
      id: s.id,
      name: this.nameDraft().trim() || s.name,
      nameAr: this.nameArDraft().trim(),
    });
  }
}
