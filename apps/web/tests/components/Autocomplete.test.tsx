import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Autocomplete, type AutocompleteOption } from '../../src/components/Autocomplete';

type Search = (term: string) => Promise<AutocompleteOption[]>;

function renderAutocomplete(search: Search, onFreeText?: (text: string) => void) {
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Autocomplete
        label="עיר"
        placeholder=""
        queryKey={['test']}
        search={(term) => {
          return search(term);
        }}
        selectedText=""
        onSelect={onSelect}
        onClear={vi.fn()}
        {...(onFreeText === undefined ? {} : { onFreeText })}
      />
    </QueryClientProvider>,
  );
  return { onSelect, input: screen.getByRole('combobox', { name: 'עיר' }) };
}

describe('Autocomplete', () => {
  it('does not search before 3 characters, and says so', async () => {
    const search = vi.fn<Search>(() => Promise.resolve([]));
    const { input } = renderAutocomplete(search);

    await userEvent.type(input, 'הר');

    expect(await screen.findByText('הקלידו לפחות 3 תווים')).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it('searches once after a pause in typing, not on every key', async () => {
    const search = vi.fn<Search>(() => Promise.resolve([{ id: 1, label: 'הרצליה' }]));
    const { input } = renderAutocomplete(search);

    await userEvent.type(input, 'הרצל');

    expect(await screen.findByRole('option', { name: 'הרצליה' })).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('הרצל');
  });

  it('selects with the keyboard', async () => {
    const { input, onSelect } = renderAutocomplete(() => {
      return Promise.resolve([
        { id: 1, label: 'רמת גן' },
        { id: 2, label: 'רמת השרון' },
      ]);
    });

    await userEvent.type(input, 'רמת');
    await screen.findByRole('option', { name: 'רמת גן' });
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledWith({ id: 2, label: 'רמת השרון' });
  });

  it('accepts free text when nothing matches and free text is allowed', async () => {
    const onFreeText = vi.fn();
    const { input } = renderAutocomplete(() => {
      return Promise.resolve([]);
    }, onFreeText);

    await userEvent.type(input, 'שכונה חדשה');
    expect(await screen.findByText('לא נמצא ברשימה – אפשר להמשיך עם הטקסט')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');

    expect(onFreeText).toHaveBeenCalledWith('שכונה חדשה');
  });
});
