/**
 * CONTADOR DE PASSADAS DO PIPELINE — instrumento de medição, não funcionalidade.
 *
 * POR QUE ELE EXISTE. O custo de arranque do /jogar é *renderização que executa de verdade*: a
 * triagem do baralho, o pedido de composição e o gate dos nove jogos rodavam mais de uma vez por
 * carga. Só que o instrumento disponível para provar isso — o TBT do Lighthouse — varia 1,53x
 * entre execuções do MESMO commit (516–790 ms, achado F0-10). Um número que se move sozinho não
 * consegue responder "o pipeline passou a rodar menos vezes?": a resposta some no ruído.
 *
 * Este contador responde. Ele é DETERMINÍSTICO: conta eventos, não milissegundos, e uma mudança
 * de 3 para 1 é 3 para 1 em toda execução.
 *
 * DESLIGADO POR PADRÃO, e é isso que o torna barato o bastante para ficar no código de produção:
 * sem a marca global ele é uma leitura de propriedade e um `return`. Quem mede liga a marca ANTES
 * de a página carregar (`page.addInitScript` do Playwright, ou o console do navegador seguido de
 * um F5) — não há caminho pela interface que o ligue, de propósito: instrumento que o usuário
 * pode ligar sem querer vira funcionalidade acidental.
 *
 *     await page.addInitScript(() => { window.__MEDIR_PASSADAS__ = true })
 *     ...
 *     await page.evaluate(() => window.__PASSADAS__)
 *
 * O CARIMBO DE TEMPO VAI JUNTO porque "quantas vezes" sem "quando" não distingue duas passadas
 * coladas (um render só, dois memos) de duas passadas separadas por uma ida à rede — e é
 * exatamente essa diferença que se está tentando eliminar.
 */

/**
 * F11-09: sem `export`. O tipo é usado só aqui dentro (em {@link JanelaMedida}), e exportá-lo
 * criava um `export` sem consumidor — que o ratchet de UX contava como tipo morto. É a distinção
 * que a Fase 2 estabeleceu: `export` morto não é código morto, e o conserto é apagar a palavra,
 * não o tipo.
 */
interface PassadaRegistrada {
  /** Qual etapa: 'triagem', 'composicao' ou 'gate'. */
  nome: string;
  /** Milissegundos desde o início da navegação. */
  ms: number;
  /** O que a etapa viu — para uma passada com o baralho vazio não ser confundida com uma real. */
  detalhe?: Record<string, unknown>;
}

interface JanelaMedida {
  __MEDIR_PASSADAS__?: boolean;
  __PASSADAS__?: PassadaRegistrada[];
}

export function contarPassada(nome: string, detalhe?: Record<string, unknown>): void {
  const g = globalThis as unknown as JanelaMedida;
  if (!g.__MEDIR_PASSADAS__) return;
  const lista = g.__PASSADAS__ ?? (g.__PASSADAS__ = []);
  lista.push({ nome, ms: Math.round(performance.now()), detalhe });
}
