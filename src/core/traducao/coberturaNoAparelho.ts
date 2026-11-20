/**
 * COBERTURA DE TRADUÇÃO DE UM PAR NESTE APARELHO (puro): que rota a fala vai usar e quanto ela baixa.
 *
 * A pergunta que faltava ANTES de Iniciar. Na auditoria de 17/11/2026 (CEL-01) o visitante legendou espanhol → português
 * no celular e nenhuma fala foi traduzida: sem modelo direto, sem pivô para os idiomas com modelo direto, sem Translator
 * nativo (Chrome Android, Safari) e sem nuvem (perfil protegido). A tela não avisou nada.
 *
 * A ORDEM é a da cascata (`core/harness/roteadorDeTraducao.ts`): o tradutor nativo do navegador, o modelo local DIRETO,
 * a nuvem autorizada e, por último, o modelo local PELO INGLÊS (perde nuance no meio, então só quando nada melhor atende).
 *
 * A LISTA DE MODELOS é uma só (`modelosDoParNoAparelho`): a mesma que a preparação baixa e o cache confere
 * (`gateway/modelCache.ts`) e a que o tradutor local carrega (`opusMtLocal.ts`, `bergamotLocal.ts`).
 */
import { modeloDaPernaParaOIngles, modeloDoInglesPara, ORIGENS_DO_BERGAMOT_NO_CDN, passaPeloIngles } from './viaIngles';

export type RotaNoAparelho = 'mesmo-idioma' | 'nativo' | 'direta' | 'nuvem' | 'pelo-ingles' | 'sem-rota';

export interface ContextoDaCobertura {
  /** O tradutor nativo do navegador atende o par (pacote disponível ou baixável)? */
  nativo: boolean;
  /** A nuvem está autorizada para este perfil (consentimento e política do perfil)? */
  nuvemAutorizada: boolean;
  /** O build aponta para o CDN dos modelos do Bergamot `X→en` (`VITE_BERGAMOT_MODELOS_URL`)? */
  bergamotNoCdn: boolean;
  /** O Bergamot `pt→en` embutido no build roda neste aparelho? (padrão: não) */
  bergamotPtEn?: boolean;
  /** MB que cada modelo baixa. Padrão: 113 por opus-mt (q8) e 32 por par do Bergamot. */
  mbDoModelo?: (id: string) => number | null;
}

export interface CoberturaNoAparelho {
  rota: RotaNoAparelho;
  /** Os modelos locais que a rota usa (vazio no nativo, na nuvem e sem rota). */
  modelos: string[];
  /** A soma do download desses modelos, em MB. */
  mb: number;
}

/** MB de um opus-mt em q8: o maior par medido (`sttRouter.MT_DOWNLOAD_MB`), para nunca prometer menos. */
export const MB_DO_OPUS_MT = 113;
/** MB de um par do Bergamot com o motor (31–32 nos europeus; `bergamotModelo.mbDoDownload` dá o exato). */
const MB_DO_BERGAMOT = 32;

const base = (l: string): string => (l || '').trim().toLowerCase().split(/[-_]/)[0] ?? '';

const mbPadrao = (id: string): number => (id.startsWith('bergamot/') ? MB_DO_BERGAMOT : MB_DO_OPUS_MT);

/**
 * Os modelos locais do par, na ordem em que carregam (`X→en` e, se o alvo não é o inglês, `en→alvo`). `bergamot(par)`
 * diz se o Bergamot daquele par (`es-en`…) é oferecido neste aparelho: aí ele toma a perna `X→en`. Vazio = sem modelo
 * local para o par.
 */
export function modelosDoParNoAparelho(de: string, para: string, o: { bergamot?: (par: string) => boolean }): string[] {
  const s = base(de);
  const t = base(para);
  if (!s || !t || s === t) return [];
  const pernaParaOIngles = (): string | null => {
    const par = `${s}-en`;
    if (o.bergamot?.(par)) return `bergamot/${par}`;
    return modeloDaPernaParaOIngles(s);
  };
  if (s === 'en') {
    const m = modeloDoInglesPara(t);
    return m ? [m] : [];
  }
  if (t === 'en') {
    const m = pernaParaOIngles();
    return m ? [m] : [];
  }
  if (passaPeloIngles(s, t)) return [pernaParaOIngles()!, modeloDoInglesPara(t)!];
  return [];
}

/** A rota de tradução do par neste aparelho e o download dela (ver o topo do arquivo). */
export function coberturaNoAparelho(de: string, para: string, ctx: ContextoDaCobertura): CoberturaNoAparelho {
  const s = base(de);
  const t = base(para);
  const nada = (rota: RotaNoAparelho): CoberturaNoAparelho => ({ rota, modelos: [], mb: 0 });
  if (s && s === t) return nada('mesmo-idioma');
  if (ctx.nativo) return nada('nativo');
  const bergamot = (par: string): boolean =>
    par === 'pt-en' ? !!ctx.bergamotPtEn : ctx.bergamotNoCdn && ORIGENS_DO_BERGAMOT_NO_CDN.has(par.split('-')[0]);
  const modelos = modelosDoParNoAparelho(s, t, { bergamot });
  const mbDe = (id: string): number => ctx.mbDoModelo?.(id) ?? mbPadrao(id);
  const comModelos = (rota: RotaNoAparelho): CoberturaNoAparelho => ({
    rota,
    modelos,
    mb: modelos.reduce((soma, id) => soma + mbDe(id), 0),
  });
  if (modelos.length && !passaPeloIngles(s, t)) return comModelos('direta');
  if (ctx.nuvemAutorizada) return nada('nuvem');
  if (modelos.length) return comModelos('pelo-ingles');
  return nada('sem-rota');
}
