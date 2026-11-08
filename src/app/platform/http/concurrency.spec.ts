import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONCURRENCY_CONFLICT_CODES,
  injectReloadOnConflict,
  isConcurrencyConflict,
  type ReloadOnConflict,
} from './concurrency';
import { ToastService } from '../feedback/toast.service';
import { LocaleService } from '../i18n/locale.service';
import { EN } from '../i18n/catalog/en';
import { AR } from '../i18n/catalog/ar';
import type { ParsedApiError } from '../types/api-error';

const parsed = (status: number, code: string | null): ParsedApiError => ({
  status,
  generalMessage: 'detail',
  fieldErrors: {},
  code,
  raw: null,
});

/** CRM-API-CONTRACT §1.4: the 409s that mean "reload, then retry". */
const CONTRACT_CODES = [
  'crm.leads.ConcurrentUpdate',
  'crm.clients.ConcurrentUpdate',
  'crm.periods.ConcurrentUpdate',
  'crm.items.ConcurrentUpdate',
  'crm.meetings.ConcurrentUpdate',
  'crm.briefs.ConcurrencyConflict',
  'crm.briefs.ConcurrentSend',
  'crm.contacts.ConcurrentPrimaryChange',
  'projects.scope.ConcurrentUpdate',
  // crmp A-4: added to §1.4 by crm-complete (#112/#113, #123/#124) and the sites-projects fixes (P9, S3).
  'crm.storefront.ConcurrentUpdate',
  'projects.members.ConcurrentUpdate',
  'projects.ConcurrentUpdate',
  'sites.ConcurrencyConflict',
];

describe('isConcurrencyConflict (009b X-3)', () => {
  it.each(CONTRACT_CODES)('is true for 409 %s', (code) => {
    expect(isConcurrencyConflict(parsed(409, code))).toBe(true);
  });

  it('holds exactly the contract §1.4 set', () => {
    expect([...CONCURRENCY_CONFLICT_CODES].sort()).toEqual([...CONTRACT_CODES].sort());
  });

  it('is false for another 409, the same code on another status, or nothing', () => {
    expect(isConcurrencyConflict(parsed(409, 'crm.periods.AlreadyOpen'))).toBe(false);
    expect(isConcurrencyConflict(parsed(400, 'crm.items.ConcurrentUpdate'))).toBe(false);
    expect(isConcurrencyConflict(parsed(409, null))).toBe(false);
    expect(isConcurrencyConflict(null)).toBe(false);
  });
});

describe('injectReloadOnConflict (009b X-3)', () => {
  let reloadOnConflict: ReloadOnConflict;
  let toast: ToastService;
  let locale: LocaleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toast = TestBed.inject(ToastService);
    locale = TestBed.inject(LocaleService);
    reloadOnConflict = runInInjectionContext(TestBed.inject(Injector), injectReloadOnConflict);
  });

  afterEach(() => locale.locale.set('en'));

  it('reloads and says so on a concurrency 409', () => {
    const reload = vi.fn();
    expect(reloadOnConflict(parsed(409, 'crm.items.ConcurrentUpdate'), reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(toast.items().map((t) => t.message)).toEqual([EN['common.changedReloaded']]);
  });

  it('reads a raw HttpErrorResponse too', () => {
    const reload = vi.fn();
    const error = new HttpErrorResponse({
      status: 409,
      error: { errors: { 'crm.briefs.ConcurrencyConflict': ['changed'] } },
    });
    expect(reloadOnConflict(error, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('says it in Arabic under the Arabic locale', () => {
    locale.locale.set('ar');
    reloadOnConflict(parsed(409, 'crm.meetings.ConcurrentUpdate'), () => undefined);
    expect(toast.items().map((t) => t.message)).toEqual([AR['common.changedReloaded']]);
  });

  it('leaves any other error alone', () => {
    const reload = vi.fn();
    expect(reloadOnConflict(parsed(409, 'crm.periods.AlreadyOpen'), reload)).toBe(false);
    expect(reloadOnConflict(new Error('boom'), reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(toast.items()).toEqual([]);
  });
});
