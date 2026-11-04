import type { CatalogKey } from '@platform/i18n/catalog/en';
import { MeetingStatus, MeetingType } from '../../model/crm-enums';
import type { StatusBadgeTone } from '@ds';

/** One mapping, reused by the agenda, the client scheduler, and B5's meetings card. */
export const MEETING_TYPE_KEYS: Record<MeetingType, CatalogKey> = {
  [MeetingType.InOffice]: 'sched.inOffice',
  [MeetingType.OnSite]: 'sched.onSite',
  [MeetingType.Online]: 'sched.online',
};

export const MEETING_STATUS_CHIP: Record<
  MeetingStatus,
  { tone: StatusBadgeTone; key: CatalogKey }
> = {
  [MeetingStatus.Requested]: { tone: 'pending', key: 'sched.requested' },
  [MeetingStatus.Scheduled]: { tone: 'success', key: 'sched.scheduled' },
  [MeetingStatus.Rescheduled]: { tone: 'warning', key: 'sched.reschedule' },
  [MeetingStatus.Completed]: { tone: 'neutral', key: 'ws.completed' },
  [MeetingStatus.Canceled]: { tone: 'neutral', key: 'sched.cancel' },
  [MeetingStatus.NoShow]: { tone: 'error', key: 'sched.noShow' },
};
