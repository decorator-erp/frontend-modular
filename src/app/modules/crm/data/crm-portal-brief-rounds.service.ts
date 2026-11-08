import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type { BriefRound } from '../model';

/**
 * Sync F4d: the client's own brief rounds — `GET /api/crm/portal/briefs/{briefId}/rounds` →
 * `CrmBriefRoundResponse[]` (dms CrmPortalEndpoints.cs:43, `crm.briefs.view_own`). 403/404 are the
 * caller's (the brief tab still shows the head without them). Apart from the eager `CrmBriefService`.
 */
@Injectable({ providedIn: 'root' })
export class CrmPortalBriefRoundsService extends ApiService {
  listMyRounds(briefId: string): Observable<BriefRound[]> {
    return this.get<unknown>(`/crm/portal/briefs/${briefId}/rounds`, undefined, {
      context: handled(403, 404),
    }).pipe(
      map((r) =>
        this.unwrapArray<unknown>(r).map((x) => ({
          round: this.field<number>(x, 'round') ?? 0,
          sentAtUtc: this.field<string>(x, 'sentAtUtc') ?? '',
          outcome: this.field<number>(x, 'outcome') ?? 0,
          decidedAtUtc: this.field<string | null>(x, 'decidedAtUtc') ?? null,
        })),
      ),
    );
  }
}
