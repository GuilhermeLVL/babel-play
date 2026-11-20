/**
 * O ELENCO NA NARRAÇÃO (M5): junta o marcador (quem fala, com que emoção), o mapa personagem → voz e os parâmetros de
 * fala numa decisão por frase. Puro: sem DOM, rede nem IA. O Narrador do leitor só pede o plano do capítulo e, a cada
 * frase, `falaDaFrase`; sem plano (elenco desligado, frase fora da lista) a fala é exatamente a de antes.
 */
import type { EmocaoDoAvatar } from '../estados';
import { marcarFrases } from './marcador';
import { TETO_DE_CARACTERES_DA_FRASE } from './texto';
import { CONFIANCA_MINIMA, type Falante, type FraseMarcada } from './tipos';
import { atribuirVozes, type DistribuicaoDeVozes, parametrosDaEmocao, vozDaFrase, type VozDisponivel } from './vozes';

export interface ConfigDoElenco {
  idioma?: string;
  /** Os nomes da ficha do livro (vazio = livro sem ficha: só há narrador). */
  personagens: readonly string[];
  vozes: readonly VozDisponivel[];
  /** A voz que a pessoa configurou para o narrador. */
  vozPrincipal?: string;
  /** Escolhas da pessoa: personagem → voz. */
  gostos?: Readonly<Record<string, string>>;
}

export interface PlanoDaFrase {
  falante: Falante;
  emocao: EmocaoDoAvatar;
  confianca: number;
  /** A voz da personagem; `null` = a voz do narrador (a que a pessoa já escolheu, sem `voiceName`). */
  voz: string | null;
}

export function montarDistribuicao(cfg: ConfigDoElenco): DistribuicaoDeVozes {
  return atribuirVozes(cfg.personagens, cfg.vozes, {
    ...(cfg.idioma ? { idioma: cfg.idioma } : {}),
    ...(cfg.vozPrincipal ? { vozPrincipal: cfg.vozPrincipal } : {}),
    ...(cfg.gostos ? { gostos: cfg.gostos } : {}),
  });
}

const PLANO_DO_NARRADOR: PlanoDaFrase = { falante: { tipo: 'narrador' }, emocao: 'neutro', confianca: 0, voz: null };

/** A marcação prévia só vale com a MESMA frase, confiança suficiente e personagem que existe na lista (nunca inventada). */
function previaAceita(
  p: FraseMarcada | null | undefined,
  personagens: readonly string[],
  texto: string,
): FraseMarcada | null {
  if (!p || p.texto !== texto || !(p.confianca >= CONFIANCA_MINIMA)) return null;
  if (p.falante.tipo === 'personagem' && !(p.falante.nome && personagens.includes(p.falante.nome))) return null;
  return p;
}

/** Um plano por frase, na MESMA ordem e quantidade da entrada. Nunca lança: o que falhar vira narrador/neutro. */
export function planejarElenco(
  textos: readonly string[],
  cfg: ConfigDoElenco,
  dist: DistribuicaoDeVozes = montarDistribuicao(cfg),
  previas?: readonly (FraseMarcada | null | undefined)[],
): PlanoDaFrase[] {
  /* O marcador parte frase > 600 em pedaços; cortar na entrada mantém o 1 para 1 com as frases do leitor. */
  const entrada = textos.map((t) =>
    t.length > TETO_DE_CARACTERES_DA_FRASE ? t.slice(0, TETO_DE_CARACTERES_DA_FRASE) : t,
  );
  let marcadas;
  try {
    marcadas = marcarFrases(entrada, { ...(cfg.idioma ? { idioma: cfg.idioma } : {}), personagens: cfg.personagens });
  } catch {
    return textos.map(() => PLANO_DO_NARRADOR);
  }
  if (marcadas.length !== textos.length) return textos.map(() => PLANO_DO_NARRADOR);
  return marcadas.map((heuristica, i) => {
    /* PONTO DE EXTENSÃO (função de IA `leitura_elenco`, ainda não implementada): uma marcação prévia VÁLIDA e confiante
       (arquivo do capítulo, IA do servidor) vence a heurística frase a frase; qualquer outra coisa cai nela. */
    const m = previaAceita(previas?.[i], cfg.personagens, textos[i]) ?? heuristica;
    const confiante = m.confianca >= CONFIANCA_MINIMA;
    const voz = m.falante.tipo === 'personagem' && confiante ? vozDaFrase(m, dist) : null;
    return {
      falante: confiante ? m.falante : { tipo: 'narrador' },
      emocao: confiante ? m.emocao : 'neutro',
      confianca: m.confianca,
      /* Voz igual à do narrador não precisa de `voiceName`: a escolha da pessoa já vale. */
      voz: voz && voz !== dist.narrador ? voz : null,
    };
  });
}

export interface FalaDaFrase {
  rate: number;
  pitch?: number;
  voiceName?: string;
}

/**
 * Os parâmetros do `speak` de uma frase. `temTom: false` (nuvem): a emoção mexe só no ritmo. `temVoz: false`: o motor
 * não escolhe voz por nome (nuvem), então não há `voiceName`. Sem plano: os parâmetros da pessoa, sem tirar nem pôr.
 */
export function falaDaFrase(
  plano: PlanoDaFrase | undefined,
  base: { rate: number; pitch?: number },
  motor: { temTom: boolean; temVoz: boolean },
): FalaDaFrase {
  if (!plano) return { rate: base.rate, ...(base.pitch !== undefined ? { pitch: base.pitch } : {}) };
  const p = parametrosDaEmocao(plano, base, motor.temTom);
  return {
    rate: p.rate,
    ...(p.pitch !== undefined ? { pitch: p.pitch } : {}),
    ...(plano.voz && motor.temVoz ? { voiceName: plano.voz } : {}),
  };
}
