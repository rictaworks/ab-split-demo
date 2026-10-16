import type { D1Like } from '../infra/d1';

/** 1 リクエストで使う外部依存。テストでは差し替える。 */
export interface AppDeps {
  readonly db: D1Like;
  /** GA4 の測定 ID。未設定なら null（画面は明示的に失敗する）。 */
  readonly ga4MeasurementId: string | null;
  readonly now: () => Date;
  readonly randomBytes: (length: number) => Uint8Array;
}

/** Workers の環境変数（バインディング）の形。 */
export interface WorkerEnv {
  readonly DB: D1Like;
  readonly GA4_MEASUREMENT_ID?: string;
}
