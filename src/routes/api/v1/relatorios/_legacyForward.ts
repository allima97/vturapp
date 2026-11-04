import type { RouteId as SvelteRouteId } from '$app/types';
import type { RequestEvent } from '@sveltejs/kit';

type RouteParams = Partial<Record<string, string>>;
type ReportGetHandler<Params extends RouteParams, RouteId extends SvelteRouteId> = (
  event: RequestEvent<Params, RouteId>
) => Response | Promise<Response>;

export function buildLegacyReportForwardUrl(event: RequestEvent) {
  const url = new URL(event.url);
  const inicio = url.searchParams.get('inicio');
  const fim = url.searchParams.get('fim');
  const companyId = url.searchParams.get('company_id');

  if (inicio && !url.searchParams.get('data_inicio')) url.searchParams.set('data_inicio', inicio);
  if (fim && !url.searchParams.get('data_fim')) url.searchParams.set('data_fim', fim);
  if (companyId && !url.searchParams.get('empresa_id'))
    url.searchParams.set('empresa_id', companyId);

  return url;
}

export function forwardLegacyReportRequest(event: RequestEvent) {
  return {
    ...event,
    url: buildLegacyReportForwardUrl(event)
  } as RequestEvent;
}

export function forwardLegacyReportGET<Params extends RouteParams, RouteId extends SvelteRouteId>(
  event: RequestEvent,
  handler: ReportGetHandler<Params, RouteId>
) {
  return handler(forwardLegacyReportRequest(event) as RequestEvent<Params, RouteId>);
}
