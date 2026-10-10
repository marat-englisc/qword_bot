import {
  and,
  eq,
  getTableColumns,
  isNull,
  type SQL,
  type InferInsertModel,
  type InferSelectModel,
} from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

export type Database = LibSQLDatabase;
export type Executor = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "all" | "get" | "run"
>;
export type CreateInput<T extends SQLiteTable> = Omit<
  InferInsertModel<T>,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateInput<
  T extends SQLiteTable,
  K extends keyof InferSelectModel<T>,
> = Partial<Omit<CreateInput<T>, K>>;
export type Page = { limit?: number; offset?: number };

export function pagination(page: Page = {}) {
  const { limit = 100, offset = 0 } = page;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 500 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new RangeError(
      "limit must be 1..500; offset must be a nonnegative safe integer",
    );
  }
  return { limit, offset };
}

export function dateMillis(date: Date) {
  const value = date.getTime();
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("Invalid date");
  return value;
}

export function timeRange(from: Date, to: Date) {
  if (dateMillis(from) >= dateMillis(to))
    throw new RangeError("Expected from < to");
}

export class RepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryConflictError";
  }
}

/** Keys and scopes are checked at runtime as well as by TypeScript. */
export function createCrudRepository<
  T extends SQLiteTable,
  K extends keyof InferSelectModel<T> & string,
  S extends K,
>(db: Executor, table: T, keys: readonly K[], scopes: readonly S[]) {
  type Row = InferSelectModel<T>;
  type Key = Pick<Row, K>;
  type Scope = Pick<Row, S>;
  const columns: Record<string, SQLiteColumn> = getTableColumns(table);
  const runtimeTable: SQLiteTable = table;
  const generated = new Set(["id", "createdAt", "updatedAt"]);

  function conditions(
    values: object,
    required: readonly string[] = [],
  ): SQL | undefined {
    const entries = Object.entries(values);
    if (
      required.some(
        (key) =>
          !Object.hasOwn(values, key) ||
          Reflect.get(values, key) === undefined ||
          Reflect.get(values, key) === null,
      )
    ) {
      throw new TypeError("All key/scope fields are required");
    }
    return and(
      ...entries.map(([key, value]) => {
        if (!Object.hasOwn(columns, key) || value === undefined)
          throw new TypeError("Invalid filter field: " + key);
        return value === null ? isNull(columns[key]) : eq(columns[key], value);
      }),
    );
  }

  function writable(data: object, excluded: readonly string[] = []) {
    const entries = Object.entries(data).filter(
      ([, value]) => value !== undefined,
    );
    for (const [key] of entries) {
      if (
        !Object.hasOwn(columns, key) ||
        generated.has(key) ||
        excluded.includes(key)
      ) {
        throw new TypeError("Field cannot be written: " + key);
      }
    }
    return Object.fromEntries(entries);
  }

  // Runtime column validation mirrors the inferred input types. Drizzle cannot
  // infer the selected row of a generic table, so casts stay in this adapter.
  async function get(key: Key): Promise<Row | undefined> {
    const rows = await db
      .select()
      .from(runtimeTable)
      .where(conditions(key, keys))
      .limit(1);
    return rows[0] as Row | undefined;
  }
  return {
    async create(data: CreateInput<T>): Promise<Row> {
      const [row] = await db
        .insert(runtimeTable)
        .values(writable(data))
        .returning();
      return row as Row;
    },
    get,
    async list(
      scope: Scope,
      options: Page & { filter?: Partial<Row> } = {},
    ): Promise<Row[]> {
      const { limit, offset } = pagination(options);
      const rows = await db
        .select()
        .from(runtimeTable)
        .where(and(conditions(scope, scopes), conditions(options.filter ?? {})))
        .orderBy(...keys.map((key) => columns[key]))
        .limit(limit)
        .offset(offset);
      return rows as Row[];
    },
    async update(key: Key, data: UpdateInput<T, K>): Promise<Row | undefined> {
      const where = conditions(key, keys);
      const values = writable(data, keys);
      if (!Object.keys(values).length) return get(key);
      const [row] = await db
        .update(runtimeTable)
        .set(values)
        .where(where)
        .returning();
      return row as Row | undefined;
    },
    async delete(key: Key): Promise<Row | undefined> {
      const rows = await db
        .delete(runtimeTable)
        .where(conditions(key, keys))
        .returning();
      const [row] = rows as Record<string, unknown>[];
      return row as Row | undefined;
    },
  };
}
