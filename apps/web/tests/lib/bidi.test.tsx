import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withIsolatedNumbers } from '../../src/lib/bidi';

describe('withIsolatedNumbers', () => {
  it('wraps each number with its unit in its own LTR isolate, keeping the text', () => {
    const { container } = render(
      <p>{withIsolatedNumbers('עם תקציב של 3,889,710 ₪ 60% מהעסקאות (3 מתוך 5)')}</p>,
    );

    const isolated = [...container.querySelectorAll('bdi')].map((node) => node.textContent);
    expect(isolated).toEqual(['3,889,710 ₪', '60%', '3', '5']);
    expect(container.textContent).toBe('עם תקציב של 3,889,710 ₪ 60% מהעסקאות (3 מתוך 5)');
  });
});
