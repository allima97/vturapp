/** Tipo estrutural usado por modulos compartilhados com o navegador. */
export interface DataClient {
  from: (table: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  auth: any;
  storage: any;
  channel: (name: string) => any;
  removeChannel: (channel?: unknown) => void;
}
