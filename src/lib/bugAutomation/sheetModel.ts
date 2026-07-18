export interface BugItem {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  reporter: string;
  created: string;
  due: string;
  resolved: string;
  notes: string;
  /** 1-based sheet row (header is row 1; first data row is row 2). */
  rowNumber: number;
}

const cell = (row: string[], i: number): string => (row[i] ?? "").trim();

/** Map raw sheet values (row 0 = header) into typed items, skipping blank-ID rows. */
export function parseRows(values: string[][]): BugItem[] {
  if (values.length === 0) return [];
  return values.slice(1)
    .map((row, i) => ({ row, rowNumber: i + 2 }))
    .filter(({ row }) => cell(row, 0) !== "")
    .map(({ row, rowNumber }) => ({
      id: cell(row, 0),
      type: cell(row, 1),
      title: cell(row, 2),
      description: cell(row, 3),
      priority: cell(row, 4),
      status: cell(row, 5),
      reporter: cell(row, 6),
      created: cell(row, 7),
      due: cell(row, 8),
      resolved: cell(row, 9),
      notes: cell(row, 10),
      rowNumber,
    }));
}
