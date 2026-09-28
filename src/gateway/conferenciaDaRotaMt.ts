/**
 * CONFERÊNCIA DA ROTA DE TRADUÇÃO (dev) — `routeMt` como ASSERÇÃO sobre o que o gateway fez.
 *
 * O `routeMt` (`core/harness/roteadorDeTraducao.ts`) é a escada M0–M5 escrita como função pura. Ligá-lo
 * como roteador do `translateSegment` hoje só trocaria a ordem que já funciona (cascata do perfil +
 * `falada`/`nuvemPrimeiro`) sem dado novo para decidir — o degrau M0 ("o aluno já sabe todas as
 * palavras") precisa do vocabulário conhecido, que ainda não chega aqui. Então ele entra como
 * CONFERÊNCIA, só em desenvolvimento: depois de cada tradução, o motor que atendeu tem de ser um que
 * a escada permitiria. As regras que não dobram e que dá para conferir no cliente:
 *   - PARCIAL nunca vai à nuvem nem a terceiro;
 *   - SEM CONSENTIMENTO nada sai do aparelho.
 * "Grátis nunca vai à nuvem" NÃO é conferível aqui: a cota de convidado é decidida no servidor (que
 * responde 402 sem cota). A conferência passa `cotaDeConvidado: true` e deixa essa regra ao servidor.
 */
import { routeMt } from '@core/harness/roteadorDeTraducao';

/** Motores de MT que tiram o texto do aparelho (ver `registroDeMotores.ts`). */
const SAEM_DO_APARELHO = new Set(['server-llm-mt', 'mymemory']);

export interface ConferenciaDaRotaMt {
  texto: string;
  origem: string;
  destino: string;
  parcial: boolean;
  consentimento: boolean;
  falada: boolean;
  /** O `engine` da resposta. */
  motor: string;
}

/** A violação encontrada, em texto para o console; `null` = o motor era permitido. */
export function violacaoDaRotaMt(c: ConferenciaDaRotaMt): string | null {
  if (!SAEM_DO_APARELHO.has(c.motor)) return null;
  const rota = routeMt({
    texto: c.texto,
    ehToqueEmPalavra: false,
    parcial: c.parcial,
    pago: false,
    cotaDeConvidado: true, // o plano é decidido no servidor
    consentimento: c.consentimento,
    disponibilidade: { tradutorNativo: true, opusMt: true, nuvem: true, terceiro: true },
    origem: c.origem,
    destino: c.destino,
    falada: c.falada,
  });
  if (rota.degraus.some((d) => d.motor === c.motor)) return null;
  const motivo = rota.descartados.find((d) => d.degrau === (c.motor === 'mymemory' ? 'terceiro' : 'nuvem'))?.motivo;
  return `routeMt violado: ${c.motor} atendeu um pedido que a escada descarta (${motivo ?? 'fora da escada'})`;
}
