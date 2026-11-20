/**
 * O AVATAR NOS MODOS (Livro/Narração e Legendar): regras puras. Sem React, sem DOM, sem rede.
 *
 * Um padrão só para todos os modos: o mesmo botão "Avatar", o mesmo painel (tamanho, quem aparece, economia: estes
 * dois últimos compartilhados com o Intérprete em `interprete.ts`) e a mesma política. O avatar é COMPLEMENTO: o texto
 * (legenda, frase) nunca depende dele. Aqui ficam o mapa fase -> estado, as preferências POR MODO (ligado, quem, recolhido,
 * janela flutuante), a política (quando aparece, com qual tier, quando cai no 2D) e o teto de contextos WebGL.
 */
import type { EstadoDoAvatar } from './estados';
import type { PreferenciasDosAvatares } from './interprete';
import { limitarTier, type TierDoAvatar } from './tiers';

export type ModoDoAvatar = 'livro' | 'legenda';
export const MODOS_DO_AVATAR: readonly ModoDoAvatar[] = ['livro', 'legenda'];

/** De quem é o avatar do modo: `meu` = o do Perfil (ou o que a pessoa trouxe), `outro` = o avatar-intérprete. */
export type DonoDoModo = 'meu' | 'outro';

export interface PreferenciasDoModo {
  /** O avatar deste modo está ligado? Padrão: não (descoberta pela dica, nunca imposto). */
  ligado: boolean;
  dono: DonoDoModo;
  /** Só o livro: recolhe o avatar e deixa a legenda. */
  recolhido: boolean;
  /** Só a legenda: aparece também na janela flutuante. */
  noPip: boolean;
}

export const PREFERENCIAS_DO_MODO_PADRAO: Readonly<PreferenciasDoModo> = Object.freeze({
  ligado: false,
  dono: 'meu',
  recolhido: false,
  noPip: true,
});

export function validarPreferenciasDoModo(bruto: unknown): PreferenciasDoModo {
  const o = bruto !== null && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {};
  return {
    ligado: o.ligado === true,
    dono: o.dono === 'outro' ? 'outro' : 'meu',
    recolhido: o.recolhido === true,
    noPip: o.noPip !== false,
  };
}

/** O narrador: tocando fala; virando o capítulo pensa; pausado ou parado, repouso. */
export function estadoDoNarrador(fase: 'parada' | 'tocando' | 'pausada' | 'virando'): EstadoDoAvatar {
  return fase === 'tocando' ? 'falando' : fase === 'virando' ? 'pensando' : 'parado';
}

export interface EntradaDaLegenda {
  gravando: boolean;
  pausado: boolean;
  /** Há fala a ser traduzida/ainda em parcial. */
  pensando: boolean;
  /** A voz está lendo uma fala em voz alta (tocar para ouvir). */
  falando: boolean;
}

/** A legenda: falando (voz) > pensando (traduzindo) > ouvindo (gravando) > parado. */
export function estadoDaLegenda(e: EntradaDaLegenda): EstadoDoAvatar {
  if (e.falando) return 'falando';
  if (!e.gravando || e.pausado) return 'parado';
  return e.pensando ? 'pensando' : 'ouvindo';
}

export interface EntradaDaPoliticaDoModo {
  flag: boolean;
  modo: PreferenciasDoModo;
  gerais: PreferenciasDosAvatares;
  webgl2: boolean;
  tier: TierDoAvatar;
  /** Quantos OUTROS avatares 3D a página já tem (o médio é o teto quando passa de 0). */
  outrosContextos?: number;
}

export interface PoliticaDoModo {
  mostrar: boolean;
  tier: TierDoAvatar;
  /** Sem WebGL2: foto ou iniciais (o avatar continua à vista). */
  fallback2d: boolean;
  motivo: 'ok' | 'sem_flag' | 'desligado' | 'economia';
}

const SEM = (motivo: PoliticaDoModo['motivo']): PoliticaDoModo => ({
  mostrar: false,
  tier: 'fraco',
  fallback2d: false,
  motivo,
});

export function politicaDoAvatarDoModo(e: EntradaDaPoliticaDoModo): PoliticaDoModo {
  if (!e.flag) return SEM('sem_flag');
  if (e.gerais.economia) return SEM('economia');
  if (!e.modo.ligado) return SEM('desligado');
  return {
    mostrar: true,
    tier: (e.outrosContextos ?? 0) > 0 ? limitarTier(e.tier, 'medio') : e.tier,
    fallback2d: !e.webgl2,
    motivo: 'ok',
  };
}

/** Quantos contextos WebGL a página aguenta ao mesmo tempo (o PiP é outro documento e tem o dele). */
export const LIMITE_DE_CONTEXTOS = 2;
export const decidirContexto = (emUso: number): boolean => emUso < LIMITE_DE_CONTEXTOS;

const LADOS: Record<'p' | 'm' | 'g', number> = { p: 56, m: 80, g: 112 };
/** Nunca passa de um quinto da altura da janela (o texto manda), nem fica menor que 40 px. */
export function ladoDoAvatarDoModo(tamanho: 'p' | 'm' | 'g', alturaDaJanela: number): number {
  const teto = Math.max(40, Math.floor(alturaDaJanela * 0.2));
  return Math.min(LADOS[tamanho], teto);
}

/** Um modelo da coleção para cada personagem: estável (mesmo nome, mesmo modelo) e, se der, não o da pessoa. */
export function modeloDoPersonagem(nome: string, ids: readonly string[], idDaPessoa: string | null): string | null {
  const livres = ids.filter((id) => id !== idDaPessoa);
  const lista = livres.length > 0 ? livres : ids;
  if (lista.length === 0) return null;
  let h = 0;
  for (const c of nome) h = (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0;
  return lista[h % lista.length] ?? null;
}
