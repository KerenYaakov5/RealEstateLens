import type { MarketAssessmentDto } from '@rel/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CRITERIA, type CriteriaState } from '../../src/features/criteria/criteria';
import { Results } from '../../src/features/assessment/Results';

const STATE: CriteriaState = { ...DEFAULT_CRITERIA, city: { id: 5, name: 'חולון' } };

function assessment(overrides: Partial<MarketAssessmentDto> = {}): MarketAssessmentDto {
  return {
    city: { id: 5, name: 'חולון' },
    neighborhood: null,
    notices: [],
    nearbyCitiesWithData: [],
    referencePeriod: '2026-07-01',
    feasibility: {
      matchRate: 0.4,
      poolSize: 20,
      affordableCount: 8,
      unknownCount: 0,
      confidence: 'high',
    },
    cityLevel: null,
    compromises: [],
    typicalForBudget: null,
    houseParts: [],
    referenceDeals: [],
    methodology: {
      minDealsForRate: 3,
      confidenceMediumFrom: 5,
      confidenceHighFrom: 15,
      roomsTolerance: 0.5,
      nearbyCityMaxKm: 25,
      maxBudgetRatio: 1.5,
      priceIndexSource: 'הלמ"ס – מדד מחירי דירות (סדרה 40010)',
    },
    ...overrides,
  };
}

/** Answers the assessment with `answer`; every other request (city list, session) with 204. */
function serve(answer: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      return Promise.resolve(
        String(url).startsWith('/api/v1/market-assessments')
          ? answer
          : new Response(null, { status: 204 }),
      );
    }),
  );
}

function renderResults() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Results
        state={STATE}
        priorities={{}}
        onChangePriorities={vi.fn()}
        onApplyCompromise={vi.fn()}
        onChooseCity={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Results', () => {
  it('asks for a city before anything else', () => {
    serve(new Response(null, { status: 204 }));
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <Results
          state={DEFAULT_CRITERIA}
          priorities={{}}
          onChangePriorities={vi.fn()}
          onApplyCompromise={vi.fn()}
          onChooseCity={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('בחרו עיר כדי להתחיל')).toBeInTheDocument();
  });

  it('shows the real numbers behind the result, and where adjusted prices come from', async () => {
    serve(new Response(JSON.stringify(assessment()), { status: 200 }));
    renderResults();

    expect(await screen.findByText('40%')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'היתכנות' });
    expect(section).toHaveTextContent(
      'מתוך 20 דירות שעונות על הדרישות בחולון, 8 נמכרו בתקציב שלך.',
    );
    expect(section).toHaveTextContent('לא מחיר שנמכר בפועל');
  });

  it('draws no conclusion from too few deals', async () => {
    serve(
      new Response(
        JSON.stringify(
          assessment({
            feasibility: {
              matchRate: null,
              poolSize: 2,
              affordableCount: 1,
              unknownCount: 0,
              confidence: 'insufficient',
            },
          }),
        ),
        { status: 200 },
      ),
    );
    renderResults();

    expect(await screen.findByText('אין מספיק נתונים')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'היתכנות' })).toHaveTextContent(
      'ולכן אי אפשר להסיק מהן מסקנה',
    );
    expect(screen.queryByText('50%')).toBeNull();
  });

  it('says only what it checked when there is no data at all (204)', async () => {
    serve(new Response(null, { status: 204 }));
    renderResults();

    expect(await screen.findByText('אין לנו עסקאות בחולון')).toBeInTheDocument();
    expect(screen.getByText(/לא מצאנו יישוב קרוב/)).toBeInTheDocument();
  });

  it('shows the server’s Hebrew message when the service is unavailable', async () => {
    serve(
      new Response(
        JSON.stringify({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'השירות אינו זמין כרגע. נסו שוב בעוד כמה דקות.',
          },
        }),
        { status: 503 },
      ),
    );
    renderResults();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'השירות אינו זמין כרגע. נסו שוב בעוד כמה דקות.',
    );
  });
});
