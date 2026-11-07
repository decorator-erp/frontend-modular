import { describe, expect, it } from 'vitest';
import {
  DEFINITION_TABS,
  SITE_TABS,
  definitionsQuery,
  parseDefinitionTab,
  parseSiteTab,
  siteLink,
  siteQuery,
} from './site-url';

describe('site-url (sites S-1)', () => {
  it.each(SITE_TABS.map((t) => [t]))('round-trips the %s tab', (tab) => {
    expect(parseSiteTab(siteQuery(tab, 'M1')['tab'])).toBe(tab);
  });

  it('keeps m only on the capture tab', () => {
    expect(siteQuery('capture', 'M1')).toEqual({ tab: 'capture', m: 'M1' });
    expect(siteQuery('overview', 'M1')).toEqual({ tab: 'overview' });
    expect(siteQuery('capture')).toEqual({ tab: 'capture' });
  });

  it.each([null, undefined, '', 'nope', 'OVERVIEW'])('falls back to overview on %j', (raw) => {
    expect(parseSiteTab(raw)).toBe('overview');
  });

  it('builds a router link', () => {
    expect(siteLink('S1', 'capture', 'M2')).toEqual([
      ['/sites', 'S1'],
      { tab: 'capture', m: 'M2' },
    ]);
    expect(siteLink('S1')).toEqual([['/sites', 'S1'], { tab: 'overview' }]);
  });

  it.each(DEFINITION_TABS.map((t) => [t]))('round-trips the %s definitions tab', (tab) => {
    expect(parseDefinitionTab(definitionsQuery(tab)['tab'])).toBe(tab);
  });

  it('falls back to modules on an unknown definitions tab', () => {
    expect(parseDefinitionTab('x')).toBe('modules');
    expect(parseDefinitionTab(null)).toBe('modules');
  });
});
