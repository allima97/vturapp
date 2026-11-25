/**
 * Geração de roteiro com IA — tipos compartilhados entre a tela e o servidor.
 *
 * A IA só preenche os MESMOS campos do formulário do roteiro (dias, opcionais,
 * inclusões). Nada de layout: os PDFs Padrão e Moderno continuam os atuais.
 */

/** Pedido do consultor (nenhum dado pessoal do cliente). */
export type PedidoRoteiroIA = {
  /** Cidade de onde a viagem sai (ex.: "São Paulo"). */
  origem: string;
  /** Destinos na ordem desejada (ex.: ["Roma", "Barcelona", "Madri"]). */
  destinos: string[];
  /** AAAA-MM-DD */
  data_inicio: string;
  /** AAAA-MM-DD */
  data_fim: string;
  adultos: number;
  criancas: number;
  /** Ex.: "Casal em lua de mel", "Família com crianças pequenas". */
  perfil: string;
  observacoes: string;
};

export type DiaRoteiroIA = {
  cidade: string;
  cidade_id: string | null;
  cidade_pendente: boolean;
  cidade_modo_geografico?: boolean;
  /** AAAA-MM-DD */
  data: string;
  percurso: string;
  descricao: string;
};

export type OpcionalRoteiroIA = {
  cidade: string;
  cidade_id?: string;
  cidade_pendente?: boolean;
  cidade_modo_geografico?: boolean;
  passeios: { nome: string; descricao: string; data?: string }[];
};

/** Rascunho devolvido pelo servidor, já validado e limpo. */
export type RascunhoRoteiroIA = {
  nome: string;
  dias: DiaRoteiroIA[];
  opcionais: OpcionalRoteiroIA[];
  inclui_texto: string;
  nao_inclui_texto: string;
  /** O que ficou para o consultor conferir (cidades não encontradas etc.). */
  avisos: string[];
  /** Modelo que gerou, para referência. */
  modelo: string;
};

/** Como o rascunho entra no formulário. */
export type ModoAplicacaoIA = 'substituir' | 'juntar';

export const ROTEIRO_IA_MAX_DIAS = 45;
export const ROTEIRO_IA_MAX_DESTINOS = 12;
