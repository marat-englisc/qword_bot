import { sql, type SQLWrapper } from "drizzle-orm";

// SQLite INTEGER affinity alone does not reject fractional numbers.
export const nonNegativeInteger = (column: SQLWrapper) =>
  sql`typeof(${column}) = 'integer' AND ${column} >= 0`;

export const nonBlankText = (column: SQLWrapper) =>
  sql`length(trim(${column}, char(9) || char(10) || char(13) || ' ')) > 0`;

export const finiteNumber = (column: SQLWrapper) =>
  sql`${column} BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308`;

export const timestampMillis = (column: SQLWrapper) =>
  sql`${nonNegativeInteger(column)} AND ${column} <= 8640000000000000`;
