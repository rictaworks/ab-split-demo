/** HTTP 層の定数（経路・Cookie・ヘッダ・応答コード・Cron）。文字列の正はここに置く。 */

export const ROUTE = {
  EXPERIMENTS_API: '/api/experiments',
  EXPERIMENT_API: '/api/experiments/:id',
  EXPERIMENT_STATUS_API: '/api/experiments/:id/status',
  EXPERIMENT_SIMULATE_API: '/api/experiments/:id/simulate',
  EXPERIMENT_RESULTS_API: '/api/experiments/:id/results',
  TRACK_ASSIGN: '/t/:publicKey/assign',
  TRACK_CONVERT: '/t/:publicKey/convert',
  SNIPPET: '/snippet.js',
  INDEX: '/',
  EXPERIMENT_PAGE: '/experiments/:id',
  LEGAL: '/legal',
  LP: '/lp',
  MANUAL: '/manual',
} as const;

export const QUERY = {
  VISITOR_ID: 'visitor_id',
} as const;

export const COOKIE = {
  SESSION_NAME: 'ab_session',
  /** 秒。日次リセットで全データが消えるため、長期保持はしない。 */
  SESSION_MAX_AGE_SECONDS: 86400,
  SESSION_ID_BYTES: 16,
} as const;

export const HEADER = {
  CONTENT_TYPE: 'content-type',
  COOKIE: 'cookie',
  SET_COOKIE: 'set-cookie',
  CACHE_CONTROL: 'cache-control',
  CORS_ORIGIN: 'access-control-allow-origin',
  CORS_METHODS: 'access-control-allow-methods',
  CORS_HEADERS: 'access-control-allow-headers',
  CORS_MAX_AGE: 'access-control-max-age',
  FRAME_OPTIONS: 'x-frame-options',
  CONTENT_TYPE_OPTIONS: 'x-content-type-options',
  REFERRER_POLICY: 'referrer-policy',
  CONTENT_SECURITY_POLICY: 'content-security-policy',
} as const;

export const CACHE_POLICY = {
  NO_STORE: 'no-store',
  SNIPPET: 'public, max-age=300',
} as const;

export const CONTENT_TYPE = {
  JSON: 'application/json; charset=utf-8',
  JSON_MEDIA_TYPE: 'application/json',
  HTML: 'text/html; charset=utf-8',
  JAVASCRIPT: 'application/javascript; charset=utf-8',
} as const;

export const CORS = {
  ALLOW_ORIGIN: '*',
  ALLOW_METHODS: 'GET, POST, OPTIONS',
  ALLOW_HEADERS: 'content-type',
  MAX_AGE_SECONDS: 600,
  PREFLIGHT_STATUS: 204,
} as const;

export const SECURITY_HEADERS = {
  FRAME_OPTIONS: 'DENY',
  CONTENT_TYPE_OPTIONS: 'nosniff',
  REFERRER_POLICY: 'strict-origin-when-cross-origin',
} as const;

/**
 * 画面の HTML に付ける CSP の正。インラインの script / style は応答ごとの nonce で許可する。
 * GA4 は googletagmanager（スクリプト）と google-analytics（送信先）、FontAwesome は cdnjs を許可する。
 */
export const CSP = {
  NONCE_BYTES: 16,
  NONCE_PATTERN: /^[A-Za-z0-9+/=_-]+$/,
  DIRECTIVES: {
    DEFAULT_SRC: ["'self'"],
    OBJECT_SRC: ["'none'"],
    BASE_URI: ["'none'"],
    FORM_ACTION: ["'self'"],
    FRAME_ANCESTORS: ["'none'"],
    SCRIPT_SRC: ["'self'", 'https://www.googletagmanager.com'],
    STYLE_SRC: ["'self'", 'https://cdnjs.cloudflare.com'],
    FONT_SRC: ["'self'", 'https://cdnjs.cloudflare.com'],
    IMG_SRC: ["'self'", 'data:', 'https://www.google-analytics.com', 'https://www.googletagmanager.com'],
    CONNECT_SRC: [
      "'self'",
      'https://www.google-analytics.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://www.googletagmanager.com',
    ],
  },
} as const;

export const DAILY_RESET = {
  /** Cron Triggers の式。UTC 18:00 は JST 03:00 に当たる。 */
  CRON: '0 18 * * *',
} as const;

export const API_CODE = {
  INVALID_JSON: 'invalid_json',
  VALIDATION_FAILED: 'validation_failed',
  UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
  NOT_FOUND: 'not_found',
  METHOD_NOT_ALLOWED: 'method_not_allowed',
  CONFLICT: 'conflict',
  EXPERIMENT_LIMIT_REACHED: 'experiment_limit_reached',
  CONFIGURATION_ERROR: 'configuration_error',
  INTERNAL_ERROR: 'internal_error',
} as const;

export const STATUS_CODE = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_ERROR: 500,
} as const;

export const GA4 = {
  /** 測定 ID の書式。値は環境変数 GA4_MEASUREMENT_ID から取る。 */
  MEASUREMENT_ID_PATTERN: /^G-[A-Z0-9]+$/,
  SCRIPT_URL: 'https://www.googletagmanager.com/gtag/js?id=',
} as const;

export const DEMO_LIST = {
  /** デモ一覧の URL は環境変数 DEMO_LIST_URL から取る。許可するスキームだけをここで定める。 */
  ALLOWED_PROTOCOLS: ['https:', 'http:'],
} as const;

export const FONT_AWESOME = {
  STYLESHEET_URL: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
} as const;

/** スニペットが割当を取得する際の訪問者 ID の保存キー（訪問者のブラウザ内のみ）。 */
export const SNIPPET = {
  VISITOR_STORAGE_KEY: 'ab_split_visitor_id',
  VISITOR_ID_BYTES: 16,
} as const;
