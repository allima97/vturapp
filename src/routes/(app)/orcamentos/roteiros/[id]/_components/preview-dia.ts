import { escapeHtml } from '$lib/utils/html';
import { requiresPrintContinuation } from '$lib/utils/printLayout';
import type { RotDia } from './tipos';

export function renderPreviewDia(
  dia: RotDia,
  index: number,
  formatarData: (data: string) => string
) {
  const percurso = dia.percurso.trim();
  const longo = requiresPrintContinuation(dia.descricao || '') ? ' roteiro-card--long' : '';
  return `<tr class="${longo.trim()}"><td><article class="card roteiro-card${longo}">
          <h3>Dia ${index + 1}${percurso ? ` - ${escapeHtml(percurso)}` : ''}</h3>
          ${dia.data ? `<p class="meta">${escapeHtml(formatarData(dia.data))}</p>` : ''}
          ${dia.descricao ? `<p>${escapeHtml(dia.descricao).replace(/\n/g, '<br>')}</p>` : '<p class="empty">Sem descrição.</p>'}
        </article></td></tr>`;
}
