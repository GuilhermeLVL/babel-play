/**
 * AS FERRAMENTAS DE IA DO LEITOR e o estado de cada uma (spec `docs/specs/2026-10-28-leitor-ia-visivel.md`).
 *
 * A tela NUNCA esconde uma ferramenta: mostra-a e diz, em linguagem humana, se dá para usar agora ou por quê não.
 * Este módulo é a regra pura (sem React, rede ou DOM): recebe FATOS (flag, plano, conta, idade, cota, conexão) e
 * devolve `{ disponivel: true }` ou o MOTIVO. Quem decide de verdade é sempre o servidor (flag, plano, cota, idade);
 * isto só evita um clique que já se sabe que será recusado e explica a recusa. Os textos ficam na UI (`t()`).
 *
 * A ORDEM DOS MOTIVOS (a primeira que vale): em-breve (a flag está desligada) → entrar (sem conta) → idade (a nuvem
 * está restrita para a idade) → plano (o plano não inclui) → cota (acabou por hoje/neste mês) → sem-conexao.
 */

export const FERRAMENTAS_DE_IA = ['traduzir-trecho', 'traduzir-capitulo', 'explicar', 'parceiro'] as const;
export type FerramentaDeIa = (typeof FERRAMENTAS_DE_IA)[number];

export type MotivoIndisponivel = 'em-breve' | 'plano' | 'entrar' | 'cota' | 'idade' | 'sem-conexao';

/** Até quando vale a cota esgotada: o resto do dia ou do mês (a tela escolhe a frase). */
export type JanelaDaCota = 'dia' | 'mes';

export type EstadoDaFerramenta =
  | { disponivel: true }
  | { disponivel: false; motivo: MotivoIndisponivel; janela?: JanelaDaCota };

export interface FatosDasFerramentas {
  /** `ia_de_estudo` ligada (o servidor responde 404 `recurso_indisponivel` sem ela). */
  iaDeEstudoLigada: boolean;
  /** `parceiro_de_leitura` ligada. */
  parceiroLigado: boolean;
  /** Tem conta entrando, ou roda sem login por ser uma instância própria (self-host/dev local). */
  temConta: boolean;
  /** O plano é o Grátis (que tem a amostra de explicações por dia). */
  planoGratis: boolean;
  /** `explicacoesMes` do plano: `0` = não inclui; `null` = sem teto. */
  explicacoesMes: number | null;
  /** `parceiroDia` do plano: `0` = não inclui; `null` = sem teto. */
  parceiroDia: number | null;
  /** A nuvem está restrita pela idade (menor de 16 sem vínculo aceito, ou idade ainda não informada). */
  nuvemRestritaPelaIdade: boolean;
  /** O aparelho está com internet. */
  online: boolean;
  /** Ferramentas cuja cota o servidor já recusou nesta visita (402/429), e até quando. */
  cotaEsgotada?: Partial<Record<FerramentaDeIa, JanelaDaCota>>;
}

/** O servidor decide; esta é a leitura prévia, no cliente, do que se sabe. Tradução roda no aparelho: sempre disponível. */
export function estadoDaFerramenta(f: FerramentaDeIa, fatos: FatosDasFerramentas): EstadoDaFerramenta {
  if (f === 'traduzir-trecho' || f === 'traduzir-capitulo') return { disponivel: true };

  const ligada = f === 'explicar' ? fatos.iaDeEstudoLigada : fatos.parceiroLigado;
  if (!ligada) return { disponivel: false, motivo: 'em-breve' };
  if (!fatos.temConta) return { disponivel: false, motivo: 'entrar' };
  if (fatos.nuvemRestritaPelaIdade) return { disponivel: false, motivo: 'idade' };

  /* O Grátis tem a AMOSTRA de explicações (decidida pelo servidor); o resto do mundo sem cota no plano não tem. */
  const semNoPlano = f === 'explicar' ? fatos.explicacoesMes === 0 && !fatos.planoGratis : fatos.parceiroDia === 0;
  if (semNoPlano) return { disponivel: false, motivo: 'plano' };

  const esgotada = fatos.cotaEsgotada?.[f];
  if (esgotada) return { disponivel: false, motivo: 'cota', janela: esgotada };
  if (!fatos.online) return { disponivel: false, motivo: 'sem-conexao' };
  return { disponivel: true };
}

/** O estado de todas, na ordem em que a tela as lista. */
export function estadoDasFerramentas(fatos: FatosDasFerramentas): Record<FerramentaDeIa, EstadoDaFerramenta> {
  return {
    'traduzir-trecho': estadoDaFerramenta('traduzir-trecho', fatos),
    'traduzir-capitulo': estadoDaFerramenta('traduzir-capitulo', fatos),
    explicar: estadoDaFerramenta('explicar', fatos),
    parceiro: estadoDaFerramenta('parceiro', fatos),
  };
}

/**
 * O LIVRO COMO O PARCEIRO O PEDE: o do catálogo vai pelo id do CATÁLOGO (o aparelho guarda `cat:<id>`; o servidor só
 * conhece `<id>`), o trazido pela pessoa vai sem id nenhum. Um id `cat:` que o servidor não reconheça (derivado de um
 * id fora do formato) volta 404 `livro_inexistente`, e a tela já trata como pedido inválido.
 */
export function livroParaOParceiro(
  livroId: string,
  origemGuardada: string | undefined,
): { origem: 'catalogo'; id: string } | { origem: 'proprio' } {
  return origemGuardada === 'catalogo' && livroId.startsWith('cat:') && livroId.length > 4
    ? { origem: 'catalogo', id: livroId.slice(4) }
    : { origem: 'proprio' };
}

/** A recusa do servidor que esgota a cota (`FalhaDoParceiro`/`FalhaDaExplicacao`) → a janela, ou `null` se não é cota. */
export function janelaDaFalha(motivo: string): JanelaDaCota | null {
  if (motivo === 'uso_justo') return 'dia';
  if (motivo === 'cota_do_mes') return 'mes';
  return null;
}

/**
 * O "AJUSTAR NÍVEL" (openspec `leitura-assistida`, fatia D): a MESMA régua de motivos, mas FORA da lista `FERRAMENTAS_DE_IA`
 * de propósito. Com a flag `ia_ajustar_nivel` desligada, nenhuma entrada aparece (a lista do painel não muda); quem mostra o
 * ajuste (o balão e o painel novo) pergunta aqui, e as ações de 1 toque passam pelo MESMO estado.
 *
 * A ordem dos motivos é a de sempre: em-breve (flag) → entrar → idade → plano → cota → sem-conexao.
 */
export const ACOES_DO_AJUSTAR_NIVEL = ['ajustar', 'gramatica', 'resumo', 'exemplo', 'simplificar', 'elevar'] as const;
export type AcaoDoAjustarNivel = (typeof ACOES_DO_AJUSTAR_NIVEL)[number];

export interface FatosDoAjustarNivel {
  /** `ia_ajustar_nivel` ligada (o servidor responde 404 `recurso_indisponivel` sem ela). */
  flagLigada: boolean;
  temConta: boolean;
  /** A nuvem está restrita pela idade (menor de 16 sem vínculo aceito, ou idade ainda não informada). */
  nuvemRestritaPelaIdade: boolean;
  /** `ajustesDeNivelMes` do plano: `0` = não inclui; `null` = sem teto. */
  ajustesDeNivelMes: number | null;
  /** `ajustesDeCapituloMes` do plano: `0` = não inclui; `null` = sem teto. */
  ajustesDeCapituloMes: number | null;
  online: boolean;
  /** A cota que o servidor já recusou nesta visita (429), e até quando. */
  cotaEsgotada?: { nivel?: JanelaDaCota; capitulo?: JanelaDaCota };
}

/** O estado do ajuste de palavra, trecho e parágrafo (`capitulo: false`) ou do capítulo inteiro (`capitulo: true`). */
export function estadoDoAjustarNivel(f: FatosDoAjustarNivel, capitulo = false): EstadoDaFerramenta {
  if (!f.flagLigada) return { disponivel: false, motivo: 'em-breve' };
  if (!f.temConta) return { disponivel: false, motivo: 'entrar' };
  if (f.nuvemRestritaPelaIdade) return { disponivel: false, motivo: 'idade' };
  const teto = capitulo ? f.ajustesDeCapituloMes : f.ajustesDeNivelMes;
  if (teto === 0) return { disponivel: false, motivo: 'plano' };
  const esgotada = capitulo ? f.cotaEsgotada?.capitulo : f.cotaEsgotada?.nivel;
  if (esgotada) return { disponivel: false, motivo: 'cota', janela: esgotada };
  if (!f.online) return { disponivel: false, motivo: 'sem-conexao' };
  return { disponivel: true };
}

/**
 * O estado de cada ação do painel. Todas passam pelo MESMO estado (flag, entrar, idade, plano, cota, conexão): "Explicar a
 * gramática" e "Resumo até aqui" também, mesmo reusando as rotas que já existem, porque são ações do painel do ajuste.
 */
export function estadoDasAcoesDoAjuste(f: FatosDoAjustarNivel): Record<AcaoDoAjustarNivel, EstadoDaFerramenta> {
  const e = estadoDoAjustarNivel(f);
  return { ajustar: e, gramatica: e, resumo: e, exemplo: e, simplificar: e, elevar: e };
}
