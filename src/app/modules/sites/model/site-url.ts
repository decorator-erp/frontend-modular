/**
 * sites S-1: the URL state of the survey and definitions pages (spec §6). Tabs live in `?tab=`; the
 * capture tab's module in `&m=`. Unknown values fall back to `overview` / `modules`.
 */
export const SITE_TABS = ['overview', 'capture', 'spaces', 'families', 'boq', 'documents'] as const;
export type SiteTab = (typeof SITE_TABS)[number];

export const DEFINITION_TABS = ['modules', 'items'] as const;
export type DefinitionTab = (typeof DEFINITION_TABS)[number];

export function parseSiteTab(raw: string | null | undefined): SiteTab {
  return (SITE_TABS as readonly string[]).includes(raw ?? '') ? (raw as SiteTab) : 'overview';
}

export function parseDefinitionTab(raw: string | null | undefined): DefinitionTab {
  return (DEFINITION_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as DefinitionTab)
    : 'modules';
}

/** Query params of `/sites/:siteId`: `m` only on the capture tab. */
export function siteQuery(tab: SiteTab, moduleId?: string | null): Record<string, string> {
  return tab === 'capture' && moduleId ? { tab, m: moduleId } : { tab };
}

/** `[commands, queryParams]` for a router link to a survey tab. */
export function siteLink(
  siteId: string,
  tab: SiteTab = 'overview',
  moduleId?: string | null,
): [string[], Record<string, string>] {
  return [['/sites', siteId], siteQuery(tab, moduleId)];
}

export function definitionsQuery(tab: DefinitionTab): Record<string, string> {
  return { tab };
}
