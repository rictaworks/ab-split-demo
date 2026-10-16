/**
 * PR #2 のユーザーテスト（開発サーバー向け）。
 *
 * 実行例:
 *   node test/pr2/run.mjs
 *   BASE_URL=http://localhost:8787 node test/pr2/run.mjs
 *   PR2_TRACE=1 node test/pr2/run.mjs
 *
 * 作成した実験は新しい名前で残す（削除はしない）。日次リセットで全データは消える。
 * 文字列は config.mjs に置く。本番ホストは ALLOWED_HOSTS に無いため拒否する。
 */
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.mjs';

/** 合否の記録と表示を担う。 */
class Recorder {
  constructor() {
    this.entries = [];
  }

  pass(label, detail = '') {
    return this.add(label, true, detail);
  }

  fail(label, detail = '') {
    return this.add(label, false, detail);
  }

  skip(label) {
    this.entries.push({ label, state: 'skip' });
    console.log(`[${CONFIG.MESSAGE.SKIP_SHORT}] ${label}`);
    return false;
  }

  add(label, ok, detail) {
    this.entries.push({ label, state: ok ? 'pass' : 'fail' });
    const mark = ok ? CONFIG.MESSAGE.PASS : CONFIG.MESSAGE.FAIL;
    const suffix = detail === '' ? '' : ` (${detail})`;
    console.log(`[${mark}] ${label}${suffix}`);
    return ok;
  }

  summary() {
    const count = (state) => this.entries.filter((entry) => entry.state === state).length;
    return { pass: count('pass'), fail: count('fail'), skip: count('skip') };
  }
}

/** 接続先の URL を検証する。開発サーバーのホストだけを許可する。 */
export function resolveBaseUrl(raw) {
  const value = raw !== undefined && raw !== '' ? raw : CONFIG.DEFAULT_BASE_URL;
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`${CONFIG.MESSAGE.INVALID_BASE_URL} (${value}): ${errorText(error)}`);
  }
  if (!CONFIG.ALLOWED_HOSTS.includes(url.hostname)) {
    throw new Error(`${CONFIG.MESSAGE.REFUSED_HOST} (${url.hostname})`);
  }
  return url.origin;
}

/** HTTP 呼び出し。JSON 応答は解析して返す。解析できなければ例外にする。 */
export async function send(baseUrl, method, path, options = {}) {
  const headers = {};
  let body;
  if (options.cookie !== undefined) {
    headers.cookie = options.cookie;
  }
  if (options.rawBody !== undefined) {
    headers['content-type'] = 'application/json';
    body = options.rawBody;
  } else if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const json = contentType.includes('application/json') ? JSON.parse(text) : null;
  if (process.env[CONFIG.TRACE_ENV] === '1') {
    console.log(`  trace ${method} ${path} -> ${response.status}`);
  }
  return { status: response.status, headers: response.headers, text, json, setCookies: response.headers.getSetCookie() };
}

/** 応答の Set-Cookie から、セッション Cookie を取り出す。形式が不正なら null。 */
export function sessionCookieFrom(setCookies) {
  const pattern = new RegExp(CONFIG.SESSION_ID_PATTERN);
  for (const line of setCookies) {
    const pair = line.split(';')[0].trim();
    const index = pair.indexOf('=');
    if (index < 0) {
      continue;
    }
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (name === CONFIG.SESSION_COOKIE_NAME && pattern.test(value)) {
      return `${name}=${value}`;
    }
  }
  return null;
}

/** HTML 属性値のエスケープ（サーバー側 escapeHtml と同じ 5 文字）。 */
function escapeAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 環境変数 DEMO_LIST_URL を取り出す。未設定は既定値で補わず例外にする。 */
export function resolveDemoListUrl(raw) {
  if (raw === undefined || raw === '') {
    throw new Error(CONFIG.MESSAGE.DEMO_LIST_URL_MISSING);
  }
  return raw;
}

/** 必須 4 要素と GA4 の検査項目を、HTML の文字列で確認する。[ラベル, 合否] の配列を返す。 */
export function requiredElementChecks(html, demoListUrl) {
  const R = CONFIG.REQUIRED;
  const L = CONFIG.MESSAGE.CHECK_LABEL;
  return [
    [L.ELEMENT_BANNER, html.includes(`class="${R.BANNER_CLASS}"`) && html.includes(R.BANNER_TEXT)],
    [L.ELEMENT_BACK_LINK, html.includes(R.BACK_LINK_TEXT) && html.includes(`href="${escapeAttribute(demoListUrl)}"`)],
    [L.ELEMENT_CONSULT, html.includes(R.CONSULT_TEXT) && html.includes(R.CONSULT_HREF) && html.includes(R.CONSULT_CLASS)],
    [L.ELEMENT_CONSULT_FIXED, new RegExp(R.CONSULT_FIXED_PATTERN).test(html)],
    [L.ELEMENT_LEGAL, html.includes(R.LEGAL_HREF)],
    [L.GA4_SCRIPT, new RegExp(R.GA4_SCRIPT_PATTERN).test(html)],
    [L.GA4_CONFIG, new RegExp(R.GA4_CONFIG_PATTERN).test(html)],
  ];
}

/** 例外を、記録に載せる文字列にする。 */
export function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

/** 手順を 1 つ実行して記録する。例外は不合格として記録し、null を返す。 */
async function step(recorder, label, action) {
  try {
    const outcome = await action();
    if (outcome.ok) {
      recorder.pass(label, outcome.detail ?? '');
      return outcome.value ?? true;
    }
    recorder.fail(label, outcome.detail ?? '');
    return null;
  } catch (error) {
    recorder.fail(label, errorText(error));
    return null;
  }
}

/** 前の手順の結果（dependency）が無いときは未実行として記録する。 */
async function stepIf(recorder, dependency, label, action) {
  if (dependency === null) {
    recorder.skip(label);
    return null;
  }
  return step(recorder, label, action);
}

function outcome(ok, detail = '', value = undefined) {
  return { ok, detail, value };
}

/** 画面 1 枚の検査。ステータスと必須要素・GA4 を記録する。応答を返す（例外時は null）。 */
async function checkPage(recorder, baseUrl, demoListUrl, cookie, pageName, path, expectedStatus) {
  const label = CONFIG.MESSAGE.CHECK_LABEL;
  const statusLabel = expectedStatus === 200 ? label.PAGE_STATUS : label.NOT_FOUND_STATUS;
  try {
    const response = await send(baseUrl, 'GET', path, { cookie });
    recorder.add(`${pageName}: ${statusLabel}`, response.status === expectedStatus, `HTTP ${response.status}`);
    for (const [checkLabel, ok] of requiredElementChecks(response.text, demoListUrl)) {
      recorder.add(`${pageName}: ${checkLabel}`, ok);
    }
    return response;
  } catch (error) {
    recorder.fail(`${pageName}: ${statusLabel}`, errorText(error));
    return null;
  }
}

function payloadOf(variant) {
  const payload = { selector: CONFIG.EXPERIMENT.SELECTOR, text: variant.text };
  if (variant.color !== undefined) {
    payload.color = variant.color;
  }
  return payload;
}

function variantBody(variant, weight) {
  return { key: variant.key, label: variant.label, weight, payload: payloadOf(variant) };
}

function sumExposures(summary) {
  return summary.variants.reduce((total, variant) => total + variant.exposures, 0);
}

/** 画面の検査（トップ・法的表記・404）。セッション Cookie を得るため最初に行う。 */
async function runPageChecks(recorder, baseUrl, demoListUrl) {
  const P = CONFIG.PAGE_NAME;
  const R = CONFIG.ROUTES;
  const home = await checkPage(recorder, baseUrl, demoListUrl, undefined, P.INDEX, R.INDEX, 200);
  const cookie = home === null ? null : sessionCookieFrom(home.setCookies);
  if (cookie === null) {
    throw new Error(CONFIG.MESSAGE.NO_SESSION_COOKIE);
  }
  await checkPage(recorder, baseUrl, demoListUrl, cookie, P.LEGAL, R.LEGAL, 200);
  await checkPage(recorder, baseUrl, demoListUrl, cookie, P.NOT_FOUND, R.UNKNOWN_PAGE, 404);
  return cookie;
}

/** 実験の作成から結果・模擬トラフィックまでの API 手順。 */
async function runExperimentFlow(recorder, baseUrl, demoListUrl, cookie) {
  const L = CONFIG.MESSAGE.CHECK_LABEL;
  const R = CONFIG.ROUTES;
  const E = CONFIG.EXPERIMENT;
  const V = CONFIG.VISITOR;

  const created = await step(recorder, L.CREATE_STATUS, async () => {
    const name = `${E.NAME_PREFIX} ${Date.now()}`;
    const response = await send(baseUrl, 'POST', R.EXPERIMENTS_API, {
      cookie,
      json: {
        name,
        goalName: E.GOAL_NAME,
        minSample: E.MIN_SAMPLE,
        variants: [
          variantBody(E.CONTROL, E.CREATE_WEIGHTS.control),
          variantBody(E.VARIANT_B, E.CREATE_WEIGHTS['variant-b']),
          variantBody(E.VARIANT_C, E.CREATE_WEIGHTS['variant-c']),
        ],
      },
    });
    return outcome(response.status === 201, `HTTP ${response.status}`, response.json?.experiment);
  });

  await stepIf(recorder, created, L.CREATE_DRAFT, async () =>
    outcome(created.status === E.STATUS_DRAFT, `status=${created.status}`),
  );
  await stepIf(recorder, created, L.CREATE_PUBLIC_KEY, async () =>
    outcome(new RegExp(CONFIG.PUBLIC_KEY_PATTERN).test(created.publicKey), `publicKey=${created.publicKey}`),
  );
  await stepIf(recorder, created, L.CREATE_VARIANTS, async () =>
    outcome(created.variants.length === 3, `count=${created.variants.length}`),
  );

  const expPath = `${R.EXPERIMENT_API}${created?.id}`;
  await stepIf(recorder, created, L.VARIANT_COUNT_FIXED, async () => {
    const response = await send(baseUrl, 'PUT', expPath, {
      cookie,
      json: {
        name: created.name,
        goalName: created.goalName,
        minSample: created.minSample,
        variants: [
          variantBody(E.CONTROL, E.RESIZE_WEIGHTS.control),
          variantBody(E.VARIANT_B, E.RESIZE_WEIGHTS['variant-b']),
        ],
      },
    });
    return outcome(response.status === 409, `HTTP ${response.status}`);
  });
  const updated = await stepIf(recorder, created, L.VARIANT_COUNT_UNCHANGED, async () => {
    const response = await send(baseUrl, 'GET', expPath, { cookie });
    const experiment = response.json?.experiment;
    return outcome(
      response.status === 200 && experiment?.variants?.length === 3,
      `HTTP ${response.status} count=${experiment?.variants?.length}`,
      experiment,
    );
  });

  const running = await stepIf(recorder, updated, L.START_STATUS, async () => {
    const response = await send(baseUrl, 'POST', `${expPath}${R.STATUS_SUFFIX}`, {
      cookie,
      json: { to: E.STATUS_RUNNING },
    });
    return outcome(response.status === 200, `HTTP ${response.status}`, response.json?.experiment);
  });
  await stepIf(recorder, running, L.START_RUNNING, async () =>
    outcome(running.status === E.STATUS_RUNNING, `status=${running.status}`),
  );

  const publicKey = updated?.publicKey ?? null;
  const assignPath = `${R.ASSIGN_PREFIX}${publicKey}${R.ASSIGN_SUFFIX}?visitor_id=${V.ASSIGN_ID}`;
  const assigned = await stepIf(recorder, running, L.ASSIGN_STATUS, async () => {
    const response = await send(baseUrl, 'GET', assignPath);
    return outcome(response.status === 200, `HTTP ${response.status}`, response);
  });
  await stepIf(recorder, assigned, L.ASSIGN_NO_STORE, async () =>
    outcome(assigned.headers.get('cache-control') === 'no-store', `cache-control=${assigned.headers.get('cache-control')}`),
  );
  const assignedKey = await stepIf(recorder, assigned, L.ASSIGN_VARIANT, async () => {
    const key = assigned.json?.variant?.key ?? null;
    const keys = updated.variants.map((variant) => variant.key);
    return outcome(keys.includes(key), `key=${key}`, key);
  });
  await stepIf(recorder, assigned, L.ASSIGN_GOAL, async () =>
    outcome(assigned.json?.goalName === E.GOAL_NAME, `goalName=${assigned.json?.goalName}`),
  );
  await stepIf(recorder, assignedKey, L.ASSIGN_STICKY, async () => {
    const again = await send(baseUrl, 'GET', assignPath);
    const key = again.json?.variant?.key ?? null;
    return outcome(key === assignedKey, `first=${assignedKey} again=${key}`);
  });

  const converted = await stepIf(recorder, assignedKey, L.CONVERT_STATUS, async () => {
    const response = await send(baseUrl, 'POST', `${R.ASSIGN_PREFIX}${publicKey}${R.CONVERT_SUFFIX}`, {
      json: { visitorId: V.ASSIGN_ID, goalName: E.GOAL_NAME },
    });
    return outcome(response.status === 200, `HTTP ${response.status}`, response);
  });
  await stepIf(recorder, converted, L.CONVERT_RECORDED, async () =>
    outcome(converted.json?.ok === true, `ok=${converted.json?.ok}`),
  );

  if (created !== null) {
    await checkPage(recorder, baseUrl, demoListUrl, cookie, CONFIG.PAGE_NAME.EXPERIMENT, `${R.EXPERIMENT_PAGE}${created.id}`, 200);
  } else {
    recorder.skip(CONFIG.PAGE_NAME.EXPERIMENT);
  }

  const resultsPath = `${expPath}${R.RESULTS_SUFFIX}`;
  const before = await stepIf(recorder, running, L.RESULTS_STATUS, async () => {
    const response = await send(baseUrl, 'GET', resultsPath, { cookie });
    return outcome(response.status === 200, `HTTP ${response.status}`, response.json);
  });
  await stepIf(recorder, before, L.RESULTS_COUNT, async () =>
    outcome(before.variants.length === 3, `count=${before.variants.length}`),
  );
  await stepIf(recorder, before, L.RESULTS_COMPARABLE, async () =>
    outcome(before.comparable === true, `comparable=${before.comparable}`),
  );
  await stepIf(recorder, before, L.RESULTS_EXPOSURE, async () =>
    outcome(sumExposures(before) >= 1, `exposures=${sumExposures(before)}`),
  );

  const idByKey = Object.fromEntries((updated?.variants ?? []).map((variant) => [variant.key, variant.id]));
  const conversionRates = Object.fromEntries(
    Object.entries(CONFIG.SIMULATE.RATES_BY_KEY).map(([key, rate]) => [idByKey[key] ?? key, rate]),
  );
  const simulated = await stepIf(recorder, running, L.SIMULATE_STATUS, async () => {
    const response = await send(baseUrl, 'POST', `${expPath}${R.SIMULATE_SUFFIX}`, {
      cookie,
      json: { visitorCount: CONFIG.SIMULATE.VISITOR_COUNT, conversionRates },
    });
    return outcome(response.status === 200, `HTTP ${response.status}`, response.json);
  });
  await stepIf(recorder, simulated, L.SIMULATE_PROCESSED, async () =>
    outcome(
      simulated.processedVisitors === CONFIG.SIMULATE.VISITOR_COUNT,
      `processed=${simulated.processedVisitors}`,
    ),
  );
  await stepIf(recorder, simulated, L.SIMULATE_RESULTS_GREW, async () => {
    const response = await send(baseUrl, 'GET', resultsPath, { cookie });
    const after = sumExposures(response.json);
    return outcome(after > sumExposures(before), `before=${sumExposures(before)} after=${after}`);
  });

  if (created !== null) {
    await step(recorder, L.NO_COOKIE_DENIED, async () => {
      const response = await send(baseUrl, 'GET', expPath);
      return outcome(response.status === 404, `HTTP ${response.status}`);
    });
  } else {
    recorder.skip(L.NO_COOKIE_DENIED);
  }
  return created;
}

/** 入力と未知の公開キーの検査。実験の作成結果に依存しない。 */
async function runNegativeChecks(recorder, baseUrl, cookie) {
  const L = CONFIG.MESSAGE.CHECK_LABEL;
  const R = CONFIG.ROUTES;
  await step(recorder, L.INVALID_JSON_STATUS, async () => {
    const response = await send(baseUrl, 'POST', R.EXPERIMENTS_API, { cookie, rawBody: '{' });
    return outcome(
      response.status === 400 && response.json?.error?.code === 'invalid_json',
      `HTTP ${response.status}`,
    );
  });
  await step(recorder, L.UNKNOWN_KEY_ASSIGN, async () => {
    const response = await send(baseUrl, 'GET', `${R.ASSIGN_PREFIX}${'0'.repeat(32)}${R.ASSIGN_SUFFIX}?visitor_id=pr2-visitor-003`);
    return outcome(response.status === 200 && response.json?.variant === null, `HTTP ${response.status}`);
  });
}

/** 全手順を実行する。 */
export async function runAll(recorder, baseUrl, demoListUrl) {
  const cookie = await runPageChecks(recorder, baseUrl, demoListUrl);
  await runExperimentFlow(recorder, baseUrl, demoListUrl, cookie);
  await runNegativeChecks(recorder, baseUrl, cookie);
}

async function main() {
  const recorder = new Recorder();
  const baseUrl = resolveBaseUrl(process.env.BASE_URL);
  const demoListUrl = resolveDemoListUrl(process.env[CONFIG.DEMO_LIST_URL_ENV]);
  console.log(CONFIG.MESSAGE.HEADER);
  console.log(`${CONFIG.MESSAGE.TARGET}: ${baseUrl}`);
  await runAll(recorder, baseUrl, demoListUrl);
  const { pass, fail, skip } = recorder.summary();
  console.log(
    `${CONFIG.MESSAGE.PREFIX_SUMMARY} ${CONFIG.MESSAGE.SUMMARY}: ${CONFIG.MESSAGE.PASS} ${pass} / ${CONFIG.MESSAGE.FAIL} ${fail} / ${CONFIG.MESSAGE.SKIP_SHORT} ${skip}`,
  );
  process.exitCode = fail > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[${CONFIG.MESSAGE.FAIL}] ${errorText(error)}`);
    process.exitCode = 1;
  });
}
