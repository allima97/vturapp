import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataContext } from './types';

const storage = new AsyncLocalStorage<DataContext>();

export function runWithDataContext<T>(context: DataContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getDataContext(): DataContext | null {
  return storage.getStore() ?? null;
}

export function requireDataContext(): DataContext {
  const context = getDataContext();
  if (!context?.db) {
    throw new Error('Banco D1 indisponivel nesta requisicao.');
  }
  return context;
}
