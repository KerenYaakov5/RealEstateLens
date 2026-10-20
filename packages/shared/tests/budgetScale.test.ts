import { describe, expect, it } from 'vitest';
import { budgetScale, nearestOnBudgetScale, roundUpToBudgetScale } from '../src/criteria.js';

describe('budget scale', () => {
  it('is fine where most budgets are and coarse above', () => {
    expect(budgetScale(12_000_000).map((value) => value / 1_000_000)).toEqual([
      0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10, 15,
    ]);
  });

  it('rounds a suggested budget up to the next point', () => {
    expect(roundUpToBudgetScale(3_889_710)).toBe(4_000_000);
    expect(roundUpToBudgetScale(5_000_000)).toBe(5_000_000);
    expect(roundUpToBudgetScale(5_000_001)).toBe(6_000_000);
    expect(roundUpToBudgetScale(10_500_000)).toBe(15_000_000);
    expect(roundUpToBudgetScale(1)).toBe(500_000);
  });

  it('snaps any amount to the closest point', () => {
    expect(nearestOnBudgetScale(2_550_000)).toBe(2_500_000);
    expect(nearestOnBudgetScale(2_750_000)).toBe(3_000_000);
    expect(nearestOnBudgetScale(7_400_000)).toBe(7_000_000);
    expect(nearestOnBudgetScale(13_000_000)).toBe(15_000_000);
  });
});
