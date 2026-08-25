import { retrievability } from './scheduler';
import { nivelCefr } from './cefrWordlist';
import { NIVEIS_CEFR } from './trilha';
import type { CefrLevel } from './contract';
import type { VocabCard } from '../../types';

/**
 * FLUÊNCIA — o quanto você SUSTENTA de cada faixa CEFR, e o rótulo que sai disso.
 *
 * O QUE NÃO EXISTIA. O app tinha duas coisas parecidas com nível e nenhuma delas era sobre a
 * pessoa: a moda do CEFR das palavras capturadas (que diz o que você coletou, não o que você sabe)
 * e uma meta que o próprio usuário declara em Ajustes. Nunca houve estimativa do nível de quem
 * está usando o app.
 *
 * A MEDIDA É RETENÇÃO, NÃO POSSE. Ter mil palavras B1 no baralho não é saber B1 — metade delas
 * pode estar prestes a ser esquecida. O que este módulo mede é `retrievability(t, s)` do FSRS: a
 * probabilidade de você lembrar AGORA, a partir da estabilidade construída pelas suas revisões.
 * É o mesmo cálculo que a tela de Palavras já usa para dizer quais estão escapando.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * A REGRA, em uma frase: **o rótulo é a faixa mais alta que você sustenta a 80%, exigindo que
 * TODAS as faixas abaixo dela também estejam sustentadas.**
 *
 * A monotonicidade é o que a torna honesta. CEFR é cumulativo: ninguém "tem" B1 falhando A2. Sem
 * essa cláusula, cinco palavras B1 de sorte rotulariam alguém de B1 — e o número ao lado, na mesma
 * tela, mostraria A2 em 31%. A regra é exigente de propósito; um rótulo que a evidência ao lado
 * contradiz é pior que rótulo nenhum.
 *
 * O CORTE DE 80% NÃO É ESCOLHIDO AQUI. É o mesmo `CORTE_DE_FEITA` das etapas da trilha e o mesmo
 * de `nivelSugerido`. Os três decidem "isto está fechado" e precisam concordar, senão o app diz que
 * o nível está pronto enquanto as etapas dele seguem abertas.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * O NÍVEL DE CADA PALAVRA VEM DA WORDLIST, NUNCA DO BANCO. `vocab_cards.cefr_level` foi escrito
 * pelo `estimateCefr` DEPRECADO, que decidia nível por comprimento da string — 2.087 de 2.126
 * cartões com confiança abaixo de 0,5 e a distribuição invertida. Passá-lo como `curado` para
 * `nivelCefr` o promoveria a `confidence: 1` e lavaria o lixo. Enquanto não houver coluna de
 * procedência confiável, esta função recalcula tudo pela lista curada e IGNORA as duas colunas.
 *
 * É por isso que a base costuma ser pequena (na medição real, 149 de 1.902) — e é isso que `base` e
 * `confianca` existem para declarar. Com 8% de cobertura, o selo de baixa confiança da UI aparece
 * sozinho, sem ninguém precisar lembrar de acendê-lo.
 */

/**
 * Mínimo de cartões MEDIDOS para uma faixa receber número.
 *
 * Doze, e não os vinte de `duracao.ts`: ali a amostra é tempo humano cru, ruidoso por natureza;
 * aqui é saída de modelo (`retrievability` é suave e já incorpora o histórico de cada cartão).
 * Abaixo disso a média balança demais entre revisões, e uma faixa que oscila entre 40% e 80% a cada
 * sessão ensina a não confiar no número.
 */
export const MIN_CARTOES_POR_FAIXA = 12;

/** Com uma faixa só não há ordenação a verificar — e a regra do rótulo É sobre ordenação. */
export const MIN_FAIXAS_COM_EVIDENCIA = 2;

/** O mesmo corte de `etapas.ts` (`CORTE_DE_FEITA`) e de `nivelSugerido`. Não é cópia: é acordo. */
export const RETENCAO_DE_DOMINIO = 0.8;

const DIA = 86_400_000;

export interface FaixaDeFluencia {
  nivel: CefrLevel;
  /** Cartões desta faixa no baralho — medidos ou não. */
  naFaixa: number;
  /** Cartões com estabilidade FSRS, ou seja, com retenção calculável. */
  medidos: number;
  /** Média de `retrievability`. `null` quando `medidos < MIN_CARTOES_POR_FAIXA`. */
  retencao: number | null;
  /** Atingiu o corte de domínio? `false` também quando não há evidência. */
  sustentada: boolean;
}

export interface Fluencia {
  /** Só as faixas presentes no baralho, na ordem A1→C2. */
  faixas: FaixaDeFluencia[];
  /** `null` quando a evidência não sustenta afirmação nenhuma. */
  rotulo: CefrLevel | null;
  /** A REGRA em uma frase, para a tela poder mostrar por que o rótulo é esse. Nunca vazio. */
  motivo: string;
  /** Sobre o que a conta foi feita — alimenta `rotuloDaBase` de `Honestidade`. */
  base: { considerados: number; total: number };
  /** `considerados / total`. Alimenta `<Confianca>`; abaixo de 0,5 o selo âmbar acende sozinho. */
  confianca: number;
  /** Cartões cuja palavra não está na lista curada. Nunca imputados a faixa nenhuma. */
  semNivel: number;
}

export function fluenciaDoBaralho(
  cartas: readonly VocabCard[],
  opts: { agora?: number; lang?: string } = {},
): Fluencia {
  const agora = opts.agora ?? Date.now();

  const noDeck = cartas.filter(c => c.inDeck);
  const porNivel = new Map<CefrLevel, { retencoes: number[]; naFaixa: number }>();
  let semNivel = 0;

  for (const c of noDeck) {
    /* Sem `opts.curado`: ver o cabeçalho. A coluna do banco veio de um estimador depreciado que
       media comprimento de string, e promovê-la a curada lavaria o dado ruim. */
    const nivel = nivelCefr(c.word ?? '', opts.lang ?? c.srcLang ?? 'en').level;
    if (!nivel) { semNivel++; continue; }

    const entrada = porNivel.get(nivel) ?? { retencoes: [], naFaixa: 0 };
    entrada.naFaixa++;

    /* Sem estabilidade não há retenção — o cartão CONTA na faixa (ele existe) e não entra na média.
       Misturar "nunca revisado" com "revisado e esquecido" produziria um número sem significado. */
    const estabilidade = c.fsrsStability ?? c.stability;
    if (estabilidade != null && estabilidade > 0) {
      const dias = c.lastReview ? Math.max(0, (agora - c.lastReview) / DIA) : 0;
      entrada.retencoes.push(retrievability(dias, estabilidade));
    }
    porNivel.set(nivel, entrada);
  }

  const faixas: FaixaDeFluencia[] = NIVEIS_CEFR
    .filter(n => porNivel.has(n))
    .map(nivel => {
      const { retencoes, naFaixa } = porNivel.get(nivel)!;
      const temEvidencia = retencoes.length >= MIN_CARTOES_POR_FAIXA;
      const retencao = temEvidencia ? retencoes.reduce((a, b) => a + b, 0) / retencoes.length : null;
      return {
        nivel,
        naFaixa,
        medidos: retencoes.length,
        retencao,
        sustentada: retencao !== null && retencao >= RETENCAO_DE_DOMINIO,
      };
    });

  const considerados = faixas.reduce((n, f) => n + f.medidos, 0);
  const total = noDeck.length;
  const comEvidencia = faixas.filter(f => f.retencao !== null);

  const { rotulo, motivo } = derivarRotulo(faixas, comEvidencia.length);

  return {
    faixas,
    rotulo,
    motivo,
    base: { considerados, total },
    confianca: total > 0 ? considerados / total : 0,
    semNivel,
  };
}

/**
 * O rótulo e a frase que o explica, sempre juntos.
 *
 * A frase não é enfeite: é o que a tela mostra quando alguém pergunta "por que A2?". Um rótulo sem
 * a regra à vista é indistinguível de um chute, e este número fala sobre a pessoa — ela tem direito
 * de conferir a conta.
 */
function derivarRotulo(
  faixas: readonly FaixaDeFluencia[],
  quantasComEvidencia: number,
): { rotulo: CefrLevel | null; motivo: string } {
  if (!faixas.length) {
    return { rotulo: null, motivo: 'Nenhuma palavra do seu caderno está na lista de níveis conferidos.' };
  }
  if (quantasComEvidencia < MIN_FAIXAS_COM_EVIDENCIA) {
    return {
      rotulo: null,
      motivo: `Ainda não dá para resumir num nível: é preciso pelo menos ${MIN_CARTOES_POR_FAIXA} palavras revisadas em ${MIN_FAIXAS_COM_EVIDENCIA} faixas diferentes.`,
    };
  }

  /* Sobe enquanto sustenta, e PARA no primeiro buraco. A parada é a regra inteira: uma faixa alta
     sustentada depois de uma baixa que falha não conta — CEFR é cumulativo. */
  let alcancado: CefrLevel | null = null;
  let parouEm: FaixaDeFluencia | null = null;

  for (const f of faixas) {
    if (f.sustentada) { alcancado = f.nivel; continue; }
    parouEm = f;
    break;
  }

  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

  if (!alcancado) {
    const primeira = faixas[0];
    return {
      rotulo: null,
      motivo: `Você ainda não sustenta o ${primeira.nivel}: lembra ${pct(primeira.retencao)} dessas palavras, e o corte é ${Math.round(RETENCAO_DE_DOMINIO * 100)}%.`,
    };
  }

  const motivo = parouEm
    ? `Você sustenta o ${alcancado} (lembra ${pct(faixas.find(f => f.nivel === alcancado)!.retencao)} dessas palavras). O ${parouEm.nivel} ainda não entra: ${pct(parouEm.retencao)}, e o corte é ${Math.round(RETENCAO_DE_DOMINIO * 100)}%.`
    : `Você sustenta todas as faixas medidas, até o ${alcancado}, com pelo menos ${Math.round(RETENCAO_DE_DOMINIO * 100)}% de lembrança.`;

  return { rotulo: alcancado, motivo };
}

/** A frase curta para o cabeçalho. Espelha `rotuloDeDuracao`: cala quando não pode afirmar. */
export function rotuloDeFluencia(f: Fluencia): string {
  return f.rotulo ? `Você sustenta o ${f.rotulo}` : 'Ainda não dá para resumir num nível';
}
