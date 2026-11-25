/**
 * O ADAPTADOR LOCAL DA PRÉ-TRADUÇÃO DE LEGENDAS (openspec `pre-traducao-de-legendas`, D2). Liga o núcleo
 * (`core/traducao/preTraducaoDeLegendas.ts`) a UM tradutor local e a mais nada: a legenda é material da pessoa e a retenção é zero.
 *
 *  - Recusa na criação qualquer provedor que não seja `opus-mt-local` ou `bergamot-local` (nada de `mymemory`, `server-llm-mt`).
 *  - Descarta a resposta cujo `engine` não seja local (defesa contra um composto que cai em outro motor).
 *  - Nunca envia `nuvemPrimeiro` nem `escalarSeRuim`, e NÃO passa pela cascata de `gateway.mt` (que pode chegar à nuvem).
 *  - Par ainda baixando vira `MotorAindaCarregando` (o núcleo para em `aguardando-motor`); par sem motor, erro simples.
 */
import { MotorAindaCarregando } from '../core/robustness';
import type { MtResult, TranslationProvider } from './capabilities';

/** Os únicos motores que a pré-tradução aceita: traduzem no aparelho, sem rede. */
export const MOTORES_LOCAIS_DE_PRE_TRADUCAO: ReadonlySet<string> = new Set(['opus-mt-local', 'bergamot-local']);

export const ehMotorLocalDePreTraducao = (id: string): boolean => MOTORES_LOCAIS_DE_PRE_TRADUCAO.has(id);

export interface TradutorDaPreTraducao {
  /** Traduz UMA fala no aparelho; lança `MotorAindaCarregando` se o par ainda não está pronto. */
  traduzir: (texto: string) => Promise<string>;
  /** O par já atende agora, sem baixar nada? */
  pronto: () => boolean;
  /** Dispara o download/aquecimento do modelo. Só chamar DEPOIS de avisar a pessoa do tamanho. */
  aquecer: (onProgress?: (p: number, label?: string, bytes?: { loaded: number; total: number }) => void) => void;
}

export function tradutorLocalDaPreTraducao(
  provedor: TranslationProvider,
  de: string,
  para: string,
): TradutorDaPreTraducao {
  if (!ehMotorLocalDePreTraducao(provedor.id))
    throw new Error(`pré-tradução só usa motor local; "${provedor.id}" não é`);

  const pronto = (): boolean => provedor.supports(de, para);

  return {
    pronto,
    aquecer: (onProgress) => provedor.preload?.(de, para, onProgress),
    traduzir: async (texto) => {
      if (!pronto()) {
        if (provedor.carregando?.(de, para))
          throw new MotorAindaCarregando(provedor.id, `${provedor.id} ainda carregando ${de}→${para}`);
        throw new Error(`${provedor.id} não suporta ${de}→${para}`);
      }
      // Sem `nuvemPrimeiro`/`escalarSeRuim`: nenhuma opção que empurre o texto para fora do aparelho.
      const r: MtResult = await provedor.translate(texto, de, para);
      if (!ehMotorLocalDePreTraducao(r.engine)) throw new Error(`resposta de motor não local descartada: ${r.engine}`);
      if (!r.text) throw new Error('tradutor local devolveu vazio');
      return r.text;
    },
  };
}
