import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { catchError, of } from 'rxjs';
import { StageTeamsService } from '../../../data/stage-teams.service';
import { AvatarStackPerson, PeraAvatarStackComponent } from '@ds';
import { CODE_C, PNL, PNL_B, PNL_H, PNL_H_C, PNL_H_T } from './dms-stage-chrome';

interface TeamMember {
  id: string;
  name: string;
  alt: boolean;
}

/**
 * "Team on stage" card — the right-rail panel from the DMS Stage Detail design.
 * Loads the stage's teams and flattens their members into a single overlapping
 * stack with a "+N more" overflow. Mounted for any project reader
 * (`Projects.Read`).
 *
 * **Batch 4b**: the hand-rolled `.wstack` overlap is now `pera-avatar-stack`, and
 * the panel chrome comes from `dms-stage-chrome` rather than the parent page's
 * unencapsulated CSS.
 */
@Component({
  selector: 'app-dms-stage-team',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraAvatarStackComponent],
  template: `
    <div [class]="PNL">
      <div [class]="PNL_H">
        <div [class]="PNL_H_T">
          Team on stage <span [class]="PNL_H_C">{{ members().length }}</span>
        </div>
      </div>
      <div [class]="PNL_B" class="flex items-center justify-between gap-2.5">
        @if (members().length) {
          <pera-avatar-stack [people]="people()" [max]="6" />
          @if (overflow() > 0) {
            <span [class]="CODE_C">+{{ overflow() }} more</span>
          }
        } @else {
          <p class="m-0 fs-caption text-text-muted">No team assigned to this stage yet.</p>
        }
      </div>
    </div>
  `,
})
export class DmsStageTeamComponent implements OnInit {
  readonly projectId = input.required<string>();
  readonly stageId = input.required<string>();

  private readonly teamsApi = inject(StageTeamsService);
  protected readonly members = signal<TeamMember[]>([]);

  protected readonly PNL = PNL;
  protected readonly PNL_H = PNL_H;
  protected readonly PNL_H_T = PNL_H_T;
  protected readonly PNL_H_C = PNL_H_C;
  protected readonly PNL_B = PNL_B;
  protected readonly CODE_C = CODE_C;

  /** Only the visible six: the stack must not draw its own `+N` chip — the
   *  panel's "+N more" label at the right end carries the overflow. */
  protected readonly people = computed<AvatarStackPerson[]>(() =>
    this.members()
      .slice(0, 6)
      .map((m) => ({ name: m.name })),
  );
  protected readonly overflow = computed(() => Math.max(0, this.members().length - 6));

  ngOnInit(): void {
    this.teamsApi
      .getByProjectStage(this.projectId(), this.stageId())
      .pipe(catchError(() => of([])))
      .subscribe((teams) => {
        const seen = new Set<string>();
        const flat: TeamMember[] = [];
        let i = 0;
        for (const team of teams) {
          for (const m of team.members) {
            if (seen.has(m.employeeId)) continue;
            seen.add(m.employeeId);
            flat.push({ id: m.id, name: m.employeeName, alt: i % 2 === 1 });
            i++;
          }
        }
        this.members.set(flat);
      });
  }
}
