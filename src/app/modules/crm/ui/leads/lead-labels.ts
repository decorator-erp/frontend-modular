import type { CatalogKey } from '@platform/i18n/catalog/en';
import { LeadSource, LeadStatus } from '../../model/crm-enums';
import type { StatusBadgeTone } from '@ds';

/** Lead status → localized label + chip tone (single definition, reused by list + detail). */
export const LEAD_STATUS_KEYS: Record<LeadStatus, CatalogKey> = {
  [LeadStatus.New]: 'lead.statusNew',
  [LeadStatus.Contacted]: 'lead.statusContacted',
  [LeadStatus.Qualified]: 'lead.statusQualified',
  [LeadStatus.Unqualified]: 'lead.statusUnqualified',
  [LeadStatus.Converted]: 'lead.statusConverted',
};

export const LEAD_STATUS_TONE: Record<LeadStatus, StatusBadgeTone> = {
  [LeadStatus.New]: 'info',
  [LeadStatus.Contacted]: 'pending',
  [LeadStatus.Qualified]: 'success',
  [LeadStatus.Unqualified]: 'neutral',
  [LeadStatus.Converted]: 'success',
};

export const LEAD_SOURCE_KEYS: Record<LeadSource, CatalogKey> = {
  [LeadSource.Website]: 'lead.sourceWebsite',
  [LeadSource.Referral]: 'lead.sourceReferral',
  [LeadSource.SocialMedia]: 'lead.sourceSocialMedia',
  [LeadSource.Phone]: 'lead.sourcePhone',
  [LeadSource.Event]: 'lead.sourceEvent',
  [LeadSource.Other]: 'common.other',
};
