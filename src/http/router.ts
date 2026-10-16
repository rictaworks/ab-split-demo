import { API_CODE, HEADER, ROUTE, STATUS_CODE } from '../config/http';
import { SERVICE_MESSAGE } from '../config/messages';
import type { AppDeps } from '../app/deps';
import { ExperimentService } from '../services/experiment-service';
import * as admin from './admin-api';
import { CORS_HEADERS, assignVariant, preflight, recordConversion } from './tracking-api';
import { renderExperiment, renderIndex, renderLegal, renderLp, renderManual, renderNotFound, serveSnippet } from './pages';
import { resolveSession } from './session';
import { errorJson, toErrorResponse, withSecurityHeaders } from './responses';
import { trace } from '../infra/trace';

type Params = Readonly<Record<string, string>>;

interface Route {
  readonly pattern: string;
  readonly methods: Readonly<Record<string, (request: Request, url: URL, params: Params, deps: AppDeps) => Promise<Response>>>;
}

/** 管理 API の経路。所有者は Cookie のセッション ID で決まる。 */
function adminRoute(
  handler: (ctx: admin.AdminContext) => Promise<Response>,
): (request: Request, url: URL, params: Params, deps: AppDeps) => Promise<Response> {
  return async (request, _url, params, deps) => {
    const session = resolveSession(request, deps);
    const service = new ExperimentService(deps);
    const response = await handler({
      service,
      ownerSessionId: session.sessionId,
      request,
      experimentId: params['id'] ?? '',
    });
    if (session.setCookie !== null) {
      response.headers.set(HEADER.SET_COOKIE, session.setCookie);
    }
    return response;
  };
}

/** 画面の経路。所有者による絞り込みは ExperimentService が行う。 */
function pageRoute(
  handler: (
    service: ExperimentService,
    deps: AppDeps,
    ownerSessionId: string,
    setCookie: string | null,
    url: URL,
    params: Params,
  ) => Promise<Response>,
): (request: Request, url: URL, params: Params, deps: AppDeps) => Promise<Response> {
  return (request, url, params, deps) => {
    const session = resolveSession(request, deps);
    return handler(new ExperimentService(deps), deps, session.sessionId, session.setCookie, url, params);
  };
}

/** 計測の経路。Cookie を読まず、全オリジンを許可する。 */
function trackRoute(
  handler: (service: ExperimentService, request: Request, url: URL, publicKey: string) => Promise<Response>,
): (request: Request, url: URL, params: Params, deps: AppDeps) => Promise<Response> {
  return (request, url, params, deps) =>
    handler(new ExperimentService(deps), request, url, params['publicKey'] ?? '');
}

const ROUTES: readonly Route[] = [
  {
    pattern: ROUTE.EXPERIMENTS_API,
    methods: {
      GET: adminRoute(admin.listExperiments),
      POST: adminRoute(admin.createExperiment),
    },
  },
  {
    pattern: ROUTE.EXPERIMENT_API,
    methods: {
      GET: adminRoute(admin.getExperiment),
      PUT: adminRoute(admin.updateExperiment),
    },
  },
  { pattern: ROUTE.EXPERIMENT_STATUS_API, methods: { POST: adminRoute(admin.changeStatus) } },
  { pattern: ROUTE.EXPERIMENT_SIMULATE_API, methods: { POST: adminRoute(admin.simulateTraffic) } },
  { pattern: ROUTE.EXPERIMENT_RESULTS_API, methods: { GET: adminRoute(admin.getResults) } },
  {
    pattern: ROUTE.TRACK_ASSIGN,
    methods: {
      GET: trackRoute((service, _request, url, publicKey) => assignVariant(service, publicKey, url)),
    },
  },
  {
    pattern: ROUTE.TRACK_CONVERT,
    methods: {
      POST: trackRoute((service, request, _url, publicKey) => recordConversion(service, publicKey, request)),
    },
  },
  {
    pattern: ROUTE.INDEX,
    methods: {
      GET: pageRoute((service, deps, owner, setCookie) => renderIndex(service, deps, owner, setCookie)),
    },
  },
  {
    pattern: ROUTE.EXPERIMENT_PAGE,
    methods: {
      GET: pageRoute((service, deps, owner, setCookie, url, params) =>
        renderExperiment(service, deps, owner, params['id'] ?? '', url, setCookie),
      ),
    },
  },
  { pattern: ROUTE.LEGAL, methods: { GET: (_request, _url, _params, deps) => Promise.resolve(renderLegal(deps)) } },
  { pattern: ROUTE.LP, methods: { GET: (_request, _url, _params, deps) => Promise.resolve(renderLp(deps)) } },
  { pattern: ROUTE.MANUAL, methods: { GET: (_request, _url, _params, deps) => Promise.resolve(renderManual(deps)) } },
  { pattern: ROUTE.SNIPPET, methods: { GET: () => Promise.resolve(serveSnippet()) } },
];

/** パターン（:name を含む）と実パスを照合し、パラメータを返す。一致しなければ null。 */
export function matchPath(pattern: string, path: string): Params | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index]!;
    const actual = pathParts[index]!;
    if (expected.startsWith(':')) {
      if (actual.length === 0) {
        return null;
      }
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

/** Worker の fetch 入口。例外は応答に写し、文脈をログに残す。 */
export async function handleRequest(request: Request, deps: AppDeps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  trace('http.request', { method, path });
  try {
    const response = await dispatch(request, url, deps, method, path);
    return finish(response, path);
  } catch (error) {
    return finish(toErrorResponse(error, path), path);
  }
}

async function dispatch(
  request: Request,
  url: URL,
  deps: AppDeps,
  method: string,
  path: string,
): Promise<Response> {
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, path);
    if (params === null) {
      continue;
    }
    if (method === 'OPTIONS' && route.pattern.startsWith('/t/')) {
      return preflight();
    }
    const handler = route.methods[method];
    if (handler === undefined) {
      return errorJson(
        STATUS_CODE.METHOD_NOT_ALLOWED,
        API_CODE.METHOD_NOT_ALLOWED,
        SERVICE_MESSAGE.METHOD_NOT_ALLOWED(method),
      );
    }
    return handler(request, url, params, deps);
  }
  if (path.startsWith('/api/')) {
    return errorJson(STATUS_CODE.NOT_FOUND, API_CODE.NOT_FOUND, SERVICE_MESSAGE.UNKNOWN_ROUTE);
  }
  return renderNotFound(deps);
}

function finish(response: Response, path: string): Response {
  const secured = withSecurityHeaders(response);
  if (path.startsWith('/t/')) {
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      secured.headers.set(name, value);
    }
  }
  return secured;
}
