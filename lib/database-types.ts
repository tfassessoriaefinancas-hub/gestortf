// Query results retain the existing driver's generic boundary; callers can
// supply a precise row type without changing the shared application queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DatabaseRow = Record<string, any>;
export type QueryResult<T = DatabaseRow> = { rows: T[]; rowCount: number | null; command: string };
export interface DatabaseClient {
  query<T extends DatabaseRow = DatabaseRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
export type StatementResult<T> = { success: true; results: T[]; meta: { changes: number; last_row_id: number; duration: number } };
export interface DatabaseStatement {
  readonly database: ApplicationDatabase;
  bind(...values: unknown[]): DatabaseStatement;
  execute<T = DatabaseRow>(client?: DatabaseClient): Promise<StatementResult<T>>;
  first<T = DatabaseRow>(column?: string): Promise<T | null>;
  all<T = DatabaseRow>(): Promise<StatementResult<T>>;
  run<T = DatabaseRow>(): Promise<StatementResult<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}
export interface ApplicationDatabase {
  prepare(sql: string): DatabaseStatement;
  batch<T = DatabaseRow>(statements: DatabaseStatement[]): Promise<StatementResult<T>[]>;
  transaction<T>(action: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
