/**
 * A APARÊNCIA GUARDADA DAS LEGENDAS FLUTUANTES — o que sobrevive a fechar e abrir a janelinha
 * (disco + `settings.ui.legendasFlutuantes` no servidor, e o "Meu perfil").
 *
 * Saiu de `LegendasFlutuantes.tsx` quando o ritmo de leitura entrou (ei/leg): o que vem do disco
 * ou do servidor pode ter sido gravado por qualquer versão anterior, então TUDO passa por
 * `normalizar`, que completa o que faltar com o padrão. Uma aparência antiga (sem `leitura`,
 * `visiveis`, `pausarAoPassar`) abre com os padrões novos; o `historico: false` de antes vira
 * "mostrar 1 fala", que era o que ele fazia.
 */
import type { Leitura } from '../../../../lib/captura/ritmoDaLegenda';

export type Modo = 'video' | 'conversa' | 'jogo';
/** `toque` = tradução escondida até você pedir, fala por fala. */
export type Traducao = 'sempre' | 'discreta' | 'oculta' | 'toque';
export type Preset = 'filme' | 'conversa' | 'jogo' | 'imersao' | 'meu';
export type Visiveis = 1 | 2 | 3 | 5;

/** O que é GUARDADO. Pausar, travar, esconder e o painel valem só enquanto a janela está aberta. */
export interface Aparencia {
  modo: Modo;
  preset: Preset;
  traducao: Traducao;
  tam: number;
  /** Quantas falas ficam à vista (o histórico curto). */
  visiveis: Visiveis;
  /** Ritmo de leitura: quanto tempo cada fala fica antes de a seguinte entrar. */
  leitura: Leitura;
  /** Passar o mouse (ou segurar o dedo) na janela pausa a legenda. */
  pausarAoPassar: boolean;
  cores: { legenda: string; traducao: string };
}

export const PADRAO: Aparencia = {
  modo: 'video',
  preset: 'filme',
  traducao: 'discreta',
  tam: 100,
  visiveis: 3,
  leitura: 'normal',
  pausarAoPassar: true,
  cores: { legenda: '#FFFFFF', traducao: '#FFEA00' },
};

/** As predefinições do protótipo: modo, tradução e tamanho de uma vez. */
export const PRESETS: Record<Exclude<Preset, 'meu'>, [Modo, Traducao, number]> = {
  filme: ['video', 'discreta', 100],
  conversa: ['conversa', 'sempre', 110],
  jogo: ['jogo', 'discreta', 90],
  imersao: ['video', 'oculta', 100],
};

export const CHAVE = 'babel.legendasFlutuantes';
export const CHAVE_MEU = 'babel.legendasMeuPerfil';
/** A configuração da janela antiga (Overlay), migrada na primeira abertura para ninguém perder a sua. */
const CHAVE_ANTIGA = 'babel.overlaySettings';

const MODOS = new Set<Modo>(['video', 'conversa', 'jogo']);
const TRADUCOES = new Set<Traducao>(['sempre', 'discreta', 'oculta', 'toque']);
const LEITURAS = new Set<Leitura>(['lenta', 'normal', 'rapida']);
export const QUANTAS: readonly Visiveis[] = [1, 2, 3, 5];

/** Aceita só o que tem forma de `Aparencia` (o que vem do disco ou do servidor pode ser qualquer coisa). */
export function normalizar(bruto: unknown): Aparencia {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Partial<Aparencia> & { historico?: unknown };
  const cores = (o.cores && typeof o.cores === 'object' ? o.cores : {}) as Partial<Aparencia['cores']>;
  const tam = typeof o.tam === 'number' && Number.isFinite(o.tam) ? Math.min(160, Math.max(70, o.tam)) : PADRAO.tam;
  /* `historico` (até ei/leg) ligava a segunda fala do modo vídeo. Desligado = uma fala só. */
  const visiveis = QUANTAS.includes(o.visiveis as Visiveis)
    ? (o.visiveis as Visiveis)
    : o.historico === false
      ? 1
      : PADRAO.visiveis;
  return {
    modo: o.modo && MODOS.has(o.modo) ? o.modo : PADRAO.modo,
    preset: o.preset && (o.preset in PRESETS || o.preset === 'meu') ? o.preset : PADRAO.preset,
    traducao: o.traducao && TRADUCOES.has(o.traducao) ? o.traducao : PADRAO.traducao,
    tam: Math.round(tam / 10) * 10,
    visiveis,
    leitura: o.leitura && LEITURAS.has(o.leitura) ? o.leitura : PADRAO.leitura,
    pausarAoPassar: typeof o.pausarAoPassar === 'boolean' ? o.pausarAoPassar : PADRAO.pausarAoPassar,
    cores: {
      legenda: typeof cores.legenda === 'string' ? cores.legenda : PADRAO.cores.legenda,
      traducao: typeof cores.traducao === 'string' ? cores.traducao : PADRAO.cores.traducao,
    },
  };
}

/** A janela antiga guardava outro formato: modo em inglês, "independência" e escala de fonte. */
function migrarDaAntiga(bruto: Record<string, unknown>): Aparencia {
  const modo = { video: 'video', conversation: 'conversa', game: 'jogo' }[String(bruto.layoutMode)] as Modo | undefined;
  const traducao = { assisted: 'sempre', intermediate: 'discreta', immersion: 'oculta' }[String(bruto.independence)] as
    | Traducao
    | undefined;
  return normalizar({
    modo,
    traducao,
    tam: typeof bruto.fontScale === 'number' ? bruto.fontScale * 100 : undefined,
    historico: bruto.videoShowHistory,
    cores: { legenda: bruto.originalTextColor, traducao: bruto.translatedTextColor },
  });
}

export function lerAparencia(): Aparencia {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) return normalizar(JSON.parse(salvo));
    const antiga = localStorage.getItem(CHAVE_ANTIGA);
    if (antiga) return migrarDaAntiga(JSON.parse(antiga));
  } catch {
    /* disco corrompido ou bloqueado: segue o padrão */
  }
  return PADRAO;
}

/** A tradução desta fala está à mostra? A troca da própria fala vence o modo da janela. */
export function traducaoAMostra(modo: Traducao, troca: boolean | undefined): boolean {
  return troca ?? (modo === 'sempre' || modo === 'discreta');
}
