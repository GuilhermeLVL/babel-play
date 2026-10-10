/**
 * AS OPÇÕES DA REVISÃO — o que a pessoa escolheu no diálogo "Opções da revisão".
 *
 * Moravam dentro de `Study.tsx`. A tela Cartões precisa das mesmas seis para dizer a verdade antes
 * de a rodada abrir (quantas cabem numa rodada, qual é a meta de retenção), então a leitura e a
 * gravação ficam num lugar só e as duas telas não discordam.
 *
 * Ficam no navegador (`localStorage`): não acompanham a pessoa entre aparelhos e os dois limites
 * valem POR RODADA, não por dia. O limite diário de verdade, guardado na conta, é fatia seguinte
 * (`openspec/changes/cartoes`).
 */

/** O tipo de cartão. O padrão, por decisão do dono, é "Lembrar". */
export type TipoDeCartao = 'lembrar' | 'digitar' | 'escolha';
export type OrdemDaRodada = 'vencidas' | 'misturar';

export interface OpcoesDaRevisao {
  novas: number;
  revisoes: number;
  ordem: OrdemDaRodada;
  tipo: TipoDeCartao;
  ouvir: boolean;
  retencao: number;
}

export const OPCOES_PADRAO: OpcoesDaRevisao = {
  novas: 20,
  revisoes: 200,
  ordem: 'vencidas',
  tipo: 'lembrar',
  ouvir: true,
  retencao: 90,
};

const CHAVE: Record<keyof OpcoesDaRevisao, string> = {
  tipo: 'revisao.tipoDeCartao',
  ouvir: 'revisao.ouvirAoMostrar',
  novas: 'revisao.novasPorDia',
  revisoes: 'revisao.revisoesPorDia',
  ordem: 'revisao.ordem',
  retencao: 'revisao.metaDeRetencao',
};

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

const numeroEntre = (v: string | null, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return v !== null && Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : padrao;
};

export function lerOpcoesDaRevisao(): OpcoesDaRevisao {
  const tipo = ler(CHAVE.tipo);
  return {
    novas: numeroEntre(ler(CHAVE.novas), 0, 200, OPCOES_PADRAO.novas),
    revisoes: numeroEntre(ler(CHAVE.revisoes), 10, 999, OPCOES_PADRAO.revisoes),
    ordem: ler(CHAVE.ordem) === 'misturar' ? 'misturar' : 'vencidas',
    tipo: tipo === 'digitar' || tipo === 'escolha' ? tipo : 'lembrar',
    ouvir: ler(CHAVE.ouvir) !== 'false',
    retencao: numeroEntre(ler(CHAVE.retencao), 80, 97, OPCOES_PADRAO.retencao),
  };
}

export function gravarOpcoesDaRevisao(mudou: Partial<OpcoesDaRevisao>): void {
  for (const [campo, valor] of Object.entries(mudou) as Array<[keyof OpcoesDaRevisao, string | number | boolean]>) {
    if (valor === undefined) continue;
    try {
      localStorage.setItem(CHAVE[campo], String(valor));
    } catch {
      /* sem armazenamento: a escolha vale só nesta abertura */
    }
  }
}

/**
 * Quantos cartões a rodada de agora leva, com o que vence e os dois limites: no máximo N novas e
 * M revisões (aprendendo conta como revisão). É a mesma conta de `startReviewSession`, em `Study`.
 */
export function tamanhoDaRodada(
  vence: { novas: number; aprendendo: number; revisar: number },
  opcoes: Pick<OpcoesDaRevisao, 'novas' | 'revisoes'>,
): number {
  return Math.min(vence.novas, opcoes.novas) + Math.min(vence.aprendendo + vence.revisar, opcoes.revisoes);
}
