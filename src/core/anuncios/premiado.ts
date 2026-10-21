/**
 * A RECOMPENSA DE CADA ESPAÇO PREMIADO (spec `anuncios-no-gratis`, "O premiado é sempre escolha"; valores do
 * protótipo, `docs/prototipos/anuncios-no-gratis-src/anuncios.js:70-75`). Pura: quem credita é o servidor
 * (`server/routes/anuncios.ts`); os tetos do dia ficam em `src/core/planos.ts`.
 *
 *  - `fim-premiado`: +10 Seeds; `loja-seeds`: +15 Seeds — creditadas no razão (`seed_credits`).
 *  - `nuvem-30`: 30 min de nuvem somados à franquia de nuvem do Grátis no mês (`server/lib/nuvemDeAlivio.ts`).
 *  - `tema-24h`: um tema da Loja liberado por 24 h. Não há posse temporária no servidor: a resposta leva o fim
 *    (`ateEm`) e o cliente guarda a liberação.
 *  - `ajuda-premiada`: +1 ajuda na rodada em andamento — vale só no cliente, sem Seeds.
 */
import { type EspacoDeAnuncio, FORMATO_DO_ESPACO } from './politicaDeAnuncio';

/** Os espaços de formato `premiado`, derivados da tabela da política. */
export const ESPACOS_PREMIADOS = (Object.keys(FORMATO_DO_ESPACO) as EspacoDeAnuncio[]).filter(
  (e) => FORMATO_DO_ESPACO[e] === 'premiado',
);
export type EspacoPremiado = 'fim-premiado' | 'ajuda-premiada' | 'tema-24h' | 'nuvem-30' | 'loja-seeds';

export const ehEspacoPremiado = (v: unknown): v is EspacoPremiado =>
  typeof v === 'string' && (ESPACOS_PREMIADOS as readonly string[]).includes(v);

/**
 * Os espaços premiados que a interface MONTA hoje (o fim da rodada e a Loja). Só eles abrem e concluem exibição
 * no servidor (`server/routes/anuncios.ts`: os outros → 400 `espaco_inativo`). Os demais (`nuvem-30`,
 * `tema-24h`, `ajuda-premiada`) entram aqui quando ganharem tela — o `nuvem-30` já tem teto do mês
 * (`LIMITE_DE_NUVEM_30_POR_MES` em `src/core/planos.ts`).
 */
export const ESPACOS_PREMIADOS_ATIVOS = ['fim-premiado', 'loja-seeds'] as const satisfies readonly EspacoPremiado[];

/** Uma exibição só credita se for concluída até este prazo depois de iniciada. */
export const PRAZO_DA_EXIBICAO_MS = 10 * 60_000;
/** Os segundos de nuvem do `nuvem-30`. */
export const SEGUNDOS_DE_NUVEM_DO_PREMIADO = 30 * 60;
/** Quanto dura a liberação do `tema-24h`. */
export const DURACAO_DO_TEMA_PREMIADO_MS = 24 * 3600_000;

export type RecompensaDoPremiado =
  | { tipo: 'seeds'; seeds: number }
  | { tipo: 'nuvem'; segundos: number }
  | { tipo: 'tema-24h'; ateEm: number }
  | { tipo: 'ajuda' };

/** A recompensa de um espaço, para uma exibição concluída em `concluidoEm` (ms). */
export function recompensaDoPremiado(espaco: EspacoPremiado, concluidoEm: number): RecompensaDoPremiado {
  switch (espaco) {
    case 'fim-premiado':
      return { tipo: 'seeds', seeds: 10 };
    case 'loja-seeds':
      return { tipo: 'seeds', seeds: 15 };
    case 'nuvem-30':
      return { tipo: 'nuvem', segundos: SEGUNDOS_DE_NUVEM_DO_PREMIADO };
    case 'tema-24h':
      return { tipo: 'tema-24h', ateEm: concluidoEm + DURACAO_DO_TEMA_PREMIADO_MS };
    case 'ajuda-premiada':
      return { tipo: 'ajuda' };
  }
}
