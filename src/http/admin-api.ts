import { STATUS_CODE } from '../config/http';
import type { ExperimentService } from '../services/experiment-service';
import { jsonResponse } from './responses';
import { readJsonBody } from './body';
import { toExperimentDto } from './dto';

/** 管理 API の各処理。所有者は呼び出し側で解決したセッション ID で絞り込む。 */
export interface AdminContext {
  readonly service: ExperimentService;
  readonly ownerSessionId: string;
  readonly request: Request;
  readonly experimentId: string;
}

export async function listExperiments(ctx: AdminContext): Promise<Response> {
  const aggregates = await ctx.service.listExperiments(ctx.ownerSessionId);
  return jsonResponse(STATUS_CODE.OK, { experiments: aggregates.map(toExperimentDto) });
}

export async function createExperiment(ctx: AdminContext): Promise<Response> {
  const body = await readJsonBody(ctx.request);
  const aggregate = await ctx.service.createExperiment(ctx.ownerSessionId, body);
  return jsonResponse(STATUS_CODE.CREATED, { experiment: toExperimentDto(aggregate) });
}

export async function getExperiment(ctx: AdminContext): Promise<Response> {
  const aggregate = await ctx.service.getOwnedExperiment(ctx.ownerSessionId, ctx.experimentId);
  return jsonResponse(STATUS_CODE.OK, { experiment: toExperimentDto(aggregate) });
}

export async function updateExperiment(ctx: AdminContext): Promise<Response> {
  const body = await readJsonBody(ctx.request);
  const aggregate = await ctx.service.updateExperiment(ctx.ownerSessionId, ctx.experimentId, body);
  return jsonResponse(STATUS_CODE.OK, { experiment: toExperimentDto(aggregate) });
}

export async function changeStatus(ctx: AdminContext): Promise<Response> {
  const body = await readJsonBody(ctx.request);
  const aggregate = await ctx.service.changeStatus(ctx.ownerSessionId, ctx.experimentId, body);
  return jsonResponse(STATUS_CODE.OK, { experiment: toExperimentDto(aggregate) });
}

export async function simulateTraffic(ctx: AdminContext): Promise<Response> {
  const body = await readJsonBody(ctx.request);
  const summary = await ctx.service.simulateTraffic(ctx.ownerSessionId, ctx.experimentId, body);
  return jsonResponse(STATUS_CODE.OK, summary);
}

export async function getResults(ctx: AdminContext): Promise<Response> {
  const summary = await ctx.service.results(ctx.ownerSessionId, ctx.experimentId);
  return jsonResponse(STATUS_CODE.OK, summary);
}
