import type { CompromiseDto } from '@rel/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CompromiseCards } from '../../src/features/assessment/CompromiseCards';
import { PersonalizePanel } from '../../src/features/recommendation/PersonalizePanel';

function compromise(
  id: string,
  type: CompromiseDto['type'],
  params: CompromiseDto['params'],
): CompromiseDto {
  return {
    id,
    type,
    params,
    delta: 0.2,
    facts: [],
    feasibility: {
      matchRate: 0.4,
      poolSize: 20,
      affordableCount: 8,
      unknownCount: 0,
      confidence: 'high',
    },
  };
}

const COMPROMISES = [
  compromise('raiseBudget', 'raiseBudget', { newMaxPrice: 2_450_000 }),
  compromise('dropFeature:parking', 'dropFeature', { feature: 'parking' }),
  compromise('fewerRooms', 'fewerRooms', { rooms: 3 }),
];

describe('CompromiseCards', () => {
  it('shows the default ranking without a label when nothing was asked', () => {
    render(
      <CompromiseCards
        compromises={COMPROMISES}
        baselineRate={0.2}
        recommendation={null}
        onApply={vi.fn()}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('מחיר');
    expect(items[1]).toHaveTextContent('מאפיינים');
    expect(items[2]).toHaveTextContent('חדרים');
    expect(items[0]).toHaveTextContent('40%לעומת 20% בחיפוש הנוכחי');
    expect(items[0]).not.toHaveTextContent('עלייה של');
    expect(screen.queryByText('המלצה אישית')).toBeNull();
    expect(screen.queryByText('המלצה אוטומטית')).toBeNull();
  });

  it('shows personal picks in their order, with reasons and the "personal" label', () => {
    render(
      <CompromiseCards
        compromises={COMPROMISES}
        baselineRate={0.2}
        recommendation={{
          source: 'llm',
          aiQuotaLeft: 4,
          picks: [
            { compromiseId: 'dropFeature:parking', reason: 'דירגת את החניה בחשיבות 1.' },
            { compromiseId: 'fewerRooms', reason: 'מספר החדרים בחשיבות 2.' },
          ],
        }}
        onApply={vi.fn()}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('לוותר על חניה')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('דירגת את החניה בחשיבות 1.');
    expect(screen.getByText('המלצה אישית')).toBeInTheDocument();
  });

  it('says when the current search has too few deals to compare with', () => {
    render(
      <CompromiseCards
        compromises={COMPROMISES}
        baselineRate={null}
        recommendation={null}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getAllByText('בחיפוש הנוכחי אין מספיק עסקאות להשוואה')).toHaveLength(3);
  });

  it('labels the fallback as automatic', () => {
    render(
      <CompromiseCards
        compromises={COMPROMISES}
        baselineRate={0.2}
        recommendation={{
          source: 'fallback',
          aiQuotaLeft: 4,
          picks: [{ compromiseId: 'raiseBudget', reason: 'תבנית.' }],
        }}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByText('המלצה אוטומטית')).toBeInTheDocument();
  });
});

describe('PersonalizePanel', () => {
  it('rates only what the compromises give up and sends every listed rating', async () => {
    const onAsk = vi.fn();
    const onChange = vi.fn();
    render(
      <PersonalizePanel
        compromises={COMPROMISES}
        priorities={{ parking: 1 }}
        onChange={onChange}
        onAsk={onAsk}
        isAsking={false}
        error={null}
        quotaLeft={5}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /סדרו לפי מה שקל לי לוותר עליו/ }));

    const groups = screen.getAllByRole('radiogroup');
    expect(groups.map((group) => group.getAttribute('aria-labelledby') !== null)).toEqual([
      true,
      true,
      true,
    ]);
    expect(screen.getByText('תקציב')).toBeInTheDocument();
    expect(screen.queryByText('עיר')).toBeNull();
    expect(screen.getByText(/נותרו היום/)).toHaveTextContent('5');

    await userEvent.click(
      within(groups[1] as HTMLElement).getByRole('radio', { name: '4 מתוך 5' }),
    );
    expect(onChange).toHaveBeenCalledWith({ parking: 4 });

    await userEvent.click(screen.getByRole('button', { name: 'בחרו לי פשרות' }));
    expect(onAsk).toHaveBeenCalledWith({ budget: 3, parking: 1, rooms: 3 });
  });

  it('is hidden when there is nothing to choose between', () => {
    const { container } = render(
      <PersonalizePanel
        compromises={COMPROMISES.slice(0, 1)}
        priorities={{}}
        onChange={vi.fn()}
        onAsk={vi.fn()}
        isAsking={false}
        error={null}
        quotaLeft={undefined}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
