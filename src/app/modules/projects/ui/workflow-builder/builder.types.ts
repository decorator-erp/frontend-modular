import { StageKind } from '../../model/project.model';

export interface PaletteChip {
  kind: StageKind;
  title: string;
  description: string;
}

export const PALETTE_CHIPS: PaletteChip[] = [
  { kind: 'Task', title: 'Task', description: 'Work owned by a person, with a due date' },
  { kind: 'Gate', title: 'Gate', description: 'Blocks downstream until conditions pass' },
  { kind: 'Approval', title: 'Approval', description: 'Sign-off by named approvers' },
  { kind: 'Milestone', title: 'Milestone', description: 'A marker — no duration' },
];
