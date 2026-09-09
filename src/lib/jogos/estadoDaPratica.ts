/**
 * O ESTADO DA PRÁTICA QUE SOBREVIVE AO RENDER — chaves, preferências e transporte.
 *
 * POR QUE ESTE ARQUIVO EXISTE. Estas quatro coisas viviam soltas no topo de `Play.tsx`, entre as
 * props e o corpo do componente: a chave da memória curta, a preferência de pular a prévia, a
 * preferência de ver os números do baralho e o transporte da composição. Nenhuma delas é da TELA
 * — nenhuma lê estado de React, nenhuma renderiza nada — e todas são exatamente o tipo de regra
 * que se duplica quando mora dentro de um arquivo de quatro mil linhas: a chave da memória curta
 * já esteve copiada em três pontos, e foi assim que o baralho Anki ficou de fora de um deles.
 *
 * Não é núcleo: aqui há `localStorage` e `apiFetch`, que são do navegador. É a camada de aplicação
 * — o mesmo lugar de `lib/filtroDaPratica.ts` e `lib/fonteDaPratica.ts`, que guardam as outras
 * preferências desta mesma tela.
 */
import type { FonteDeItens } from '@core';
import { apiFetch } from '../../data/api';

/**
 * Quantos cartões o servidor PRIORIZA por rodada.
 *
 * Não é o tamanho do pool — o pool é o acervo inteiro (`recortarPelaComposicao` completa por trás).
 * Este número é só até onde vale a pena o servidor ordenar por vencimento e estratégia; o resto
 * entra na ordem da triagem. Cortar o pool aqui foi o que fez a Memória ver 5 palavras de 323.
 */
export const LIMITE_DA_COMPOSICAO = 200;

/**
 * A CHAVE DA MEMÓRIA CURTA (vistas recentes, persistidas por origem no localStorage).
 *
 * Uma função só, usada na LEITURA e na GRAVAÇÃO — este cálculo existia copiado em três pontos do
 * arquivo, e foi assim que o baralho Anki ficou de fora de um deles (auditoria S6): rodada com o
 * recorte ligado gravava as vistas em 'baralho' e a troca de baralho não zerava nada.
 *
 * O baralho entra na chave pela mesma razão que a sessão e o nível entram: trocar de baralho é
 * começar outro assunto. NOTA: isto é memória LOCAL; a `origem` persistida em `exercise_results`
 * continua 'baralho' — separar o histórico por baralho é decisão do modelo facetado, não daqui.
 */
export function chaveDaMemoriaCurta(fonte: FonteDeItens, baralhoAnki: { id: string } | null): string {
  if (fonte.id === 'sessao') return `sessao:${fonte.sessionId ?? ''}`;
  if (fonte.id === 'trilha') return `trilha:${fonte.nivel ?? ''}`;
  if (fonte.id === 'dificeis') return 'dificeis';
  return baralhoAnki ? `baralho:anki:${baralhoAnki.id}` : 'baralho';
}

/* Quem já sabe o que quer não deve pagar um clique por rodada. Fica no `localStorage`, no
   precedente de `minigames/passosDosJogos.ts`, e a antessala continua alcançável pelo ícone de
   lista na carta, senão desligar seria um caminho sem volta. */
const CHAVE_PULAR = 'babel.pular_antessala';

/**
 * PULAR A PRÉVIA É O PADRÃO — quem quiser vê-la marca o checkbox no lobby.
 *
 * A prévia vinha ligada, e voltava a cada rodada: mais uma tela cheia entre querer jogar e jogar,
 * com quatro contadores dos quais três costumam ser "0". Ela continua inteira e a um clique — o
 * checkbox "Mostrar a prévia antes de começar" fica ao lado do título da grade, e o botão de
 * espiar aparece em cada carta justamente quando a prévia está desligada.
 *
 * `'0'` explícito é o que distingue "escolheu ver" de "nunca mexeu": só quem desmarcou volta a
 * ver a prévia, e quem chega hoje entra na partida no primeiro clique.
 */
export const pularAntessala = (): boolean => {
  try {
    return localStorage.getItem(CHAVE_PULAR) !== '0';
  } catch {
    return true;
  }
};

export const gravarPularAntessala = (v: boolean): void => {
  try {
    localStorage.setItem(CHAVE_PULAR, v ? '1' : '0');
  } catch {
    /* storage bloqueado */
  }
};

/* Números do baralho (contagens, mapa, recorte, revisão) COLAPSADOS por padrão: quem chega quer
   jogar, não auditar o acervo, pedido do dono (2026-08-26). A escolha persiste no navegador. */
const CHAVE_DETALHES = 'babel.play.detalhes';

export const verDetalhesDoBaralho = (): boolean => {
  try {
    return localStorage.getItem(CHAVE_DETALHES) === '1';
  } catch {
    return false;
  }
};

export const gravarDetalhesDoBaralho = (v: boolean): void => {
  try {
    localStorage.setItem(CHAVE_DETALHES, v ? '1' : '0');
  } catch {
    /* sem storage */
  }
};

/**
 * TRANSPORTE da composição pelo FUNIL. O default do núcleo resolve `globalThis.fetch` — sem
 * Bearer e, sem conta, direto ao servidor real: foi assim que o lobby mostrou "600 no idioma"
 * (os cartões do banco do servidor) ao lado de um baralho vazio (o do navegador). Pelo `apiFetch`,
 * sem conta a rota responde 501 e `compor` cai no fallback local — o mesmo baralho, um número só.
 */
export const buscarComposicaoPeloFunil = async (
  caminho: string,
  init?: { method: 'POST'; body: string },
): Promise<unknown> => {
  // `init` só vem quando o filtro facetado não cabe na URL — mesmos campos, no corpo.
  const res = await apiFetch(
    caminho,
    init
      ? {
          method: init.method,
          body: init.body,
          headers: { accept: 'application/json', 'content-type': 'application/json' },
        }
      : { headers: { accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
};
