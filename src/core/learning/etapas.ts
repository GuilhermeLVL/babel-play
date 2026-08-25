import type { CefrLevel } from './contract';
import { chaveDaPalavra, NIVEIS_CEFR, type DadoTrilha } from './trilha';

/**
 * ETAPAS DA TRILHA — um caminho com começo, meio e fim, em vez de um nível de 807 palavras.
 *
 * O PROBLEMA. A trilha existia como recorte por nível CEFR: escolher "A2" jogava sobre as 807
 * palavras do A2 de uma vez. Não havia noção de progresso dentro do nível, nem de "onde eu parei",
 * nem de próximo passo — e 807 é um número que não convida ninguém a começar.
 *
 * O NOME É HONESTO, E ESSA É A DECISÃO DIFÍCIL DESTE MÓDULO. O desenho de referência trazia etapas
 * temáticas ("Na escola", "Pedindo ajuda", "Explicando o que aconteceu"). O dado real (`en.json`) é
 * uma lista ALFABÉTICA vinda de listas de frequência CEFR — não há tema nenhum lá dentro. Batizar
 * uma fatia alfabética de "Na escola" produziria um rótulo plausível e falso, exatamente o que
 * `tests/semConteudoFabricado.test.ts` existe para barrar no resto do app. Então a etapa se chama
 * "A2 · etapa 7" e leva um subtítulo que diz a verdade sobre o que ela é: "28 palavras, de cost a
 * decide". O passo a passo do desenho fica igual; só o rótulo não mente.
 *
 * O CAMINHO CURADO JÁ ESTÁ ABERTO. `etapasDoNivel` lê `dado.etapas?.[nivel]` quando esse campo
 * existir e só cai no fatiamento quando não existe. Curar são ~150 nomes e a atribuição de ~4.000
 * palavras a temas — projeto de conteúdo, não de código. Quando ele acontecer, é só dado novo: nada
 * aqui muda.
 *
 * A FATIA É DETERMINÍSTICA, e isso não é detalhe. O `id` da etapa é a chave pela qual o progresso é
 * lido; se a fatia fosse embaralhada, "etapa 7" mudaria de conteúdo entre sessões e o progresso
 * passaria a apontar para palavras que nunca estiveram ali.
 */

/**
 * 28 palavras por etapa.
 *
 * Escolhido pelo tamanho da SESSÃO, não do nível: uma etapa deve caber em poucas rodadas de 8, para
 * que fechar uma seja algo que acontece de verdade. Como efeito, o A2 (807 palavras) dá 29 etapas.
 */
export const TAMANHO_PADRAO = 28;

export interface EtapaDaTrilha {
  /** `en:A2:07` — estável entre sessões. É a chave do progresso, então nunca é reordenado. */
  id: string;
  nivel: CefrLevel;
  /** 1-based: "etapa 7 de 29" é como a tela conta. */
  ordem: number;
  nome: string;
  /** O que a etapa É, dito sem inventar tema: "28 palavras, de cost a decide". */
  subtitulo: string;
  /** As palavras, na ordem do dado. */
  palavras: string[];
}

export interface ProgressoDaEtapa {
  etapa: EtapaDaTrilha;
  /** Quantas das palavras desta etapa já estão no seu caderno. */
  jaTem: number;
  total: number;
  pct: number;
  /** Quantas você acertou pelo menos uma vez, quando o histórico foi fornecido. */
  acertou?: number;
  estado: 'feita' | 'atual' | 'futura';
}

/**
 * O corte de "feita" é 80%, o MESMO de `nivelSugerido`.
 *
 * Não é coincidência nem cópia: as listas CEFR têm palavras raras que a pessoa pode nunca capturar,
 * e exigir 100% deixaria toda etapa eternamente aberta. Os dois lugares que decidem "isto está
 * fechado" precisam concordar, senão a trilha diz que o nível está pronto enquanto as etapas dele
 * seguem em aberto.
 */
export const CORTE_DE_FEITA = 0.8;

/** Dado da trilha que já traga etapas curadas. Ainda não existe — o tipo abre a porta. */
export interface DadoTrilhaComEtapas extends DadoTrilha {
  etapas?: Partial<Record<CefrLevel, Array<{ nome: string; palavras: string[] }>>>;
}

function rotuloDaFatia(palavras: string[]): string {
  const n = palavras.length;
  const quantas = `${n} ${n === 1 ? 'palavra' : 'palavras'}`;
  if (n < 2) return quantas;
  return `${quantas}, de ${palavras[0]} a ${palavras[n - 1]}`;
}

/**
 * As etapas de um nível.
 *
 * Devolve `[]` quando o nível não existe no dado — e não uma etapa vazia, que a tela desenharia
 * como um passo real que não leva a lugar nenhum.
 */
export function etapasDoNivel(
  dado: DadoTrilhaComEtapas,
  nivel: CefrLevel,
  opts: { tamanho?: number } = {},
): EtapaDaTrilha[] {
  const curadas = dado.etapas?.[nivel];
  if (curadas?.length) {
    return curadas.map((e, i) => ({
      id: `${dado.lang}:${nivel}:${String(i + 1).padStart(2, '0')}`,
      nivel,
      ordem: i + 1,
      nome: e.nome,
      subtitulo: rotuloDaFatia(e.palavras),
      palavras: e.palavras,
    }));
  }

  const lista = (dado.niveis[nivel] ?? []).map(par => par[0]);
  if (!lista.length) return [];

  const tamanho = Math.max(1, opts.tamanho ?? TAMANHO_PADRAO);
  const etapas: EtapaDaTrilha[] = [];

  for (let i = 0; i < lista.length; i += tamanho) {
    const palavras = lista.slice(i, i + tamanho);
    const ordem = etapas.length + 1;
    etapas.push({
      id: `${dado.lang}:${nivel}:${String(ordem).padStart(2, '0')}`,
      nivel,
      ordem,
      nome: `${nivel} · etapa ${ordem}`,
      subtitulo: rotuloDaFatia(palavras),
      palavras,
    });
  }

  return etapas;
}

/**
 * Onde você está em cada etapa.
 *
 * `jaTem` casa pela PALAVRA normalizada, como `progressoDaTrilha` — a tradução é o verso do cartão,
 * não a chave dele.
 *
 * `acertos` é opcional e vem do histórico de itens (`GET /api/exercises/historico`), que é indexado
 * por `item_ref` — a palavra. É por isso que o progresso da etapa é derivado por INTERSEÇÃO em vez
 * de a etapa entrar na `origem` gravada: `origem` é `trilha:<nivel>` e está persistida em
 * `exercise_results` desde sempre. Trocá-la por `trilha:<nivel>:<etapa>` faria todo o histórico
 * anterior deixar de casar — recordes zerados, itens já jogados voltando a "nunca caiu" — em troca
 * de nada que a interseção não resolva de graça.
 */
export function progressoDasEtapas(
  etapas: readonly EtapaDaTrilha[],
  jaTem: ReadonlySet<string>,
  acertos?: ReadonlySet<string>,
): ProgressoDaEtapa[] {
  const brutos = etapas.map(etapa => {
    const total = etapa.palavras.length;
    let tem = 0;
    let acertou = 0;
    for (const p of etapa.palavras) {
      const chave = chaveDaPalavra(p);
      if (jaTem.has(chave)) tem++;
      if (acertos?.has(chave)) acertou++;
    }
    return {
      etapa,
      jaTem: tem,
      total,
      pct: total ? Math.round((tem / total) * 100) : 0,
      acertou: acertos ? acertou : undefined,
      feita: total > 0 && tem / total >= CORTE_DE_FEITA,
    };
  });

  /**
   * "Atual" é a PRIMEIRA não feita, e só ela.
   *
   * Marcar todas as não feitas como atuais daria uma trilha sem "você está aqui" — que é a única
   * coisa que um caminho precisa dizer. As posteriores ficam `futura` mesmo que já tenham progresso
   * parcial: o progresso delas continua visível no número, sem competir pelo marcador.
   */
  const iAtual = brutos.findIndex(b => !b.feita);

  return brutos.map(({ feita, ...resto }, i) => ({
    ...resto,
    estado: feita ? 'feita' : i === iAtual ? 'atual' : 'futura',
  }));
}

/** A etapa em que a pessoa está agora, ou `null` quando o nível inteiro está fechado. */
export function etapaAtual(progresso: readonly ProgressoDaEtapa[]): EtapaDaTrilha | null {
  return progresso.find(p => p.estado === 'atual')?.etapa ?? null;
}

/**
 * "etapa 10 de 29" — a posição, para o cabeçalho da trilha e o card do lobby.
 *
 * Devolve `null` num nível sem etapas, para a tela não desenhar "etapa 0 de 0".
 */
export function posicaoNaTrilha(
  progresso: readonly ProgressoDaEtapa[],
): { atual: number; total: number } | null {
  if (!progresso.length) return null;
  const atual = progresso.find(p => p.estado === 'atual')?.etapa.ordem ?? progresso.length;
  return { atual, total: progresso.length };
}

/** Os níveis que o dado realmente traz, na ordem CEFR. Evita desenhar um C2 vazio. */
export function niveisComEtapas(dado: DadoTrilhaComEtapas): CefrLevel[] {
  return NIVEIS_CEFR.filter(n => (dado.niveis[n] ?? []).length > 0);
}
