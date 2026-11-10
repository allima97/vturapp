/**
 * Navegação por teclado das abas (padrão WAI-ARIA "Tabs"): setas esquerda e
 * direita (com volta ao início e ao fim), Home e End. Pula abas desabilitadas.
 * Retorna o índice da aba a ativar, ou null quando a tecla não é de navegação.
 */
export function nextTabIndex(
  items: ReadonlyArray<{ disabled?: boolean }>,
  current: number,
  key: string
): number | null {
  const enabled = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);
  if (enabled.length === 0) return null;
  if (key === 'Home') return enabled[0];
  if (key === 'End') return enabled[enabled.length - 1];
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const pos = enabled.indexOf(current);
  if (pos === -1) return key === 'ArrowRight' ? enabled[0] : enabled[enabled.length - 1];
  const step = key === 'ArrowRight' ? 1 : -1;
  return enabled[(pos + step + enabled.length) % enabled.length];
}

/** Índice que recebe tabindex=0 (a aba ativa ou, se nenhuma, a primeira habilitada). */
export function focusableTabIndex(
  items: ReadonlyArray<{ key: string; disabled?: boolean }>,
  activeKey: string
): number {
  const active = items.findIndex((item) => item.key === activeKey && !item.disabled);
  if (active >= 0) return active;
  return items.findIndex((item) => !item.disabled);
}
