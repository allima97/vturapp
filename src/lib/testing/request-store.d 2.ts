declare module '$test/request-store' {
  export function with_request_store<T>(store: { event: unknown; state: unknown }, fn: () => T): T;
}
