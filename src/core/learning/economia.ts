/**
 * A ECONOMIA, DITA EM UMA TABELA.
 *
 * O DEFEITO QUE ISTO CONSERTA (medido em 2026-08-28): Seeds eram `palavrasCapturadas × 1 +
 * revisõesCertas × 4`, e "palavra capturada" é só a soma de palavras dos transcritos. Uma
 * importação de 325 palavras rendia 325 Seeds sem nenhuma ação; jogar não rendia Seed nenhuma;
 * presença, sequência e tempo de sessão não existiam. Com a Loja custando 30-400, quem só
 * capturava comprava metade do catálogo sem jogar.
 *
 * A REGRA AGORA É DADO. `REGRAS` é lida pelo cálculo (`xp.ts`) E pela tela "Como ganhar"
 * (`Conquistas.tsx`), então o que o app promete é, por construção, o que ele credita. Mudar um
 * número aqui muda os dois lados.
 *
 * RECOMPENSAS v2 (27/09): SÓ RESULTADO PAGA. Saíram a presença (abrir o app no dia) e os minutos
 * de captura — o Decreto 12.880/2026, art. 9º, trata prêmio por tempo como incentivo compulsivo.
 * Entraram a palavra salva da captura (teto diário), a meta do dia cumprida e o nível de maestria.
 * A ofensiva e os marcos de 7 dias passaram a contar DIAS DE PRÁTICA (revisão, rodada ou palavra
 * salva), nunca dias em que o app só foi aberto. Ritmo e preços: `docs/economia-v2.md`.
 */
import { PESOS_SEEDS, PESOS_XP } from './xp';

export interface RegraDeGanho {
  id: string;
  /** O que a pessoa faz. Redigido para a tela, sem jargão. */
  como: string;
  xp: number;
  seeds: number;
  /** Limite, quando existe. Também vai para a tela. */
  teto?: string;
  /** Unidade do ganho ("por revisão certa"). */
  unidade: string;
}

/**
 * PALAVRAS SALVAS PREMIADAS POR DIA (recompensas v2). Acima do teto a palavra continua entrando no
 * caderno e contando para o resto (cartão, conquistas), mas não rende a Seed extra: é o que impede
 * uma importação de 300 palavras de virar 300 Seeds.
 */
export const TETO_PALAVRAS_SALVAS_POR_DIA = 30;

/**
 * A REGRA PROVISÓRIA da meta do dia (onda 2): 20 acertos no dia. SUBSTITUÍDA na onda 5 pelas três
 * missões do dia (`src/core/missoes.ts`) — nenhuma rota confere mais isto. Fica só para a
 * simulação de ritmo (`scripts/economia/simular-ritmo.ts`), que usa os acertos como aproximação
 * de "dia típico com meta".
 */
export const META_DIARIA_ACERTOS = 20;

export const REGRAS: RegraDeGanho[] = [
  { id: 'sequencia7', como: 'Praticar 7 dias seguidos', xp: PESOS_XP.sequencia7, seeds: PESOS_SEEDS.sequencia7, teto: 'a cada 7 dias', unidade: 'por marco' },
  { id: 'palavraSalva', como: 'Salvar uma palavra nova da captura', xp: 0, seeds: PESOS_SEEDS.palavraSalva, teto: `até ${TETO_PALAVRAS_SALVAS_POR_DIA} por dia`, unidade: 'por palavra' },
  { id: 'metaDiaria', como: 'Cumprir a meta do dia', xp: PESOS_XP.metaDiaria, seeds: PESOS_SEEDS.metaDiaria, teto: '1× por dia', unidade: 'as 3 missões do dia' },
  { id: 'sessao', como: 'Salvar uma sessão e fichar ao menos uma palavra dela', xp: PESOS_XP.sessao, seeds: 0, unidade: 'por sessão' },
  { id: 'cartao', como: 'Fichar uma palavra no caderno', xp: PESOS_XP.cartao, seeds: PESOS_SEEDS.cartao, unidade: 'por palavra' },
  { id: 'revisaoCerta', como: 'Acertar uma revisão', xp: PESOS_XP.revisao + PESOS_XP.revisaoCerta, seeds: PESOS_SEEDS.revisaoCerta, unidade: 'por revisão certa' },
  { id: 'jogoCerto', como: 'Acertar um item de jogo', xp: PESOS_XP.itemDeJogo + PESOS_XP.itemDeJogoCerto, seeds: PESOS_SEEDS.jogoCerto, unidade: 'por acerto' },
  { id: 'rodadaPerfeita', como: 'Fechar uma rodada sem errar (3 estrelas)', xp: PESOS_XP.rodadaPerfeita, seeds: PESOS_SEEDS.rodadaPerfeita, unidade: 'por rodada' },
  { id: 'nivelDeMaestria', como: 'Subir de nível de maestria num jogo', xp: 0, seeds: PESOS_SEEDS.nivelDeMaestria, unidade: 'vezes o nível alcançado' },
  { id: 'conquista', como: 'Desbloquear uma conquista', xp: 0, seeds: 0, unidade: 'varia por conquista' },
];


/** Palavras PREMIADAS de um conjunto de dias: por dia, min(teto, palavras do dia). */
export function palavrasPremiadas(palavrasPorDia: Iterable<number>): number {
  let total = 0;
  for (const n of palavrasPorDia) total += Math.min(TETO_PALAVRAS_SALVAS_POR_DIA, Math.max(0, Math.floor(n)));
  return total;
}


/**
 * O FUSO DO USUÁRIO. O dia da meta, as missões, a ofensiva e o teto do baú são do dia LOCAL de
 * quem joga. O cliente manda o fuso dele; o servidor o GRAVA no primeiro uso e, dali em diante,
 * vale o gravado (`decidirFuso`). Sem nada gravado nem pedido válido, vale o de São Paulo.
 */
export const FUSO_PADRAO = 'America/Sao_Paulo';

/**
 * A CARÊNCIA DO FUSO (revisão de 27/09, P1): o fuso gravado só muda uma vez a cada 24 h. Enquanto o
 * fuso vinha em cada pedido, trocar de fuso a cada chamada dava um "dia novo" à vontade — três baús
 * a mais, outra meta do dia, outras missões. Quem viaja troca de fuso uma vez; quem trapaceia
 * trocaria a cada pedido.
 */
export const CARENCIA_DO_FUSO_MS = 24 * 60 * 60 * 1000;

export interface FusoGravado {
  fuso: string | null;
  /** Quando o fuso gravado passou a valer (ms). */
  desde: number | null;
}

/**
 * O FUSO QUE VALE, e se é preciso gravar um novo. Puro: o Express e o espelho sem conta decidem
 * com a mesma régua.
 *  · nada gravado + pedido válido → grava o pedido (o primeiro uso);
 *  · gravado + pedido válido e diferente + carência vencida → grava o pedido;
 *  · qualquer outro caso → vale o gravado (ou o padrão, sem nada gravado).
 */
export function decidirFuso(
  gravado: FusoGravado,
  pedido: string | null | undefined,
  agora: number,
): { fuso: string; gravar: { fuso: string; desde: number } | null } {
  const valido = pedido && fusoOuPadrao(pedido) === pedido ? pedido : null;
  const atual = gravado.fuso && fusoOuPadrao(gravado.fuso) === gravado.fuso ? gravado.fuso : null;
  if (!atual) return valido ? { fuso: valido, gravar: { fuso: valido, desde: agora } } : { fuso: FUSO_PADRAO, gravar: null };
  if (valido && valido !== atual && agora - (gravado.desde ?? 0) >= CARENCIA_DO_FUSO_MS) {
    return { fuso: valido, gravar: { fuso: valido, desde: agora } };
  }
  return { fuso: atual, gravar: null };
}

const fusosConferidos = new Map<string, boolean>();
export function fusoOuPadrao(fuso: string | null | undefined): string {
  if (!fuso || fuso.length > 64) return FUSO_PADRAO;
  let ok = fusosConferidos.get(fuso);
  if (ok === undefined) {
    try {
      // ast-grep-ignore: locale-cravado — locale de MÁQUINA: en-CA dá AAAA-MM-DD (chave de dia), en-GB dá HH:MM 24 h; ninguém lê este texto.
      new Intl.DateTimeFormat('en-CA', { timeZone: fuso });
      ok = true;
    } catch {
      ok = false;
    }
    fusosConferidos.set(fuso, ok);
  }
  return ok ? fuso : FUSO_PADRAO;
}

const formatosDeDia = new Map<string, Intl.DateTimeFormat>();
/** `AAAA-MM-DD` do carimbo no fuso dado — a chave do dia local de verdade, não a do servidor. */
export function diaNoFuso(ts: number, fuso: string): string {
  const f = fusoOuPadrao(fuso);
  let fmt = formatosDeDia.get(f);
  if (!fmt) {
    // ast-grep-ignore: locale-cravado — locale de MÁQUINA: en-CA dá AAAA-MM-DD (chave de dia), en-GB dá HH:MM 24 h; ninguém lê este texto.
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: f, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatosDeDia.set(f, fmt);
  }
  return fmt.format(new Date(ts));
}

/** O fuso de quem está no navegador (ou o padrão, fora dele). */
export function fusoDoAmbiente(): string {
  try {
    return fusoOuPadrao(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return FUSO_PADRAO;
  }
}

/** Quantos carimbos caem no dia `AAAA-MM-DD` do fuso. */
export function acertosNoDia(carimbos: Iterable<number>, dia: string, fuso: string): number {
  let n = 0;
  for (const t of carimbos) if (diaNoFuso(t, fuso) === dia) n += 1;
  return n;
}

const QUARTO_DE_HORA = 15 * 60 * 1000;
const deslocamentos = new Map<string, number>();
/**
 * O NÚMERO DO DIA de um carimbo NO FUSO dado — a mesma unidade de `diaLocal` e de `numeroDoDia`
 * (`AAAA-MM-DD` contado em dias desde 1970), mas no fuso do usuário, não no do processo. É o que a
 * ofensiva, os marcos e o teto de palavras usam no servidor (revisão de 27/09, P2: o servidor em
 * UTC contava o dia de quem estuda em São Paulo três horas adiantado).
 *
 * Rápido de propósito (o perfil passa por milhares de carimbos): o deslocamento do fuso é
 * constante dentro de um quarto de hora — todo fuso e toda troca de horário de verão caem em
 * múltiplos de 15 min —, então ele é calculado uma vez por quarto de hora e guardado.
 */
export function diaNumeroNoFuso(ts: number, fuso: string): number {
  const f = fusoOuPadrao(fuso);
  const quarto = Math.floor(ts / QUARTO_DE_HORA) * QUARTO_DE_HORA;
  const chave = `${f}|${quarto}`;
  let desloc = deslocamentos.get(chave);
  if (desloc === undefined) {
    const [a, m, d] = diaNoFuso(quarto, f).split('-').map(Number);
    const hm = horaNoFuso(quarto, f);
    desloc = Date.UTC(a, m - 1, d, hm[0], hm[1]) - quarto;
    if (deslocamentos.size > 20_000) deslocamentos.clear();
    deslocamentos.set(chave, desloc);
  }
  return Math.floor((ts + desloc) / 86_400_000);
}

const formatosDeHora = new Map<string, Intl.DateTimeFormat>();
function horaNoFuso(ts: number, fuso: string): [number, number] {
  let fmt = formatosDeHora.get(fuso);
  if (!fmt) {
    // ast-grep-ignore: locale-cravado — locale de MÁQUINA: en-CA dá AAAA-MM-DD (chave de dia), en-GB dá HH:MM 24 h; ninguém lê este texto.
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatosDeHora.set(fuso, fmt);
  }
  const [h, m] = fmt.format(new Date(ts)).split(':').map(Number);
  return [h % 24, m];
}

/** Dia local (número inteiro) de um carimbo: a unidade da presença e do teto de captura. */
export function diaLocal(ts: number): number {
  const d = new Date(ts);
  return Math.floor((ts - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

/**
 * Quantos MARCOS de 7 dias uma lista de dias de presença contém, somando todas as sequências.
 * Uma sequência de 15 dias vale 2 marcos; três sequências de 7 valem 3. O marco nunca é perdido
 * depois de ganho (é contado do histórico, não do estado atual): perder a sequência não cobra
 * de volta o que foi creditado.
 */
export function marcosDeSequencia(dias: Iterable<number>, tamanho = 7): number {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b);
  let marcos = 0;
  let corrida = 0;
  let anterior: number | null = null;
  for (const d of ordenados) {
    corrida = anterior !== null && d === anterior + 1 ? corrida + 1 : 1;
    if (corrida % tamanho === 0) marcos += 1;
    anterior = d;
  }
  return marcos;
}

/** Sequência ATUAL de dias (terminando hoje) e a MAIOR já feita. */
export function sequencias(dias: Iterable<number>, hoje: number): { atual: number; maior: number } {
  const set = new Set(dias);
  let atual = 0;
  for (let d = hoje; set.has(d); d -= 1) atual += 1;
  let maior = 0;
  let corrida = 0;
  let anterior: number | null = null;
  for (const d of [...set].sort((a, b) => a - b)) {
    corrida = anterior !== null && d === anterior + 1 ? corrida + 1 : 1;
    if (corrida > maior) maior = corrida;
    anterior = d;
  }
  return { atual, maior };
}
