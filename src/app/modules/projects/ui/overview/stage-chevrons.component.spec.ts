import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectStage } from '../../model/project.model';
import { StageChevronsComponent } from './stage-chevrons.component';

const stage = (id: string, order: number, status: ProjectStage['status']) =>
  ({ id, order, status, name: `Stage ${id}`, progressPercent: 40 }) as ProjectStage;

describe('StageChevronsComponent (OS-5)', () => {
  it('lays the stages out in order as done, current and upcoming, and opens one on click', () => {
    const f = TestBed.createComponent(StageChevronsComponent);
    f.componentRef.setInput('stages', [
      stage('c', 3, 'Locked'),
      stage('a', 1, 'Completed'),
      stage('b', 2, 'Active'),
    ]);
    f.detectChanges();
    const buttons = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-chevron]'),
    );
    expect(buttons.map((b) => b.dataset['chevron'])).toEqual(['done', 'current', 'upcoming']);
    expect(buttons[1].getAttribute('aria-current')).toBe('step');
    expect(buttons[1].textContent).toContain('40%');
    const spy = vi.fn();
    f.componentInstance.stageClick.subscribe(spy);
    buttons[2].click();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });
});
