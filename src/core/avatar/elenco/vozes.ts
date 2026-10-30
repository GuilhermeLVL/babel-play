/**
 * VOZES DO ELENCO: personagem → voz do aparelho/nuvem, e emoção → parâmetros de fala.
 *
 * Determinístico: o mesmo elenco e as mesmas vozes dão sempre o mesmo resultado, em qualquer ordem de entrada.
 * NÃO infere gênero pelo nome (nem por pronome): a escolha vem do hash do nome ou do GOSTO da pessoa
 * (`gostos`). Para a voz de uma personagem não mudar de cena em cena, passe o elenco do LIVRO inteiro.
 */
import { type VozBase, type VozDaEmocao, vozDaEmocao } from '../emocao';
import { normalizar } from './texto';
import { CONFIANCA_MINIMA, type FraseMarcada } from './tipos';

export interface VozDisponivel {
  /** O `voiceName`/`voiceURI` que o motor aceita. */
  id: string;
  idioma?: string;
  /** A voz que a pessoa configurou como principal (a do narrador). */
  principal?: boolean;
}

export interface OpcoesDeVozes {
  idioma?: string;
  /** Id da voz do narrador (a configurada pela pessoa). Vence a marca `principal`. */
  vozPrincipal?: string;
  /** Escolhas da pessoa: nome da personagem → id da voz. Valem se a voz existe e não está em uso. */
  gostos?: Readonly<Record<string, string>>;
}

export interface DistribuicaoDeVozes {
  /** `null` quando não há nenhuma voz. */
  narrador: string | null;
  personagens: Record<string, string>;
  /** Personagens que dividem voz (só quando há menos vozes que personagens). */
  repetidas: string[];
}

/** FNV-1a de 32 bits sobre o nome normalizado: estável entre sessões e navegadores. */
export function hashDoNome(nome: string): number {
  const s = normalizar(nome).trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const idiomaBase = (i?: string) => (i ?? '').slice(0, 2).toLowerCase();

export function atribuirVozes(
  personagens: readonly string[],
  vozesDisponiveis: readonly VozDisponivel[],
  opcoes: OpcoesDeVozes = {},
): DistribuicaoDeVozes {
  const vistos = new Set<string>();
  const todas = vozesDisponiveis
    .filter((v) => v && typeof v.id === 'string' && v.id && !vistos.has(v.id) && vistos.add(v.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const base = idiomaBase(opcoes.idioma);
  const doIdioma = base ? todas.filter((v) => !v.idioma || idiomaBase(v.idioma) === base) : todas;
  const vozes = doIdioma.length ? doIdioma : todas;
  if (!vozes.length) return { narrador: null, personagens: {}, repetidas: [] };

  const narrador =
    vozes.find((v) => v.id === opcoes.vozPrincipal)?.id ?? vozes.find((v) => v.principal)?.id ?? vozes[0].id;
  /* Sem alternativa à voz do narrador, as personagens falam com ela. */
  const outras = vozes.filter((v) => v.id !== narrador).map((v) => v.id);
  const piscina = outras.length ? outras : [narrador];

  const nomes = [...new Set(personagens.filter((n) => typeof n === 'string' && n.trim()))];
  /* Ordem determinística, independente da entrada: por hash e depois pelo nome. */
  nomes.sort((a, b) => hashDoNome(a) - hashDoNome(b) || (a < b ? -1 : a > b ? 1 : 0));

  const resultado: Record<string, string> = {};
  const emUso = new Set<string>();
  /* Gosto da pessoa primeiro: é escolha dela, não pode perder para o hash. */
  for (const nome of nomes) {
    const gosto = opcoes.gostos?.[nome];
    if (gosto && piscina.includes(gosto) && !emUso.has(gosto)) {
      resultado[nome] = gosto;
      emUso.add(gosto);
    }
  }
  const repetidas: string[] = [];
  for (const nome of nomes) {
    if (resultado[nome]) continue;
    const ini = hashDoNome(nome) % piscina.length;
    let escolhida: string | null = null;
    for (let k = 0; k < piscina.length; k += 1) {
      const v = piscina[(ini + k) % piscina.length];
      if (!emUso.has(v)) {
        escolhida = v;
        break;
      }
    }
    if (escolhida === null) {
      escolhida = piscina[ini];
      repetidas.push(nome);
    }
    resultado[nome] = escolhida;
    emUso.add(escolhida);
  }
  return { narrador, personagens: resultado, repetidas: repetidas.sort() };
}

/**
 * Os parâmetros de fala de uma frase marcada. Reaproveita `vozDaEmocao` (M3: faixas curtas, nunca passa dos limites do
 * app). Marcação de pouca confiança fala neutra: errar para o neutro é melhor que dramatizar o trecho errado.
 */
export function parametrosDaEmocao(
  frase: Pick<FraseMarcada, 'emocao' | 'confianca'>,
  base: VozBase = {},
  temTom = true,
): VozDaEmocao {
  return vozDaEmocao(frase.confianca >= CONFIANCA_MINIMA ? frase.emocao : 'neutro', base, temTom);
}

/** A voz de uma frase: a da personagem só com confiança suficiente; senão a do narrador. */
export function vozDaFrase(frase: FraseMarcada, dist: DistribuicaoDeVozes): string | null {
  if (frase.falante.tipo === 'personagem' && frase.falante.nome && frase.confianca >= CONFIANCA_MINIMA) {
    return dist.personagens[frase.falante.nome] ?? dist.narrador;
  }
  return dist.narrador;
}
