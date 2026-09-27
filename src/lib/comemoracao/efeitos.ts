import { efeitoPorId, efeitoValeNoJogo, type MinigameId, type TipoDeEfeito } from '@core';

import { nivelCreditado } from '../maestriaPosse';
import type { PacoteDeEfeito } from './pacotes';

/**
 * AS RECEITAS DOS EFEITOS DE JOGO (recompensas v2, onda 3) — o DESENHO de cada efeito do catálogo
 * (`src/core/efeitosDeJogo.ts`).
 *
 * SÓ O MOTOR QUE JÁ EXISTE. Cada receita é uma rajada de `BURST_SPECS` (`kind`) com o que o
 * barramento já sabe sobrescrever: a forma (`FormaParticula`), a origem (`OrigemRajada`), a cor
 * por TOKEN do tema (nunca hex: o efeito acompanha os temas claro e escuro), a quantidade e a
 * gravidade — mais, quando faz sentido, o som. Nada de emoji, nada de canvas novo, nada de imagem.
 * A forma `cometa` fica de fora: é a assinatura de uma conquista (Partículas Cometa).
 *
 * O MODO LEVE vale para todos: `planoDeComemoracao` zera as rajadas com `reduzirEfeitos()` ou
 * movimento reduzido, e o efeito equipado vira o mesmo retorno discreto (som curto e o número).
 */

type Receita = PacoteDeEfeito;

/** Acertos: a rajada curta do item certo (base `xp`, 14 partículas). */
export const RECEITAS_DE_ACERTO: Record<string, Receita> = {
  // genéricos (Loja com Seeds)
  'acerto-pixel': { kind: 'xp', forma: 'pixel', cor: '--good' },
  'acerto-confete': { kind: 'xp', forma: 'confete', cor: '--accent', gravidade: 0.06 },
  'acerto-brasa': { kind: 'xp', forma: 'circulo', cor: '--warn', gravidade: -0.03 },
  'acerto-vapor': { kind: 'xp', forma: 'fumaca', cor: '--good', gravidade: -0.015 },
  'acerto-coracao': { kind: 'xp', forma: 'coracao', cor: '--accent', contagem: 10 },
  'acerto-raio': { kind: 'xp', forma: 'raio', cor: '--warn', contagem: 8, som: 'timeBonus' },
  // de maestria (nível 2 de cada jogo): um par forma × cor por jogo, contagem maior que o genérico
  'acerto-memory': { kind: 'xp', forma: 'confete', cor: '--good', contagem: 18, gravidade: 0.06 },
  'acerto-wordsearch': { kind: 'xp', forma: 'pixel', cor: '--accent', contagem: 18 },
  'acerto-blitz': { kind: 'xp', forma: 'raio', cor: '--warn', contagem: 10 },
  'acerto-termo': { kind: 'xp', forma: 'pixel', cor: '--good', contagem: 18 },
  'acerto-scramble': { kind: 'xp', forma: 'confete', cor: '--warn', contagem: 18, gravidade: 0.06 },
  'acerto-karaoke': { kind: 'xp', forma: 'coracao', cor: '--accent', contagem: 12, gravidade: -0.02 },
  'acerto-escuta': { kind: 'xp', forma: 'circulo', cor: '--good', contagem: 18, gravidade: -0.03 },
  'acerto-ditado': { kind: 'xp', forma: 'fumaca', cor: '--accent', contagem: 12, gravidade: -0.015 },
  'acerto-conectores': { kind: 'xp', forma: 'circulo', cor: '--warn', contagem: 18 },
  'acerto-karuta': { kind: 'xp', forma: 'confete', cor: '--accent', contagem: 18, gravidade: 0.06 },
  'acerto-choseong': { kind: 'xp', forma: 'pixel', cor: '--warn', contagem: 18 },
  'acerto-tenis': { kind: 'xp', forma: 'raio', cor: '--good', contagem: 10 },
  'acerto-koffer': { kind: 'xp', forma: 'circulo', cor: '--accent', contagem: 18 },
  'acerto-bao': { kind: 'xp', forma: 'coracao', cor: '--good', contagem: 12 },
  'acerto-vitendawili': { kind: 'xp', forma: 'fumaca', cor: '--warn', contagem: 12, gravidade: -0.015 },
  'acerto-shiritori': { kind: 'xp', forma: 'raio', cor: '--accent', contagem: 10 },
  'acerto-cadavre': { kind: 'xp', forma: 'fumaca', cor: '--good', contagem: 12, gravidade: -0.015 },
  'acerto-taboo': { kind: 'xp', forma: 'coracao', cor: '--warn', contagem: 12 },
};

/** Combos: o degrau do multiplicador (base `combo`, faísca quente). */
export const RECEITAS_DE_COMBO: Record<string, Receita> = {
  'combo-brasa': { kind: 'combo', forma: 'circulo', cor: '--warn', contagem: 26, gravidade: -0.03 },
  'combo-pixel': { kind: 'combo', forma: 'pixel', cor: '--accent', origem: 'travessia', contagem: 16 },
  'combo-trovao': { kind: 'combo', forma: 'raio', cor: '--warn', origem: 'cantos', contagem: 10, som: 'fever' },
  'combo-confete': { kind: 'combo', forma: 'confete', cor: '--good', origem: 'chuva', contagem: 30, gravidade: 0.05 },
};

/** Finalizações: a festa da rodada de três estrelas (base `perfeito`, 70 partículas). */
export const RECEITAS_DE_FINALIZACAO: Record<string, Receita> = {
  'finalizacao-memory': { kind: 'perfeito', forma: 'confete', origem: 'cantos', cor: '--good' },
  'finalizacao-wordsearch': { kind: 'perfeito', forma: 'pixel', origem: 'cantos', cor: '--good' },
  'finalizacao-blitz': { kind: 'perfeito', forma: 'raio', origem: 'cantos', cor: '--warn', contagem: 28, som: 'fever' },
  'finalizacao-termo': { kind: 'perfeito', forma: 'pixel', origem: 'chuva', cor: '--accent' },
  'finalizacao-scramble': { kind: 'perfeito', forma: 'confete', origem: 'travessia', cor: '--good' },
  'finalizacao-karaoke': { kind: 'perfeito', forma: 'coracao', origem: 'chuva', cor: '--accent', contagem: 40 },
  'finalizacao-escuta': { kind: 'perfeito', forma: 'circulo', origem: 'radial', cor: '--warn', gravidade: 0 },
  'finalizacao-ditado': {
    kind: 'perfeito',
    forma: 'fumaca',
    origem: 'radial',
    cor: '--accent',
    contagem: 36,
    gravidade: -0.015,
  },
  'finalizacao-conectores': { kind: 'perfeito', forma: 'circulo', origem: 'travessia', cor: '--good' },
  'finalizacao-karuta': { kind: 'perfeito', forma: 'confete', origem: 'cantos', cor: '--warn' },
  'finalizacao-choseong': { kind: 'perfeito', forma: 'pixel', origem: 'radial', cor: '--warn' },
  'finalizacao-tenis': { kind: 'perfeito', forma: 'circulo', origem: 'travessia', cor: '--warn' },
  'finalizacao-koffer': { kind: 'perfeito', forma: 'confete', origem: 'radial', cor: '--accent' },
  'finalizacao-bao': { kind: 'perfeito', forma: 'circulo', origem: 'chuva', cor: '--good' },
  'finalizacao-vitendawili': { kind: 'perfeito', forma: 'raio', origem: 'radial', cor: '--accent', contagem: 28 },
  'finalizacao-shiritori': { kind: 'perfeito', forma: 'pixel', origem: 'travessia', cor: '--accent' },
  'finalizacao-cadavre': { kind: 'perfeito', forma: 'coracao', origem: 'cantos', cor: '--warn', contagem: 40 },
  'finalizacao-taboo': {
    kind: 'perfeito',
    forma: 'fumaca',
    origem: 'cantos',
    cor: '--good',
    contagem: 36,
    gravidade: -0.015,
  },
};

export const RECEITAS: Record<TipoDeEfeito, Record<string, Receita>> = {
  'efeito-acerto': RECEITAS_DE_ACERTO,
  'efeito-combo': RECEITAS_DE_COMBO,
  finalizacao: RECEITAS_DE_FINALIZACAO,
};

/* ─────────────────────────── o que está equipado ─────────────────────────── */

const CHAVE = 'babel.efeitos_equipados';
const CAMPO: Record<TipoDeEfeito, 'acerto' | 'combo' | 'finalizacao'> = {
  'efeito-acerto': 'acerto',
  'efeito-combo': 'combo',
  finalizacao: 'finalizacao',
};

type Guardados = Partial<Record<'acerto' | 'combo' | 'finalizacao', string>>;

/** O que foi equipado, cru (sem conferir jogo nem posse). */
export function efeitosGuardados(): Guardados {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}') as unknown;
    return v && typeof v === 'object' ? (v as Guardados) : {};
  } catch {
    return {};
  }
}

/** Equipa um efeito (quem confere a posse é `equiparItem`). `'padrao'` volta ao efeito da casa. */
export function equiparEfeito(tipo: TipoDeEfeito, id: string): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ ...efeitosGuardados(), [CAMPO[tipo]]: id }));
  } catch {
    /* sem storage: o efeito volta ao padrão, o jogo segue */
  }
}

/* O JOGO EM CURSO. O acerto e o combo não dizem de que jogo vieram — a casca da rodada diz, ao
   montar (`CascaDaRodada`). O fim de rodada traz o próprio jogo no evento. */
let jogoEmCurso: MinigameId | null = null;

export function definirJogoEmCurso(jogo: MinigameId | null): void {
  jogoEmCurso = jogo;
}

export function jogoDaComemoracao(): MinigameId | null {
  return jogoEmCurso;
}

/**
 * O id que VALE para este tipo neste jogo: o equipado, se ele existe no catálogo, tem receita, a
 * maestria que o abre continua creditada e a regra de jogo deixa (`efeitoValeNoJogo`: o de
 * maestria vale no jogo de origem, e em qualquer jogo depois do nível 5 dele). Senão, `'padrao'`.
 */
export function efeitoQueVale(tipo: TipoDeEfeito, id: string | undefined, jogo: MinigameId | null): string {
  if (!id || id === 'padrao') return 'padrao';
  const efeito = efeitoPorId(id);
  if (!efeito || efeito.tipo !== tipo || !RECEITAS[tipo][id]) return 'padrao';
  if (efeito.jogo) {
    const nivelDaOrigem = nivelCreditado(efeito.jogo);
    const exigido = efeito.tipo === 'finalizacao' ? 4 : 2;
    if (nivelDaOrigem < exigido) return 'padrao';
    if (!efeitoValeNoJogo(efeito, jogo, nivelDaOrigem)) return 'padrao';
  }
  return id;
}
