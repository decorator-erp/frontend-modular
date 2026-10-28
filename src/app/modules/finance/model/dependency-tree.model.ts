import type {
  ProjectStageFinancialBlock,
  ProjectTaskFinancialBlock,
} from './financial-block.model';

/** Direction of dependency traversal. */
export type DependencyDirection = 'Downstream' | 'Upstream';

export interface FinancialRollup {
  nodes: number;
  estimatedBudget: string;
  approvedAdjustments: string;
  effectiveCap: string;
  allocatedAmount: string;
  committedAmount: string;
  actualAmount: string;
  availableAmount: string;
  /** Σ max(0, actual − effectiveCap) per node. */
  overrunAmount: string;
  /** Σ max(0, committed + actual − effectiveCap) per node. */
  atRiskAmount: string;
}

export interface TaskTreeNode {
  projectTaskId: string;
  name: string;
  projectStageId: string;
  status: string;
  financial: ProjectTaskFinancialBlock;
  children: TaskTreeNode[];
}

export interface StageTreeNode {
  projectStageId: string;
  name: string;
  status: string;
  financial: ProjectStageFinancialBlock;
  dependentStages: StageTreeNode[];
  tasks: TaskTreeNode[];
}

export interface TaskDependencyTreeResponse {
  root: TaskTreeNode;
  rollup: FinancialRollup;
  nodeCount: number;
  maxDepthReached: number;
  truncatedByDepth: boolean;
  cycleNodes: string[];
}

export interface StageDependencyTreeResponse {
  root: StageTreeNode;
  rollup: FinancialRollup;
  nodeCount: number;
  maxDepthReached: number;
  truncatedByDepth: boolean;
  cycleNodes: string[];
}
