/**
 * A TRADUÇÃO DE UM CAPÍTULO, parágrafo a parágrafo, NO APARELHO (`gateway.mt`; custo zero, o texto não sai dele).
 * Quem chama passa a função que traduz UM parágrafo. Aqui ficam só as regras de andamento:
 *
 *  - em LOTES pequenos, com uma PAUSA entre eles — o tradutor local usa a CPU e a página não pode travar;
 *  - CANCELÁVEL a qualquer momento (`AbortSignal`): o que já saiu fica;
 *  - parágrafo que falha vira `null` (a tela mostra "não deu para traduzir") e NÃO derruba o resto, a menos que falhem
 *    vários em sequência — aí o motor/a rede estão fora e continuar só gasta CPU: encerra com `erro`.
 *  - o progresso sai a cada parágrafo, com a lista parcial (`undefined` = ainda não chegou).
 */

export interface OpcoesDaTraducao {
  /** Quantos parágrafos por lote (padrão 2). */
  lote?: number;
  /** Pausa entre lotes, em ms (padrão 40): deixa a página respirar. */
  pausaMs?: number;
  /** Falhas SEGUIDAS que encerram com `erro` (padrão 3). */
  falhasSeguidas?: number;
  /**
   * O PREPARO: o tradutor do aparelho baixa e carrega um modelo na primeira vez (e um disjuntor pode ficar aberto por
   * 30 s), e até lá a chamada falha. A falha repete o mesmo parágrafo a cada `intervaloDePreparoMs`, até `preparoMs` de
   * espera SEGUIDA (padrão 60 s; cada acerto zera a conta) — só depois disso vale como falha de verdade.
   * `aoPreparar` avisa a tela (uma vez por espera).
   */
  preparoMs?: number;
  intervaloDePreparoMs?: number;
  aoPreparar?: (preparando: boolean) => void;
  sinal?: AbortSignal;
  aoProgresso?: (feitos: number, total: number, parcial: ReadonlyArray<string | null | undefined>) => void;
  /** Para os testes: troca o `setTimeout`. */
  esperar?: (ms: number) => Promise<void>;
}

export type FimDaTraducao = 'completo' | 'cancelado' | 'erro';

const esperarDeVerdade = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Traduz `paragrafos` (só os índices em `indices`, ou todos) e devolve a lista final. `undefined` = não chegou a
 * traduzir (cancelado/erro); `null` = tentou e falhou. `parcial` pode vir com o que já existia (o que a pessoa
 * traduziu um a um) — esses índices são pulados.
 */
export async function traduzirParagrafos(
  paragrafos: readonly string[],
  traduzir: (texto: string) => Promise<string | null>,
  opcoes: OpcoesDaTraducao & { jaTraduzidos?: ReadonlyArray<string | null | undefined> } = {},
): Promise<{ fim: FimDaTraducao; traducoes: Array<string | null | undefined> }> {
  const {
    lote = 2,
    pausaMs = 40,
    falhasSeguidas = 3,
    preparoMs = 60_000,
    intervaloDePreparoMs = 2_000,
    aoPreparar,
    sinal,
    aoProgresso,
    esperar = esperarDeVerdade,
  } = opcoes;
  const traducoes: Array<string | null | undefined> = paragrafos.map((_, i) => opcoes.jaTraduzidos?.[i] ?? undefined);
  const pendentes = paragrafos.map((_, i) => i).filter((i) => typeof traducoes[i] !== 'string');
  let feitos = paragrafos.length - pendentes.length;
  let seguidas = 0;
  let esperaDePreparo = 0;
  aoProgresso?.(feitos, paragrafos.length, traducoes);

  for (let ini = 0; ini < pendentes.length; ini += lote) {
    for (const i of pendentes.slice(ini, ini + lote)) {
      if (sinal?.aborted) return { fim: 'cancelado', traducoes };
      let saida: string | null;
      let preparando = false;
      for (;;) {
        try {
          saida = (await traduzir(paragrafos[i])) || null;
        } catch {
          saida = null;
        }
        if (saida !== null || sinal?.aborted) break;
        if (esperaDePreparo >= preparoMs) break;
        /* Ainda carregando o modelo: espera e repete o mesmo parágrafo. */
        if (!preparando) aoPreparar?.((preparando = true));
        await esperar(intervaloDePreparoMs);
        esperaDePreparo += intervaloDePreparoMs;
      }
      if (preparando) aoPreparar?.(false);
      if (sinal?.aborted) return { fim: 'cancelado', traducoes };
      traducoes[i] = saida;
      if (saida !== null) esperaDePreparo = 0; /* a paciência volta inteira depois de cada acerto */
      feitos++;
      seguidas = saida === null ? seguidas + 1 : 0;
      aoProgresso?.(feitos, paragrafos.length, traducoes);
      if (seguidas >= falhasSeguidas) return { fim: 'erro', traducoes };
    }
    if (ini + lote < pendentes.length) await esperar(pausaMs);
  }
  return { fim: 'completo', traducoes };
}
