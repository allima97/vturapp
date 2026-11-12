import { describe, expect, it } from 'vitest';
import { importarTextoPassagem } from './importacao';

describe('importação inicial de passagens', () => {
  it('extrai localizador e segmentos de texto estruturado sem criar passageiros ou bilhetes', () => {
    const resultado = importarTextoPassagem(`LOC: ABC123
segmentos
Companhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 01:19
Companhia Outra ZQ 88 12/11/2026 - 17:50 13/11/2026 - 07:15 HK BBB - Bbb CCC - Ccc 781 10:25
passageiros
Nome não reconhecido`);
    expect(resultado.dados.localizador).toBe('ABC123');
    expect(resultado.dados.trechos).toEqual([
      {
        companhia: 'Companhia Exemplo',
        voo: 'XY 123',
        origem: 'AAA',
        destino: 'BBB',
        saida: '2026-11-12T15:00',
        chegada: '2026-11-12T16:19',
        status: 'HK',
        duracao: '01:19',
        classe: ''
      },
      {
        companhia: 'Companhia Outra',
        voo: 'ZQ 88',
        origem: 'BBB',
        destino: 'CCC',
        saida: '2026-11-12T17:50',
        chegada: '2026-11-13T07:15',
        status: 'HK',
        duracao: '10:25',
        classe: ''
      }
    ]);
    expect(resultado.dados.passageiros).toEqual([]);
    expect(resultado.avisos.join(' ')).toContain('campos não reconhecidos');
  });

  it('avisa explicitamente quando o formato não é reconhecido', () => {
    const resultado = importarTextoPassagem('reserva sem formato reconhecido');
    expect(resultado.dados).toEqual({ localizador: '', emissao: '', trechos: [], passageiros: [] });
    expect(resultado.avisos.join(' ')).toContain('Localizador não reconhecido');
    expect(resultado.avisos.join(' ')).toContain('Nenhum trecho reconhecido');
  });

  it('associa passageiros e assentos quando as colunas estão separadas por tabulações', () => {
    const resultado = importarTextoPassagem(`loc\tprazo de emissão\tprazo da reserva
ABC123\t---\t---
segmentos
Companhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 01:19 W
passageiros
ADT\tSOBRENOME EXEMPLO\tMARIA\tFeminino\tEmitida
assentos
SOBRENOME EXEMPLO/MARIA\t17D`);
    expect(resultado.dados.localizador).toBe('ABC123');
    expect(resultado.dados.trechos[0].classe).toBe('W');
    expect(resultado.dados.passageiros).toEqual([
      {
        nome: 'SOBRENOME EXEMPLO, MARIA',
        tipo: 'ADT',
        bilhete: '',
        status: 'Emitida',
        assentos: ['17D']
      }
    ]);
  });

  it('reconhece os tipos de passageiro da reserva', () => {
    const resultado = importarTextoPassagem(`passageiros
adt\tSOBRENOME\tADULTO\tX\tEmitida
CHD\tSOBRENOME\tCRIANCA\tX\tEmitida
inf\tSOBRENOME\tBEBE\tX\tEmitida`);
    expect(resultado.dados.passageiros.map((passageiro) => passageiro.tipo)).toEqual([
      'ADT',
      'CHD',
      'INF'
    ]);
  });

  it('reconhece duração quando o OCR acrescenta um caractere antes do horário', () => {
    const resultado = importarTextoPassagem(`segmentos
Companhia Exemplo XY 123 12/11/2026 - 15:00 12/11/2026 - 16:19 HK AAA - Aaa BBB - Bbb E90 D01:19`);
    expect(resultado.dados.trechos[0]?.duracao).toBe('01:19');
  });

  it('importa tabelas de venda CVC extraídas de PDF', () => {
    const resultado = importarTextoPassagem(`VENDA BILHETE A REO INTERNACIONAL
RESERVA CIA. AÉREA
Número   Provedor   Cia. Aérea   Localizador   Loc   Vôos Emiss o Status Solic.Cart o
33151336   CM   CM - COPA AIRLINES   ABC123   HST   HST
TRECHOS
V o   Aeroporto Origem   Partida   Aeroporto Destino   Chegada   Familia   Office Id
Cia.   N mero   Data   Hora   Data   Hora
CM   841   GRU - GUARULHOS   15/01/2027   01:30   PTY - PANAMA CITY   15/01/2027   06:17   Economy Classic
CM   805   PTY - PANAMA CITY   15/01/2027   07:33   MCO - ORLANDO   15/01/2027   11:00   Economy Classic
POLÍTICA DE MULTA
PASSAGEIROS
Nome   Sobrenome   Tipo   Assento   Tarifa
(sem as Taxas)   Taxa DU   Taxas   Bilhete   Data de
Nascimento
MARIA   EXEMPLO SILVA   ADT   4.228,86   296,02   305,45   25/01/1951
ANA   EXEMPLO SILVA   CHD   3.807,07   266,49   305,45   22/10/2018
CONTRATANTE`);
    expect(resultado.dados.localizador).toBe('ABC123');
    expect(resultado.dados.trechos).toEqual([
      expect.objectContaining({
        companhia: 'COPA AIRLINES',
        voo: 'CM 841',
        origem: 'GRU',
        destino: 'PTY',
        saida: '2027-01-15T01:30',
        chegada: '2027-01-15T06:17',
        classe: 'Econômica',
        tarifa: 'Classic',
        duracao: '',
        status: ''
      }),
      expect.objectContaining({
        companhia: 'COPA AIRLINES',
        voo: 'CM 805',
        origem: 'PTY',
        destino: 'MCO',
        saida: '2027-01-15T07:33',
        chegada: '2027-01-15T11:00',
        classe: 'Econômica',
        tarifa: 'Classic'
      })
    ]);
    expect(resultado.dados.passageiros).toEqual([
      { nome: 'MARIA EXEMPLO SILVA', tipo: 'ADT', bilhete: '', status: '', assentos: [] },
      { nome: 'ANA EXEMPLO SILVA', tipo: 'CHD', bilhete: '', status: '', assentos: [] }
    ]);
  });

  it('importa texto CVC sem separadores sem inventar nomes', () => {
    const resultado =
      importarTextoPassagem(`Reserva Cia. AéreaNúmeroProvedorCia. AéreaLocalizadorLocVôosEmiss oStatus Solic.Cart o33151336CMCM - COPA AIRLINESABC123![](https://example.test/editar.gif)HSTHST
TrechosV oAeroporto OrigemPartidaAeroporto DestinoChegadaFamiliaOffice IdCia.N meroDataHoraDataHora CM841GRU - GUARULHOS15/01/202701:30PTY - PANAMA CITY15/01/202706:17Economy ClassicCM805PTY - PANAMA CITY15/01/202707:33MCO - ORLANDO15/01/202711:00Economy Classic
Política de Multa
PassageirosNomeSobrenomeTipoAssentoTarifa (sem as Taxas)Taxa DUTaxasBilheteData de NascimentoMARIAEXEMPLO SILVAADT4.228,86296,02305,4525/01/1951ANACOSTACHD3.807,07266,49305,4522/10/2018
Contratante`);
    expect(resultado.dados.localizador).toBe('ABC123');
    expect(
      resultado.dados.trechos.map((trecho) => [
        trecho.voo,
        trecho.origem,
        trecho.destino,
        trecho.tarifa
      ])
    ).toEqual([
      ['CM 841', 'GRU', 'PTY', 'Classic'],
      ['CM 805', 'PTY', 'MCO', 'Classic']
    ]);
    expect(resultado.dados.passageiros.map((p) => [p.nome, p.tipo])).toEqual([
      ['MARIAEXEMPLO SILVA', 'ADT'],
      ['ANACOSTA', 'CHD']
    ]);
    expect(resultado.avisos.join(' ')).toContain('separação entre nome e sobrenome');
  });

  it('não inventa localizador a partir do nome da companhia nem associa assento a trecho', () => {
    const resultado = importarTextoPassagem(`RESERVA CIA. AÉREA
CM - COPA AIRLINES HST
TRECHOS
CM 841 GRU - GUARULHOS 15/01/2027 01:30 PTY - PANAMA CITY 15/01/2027 06:17 Economy Classic
PASSAGEIROS
Nome Sobrenome Tipo Assento Tarifa Data de Nascimento
MARIA   EXEMPLO   ADT   12A   4.228,86   25/01/1951
CONTRATANTE`);
    expect(resultado.dados.localizador).toBe('');
    expect(resultado.dados.passageiros).toEqual([
      { nome: 'MARIA EXEMPLO', tipo: 'ADT', bilhete: '', status: '', assentos: [] }
    ]);
    expect(resultado.avisos.join(' ')).toContain('Localizador não reconhecido');
  });

  it('não associa localizador nem companhia quando há reservas diferentes', () => {
    const resultado = importarTextoPassagem(`RESERVA CIA. AÉREA
CM - COMPANHIA EXEMPLO   ABC123   HST
XY - OUTRA COMPANHIA   DEF456   HST
TRECHOS
CM 841 GRU - GUARULHOS 15/01/2027 01:30 PTY - PANAMA CITY 15/01/2027 06:17 Economy Classic
PASSAGEIROS
Nome Sobrenome Tipo Data de Nascimento
CONTRATANTE`);
    expect(resultado.dados.localizador).toBe('');
    expect(resultado.dados.trechos[0]?.companhia).toBe('');
    expect(resultado.avisos.join(' ')).toContain('mais de uma reserva');
  });

  it('identifica reservas múltiplas também em texto concatenado', () => {
    const resultado = importarTextoPassagem(`Reserva Cia. Aérea
CMCM - COMPANHIA EXEMPLOABC123HSTXYXY - OUTRA COMPANHIADEF456HST
Trechos
Passageiros
Nome Sobrenome Tipo Data de Nascimento
Contratante`);
    expect(resultado.dados.localizador).toBe('');
    expect(resultado.avisos.join(' ')).toContain('mais de uma reserva');
  });

  it('não combina linhas de passageiros quando falta a data de nascimento', () => {
    const resultado = importarTextoPassagem(`RESERVA CIA. AÉREA
CM - COPA AIRLINES   ABC123   HST
TRECHOS
PASSAGEIROS
Nome Sobrenome Tipo Data de Nascimento
MARIA   EXEMPLO   ADT   4.228,86
ANA   EXEMPLO   CHD   3.807,07   22/10/2018
CONTRATANTE`);
    expect(resultado.dados.passageiros).toEqual([
      { nome: 'ANA EXEMPLO', tipo: 'CHD', bilhete: '', status: '', assentos: [] }
    ]);
  });

  it('mantém nome e sobrenome de colunas tabuladas na ordem original', () => {
    const resultado = importarTextoPassagem(`RESERVA CIA. AÉREA
CM - COMPANHIA EXEMPLO   ABC123   HST
TRECHOS
PASSAGEIROS
Nome\tSobrenome\tTipo\tAssento\tTarifa\tData de Nascimento
MARIA\tSILVA EXEMPLO\tADT\t\t4.228,86\t25/01/1951
ANA CLARA\tOUTRO SOBRENOME\tCHD\t\t3.807,07\t22/10/2018
CONTRATANTE`);
    expect(resultado.dados.passageiros.map((p) => p.nome)).toEqual([
      'MARIA SILVA EXEMPLO',
      'ANA CLARA OUTRO SOBRENOME'
    ]);
  });

  it('importa roteiro CVC concatenado cruzando nomes com a lista de reservas', () => {
    const resultado = importarTextoPassagem(`Consulta de Roteiro e Reserva
ContratanteNomePassageirosMaria Exemplo
Fornecedores
Transporte AéreoNúmero do AcordoTransporte AéreoCategoriaTrechoData InicialData Final3350602GolCLASSE TURÍSTICA(A/A)1234 - MCO/GRU
Dados da Reserva
PassageirosSobrenomeNomeNascimentoSexoIdadeLocal de EmbarqueObservaçãoSilva Exemplo Maria 25/01/1951Feminino76 MCO ![](https://example.test/plus.gif) Dados PessoaisOutro Sobrenome Ana 22/10/2018Feminino8 MCO ![](https://example.test/plus.gif) Dados Pessoais
Voo CVCCia.Malha AéreaNúmero do VooOrigemDestinoData de EmbarqueData de ChegadaTipoEquipamentoLocalizador GDSLocalizador Cia.Data de LiberaçãoFamíliaLoc**Acordo - MCO/GRU**G3 6064MCOMIA27/01/2027 20:0427/01/2027 21:24  ABC123ABC12305/11/2026CLASSIC![](https://example.test/editar.gif)G3 6011MIAGRU27/01/2027 22:5028/01/2027 09:25  ABC123ABC12305/11/2026CLASSIC![](https://example.test/editar.gif)
Reserva de Passagens AéreasTrecho(s)Passageiros(s)Localizador SGOLLocalizador Cia AéreaAssentoPrazo da Reserva AéreaSituaçãoGOL
ORLANDO/GUARULHOSOutro Sobrenome/AnaABC123ABC123  RESERVADASilva Exemplo/MariaABC123ABC123  RESERVADA
OrçamentoPreço`);
    expect(resultado.dados.localizador).toBe('ABC123');
    expect(resultado.dados.trechos).toEqual([
      expect.objectContaining({
        companhia: 'Gol',
        voo: 'G3 6064',
        origem: 'MCO',
        destino: 'MIA',
        saida: '2027-01-27T20:04',
        chegada: '2027-01-27T21:24',
        tarifa: 'CLASSIC',
        classe: 'Classe turística',
        status: '',
        duracao: ''
      }),
      expect.objectContaining({
        companhia: 'Gol',
        voo: 'G3 6011',
        origem: 'MIA',
        destino: 'GRU',
        saida: '2027-01-27T22:50',
        chegada: '2027-01-28T09:25',
        tarifa: 'CLASSIC'
      })
    ]);
    expect(resultado.dados.passageiros).toEqual([
      { nome: 'Maria Silva Exemplo', tipo: '', bilhete: '', status: '', assentos: [] },
      { nome: 'Ana Outro Sobrenome', tipo: '', bilhete: '', status: '', assentos: [] }
    ]);
    expect(resultado.avisos.join(' ')).toContain('não informa o tipo');
  });

  it('mantém localizador vazio quando voos têm localizadores diferentes e não inventa nomes', () => {
    const resultado = importarTextoPassagem(`Consulta de Roteiro e Reserva
Passageiros Sobrenome Nome Nascimento Sexo Idade Local de Embarque Observação
SILVA MARIA 25/01/1951 Feminino 76 MCO Dados Pessoais
Voo CVC Cia. Malha Aérea Número do Voo Origem Destino Data de Embarque Data de Chegada
G3 6064 MCO MIA 27/01/2027 20:04 27/01/2027 21:24 ABC123 ABC123 05/11/2026 CLASSIC
G3 6011 MIA GRU 27/01/2027 22:50 28/01/2027 09:25 DEF456 DEF456 05/11/2026 CLASSIC
Reserva de Passagens Aéreas
Orçamento`);
    expect(resultado.dados.localizador).toBe('');
    expect(resultado.dados.passageiros[0]?.nome).toBe('SILVA MARIA');
    expect(resultado.avisos.join(' ')).toContain('não foi possível separar');
    expect(resultado.avisos.join(' ')).toContain('não há um único valor');
  });

  it('interpreta as colunas separadas de sobrenome e nome em roteiro CVC', () => {
    const resultado = importarTextoPassagem(`Consulta de Roteiro e Reserva
Passageiros   Sobrenome   Nome   Nascimento   Sexo   Idade   Local de Embarque   Observação
SILVA EXEMPLO\tANA CLARA\t25/01/1951\tFeminino\t76\tMCO\tDados Pessoais
Voo CVC Cia.
Reserva de Passagens Aéreas`);
    expect(resultado.dados.passageiros[0]?.nome).toBe('ANA CLARA SILVA EXEMPLO');
  });

  it('não atribui companhia de fornecedor com rota diferente e usa localizador da companhia', () => {
    const resultado = importarTextoPassagem(`Consulta de Roteiro e Reserva
Fornecedores
3350602 Outra Companhia CLASSE TURÍSTICA (A/A) 1234 - AAA/BBB
Dados da Reserva
Passageiros Sobrenome Nome Nascimento Sexo Idade Local de Embarque Observação
SILVA\tMARIA\t25/01/1951\tFeminino\t76\tMCO Dados Pessoais
Voo CVC Cia.
G3 6064 MCO MIA 27/01/2027 20:04 27/01/2027 21:24 ABC123 XYZ456 05/11/2026 CLASSIC
Reserva de Passagens Aéreas
Orçamento`);
    expect(resultado.dados.localizador).toBe('XYZ456');
    expect(resultado.dados.trechos[0]?.companhia).toBe('');
    expect(resultado.dados.trechos[0]?.classe).toBe('');
    expect(resultado.avisos.join(' ')).toContain('não foi possível associá-las');
  });
});
