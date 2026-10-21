import { TestBed } from '@angular/core/testing';
import { PeraTabsComponent, type TabDef } from './pera-tabs.component';
import { PermissionsService } from '@platform/permissions/permissions.service';

/** Stub: everything allowed except the capability 'secret'. */
class StubPermissions {
  can(cap: string): boolean {
    return cap !== 'secret';
  }
}

const TABS: TabDef[] = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Details' },
];

describe('PeraTabsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraTabsComponent],
      providers: [{ provide: PermissionsService, useClass: StubPermissions }],
    }).compileComponents();
  });

  it('renders a tab button per visible tab', () => {
    const f = TestBed.createComponent(PeraTabsComponent);
    f.componentRef.setInput('tabs', TABS);
    f.componentRef.setInput('activeId', 'a');
    f.detectChanges();
    const buttons = (f.nativeElement as HTMLElement).querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
  });

  it('defaults to the underline variant (bottom border on the active tab)', () => {
    const f = TestBed.createComponent(PeraTabsComponent);
    f.componentRef.setInput('tabs', TABS);
    f.componentRef.setInput('activeId', 'a');
    f.detectChanges();
    const active = (f.nativeElement as HTMLElement).querySelector('button')!;
    expect(active.className).toContain('border-b-2');
    expect(active.className).toContain('border-accent');
  });

  it('renders the pill variant (rounded, surface-muted rail) when variant=pill', () => {
    const f = TestBed.createComponent(PeraTabsComponent);
    f.componentRef.setInput('tabs', TABS);
    f.componentRef.setInput('activeId', 'a');
    f.componentRef.setInput('variant', 'pill');
    f.detectChanges();
    const rail = (f.nativeElement as HTMLElement).querySelector('[role="tablist"]')!;
    expect(rail.className).toContain('bg-surface-muted');
    const active = (f.nativeElement as HTMLElement).querySelector('button')!;
    expect(active.className).toContain('rounded-md');
    expect(active.className).not.toContain('border-b-2');
  });

  it('keeps the 2px brand focus ring on tab buttons', () => {
    const f = TestBed.createComponent(PeraTabsComponent);
    f.componentRef.setInput('tabs', TABS);
    f.detectChanges();
    const btn = (f.nativeElement as HTMLElement).querySelector('button')!;
    expect(btn.className).toContain('focus-visible:outline-2');
    expect(btn.className).toContain('focus-visible:outline-accent');
  });

  it('emits activeChange with the tab id on click (keyboard-operable button)', () => {
    const f = TestBed.createComponent(PeraTabsComponent);
    f.componentRef.setInput('tabs', TABS);
    let emitted = '';
    f.componentInstance.activeChange.subscribe((id: string) => (emitted = id));
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelectorAll('button')[1].click();
    expect(emitted).toBe('b');
  });

  it('hides tabs whose capability is not granted (gating preserved)', () => {
    const f = TestBed.createComponent(PeraTabsComponent);
    f.componentRef.setInput('tabs', [
      { id: 'a', label: 'Overview' },
      { id: 'x', label: 'Secret', capability: 'secret' },
    ] satisfies TabDef[]);
    f.detectChanges();
    const buttons = (f.nativeElement as HTMLElement).querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('Overview');
  });
});
