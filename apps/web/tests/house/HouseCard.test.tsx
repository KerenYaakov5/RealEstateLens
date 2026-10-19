import type { CompromiseDto, HousePartDto } from '@rel/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HouseCard } from '../../src/features/house/HouseCard';

const PARTS: HousePartDto[] = [
  { part: 'structure', preference: null, share: 0.21, knownCount: 39, status: 'partial' },
  { part: 'safeRoom', preference: 'required', share: 0.13, knownCount: 8, status: 'missing' },
  { part: 'elevator', preference: 'any', share: 0.75, knownCount: 8, status: 'full' },
  { part: 'parking', preference: 'any', share: null, knownCount: 2, status: 'unknown' },
  { part: 'balcony', preference: 'preferred', share: 0.88, knownCount: 8, status: 'full' },
];

const DROP_SAFE_ROOM: CompromiseDto = {
  id: 'dropFeature:safeRoom',
  type: 'dropFeature',
  params: { feature: 'safeRoom' },
  delta: 0.16,
  facts: [],
  feasibility: {
    matchRate: 0.21,
    poolSize: 39,
    affordableCount: 8,
    unknownCount: 0,
    confidence: 'high',
  },
};

describe('HouseCard', () => {
  it('lists every part with its share, unknown as a question mark', () => {
    render(<HouseCard parts={PARTS} compromises={[]} onApplyCompromise={vi.fn()} />);
    const list = screen.getAllByRole('listitem');

    expect(list).toHaveLength(5);
    expect(screen.getByRole('button', { name: /חניה.*\?/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ממ"ד.*חובה.*13%/ })).toBeInTheDocument();
  });

  it('explains a missing part and offers its compromise', async () => {
    const onApply = vi.fn();
    render(<HouseCard parts={PARTS} compromises={[DROP_SAFE_ROOM]} onApplyCompromise={onApply} />);

    await userEvent.click(screen.getByRole('button', { name: /ממ"ד.*13%/ }));

    expect(screen.getByRole('status')).toHaveTextContent('כאן צריך להתפשר');
    expect(screen.getByRole('status')).toHaveTextContent('13% מהדירות שנמכרו בתקציב כוללות ממ"ד');
    await userEvent.click(screen.getByRole('button', { name: /לוותר על ממ"ד/ }));
    expect(onApply).toHaveBeenCalledWith(DROP_SAFE_ROOM);
  });

  it('says when there is not enough data instead of guessing', async () => {
    render(<HouseCard parts={PARTS} compromises={[]} onApplyCompromise={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /חניה.*\?/ }));

    expect(screen.getByRole('status')).toHaveTextContent('אין מספיק נתונים כדי לדעת');
    expect(screen.getByRole('status')).toHaveTextContent('נמצאו רק 2 עסקאות');
  });
});
