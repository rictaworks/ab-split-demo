import { DEMO_LIST, GA4, CACHE_POLICY, CONTENT_TYPE, HEADER, STATUS_CODE } from '../config/http';
import { SERVICE_MESSAGE } from '../config/messages';
import { ConfigurationError, NotFoundError } from '../app/errors';
import type { AppDeps } from '../app/deps';
import { EXPERIMENT_LIMITS } from '../config/domain';
import { ExperimentService } from '../services/experiment-service';
import {
  renderExperimentPage,
  renderIndexPage,
  renderLegalPage,
  renderLpPage,
  renderManualPage,
  renderNotFoundPage,
} from '../views/pages';
import { htmlResponse } from './responses';
import { buildContentSecurityPolicy, newCspNonce } from './csp';
import { toExperimentDto } from './dto';
import { buildSnippetSource } from '../snippet/snippet';

/** GA4 の測定 ID を検証して返す。未設定・不正なら明示的に失敗する（既定値で代用しない）。 */
export function requireGa4MeasurementId(deps: AppDeps): string {
  const id = deps.ga4MeasurementId;
  if (id === null || !GA4.MEASUREMENT_ID_PATTERN.test(id)) {
    throw new ConfigurationError(SERVICE_MESSAGE.CONFIGURATION_ERROR('GA4_MEASUREMENT_ID'));
  }
  return id;
}

/** デモ一覧の URL を検証して返す。未設定・不正（http/https 以外、相対 URL、解析不能）なら明示的に失敗する。 */
export function requireDemoListUrl(deps: AppDeps): string {
  const value = deps.demoListUrl;
  if (value === null || value.trim() === '') {
    throw new ConfigurationError(SERVICE_MESSAGE.CONFIGURATION_ERROR('DEMO_LIST_URL'));
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigurationError(SERVICE_MESSAGE.CONFIGURATION_ERROR('DEMO_LIST_URL'));
  }
  if (!(DEMO_LIST.ALLOWED_PROTOCOLS as readonly string[]).includes(parsed.protocol)) {
    throw new ConfigurationError(SERVICE_MESSAGE.CONFIGURATION_ERROR('DEMO_LIST_URL'));
  }
  return parsed.href;
}

export async function renderIndex(
  service: ExperimentService,
  deps: AppDeps,
  ownerSessionId: string,
  setCookie: string | null,
): Promise<Response> {
  const ga4MeasurementId = requireGa4MeasurementId(deps);
  const demoListUrl = requireDemoListUrl(deps);
  const nonce = newCspNonce(deps.randomBytes);
  const aggregates = await service.listExperiments(ownerSessionId);
  const experiments = aggregates.map(toExperimentDto);
  const html = renderIndexPage({
    experiments,
    limitReached: aggregates.length >= EXPERIMENT_LIMITS.MAX_EXPERIMENTS_PER_SESSION,
    ga4MeasurementId,
    demoListUrl,
    nonce,
  });
  return pageResponse(STATUS_CODE.OK, html, nonce, setCookie);
}

export async function renderExperiment(
  service: ExperimentService,
  deps: AppDeps,
  ownerSessionId: string,
  experimentId: string,
  url: URL,
  setCookie: string | null,
): Promise<Response> {
  const ga4MeasurementId = requireGa4MeasurementId(deps);
  const demoListUrl = requireDemoListUrl(deps);
  const nonce = newCspNonce(deps.randomBytes);
  let aggregate;
  try {
    aggregate = await service.getOwnedExperiment(ownerSessionId, experimentId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return pageResponse(STATUS_CODE.NOT_FOUND, renderNotFoundPage(ga4MeasurementId, demoListUrl, nonce), nonce, setCookie);
    }
    throw error;
  }
  const results = await service.results(ownerSessionId, experimentId);
  const labels = Object.fromEntries(aggregate.variants.map((variant) => [variant.id, variant.label]));
  const html = renderExperimentPage({
    experiment: toExperimentDto(aggregate),
    results,
    labels,
    origin: url.origin,
    ga4MeasurementId,
    demoListUrl,
    nonce,
  });
  return pageResponse(STATUS_CODE.OK, html, nonce, setCookie);
}

export function renderLegal(deps: AppDeps): Response {
  const ga4MeasurementId = requireGa4MeasurementId(deps);
  const demoListUrl = requireDemoListUrl(deps);
  const nonce = newCspNonce(deps.randomBytes);
  return pageResponse(STATUS_CODE.OK, renderLegalPage(ga4MeasurementId, demoListUrl, nonce), nonce, null);
}

export function renderLp(deps: AppDeps): Response {
  const ga4MeasurementId = requireGa4MeasurementId(deps);
  const demoListUrl = requireDemoListUrl(deps);
  const nonce = newCspNonce(deps.randomBytes);
  return pageResponse(STATUS_CODE.OK, renderLpPage(ga4MeasurementId, demoListUrl, nonce), nonce, null);
}

export function renderManual(deps: AppDeps): Response {
  const ga4MeasurementId = requireGa4MeasurementId(deps);
  const demoListUrl = requireDemoListUrl(deps);
  const nonce = newCspNonce(deps.randomBytes);
  return pageResponse(STATUS_CODE.OK, renderManualPage(ga4MeasurementId, demoListUrl, nonce), nonce, null);
}

export function renderNotFound(deps: AppDeps): Response {
  const ga4MeasurementId = requireGa4MeasurementId(deps);
  const demoListUrl = requireDemoListUrl(deps);
  const nonce = newCspNonce(deps.randomBytes);
  return pageResponse(STATUS_CODE.NOT_FOUND, renderNotFoundPage(ga4MeasurementId, demoListUrl, nonce), nonce, null);
}

export function serveSnippet(): Response {
  return new Response(buildSnippetSource(), {
    status: STATUS_CODE.OK,
    headers: {
      [HEADER.CONTENT_TYPE]: CONTENT_TYPE.JAVASCRIPT,
      [HEADER.CACHE_CONTROL]: CACHE_POLICY.SNIPPET,
    },
  });
}

/** HTML 画面の応答。CSP は画面ごとの nonce から作り、JSON などほかの応答には付けない。 */
function pageResponse(status: number, html: string, nonce: string, setCookie: string | null): Response {
  return htmlResponse(status, html, {
    ...cookieHeader(setCookie),
    [HEADER.CONTENT_SECURITY_POLICY]: buildContentSecurityPolicy(nonce),
  });
}

function cookieHeader(setCookie: string | null): Record<string, string> {
  return setCookie === null ? {} : { [HEADER.SET_COOKIE]: setCookie };
}

