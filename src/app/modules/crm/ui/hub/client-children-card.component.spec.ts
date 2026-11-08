import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService, PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { CrmClientService } from '../../data/crm-client.service';
import { ClientHubStore } from '../../stores/client-hub.store';
import { CrmClientChildrenCardComponent } from './client-children-card.component';
import { CrmClientChildFormComponent } from './client-child-form.component';

/** Sync F4b: the client hub's household card. */
describe('CrmClientChildrenCardComponent (sync F4b)', () => {
  function make(granted: boolean, confirm = true) {
    const api = { removeChild: vi.fn().mockReturnValue(of(null)) };
    const store = {
      client: signal({
        id: 'C',
        children: [
          { id: 'k1', gender: 'F', age: 7 },
          { id: 'k2', gender: 'M', age: 12 },
        ],
      }),
      reloadClient: vi.fn(),
    };
    const opened: { component: unknown; data: unknown }[] = [];
    TestBed.configureTestingModule({
      imports: [CrmClientChildrenCardComponent],
      providers: [
        { provide: CrmClientService, useValue: api },
        { provide: ClientHubStore, useValue: store },
        { provide: PermissionsService, useValue: { can: () => granted } },
        { provide: ConfirmService, useValue: { open: async () => confirm } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        {
          provide: ModalService,
          useValue: {
            open: (component: unknown, cfg: { data: unknown }) => {
              opened.push({ component, data: cfg.data });
              return { afterClosed: async () => true };
            },
          },
        },
      ],
    });
    const f = TestBed.createComponent(CrmClientChildrenCardComponent);
    f.detectChanges();
    return { f, c: f.componentInstance, api, store, opened };
  }

  it('lists the children with gender and age', () => {
    const { f } = make(false);
    const rows = [...f.nativeElement.querySelectorAll('[data-child]')].map((r: Element) =>
      r.textContent?.trim(),
    );
    expect(rows[0]).toContain('Girl, 7 years');
    expect(rows[1]).toContain('Boy, 12 years');
  });

  it('hides add, edit and remove without clients.manage_children', () => {
    const el: HTMLElement = make(false).f.nativeElement;
    expect(el.querySelector('[data-add-child]')).toBeNull();
    expect(el.querySelector('[data-edit-child]')).toBeNull();
    expect(el.querySelector('[data-remove-child]')).toBeNull();
  });

  it('add and edit open the child form, then re-read the client', async () => {
    const { c, opened, store } = make(true);
    await c.add();
    await c.edit({ id: 'k1', gender: 'F', age: 7 });
    expect(opened.map((o) => o.component)).toEqual([
      CrmClientChildFormComponent,
      CrmClientChildFormComponent,
    ]);
    expect(opened[1].data).toEqual({ clientId: 'C', child: { id: 'k1', gender: 'F', age: 7 } });
    expect(store.reloadClient).toHaveBeenCalledTimes(2);
  });

  it('removes a child only after the confirm', async () => {
    const declined = make(true, false);
    await declined.c.remove({ id: 'k1', gender: 'F', age: 7 });
    expect(declined.api.removeChild).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const { c, api } = make(true, true);
    await c.remove({ id: 'k1', gender: 'F', age: 7 });
    expect(api.removeChild).toHaveBeenCalledWith('C', 'k1');
  });
});

describe('CrmClientChildFormComponent (sync F4b)', () => {
  function make(child?: { id: string; gender: string; age: number }, fail = false) {
    const api = {
      addChild: vi.fn().mockReturnValue(of('k9')),
      updateChild: vi.fn().mockReturnValue(
        fail
          ? throwError(
              () =>
                new HttpErrorResponse({
                  status: 400,
                  error: { status: 400, errors: { 'crm.client_children.InvalidAge': ['x'] } },
                }),
            )
          : of(null),
      ),
    };
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [CrmClientChildFormComponent],
      providers: [
        { provide: CrmClientService, useValue: api },
        { provide: PeraModalRef, useValue: { close } },
        { provide: PERA_MODAL_DATA, useValue: { clientId: 'C', child } },
      ],
    });
    const c = TestBed.createComponent(CrmClientChildFormComponent).componentInstance;
    return { c, api, close };
  }

  it('adds { gender, age }; an age over 120 sends nothing', () => {
    const { c, api, close } = make();
    c.gender.set('F');
    c.age.set('130');
    c.submit();
    expect(api.addChild).not.toHaveBeenCalled();
    expect(c.shown('age')).toBe('Enter an age from 0 to 120.');
    c.age.set('4');
    c.submit();
    expect(api.addChild).toHaveBeenCalledWith('C', { gender: 'F', age: 4 });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('edits the child and names an InvalidAge refusal', () => {
    const { c, api } = make({ id: 'k1', gender: 'M', age: 5 }, true);
    c.age.set('6');
    c.submit();
    expect(api.updateChild).toHaveBeenCalledWith('C', 'k1', { gender: 'M', age: 6 });
    expect(c.serverError()).toBe('Age must be between 0 and 120.');
  });
});
