import { writable } from 'svelte/store';

export type ConfirmVariant = 'primary' | 'danger';
export type ConfirmColor =
  | 'clientes'
  | 'orcamentos'
  | 'operacao'
  | 'financeiro'
  | 'vendas'
  | 'blue'
  | 'green'
  | 'orange'
  | 'teal';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ConfirmVariant;
  color?: ConfirmColor;
};

type ConfirmRequest = Required<Omit<ConfirmOptions, 'color'>> & {
  color: ConfirmColor;
};

let activeResolve: ((confirmed: boolean) => void) | null = null;

export const confirmState = writable<ConfirmRequest | null>(null);

function inferOptions(input: string | ConfirmOptions): ConfirmRequest {
  const base = typeof input === 'string' ? { message: input } : input;
  const message = String(base.message || '').trim();
  const lower = message.toLowerCase();

  let title = base.title || 'Confirmar ação';
  let confirmLabel = base.confirmLabel || 'Confirmar';
  let confirmVariant: ConfirmVariant = base.confirmVariant || 'primary';

  if (lower.includes('excluir')) {
    title = base.title || 'Confirmar exclusão';
    confirmLabel = base.confirmLabel || 'Excluir';
    confirmVariant = base.confirmVariant || 'danger';
  } else if (lower.includes('remover')) {
    title = base.title || 'Confirmar remoção';
    confirmLabel = base.confirmLabel || 'Remover';
    confirmVariant = base.confirmVariant || 'danger';
  } else if (lower.includes('cancelar') || lower.includes('cancelada')) {
    title = base.title || 'Confirmar cancelamento';
    confirmLabel = base.confirmLabel || 'Confirmar';
    confirmVariant = base.confirmVariant || 'danger';
  } else if (lower.includes('rejei')) {
    title = base.title || 'Confirmar rejeição';
    confirmLabel = base.confirmLabel || 'Rejeitar';
    confirmVariant = base.confirmVariant || 'danger';
  } else if (lower.includes('aprova')) {
    title = base.title || 'Confirmar aprovação';
    confirmLabel = base.confirmLabel || 'Aprovar';
  }

  return {
    title,
    message,
    confirmLabel,
    cancelLabel: base.cancelLabel || 'Cancelar',
    confirmVariant,
    color: base.color || 'financeiro'
  };
}

export function confirmAction(input: string | ConfirmOptions): Promise<boolean> {
  if (activeResolve) {
    activeResolve(false);
    activeResolve = null;
  }

  confirmState.set(inferOptions(input));

  return new Promise<boolean>((resolve) => {
    activeResolve = resolve;
  });
}

export function resolveConfirmAction(confirmed: boolean) {
  if (activeResolve) {
    activeResolve(confirmed);
    activeResolve = null;
  }
  confirmState.set(null);
}
