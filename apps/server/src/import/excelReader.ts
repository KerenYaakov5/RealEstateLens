import ExcelJS from 'exceljs';
import type { RawCell } from './normalizers/result.js';
import type { RawRow } from './rowMapper.js';

export interface SheetRow {
  rowNumber: number;
  values: RawRow;
}

/** Converts exceljs cell values (rich text, formulas, hyperlinks…) into plain raw cells. */
function toRawCell(value: ExcelJS.CellValue): RawCell {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }
  if ('richText' in value) {
    return value.richText
      .map((part) => {
        return part.text;
      })
      .join('');
  }
  if ('result' in value) {
    return toRawCell(value.result as ExcelJS.CellValue);
  }
  if ('text' in value) {
    return String(value.text);
  }
  if ('error' in value) {
    return null;
  }
  return String(value);
}

function normalizeHeader(header: RawCell): string {
  return String(header ?? '')
    .trim()
    .toLowerCase();
}

/** Reads the first worksheet; the first row holds column headers. */
export async function readSpreadsheet(filePath: string): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    throw new Error(`No worksheet found in ${filePath}`);
  }

  const headers = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    headers.set(columnNumber, normalizeHeader(toRawCell(cell.value)));
  });

  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const values: Record<string, RawCell> = {};
    for (const [columnNumber, header] of headers) {
      values[header] = toRawCell(row.getCell(columnNumber).value);
    }
    rows.push({ rowNumber, values });
  });
  return rows;
}
