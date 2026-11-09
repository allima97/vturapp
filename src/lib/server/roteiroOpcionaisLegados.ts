import { registroOpcionalIdValido } from '$lib/roteiroOpcionais';

async function idParaGrupo(roteiroId: string, revisao: string, indice: number, tentativa: number) {
  const entrada = JSON.stringify(['roteiro-opcional', roteiroId, revisao, indice, tentativa]);
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entrada))
  );
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function identificarOpcionaisLegados(
  value: unknown,
  roteiroId: string,
  revisao: string
): Promise<Record<string, unknown>[]> {
  if (!Array.isArray(value)) throw new Error('Opcionais salvos inválidos.');
  const ids = new Set<string>();
  const grupos: Record<string, unknown>[] = value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Grupo de opcionais salvo inválido.');
    const grupo = { ...item };
    if ('registro_id' in grupo) {
      if (!registroOpcionalIdValido(grupo.registro_id))
        throw new Error('Identificação salva do grupo de opcionais inválida.');
      const id = grupo.registro_id.toLowerCase();
      if (ids.has(id)) throw new Error('Identificação salva do grupo de opcionais duplicada.');
      ids.add(id);
      grupo.registro_id = id;
    }
    return grupo;
  });

  for (const [indice, grupo] of grupos.entries()) {
    if ('registro_id' in grupo) continue;
    let tentativa = 0;
    let id = await idParaGrupo(roteiroId, revisao, indice, tentativa);
    while (ids.has(id)) id = await idParaGrupo(roteiroId, revisao, indice, ++tentativa);
    ids.add(id);
    grupo.registro_id = id;
  }
  return grupos;
}
