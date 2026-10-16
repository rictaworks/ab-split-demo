/**
 * Cloudflare D1 の利用部分だけを表す最小インターフェース。
 * 型定義パッケージに依存せず、テストでは node:sqlite による実装を差し込む。
 */

export interface D1Result<T = unknown> {
  readonly results: T[];
  readonly success: boolean;
  readonly meta: { readonly changes: number };
}

export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Like {
  prepare(query: string): D1PreparedLike;
  batch<T = unknown>(statements: D1PreparedLike[]): Promise<D1Result<T>[]>;
}
