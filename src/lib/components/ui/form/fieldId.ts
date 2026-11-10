let fieldCounter = 0;

/**
 * Gera um ID único para campos de formulário.
 * Usado quando nenhum `id` explícito é passado ao componente.
 * Evita duplicação de IDs quando múltiplos campos têm o mesmo label.
 */
export function uniqueFieldId(label?: string | null): string {
  fieldCounter += 1;
  if (label) {
    const base = label
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    return `${base}-${fieldCounter}`;
  }
  return `field-${fieldCounter}`;
}
