import { describe, expect, it } from 'vitest';
import { MAX_PLAN_STEPS, PlanSchema, capPlanSteps, orderedExecutionIds } from './index';

describe('plan-and-execute helpers', () => {
  it('rejects plans with duplicate step ids', () => {
    expect(
      PlanSchema.safeParse({
        steps: [
          { id: 'step-1', title: 'One', objective: 'Do one', successCriteria: 'One done' },
          { id: 'step-1', title: 'Again', objective: 'Do again', successCriteria: 'Again done' },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects plans that exceed the step budget', () => {
    expect(
      PlanSchema.safeParse({
        steps: Array.from({ length: MAX_PLAN_STEPS + 1 }, (_, index) => ({
          id: `step-${index + 1}`,
          title: `Step ${index + 1}`,
          objective: 'Complete the step',
          successCriteria: 'The step is complete',
        })),
      }).success,
    ).toBe(false);
  });

  it('caps steps while preserving order', () => {
    expect(capPlanSteps(['a', 'b', 'c', 'd'], 3)).toEqual(['a', 'b', 'c']);
  });

  it('reports execution order from step results', () => {
    expect(
      orderedExecutionIds([
        { stepId: 'step-1', title: 'One', status: 'done', result: 'done', evidence: [] },
        { stepId: 'step-2', title: 'Two', status: 'needs_follow_up', result: 'partial', evidence: [] },
      ]),
    ).toEqual(['step-1', 'step-2']);
  });
});
