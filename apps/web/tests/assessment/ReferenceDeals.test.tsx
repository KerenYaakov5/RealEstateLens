import type { MarketAssessmentDto } from '@rel/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReferenceDeals } from '../../src/features/assessment/ReferenceDeals';

type Deal = MarketAssessmentDto['referenceDeals'][number];

const DEAL: Deal = {
  id: 1,
  dealId: 'D1',
  city: { id: 9, name: 'חולון' },
  neighborhood: { id: 47, name: 'קריית שרת' },
  street: 'סוקולוב',
  propertyType: 'apartment',
  rooms: 4,
  sizeSqm: 96,
  floor: 3,
  totalFloors: 8,
  yearBuilt: 2015,
  condition: null,
  features: { safeRoom: true, elevator: true, parking: false, balcony: null },
  dealDate: '2025-09-07',
  priceNis: 2_300_000,
  adjustedPriceNis: 2_380_000,
  isAdjusted: true,
  pricePerSqm: 23_958,
  source: 'broker',
  matchedPreferences: ['elevator'],
};

describe('ReferenceDeals', () => {
  it('shows each deal as a card with price, place, details and its features – always open', () => {
    render(<ReferenceDeals deals={[DEAL, { ...DEAL, id: 2, dealId: 'D2' }]} />);

    const cards = screen
      .getAllByRole('listitem')
      .filter((item) => item.querySelector('ul') !== null);
    expect(cards).toHaveLength(2);
    const card = cards[0] as HTMLElement;
    expect(card).toHaveTextContent('סוקולוב, קריית שרת');
    expect(card).toHaveTextContent('4 חדרים');
    expect(card).toHaveTextContent('96 מ"ר');
    expect(card).toHaveTextContent('קומה 3 מתוך 8');
    expect(card).toHaveTextContent('07.09.2025');
    const features = within(card).getByRole('list', { name: 'כולל' });
    expect(
      within(features)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['ממ"ד', 'מעלית']);
  });

  it('says so when no deal fits the budget', () => {
    render(<ReferenceDeals deals={[]} />);

    expect(
      screen.getByText('לא נמצאו עסקאות עבר שנמכרו עם המאפיינים האלו בתקציב הזה.'),
    ).toBeInTheDocument();
  });
});
