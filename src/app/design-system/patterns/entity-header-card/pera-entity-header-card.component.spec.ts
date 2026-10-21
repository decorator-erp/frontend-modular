import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PeraEntityHeaderCardComponent } from './pera-entity-header-card.component';

@Component({
  imports: [PeraEntityHeaderCardComponent],
  template: `
    <pera-entity-header-card kind="project" name="Marina Tower">
      <button headerActions type="button" data-edit>Edit</button>
    </pera-entity-header-card>
  `,
})
class ActionsHostComponent {}

describe('PeraEntityHeaderCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeraEntityHeaderCardComponent],
    }).compileComponents();
  });

  it('renders name, status badge, and kpi strip', () => {
    const f = TestBed.createComponent(PeraEntityHeaderCardComponent);
    f.componentRef.setInput('kind', 'project');
    f.componentRef.setInput('name', 'Riverside Tower');
    f.componentRef.setInput('status', { tone: 'success', label: 'On track' });
    f.componentRef.setInput('kpis', [
      { caption: 'Budget', value: '2.4M' },
      { caption: 'Tasks', value: 42 },
    ]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Riverside Tower');
    expect(el.querySelector('pera-status-badge')).toBeTruthy();
    expect(el.querySelectorAll('pera-kpi-tile').length).toBe(2);
  });

  it('renders meta pairs', () => {
    const f = TestBed.createComponent(PeraEntityHeaderCardComponent);
    f.componentRef.setInput('kind', 'employee');
    f.componentRef.setInput('name', 'A. Hassan');
    f.componentRef.setInput('meta', [{ label: 'Department', value: 'Structural' }]);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Structural');
  });

  // --- 003 Batch 0: team avatar stack + Arabic subtitle ----------------------

  const card = (name = 'Marina Tower') => {
    const f = TestBed.createComponent(PeraEntityHeaderCardComponent);
    f.componentRef.setInput('kind', 'project');
    f.componentRef.setInput('name', name);
    return f;
  };

  it('renders a people meta value as an avatar stack with +N overflow', () => {
    const f = card();
    f.componentRef.setInput('meta', [
      {
        label: 'Team',
        value: {
          people: [
            { name: 'Ahmed Tarek' },
            { name: 'Mona Nabil' },
            { name: 'Sara Mohamed' },
            { name: 'Omar Adel' },
            { name: 'Laila Fouad' },
          ],
          max: 2,
        },
      },
    ]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('pera-avatar-stack')).toBeTruthy();
    expect(el.textContent).toContain('Team');
    expect(el.textContent).toContain('+3');
  });

  it('still renders a string meta value as plain text, not a stack', () => {
    const f = card();
    f.componentRef.setInput('meta', [{ label: 'Due', value: 'Nov 22, 2026' }]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('pera-avatar-stack')).toBeNull();
    expect(el.textContent).toContain('Nov 22, 2026');
  });

  it('renders nameAr beside the name when supplied', () => {
    const f = card();
    f.componentRef.setInput('nameAr', 'برج المارينا');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Marina Tower');
    expect(el.textContent).toContain('برج المارينا');
  });

  it('omits nameAr when absent and leaves the status badge in place', () => {
    const f = card();
    f.componentRef.setInput('status', { tone: 'success', label: 'On track' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('pera-status-badge')).toBeTruthy();
    expect(el.textContent).toContain('On track');
  });

  // --- 003 Batch 1: page actions project into the card (prototype `.ehc .acts`)

  it('projects page actions into the headerActions slot', () => {
    const f = TestBed.createComponent(ActionsHostComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const host = el.querySelector('pera-entity-header-card');
    expect(host?.querySelector('button[data-edit]')).toBeTruthy();
    expect(el.textContent).toContain('Edit');
  });

  it('renders no action markup when nothing is projected', () => {
    const f = card();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });
});
