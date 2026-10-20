const priceFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

/** "‏2,500,000 ₪" */
export function formatPrice(value: number): string {
  return priceFormatter.format(value);
}

/** "2.5 מיליון ₪" for large sums, full price below a million. */
export function formatPriceShort(value: number): string {
  if (value >= 1_000_000) {
    const millions = Math.round((value / 1_000_000) * 100) / 100;
    return `${millions.toLocaleString('he-IL')} מיליון ₪`;
  }
  return formatPrice(value);
}

/** 0.4123 → "41%" */
export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** "2026-07-01" → "יולי 2026" */
export function formatMonth(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "2025-09-07" → "07.09.2025" */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day ?? ''}.${month ?? ''}.${year ?? ''}`;
}
