export interface PaginationResult<T> {
  items: T[];
  next_cursor: string | null;
}

interface RowWithCursor {
  cursor: string;
}

export function paginate<T extends RowWithCursor>(rows: T[], limit: number): PaginationResult<T> {
  if (rows.length <= limit) return { items: rows, next_cursor: null };
  return { items: rows.slice(0, limit), next_cursor: rows[limit]!.cursor };
}
