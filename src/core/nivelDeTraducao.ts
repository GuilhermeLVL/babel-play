/**
 * OS NÍVEIS DA TRADUÇÃO — o contrato que servidor e cliente compartilham (B3 da Fase B, 29/09/2026).
 *
 * POR QUE NÍVEL, E NÃO "MODELO MAIOR". Até aqui o plano escolhia o modelo por um booleano,
 * `largerModels`, que trocava o `LLM_MODEL` pelo `LLM_MODEL_GRANDE`. A decisão do dono (29/09/2026)
 * é vender o que a pessoa SENTE, e não "qualidade melhor" (que pega mal): o Grátis é apresentado,
 * de forma positiva, como "Tradução rápida ao vivo"; o Premium traz a "Tradução Nuance". Cada nome é
 * um NÍVEL, e o servidor decide o modelo de cada nível no registro de provedores
 * (`server/ai/registroDeProvedores.ts`, campo `niveis` de cada modelo; a tabela por função é
 * `IA_NIVEIS`, em `server/ai/niveis.ts`):
 *
 *   rapida     o modelo barato. Grátis, convidado e a nuvem de alívio;
 *   nuance     o modelo que a bancada escolher para a nuance, com o barato de reserva. Quem paga;
 *   polimento  "polir a sessão" (Fase D, D5): blocos inteiros, sem pressa de legenda. No contrato
 *              desde já para o D5 não mexer nele; ainda sem rota.
 *
 * QUEM PODE É A CAPACIDADE, NUNCA O NOME DO PLANO. `rebaixarNivel` lê o entitlement
 * `traducaoNuance` (`src/core/planos.ts`). A Fase C renomeia os planos (essencial/pro → premium): um
 * `plan === 'pro'` espalhado pelo código viraria, no rename, um pagante recebendo o modelo do Grátis
 * sem erro nenhum. O entitlement atravessa o rename intacto.
 *
 * PURO E ISOMÓRFICO, sem imports, como `planos.ts`: o cliente vai importar daqui para pintar o
 * nível (Fase C/D), e o servidor para decidir.
 */

/** Em ordem crescente de custo. A ordem é a da escada: cada nível cai no anterior. */
export const NIVEIS_DA_TRADUCAO = ['rapida', 'nuance', 'polimento'] as const;
export type NivelDaTraducao = (typeof NIVEIS_DA_TRADUCAO)[number];

export const ehNivelDaTraducao = (v: unknown): v is NivelDaTraducao =>
  typeof v === 'string' && (NIVEIS_DA_TRADUCAO as readonly string[]).includes(v);

/**
 * A CADEIA DE UM NÍVEL: os níveis cujos modelos atendem um pedido dele, do preferido ao último
 * recurso. Nuance tenta o modelo da nuance e cai no mais barato ("com fallback para o mais barato",
 * decisão do dono); rápida é SÓ rápida — quem não paga nunca cai, nem por reserva, num modelo caro.
 */
export function niveisAtendidos(nivel: NivelDaTraducao): readonly NivelDaTraducao[] {
  const i = NIVEIS_DA_TRADUCAO.indexOf(nivel);
  return NIVEIS_DA_TRADUCAO.slice(0, Math.max(0, i) + 1).reverse();
}

/** A capacidade que decide o nível — o entitlement da matriz de planos. */
export interface CapacidadeDeNivel {
  traducaoNuance?: boolean;
}

/**
 * O NÍVEL QUE O PLANO ALCANÇA para um pedido: o pedido como veio, se o plano tem a nuance; senão,
 * a rápida — sem erro, porque a rápida é tradução de verdade (é o Grátis). Capacidade ausente (forma
 * desconhecida, cliente antigo) é a segura. É a regra do D1 ("o servidor rebaixa para rápida quem
 * não tem `traducaoNuance`"); sem pedido, o nível de cada função sai de `IA_NIVEIS`, no servidor.
 */
export function rebaixarNivel(pedido: NivelDaTraducao | undefined, c: CapacidadeDeNivel): NivelDaTraducao {
  if (c.traducaoNuance !== true) return 'rapida';
  return pedido ?? 'rapida';
}
