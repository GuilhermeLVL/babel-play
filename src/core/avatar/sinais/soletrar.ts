/**
 * SOLETRAÇÃO: texto + alfabeto -> sequência de passos `{letra, inicioMs, fimMs, pose}` e linha do tempo.
 *
 * Regras (herdadas do protótipo P2/P5, ver `RELATORIO-P5`):
 *  · velocidade escala todos os tempos; retenção por letra; letra com movimento retém 1,7x;
 *  · letra dupla: rebote (a mão avança 3,5 cm, afrouxa 30% os dedos e volta);
 *  · TETO DE TEMPO por fala: preenche por prioridade (nomes próprios primeiro, depois a ordem do texto) e toca
 *    na ordem do texto; o que não coube fica "não soletrada" (marcada por palavra, com o motivo);
 *  · palavra de UMA letra ("a", "é") não é soletrada nem gasta o teto à toa (motivo `uma_letra`);
 *  · números não suportados: pulados e marcados; caracteres desconhecidos viram pausa.
 *
 * Soletração do alfabeto manual: NÃO é tradução. As poses não foram revisadas por pessoas surdas.
 */
import { chaveDoDicionario, dicionarioDeSinais } from './dicionario';
import { type LetraNormalizada, normalizarTexto, type PalavraNormalizada } from './normalizar';
import { comDelta, espelharPose, misturar, poseDaLetra, poseDeDescanso, poseDeRepouso } from './pose';
import type {
  Alfabeto,
  ChaveDeTempo,
  DicionarioDeSinais,
  Limites,
  MotivoDeNaoSoletrar,
  PalavraDaFala,
  PassoDeSoletracao,
  PoseDeMao,
  Sequencia,
  Suavizacao,
} from './tipos';

export interface OpcoesDeSoletracao {
  /** Limites articulares (`limites.json`). */
  limites: Limites;
  /** Multiplicador de velocidade (0,25 a 4). Padrão 1. */
  velocidade?: number;
  /** Retenção da forma da letra, em ms (antes da velocidade). Padrão 450. */
  retencaoMs?: number;
  /** Transição entre letras. Padrão 300. */
  transicaoMs?: number;
  /** Pausa entre palavras. Padrão 400. */
  pausaMs?: number;
  /** Teto de tempo da fala inteira, em ms (já com a velocidade aplicada). Padrão 10 000. */
  tetoMs?: number;
  /** Só nomes próprios (palavras com inicial maiúscula fora do começo). */
  soNomesProprios?: boolean;
  /** Soletrar palavras de uma letra (padrão: não). */
  soletrarUmaLetra?: boolean;
  /** Mão canhota: espelha as poses e usa os ossos do lado esquerdo. */
  espelhar?: boolean;
  dicionario?: DicionarioDeSinais;
  /** Máximo de caracteres processados (o resto é cortado e marcado). Padrão 20 000. */
  maxCaracteres?: number;
}

export const PADROES = {
  velocidade: 1,
  retencaoMs: 450,
  transicaoMs: 300,
  pausaMs: 400,
  tetoMs: 10_000,
  maxCaracteres: 20_000,
  reboteMs: 200,
  tilMs: 360,
  fatorDeMovimento: 1.7,
  caudaMs: 350,
} as const;

interface Tempos {
  esc: number;
  tr: number;
  ret: number;
  pausa: number;
  bounce: number;
  til: number;
}

function temposDe(o: OpcoesDeSoletracao): Tempos {
  const v = Math.min(4, Math.max(0.25, Number.isFinite(o.velocidade) ? (o.velocidade as number) : PADROES.velocidade));
  const esc = 1 / v;
  return {
    esc,
    tr: (o.transicaoMs ?? PADROES.transicaoMs) * esc,
    ret: (o.retencaoMs ?? PADROES.retencaoMs) * esc,
    pausa: (o.pausaMs ?? PADROES.pausaMs) * esc,
    bounce: PADROES.reboteMs * esc,
    til: PADROES.tilMs * esc,
  };
}

/** Duração de uma letra (transição + retenção + til). Usada na estimativa E na construção: nunca divergem. */
function duracaoDaLetra(movimento: boolean, rebote: boolean, til: boolean, t: Tempos) {
  const trans = rebote ? t.bounce : t.tr;
  const ret = t.ret * (movimento ? PADROES.fatorDeMovimento : 1);
  return { trans, ret, til: til ? t.til : 0, total: trans + ret + (til ? t.til : 0) };
}

interface GrupoPronto {
  letras: LetraNormalizada[];
}

function letrasPresentes(p: PalavraNormalizada, alfabeto: Alfabeto, desconhecidos: Set<string>): GrupoPronto[] {
  return p.grupos
    .map((g) => ({
      letras: g.filter((l) => {
        if (alfabeto.letras[l.chave]) return true;
        desconhecidos.add(l.disp);
        return false;
      }),
    }))
    .filter((g) => g.letras.length > 0);
}

function duracaoDosGrupos(grupos: GrupoPronto[], alfabeto: Alfabeto, t: Tempos): number {
  let total = 0;
  grupos.forEach((g, gi) => {
    g.letras.forEach((l, k) => {
      const mov = alfabeto.letras[l.chave].movimento === true;
      total += duracaoDaLetra(mov, k > 0 && g.letras[k - 1].chave === l.chave, l.til, t).total;
    });
    if (gi < grupos.length - 1) total += t.tr + t.pausa;
  });
  return total;
}

/**
 * Quantas palavras ficaram sem soletrar. No modo "só nomes" (Intérprete) as palavras comuns não são soletradas DE
 * PROPÓSITO (a voz e a legenda as levam), então só conta o nome que não coube no teto de tempo.
 */
export function contarNaoSoletradas(palavras: readonly PalavraDaFala[], soNomesProprios: boolean): number {
  return palavras.filter((p) => p.estado === 'nao_soletrada' && (!soNomesProprios || p.motivo === 'teto')).length;
}

export function soletrar(texto: string, alfabeto: Alfabeto, opcoes: OpcoesDeSoletracao): Sequencia {
  const lim = opcoes.limites;
  const t = temposDe(opcoes);
  const max = opcoes.maxCaracteres ?? PADROES.maxCaracteres;
  const textoCortado = texto.length > max;
  const normal = normalizarTexto(textoCortado ? texto.slice(0, max) : texto, alfabeto.lingua);
  const desconhecidos = new Set(normal.desconhecidos);
  const dicionario = opcoes.dicionario ?? dicionarioDeSinais;
  const teto = opcoes.tetoMs ?? PADROES.tetoMs;
  const repouso = poseDeRepouso(lim);
  const descanso = poseDeDescanso(lim);
  const umaLetra = opcoes.soletrarUmaLetra === true;

  // 1) estado inicial de cada palavra
  const palavras: PalavraDaFala[] = normal.palavras.map((p, indice) => ({
    indice,
    texto: p.texto,
    estado: 'nao_soletrada',
    temNumeros: p.temNumeros,
  }));
  const gruposDe = new Map<number, GrupoPronto[]>();
  const candidatas: number[] = [];
  normal.palavras.forEach((p, i) => {
    const marcar = (m: MotivoDeNaoSoletrar) => {
      palavras[i].motivo = m;
    };
    if (dicionario[chaveDoDicionario(p.texto)]) return marcar('dicionario');
    const grupos = letrasPresentes(p, alfabeto, desconhecidos);
    const n = grupos.reduce((s, g) => s + g.letras.length, 0);
    if (n === 0) return marcar(p.temNumeros ? 'numero' : 'sem_letras');
    if (n === 1 && !umaLetra) return marcar('uma_letra');
    if (opcoes.soNomesProprios && !p.nomeProprio) return marcar('so_nomes');
    gruposDe.set(i, grupos);
    candidatas.push(i);
  });

  // 2) o teto de tempo é preenchido por prioridade (nomes próprios primeiro, depois a ordem do texto)
  const ordem = [...candidatas].sort(
    (a, b) => Number(normal.palavras[b].nomeProprio) - Number(normal.palavras[a].nomeProprio) || a - b,
  );
  const incluidas: number[] = [];
  let gasto = 0;
  let tetoAtingido = false;
  for (const i of ordem) {
    const d = duracaoDosGrupos(gruposDe.get(i) as GrupoPronto[], alfabeto, t);
    const juncao = incluidas.length ? t.tr + t.pausa : 0;
    if (gasto + juncao + d > teto) {
      palavras[i].motivo = 'teto';
      tetoAtingido = true;
      continue;
    }
    gasto += juncao + d;
    incluidas.push(i);
  }
  incluidas.sort((a, b) => a - b); // toca na ordem do texto

  // 3) linha do tempo
  const chaves: ChaveDeTempo[] = [];
  const passos: PassoDeSoletracao[] = [];
  const add = (tMs: number, pose: PoseDeMao, ease: Suavizacao = 'suave') => chaves.push({ tMs, pose, ease });
  add(0, repouso);
  let tt = 0;
  let ultimo: PoseDeMao = repouso;
  incluidas.forEach((pi, ordemDaPalavra) => {
    const grupos = gruposDe.get(pi) as GrupoPronto[];
    const inicioDaPalavra = tt;
    let indiceNaPalavra = 0;
    grupos.forEach((g, gi) => {
      g.letras.forEach((l, k) => {
        const dados = alfabeto.letras[l.chave];
        const base = poseDaLetra(dados, lim);
        const mov = dados.movimento === true;
        const rebote = k > 0 && g.letras[k - 1].chave === l.chave;
        const d = duracaoDaLetra(mov, rebote, l.til, t);
        const inicio = tt;
        if (rebote) {
          // letra dupla: a mão sai um pouco para a frente, relaxa os dedos 30% e volta
          const meio: PoseDeMao = {
            ...ultimo,
            a: ultimo.a.map((x) => x * 0.7),
            posicao: [ultimo.posicao[0], ultimo.posicao[1] - 0.012, ultimo.posicao[2] + 0.035],
          };
          tt += d.trans / 2;
          add(tt, meio);
          tt += d.trans / 2;
        } else tt += d.trans;
        const chegada = tt;
        add(tt, base);
        let fim = base;
        if (mov && dados.caminho) {
          for (const wp of dados.caminho) {
            fim = comDelta(base, wp, lim);
            add(chegada + d.ret * wp.t, fim, 'senoide');
          }
          tt = chegada + d.ret;
          if (chaves[chaves.length - 1].tMs < tt) add(tt, fim);
        } else {
          tt += d.ret;
          add(tt, base);
        }
        if (l.til) {
          // convenção (a confirmar com surdos): til = leve balanço lateral da mão
          const a = comDelta(fim, { dpos: [0.03, 0, 0] }, lim);
          const b = comDelta(fim, { dpos: [-0.03, 0.01, 0] }, lim);
          tt += d.til / 3;
          add(tt, a, 'senoide');
          tt += d.til / 3;
          add(tt, b, 'senoide');
          tt += d.til / 3;
          add(tt, fim, 'senoide');
        }
        passos.push({
          letra: l.disp,
          chave: l.chave,
          palavra: pi,
          indiceNaPalavra: indiceNaPalavra++,
          til: l.til,
          rebote,
          movimento: mov,
          inicioMs: inicio,
          chegadaMs: chegada,
          fimMs: tt,
          pose: base,
        });
        ultimo = fim;
      });
      if (gi < grupos.length - 1) {
        tt += t.tr;
        add(tt, descanso);
        tt += t.pausa;
        add(tt, descanso);
        ultimo = descanso;
      }
    });
    palavras[pi].estado = 'soletrada';
    palavras[pi].inicioMs = inicioDaPalavra;
    palavras[pi].fimMs = tt;
    if (ordemDaPalavra < incluidas.length - 1) {
      tt += t.tr;
      add(tt, descanso);
      tt += t.pausa;
      add(tt, descanso);
      ultimo = descanso;
    }
  });
  let duracaoMs = 0;
  if (passos.length) {
    tt += PADROES.caudaMs * t.esc;
    add(tt, repouso);
    duracaoMs = tt;
  }

  const espelhar = opcoes.espelhar === true;
  const m = (p: PoseDeMao) => (espelhar ? espelharPose(p) : p);
  return {
    lingua: alfabeto.lingua,
    passos: espelhar ? passos.map((p) => ({ ...p, pose: m(p.pose) })) : passos,
    palavras,
    chaves: espelhar ? chaves.map((c) => ({ ...c, pose: m(c.pose) })) : chaves,
    duracaoMs,
    tetoAtingido,
    desconhecidos: [...desconhecidos],
    numerosPulados: normal.palavras.some((p) => p.temNumeros),
    textoCortado,
    repouso: m(repouso),
    descanso: m(descanso),
  };
}

function suavizar(u: number, ease: Suavizacao): number {
  return ease === 'senoide' ? 0.5 - 0.5 * Math.cos(Math.PI * u) : u * u * u * (u * (u * 6 - 15) + 10);
}

export interface Amostra {
  pose: PoseDeMao;
  /** Índice do passo (letra) atual, ou -1 fora da soletração. */
  passo: number;
  /** Índice da palavra do texto que está sendo soletrada, ou -1. */
  palavra: number;
}

/**
 * A pose em `tMs`. Movimento reduzido (`reduzido`): SEM interpolação nem percurso; a mão salta de letra em
 * letra (a forma-base do passo vigente), vai ao descanso entre palavras e ao repouso no fim.
 */
export function amostrar(seq: Sequencia, tMs: number, opcoes: { reduzido?: boolean } = {}): Amostra {
  const K = seq.chaves;
  const passos = seq.passos;
  // passo vigente: o último que já começou a chegar
  let passo = -1;
  for (let i = 0; i < passos.length; i += 1) {
    const p = passos[i];
    if (tMs >= p.chegadaMs - 0.6 * (p.chegadaMs - p.inicioMs)) passo = i;
    else break;
  }
  const palavra = passo >= 0 && tMs < seq.duracaoMs ? passos[passo].palavra : -1;
  if (!passos.length) return { pose: seq.repouso, passo: -1, palavra: -1 };

  if (opcoes.reduzido) {
    if (passo < 0) return { pose: seq.repouso, passo, palavra: -1 };
    const p = passos[passo];
    if (tMs >= p.fimMs) {
      const prox = passos[passo + 1];
      if (!prox) return { pose: seq.repouso, passo, palavra: tMs < seq.duracaoMs ? p.palavra : -1 };
      if (prox.palavra !== p.palavra || (prox.inicioMs > p.fimMs && tMs < prox.inicioMs))
        return { pose: seq.descanso, passo, palavra };
    }
    return { pose: p.pose, passo, palavra };
  }

  if (tMs <= 0) return { pose: K[0].pose, passo, palavra };
  const ult = K[K.length - 1];
  if (tMs >= ult.tMs) return { pose: ult.pose, passo, palavra };
  let lo = 0;
  let hi = K.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (K[mid].tMs <= tMs) lo = mid;
    else hi = mid;
  }
  const a = K[lo];
  const b = K[hi];
  const u = (tMs - a.tMs) / Math.max(1e-6, b.tMs - a.tMs);
  return { pose: misturar(a.pose, b.pose, suavizar(u, b.ease)), passo, palavra };
}
