/**
 * O QUE O PAINEL DE PROCESSAMENTO DA CAPTURA DIZ — os nomes simples de quem transcreve e de quem
 * traduz, onde cada um roda, e as cotas do mês (`PainelDeProcessamento.tsx`).
 *
 * Os nomes são os da tela "Modelos no aparelho" (`catalogoDeTranscricao`: Preciso, Equilibrado,
 * Rápido…), nunca o id do Hub. A nuvem e o navegador têm o nome deles. Só afirma o que o selo da fala
 * afirma: com o selo na nuvem, quem transcreve é a nuvem, mesmo que o modelo local esteja de reserva.
 *
 * As cotas só aparecem com teto de verdade e com a resposta do servidor (`/api/me/uso`): sem resposta,
 * nenhum número inventado. A "reserva para aparelho fraco" é a franquia de alívio do Grátis
 * (`core/nuvemDeAlivio.ts`); quando ela está desligada ou depende do responsável, não é mostrada.
 *
 * PURO: as frases em português são as chaves do catálogo de i18n; quem traduz é a tela.
 */
import { catalogoDeTranscricao } from '../../gateway/catalogoDeModelos';
import type { UsoDoMes } from '../uso';
import { medidoresDoUso } from './nivelDeServico';
import type { SeloDaFala } from './seloDaFala';

export type OndeRoda = 'aparelho' | 'nuvem' | 'navegador';

/** "no aparelho", "na nuvem", "pelo navegador": o rótulo curto do cabeçalho e de cada linha. */
export const ROTULO_DO_ONDE: Record<OndeRoda, string> = {
  aparelho: 'no aparelho',
  nuvem: 'na nuvem',
  navegador: 'pelo navegador',
};

export interface LinhaDoMotor {
  /** Chave de i18n: o nome simples. */
  nome: string;
  onde: OndeRoda;
}

/** Quem transcreve: a nuvem, o navegador ou o modelo local pelo nome do catálogo. */
export function linhaDaTranscricao(o: {
  selo: SeloDaFala | null;
  /** O id do modelo local que a rota carrega (`rota.localModel`). */
  idDoModelo?: string | null;
  /** A legenda vem do reconhecedor do navegador (nada nosso baixa para transcrever). */
  noNavegador?: boolean;
}): LinhaDoMotor {
  if (o.selo?.onde === 'nuvem') return { nome: 'Nuvem do Frasy', onde: 'nuvem' };
  if (o.selo?.onde === 'navegador' || o.noNavegador) {
    return { nome: 'Reconhecimento do navegador', onde: o.selo?.onde === 'navegador' ? 'navegador' : 'aparelho' };
  }
  const id = o.idDoModelo ?? '';
  const item = id ? catalogoDeTranscricao().find((i) => i.id === id || id.startsWith(`${i.id}`)) : undefined;
  return { nome: item?.nome ?? 'Modelo local', onde: 'aparelho' };
}

/** Quem traduz: o tradutor do navegador, o Bergamot ou o opus-mt. `null` = nada a afirmar. */
export function linhaDaTraducao(o: { nativo: boolean; ids: readonly string[] }): LinhaDoMotor | null {
  if (o.nativo) return { nome: 'Tradutor do navegador', onde: 'aparelho' };
  if (o.ids.some((id) => /^bergamot\//i.test(id))) return { nome: 'Bergamot', onde: 'aparelho' };
  if (o.ids.some((id) => /opus-mt/i.test(id))) return { nome: 'opus-mt', onde: 'aparelho' };
  return null;
}

export interface CotaDoPainel {
  qual: 'nuvem' | 'alivio';
  /** Em minutos. */
  usado: number;
  total: number;
  /** 0 a 100. */
  pct: number;
  acabou: boolean;
}

/** Os motivos em que a reserva não vale para a pessoa: não há o que medir. */
const ALIVIO_FORA = new Set(['alivio_desligado', 'alivio_exige_responsavel']);

/** As cotas do mês: a nuvem do plano (trechos) e a reserva para aparelho fraco. */
export function cotasDoUso(uso: UsoDoMes | null): CotaDoPainel[] {
  if (!uso) return [];
  const cotas: CotaDoPainel[] = medidoresDoUso(uso)
    .filter((m) => m.nivel === 'precisao')
    .map((m) => ({ qual: 'nuvem', usado: m.usado, total: m.total, pct: m.pct, acabou: m.acabou }));
  const a = uso.alivio;
  const c = a?.segundosDeAudio;
  if (a && c && c.teto !== null && c.teto > 0 && !ALIVIO_FORA.has(a.motivo ?? '')) {
    const total = Math.max(1, Math.round(c.teto / 60));
    const acabou = c.usado >= c.teto;
    const usado = acabou ? total : Math.min(total, Math.round(Math.max(0, c.usado) / 60));
    cotas.push({ qual: 'alivio', usado, total, pct: acabou ? 100 : Math.round((usado / total) * 100), acabou });
  }
  return cotas;
}
