import type { RequestEvent } from '@sveltejs/kit';

/**
 * Garante que `event.params` tenha os parâmetros da rota Hono (ex.: `:id`).
 *
 * Enquanto o +server.ts específico existir, o SvelteKit já preenche
 * event.params.id e os valores são os mesmos. Mas quando a requisição chega
 * pelo catch-all ([...path]), event.params seria { path: '...' } — por isso os
 * parâmetros da rota Hono têm prioridade.
 */
export function withRouteParams(event: RequestEvent, params: Record<string, string>): RequestEvent {
  if (!params || Object.keys(params).length === 0) return event;
  const merged = { ...event.params, ...params };
  return new Proxy(event, {
    get(target, prop, receiver) {
      if (prop === 'params') return merged;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
