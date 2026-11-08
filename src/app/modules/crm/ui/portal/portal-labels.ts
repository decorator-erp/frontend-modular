import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { BadgeTone } from '@ds';
import type { PortalSectionKey, PortalShare, PortalShareKind } from '../../model/portal.model';

/** crmp P2-B: catalog keys and badge tones of the portal share kinds and sections. */

const KIND_KEYS: Readonly<Record<PortalShareKind, CatalogKey>> = {
  1: 'pportal.kind.1',
  2: 'pportal.kind.2',
  3: 'pportal.kind.3',
  4: 'pportal.kind.4',
  5: 'pportal.kind.5',
};

const KIND_TONES: Readonly<Record<PortalShareKind, BadgeTone>> = {
  1: 'neutral',
  2: 'accent',
  3: 'info',
  4: 'success',
  5: 'warning',
};

export function portalKindKey(kind: PortalShareKind): CatalogKey {
  return KIND_KEYS[kind];
}

export function portalKindTone(kind: PortalShareKind): BadgeTone {
  return KIND_TONES[kind];
}

export const SECTION_LABEL_KEYS: Readonly<Record<PortalSectionKey, CatalogKey>> = {
  progress: 'pportal.section.progress',
  tasks: 'pportal.section.tasks',
  documents: 'pportal.section.documents',
  gallery: 'pportal.section.gallery',
  siteSurveys: 'pportal.section.siteSurveys',
  updates: 'pportal.section.updates',
};

export const SECTION_HINT_KEYS: Readonly<Record<PortalSectionKey, CatalogKey>> = {
  progress: 'pportal.hint.progress',
  tasks: 'pportal.hint.tasks',
  documents: 'pportal.hint.documents',
  gallery: 'pportal.hint.gallery',
  siteSurveys: 'pportal.hint.siteSurveys',
  updates: 'pportal.hint.updates',
};

/** What the office calls a share: the client title when set, else the item's own name. */
export function shareDisplayName(share: PortalShare): string {
  return share.clientTitle || share.itemName || '—';
}
