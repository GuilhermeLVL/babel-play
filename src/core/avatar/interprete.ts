/**
 * OS AVATARES DA CONVERSA (M4): regras puras do Intérprete com avatar. Sem React, sem DOM, sem rede.
 *
 * O avatar é COMPLEMENTO: a legenda em texto continua sendo o conteúdo e nunca depende dele. Aqui ficam
 *  · o mapa fase da conversa -> estado de cada avatar (ouvindo, pensando, falando);
 *  · as preferências locais (quem aparece, tamanho, rosto/mãos, economia, anúncio por voz) e a validação delas;
 *  · a política: quando os avatares aparecem, com qual tier, e quando cai no fallback 2D.
 *
 * Os dois lados do motor são `meu` e `outro`. O DONO de cada metade da tela (`meu` = a pessoa, `outro` = a outra
 * pessoa, que é quem o intérprete representa) troca de lugar quando a pessoa "troca os lados". O avatar do lado `meu`
 * usa a receita da pessoa; o do lado `outro` usa o avatar-intérprete (escolha da coleção curada), porque o app não
 * tem foto nem aparência da outra pessoa e não deve ter.
 */
import type { EstadoDoAvatar } from './estados';
import {
  type EscolhaDeAlfabeto,
  ESCOLHAS_DE_ALFABETO,
  type RitmoDaSoletracao,
  RITMOS_DA_SOLETRACAO,
} from './sinais/soletracaoDoInterprete';
import { limitarTier, type TierDoAvatar } from './tiers';

export type LadoDaConversa = 'meu' | 'outro';

/** O que o estado do controle do intérprete tem de saber, sem importar o controle (o core não importa de `lib`). */
export interface EntradaDoEstadoDaConversa {
  fase: 'parado' | 'ouvindo' | 'traduzindo' | 'falando';
  /** O lado que o microfone abriu (modo por toque); `null` no automático e parado. */
  lado: LadoDaConversa | null;
  /** O modo automático está ouvindo a conversa (ninguém toca em lado). */
  automatico: boolean;
  /** A fala da fila de voz em curso: quem falou originalmente e se a voz realmente começou. */
  falando: { lado?: LadoDaConversa | undefined } | null;
}

/**
 * O estado do avatar de UM lado do motor.
 *
 *  · `ouvindo`: o microfone está aberto neste lado (por toque) ou no automático, em que os dois ouvem; e, enquanto a voz
 *    lê a tradução, o lado de quem OUVE a tradução também fica `ouvindo`;
 *  · `pensando`: traduzindo (o lado que falou, ou os dois no automático);
 *  · `falando`: o lado de quem disse a frase, enquanto a voz (já traduzida) toca. É a boca que "fala por ele".
 *
 * `vozTocando` é a verdade do motor de voz (`ligarAvatarAFala`): a fase `falando` do controle começa antes do primeiro
 * som, e o avatar só mexe a boca quando o som sai.
 */
export function estadoDoLadoNaConversa(
  lado: LadoDaConversa,
  e: EntradaDoEstadoDaConversa,
  vozTocando: boolean,
): EstadoDoAvatar {
  const dono = e.falando?.lado;
  // Toque no texto (leitura manual) não muda a fase da conversa, mas a voz toca: o avatar de quem disse acompanha.
  if (dono && (e.fase === 'falando' || vozTocando)) {
    if (dono === lado) return vozTocando ? 'falando' : 'pensando';
    return 'ouvindo';
  }
  if (e.fase === 'traduzindo') return e.automatico || e.lado === lado ? 'pensando' : 'parado';
  if (e.fase === 'ouvindo') return e.automatico || e.lado === lado ? 'ouvindo' : 'parado';
  return 'parado';
}

/** Quem aparece. `outro` é o avatar-intérprete (o app não desenha a outra pessoa). */
export type QuemAparece = 'ambos' | 'meu' | 'interprete' | 'nenhum';
export const OPCOES_DE_QUEM: readonly QuemAparece[] = ['ambos', 'meu', 'interprete', 'nenhum'];

export type TamanhoDoAvatar = 'p' | 'm' | 'g';
export const TAMANHOS_DO_AVATAR: readonly TamanhoDoAvatar[] = ['p', 'm', 'g'];

/**
 * O que mostrar: "só rosto", "só mãos" ou AUTOMÁTICO (o padrão: mãos enquanto a soletração está ativa, rosto no resto).
 * Só mãos exige a flag `avatar_sinais` (e continua rotulado como demonstração). Escolha explícita vence o automático.
 */
export type FocoDoAvatar = 'auto' | 'rosto' | 'maos';

export interface PreferenciasDosAvatares {
  quem: QuemAparece;
  tamanho: TamanhoDoAvatar;
  foco: FocoDoAvatar;
  /** Modo economia: nenhum avatar, a tela volta ao layout de antes. */
  economia: boolean;
  /** Região viva (`aria-live`) que anuncia quando o avatar fala. DESLIGADA por padrão: a legenda já é lida. */
  anunciar: boolean;
  /** "Soletrar nomes e palavras sem sinal" (flag `avatar_sinais`). DESLIGADA por padrão. */
  soletrar: boolean;
  /** "Soletrar tudo": as mãos soletram todas as palavras da fala, não só os nomes próprios. DESLIGADA por padrão. */
  soletrarTudo: boolean;
  /** Libras ou ASL: no automático vem do idioma da outra pessoa. */
  alfabeto: EscolhaDeAlfabeto;
  /** Mão canhota: espelha as poses e usa a mão esquerda. */
  espelhar: boolean;
  ritmo: RitmoDaSoletracao;
}

export const PREFERENCIAS_PADRAO: Readonly<PreferenciasDosAvatares> = Object.freeze({
  quem: 'ambos',
  tamanho: 'm',
  foco: 'auto',
  economia: false,
  anunciar: false,
  soletrar: false,
  soletrarTudo: false,
  alfabeto: 'auto',
  espelhar: false,
  ritmo: 'normal',
});

const um = <T extends string>(lista: readonly T[], v: unknown, padrao: T): T =>
  typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : padrao;

/** Aceita qualquer coisa guardada (campo ausente, tipo errado, valor futuro) e devolve preferências válidas. */
export function validarPreferencias(bruto: unknown): PreferenciasDosAvatares {
  const o = bruto !== null && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {};
  return {
    quem: um(OPCOES_DE_QUEM, o.quem, PREFERENCIAS_PADRAO.quem),
    tamanho: um(TAMANHOS_DO_AVATAR, o.tamanho, PREFERENCIAS_PADRAO.tamanho),
    foco: um<FocoDoAvatar>(['auto', 'rosto', 'maos'], o.foco, PREFERENCIAS_PADRAO.foco),
    economia: o.economia === true,
    anunciar: o.anunciar === true,
    soletrar: o.soletrar === true,
    soletrarTudo: o.soletrarTudo === true,
    alfabeto: um(ESCOLHAS_DE_ALFABETO, o.alfabeto, PREFERENCIAS_PADRAO.alfabeto),
    espelhar: o.espelhar === true,
    ritmo: um(RITMOS_DA_SOLETRACAO, o.ritmo, PREFERENCIAS_PADRAO.ritmo),
  };
}

/** Pixels do lado do quadrado do avatar. No celular as duas metades dividem a altura, então o teto é menor. */
export function ladoDoAvatarEmPx(tamanho: TamanhoDoAvatar, layout: 'celular' | 'computador' | 'quest'): number {
  const tabela: Record<'celular' | 'computador', Record<TamanhoDoAvatar, number>> = {
    celular: { p: 64, m: 96, g: 136 },
    computador: { p: 96, m: 144, g: 208 },
  };
  return tabela[layout === 'computador' ? 'computador' : 'celular'][tamanho];
}

/** O menor círculo do avatar no celular (o tamanho "p"). */
export const LADO_MINIMO_NO_CELULAR = 64;
/**
 * No celular, com os dois avisos fixos da soletração embaixo do idioma, o círculo do intérprete cede espaço ao texto
 * da conversa: no máximo 72 px (as mãos continuam legíveis porque o enquadramento automático vira "só mãos").
 */
export function ladoComAvisosEmPx(lado: number): number {
  return Math.max(LADO_MINIMO_NO_CELULAR, Math.min(lado, 72));
}

/**
 * O lado do PALCO DAS MÃOS (a soletração ligada). No computador ele cresce (há largura de sobra e as mãos precisam de
 * tamanho para serem lidas); no celular fica no lado apertado que deixa a frase da conversa respirar.
 */
export const LADO_DO_PALCO_NO_COMPUTADOR = 232;
/** No celular as mãos precisam de um pouco mais que o círculo apertado, desde que a frase siga com 58 px ou mais. */
export const LADO_DO_PALCO_NO_CELULAR = 64;
export function ladoDoPalcoEmPx(ladoApertado: number, layout: 'celular' | 'computador' | 'quest'): number {
  return Math.max(ladoApertado, layout === 'computador' ? LADO_DO_PALCO_NO_COMPUTADOR : LADO_DO_PALCO_NO_CELULAR);
}

export interface EntradaDaPolitica {
  /** A flag `avatar_3d`. */
  flag: boolean;
  prefs: PreferenciasDosAvatares;
  /** O aparelho cria um contexto WebGL2? */
  webgl2: boolean;
  /** O tier detectado para o aparelho. */
  tier: TierDoAvatar;
  /** A flag `avatar_sinais`. */
  sinais?: boolean;
}

export interface PoliticaDosAvatares {
  /** Os avatares entram na tela? Falso: o layout é exatamente o de antes. */
  mostrar: boolean;
  /** Os donos de metade que ganham avatar. */
  donos: readonly LadoDaConversa[];
  /** O tier a pedir ao motor. Dois avatares ao mesmo tempo: nunca acima de `medio`. */
  tier: TierDoAvatar;
  /** Sem WebGL2: foto ou iniciais em vez do 3D (o avatar continua à vista, só não é 3D). */
  fallback2d: boolean;
  /** O enquadramento EFETIVO (o `auto` já foi resolvido). */
  foco: Exclude<FocoDoAvatar, 'auto'>;
  /**
   * A soletração pode acontecer: as duas flags, a opção ligada e o avatar-intérprete na tela. (Falta ainda o modelo
   * suportar: isso só se sabe com o modelo carregado.)
   */
  soletrar: boolean;
  motivo: 'ok' | 'sem_flag' | 'economia' | 'nenhum';
}

const SEM_AVATAR = (motivo: PoliticaDosAvatares['motivo'], foco: PoliticaDosAvatares['foco']): PoliticaDosAvatares => ({
  mostrar: false,
  donos: [],
  tier: 'fraco',
  fallback2d: false,
  foco,
  soletrar: false,
  motivo,
});

/** Quando e como os avatares aparecem. Sem a flag, no modo economia ou em "nenhum", nada muda na tela. */
export function politicaDosAvatares(e: EntradaDaPolitica): PoliticaDosAvatares {
  // "Só mãos" só vale com a flag dos sinais; sem ela, volta ao rosto (e o painel mostra a opção desabilitada).
  // O automático escolhe "só mãos" quando a soletração está ativa (opção ligada e intérprete na tela), pois no
  // círculo pequeno as mãos ficam minúsculas no enquadramento do corpo. A escolha explícita da pessoa vence.
  const interpreteNaTela = e.prefs.quem === 'ambos' || e.prefs.quem === 'interprete';
  const querMaos =
    e.prefs.foco === 'maos' || (e.prefs.foco === 'auto' && e.prefs.soletrar && interpreteNaTela && !e.prefs.economia);
  const foco: PoliticaDosAvatares['foco'] = querMaos && e.sinais === true ? 'maos' : 'rosto';
  if (!e.flag) return SEM_AVATAR('sem_flag', foco);
  if (e.prefs.economia) return SEM_AVATAR('economia', foco);
  const donos: readonly LadoDaConversa[] =
    e.prefs.quem === 'ambos'
      ? ['meu', 'outro']
      : e.prefs.quem === 'meu'
        ? ['meu']
        : e.prefs.quem === 'interprete'
          ? ['outro']
          : [];
  if (donos.length === 0) return SEM_AVATAR('nenhum', foco);
  return {
    mostrar: true,
    donos,
    tier: donos.length > 1 ? limitarTier(e.tier, 'medio') : e.tier,
    fallback2d: !e.webgl2,
    foco,
    soletrar: e.sinais === true && e.prefs.soletrar && donos.includes('outro'),
    motivo: 'ok',
  };
}

/** O modelo-padrão do avatar-intérprete e o reserva (se a pessoa já usa o mesmo, o intérprete é outro). */
export const INTERPRETE_PADRAO = 'bullidan';
export const INTERPRETE_RESERVA = 'milk';

export function modeloDoInterprete(idDaPessoa: string | null | undefined, ids: readonly string[]): string | null {
  const ordem = [INTERPRETE_PADRAO, INTERPRETE_RESERVA, ...ids];
  const escolhido = ordem.find((id) => ids.includes(id) && id !== idDaPessoa) ?? ordem.find((id) => ids.includes(id));
  return escolhido ?? null;
}

const PESO_DO_ESTADO: Record<EstadoDoAvatar, number> = { parado: 0, ouvindo: 1, pensando: 2, falando: 3 };

/**
 * QUAL AVATAR O PiP MOSTRA. A janelinha é pequena: UM avatar só, e é sempre o INTÉRPRETE (`outro`): quem lê a tradução em
 * voz alta é ele, e trocar de modelo a cada fala recarregaria o avatar a cada troca de quem fala. O estado é o de maior
 * atividade entre os dois lados (falando, depois pensando, depois ouvindo): se alguém fala, o intérprete "fala".
 */
export function avatarDoPip(estados: Record<LadoDaConversa, EstadoDoAvatar>): {
  dono: LadoDaConversa;
  estado: EstadoDoAvatar;
} {
  const estado = PESO_DO_ESTADO[estados.meu] > PESO_DO_ESTADO[estados.outro] ? estados.meu : estados.outro;
  return { dono: 'outro', estado };
}

/** O avatar que a pessoa recebe enquanto não escolhe um em "Meu avatar": o primeiro da coleção que não é o do intérprete. */
export function modeloPadraoDaPessoa(ids: readonly string[]): string | null {
  return ids.find((id) => id !== INTERPRETE_PADRAO) ?? ids[0] ?? null;
}
