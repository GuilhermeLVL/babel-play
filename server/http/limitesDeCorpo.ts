/**
 * LIMITES DE CORPO JSON POR ROTA — GAP-015 da auditoria pré-deploy (2026-09-13).
 *
 * `app.use(express.json({ limit: '5mb' }))` ficava no topo da pilha, ANTES do `authMiddleware`.
 * Qualquer visitante, sem token, fazia o processo ler e fazer parse de 5 MB — o 401 só chegava
 * depois. Numa máquina de 1 GB, algumas dezenas dessas requisições em paralelo bastam para ocupar
 * o heap, e nenhuma delas passa por limitador por tenant (eles ficam depois do auth).
 *
 * A REGRA NOVA tem duas metades:
 *
 *   1. ANTES do auth, o teto é PEQUENO (`LIMITE_PADRAO`) em toda rota — o webhook, o ranking e o
 *      próprio 401 não precisam de mais do que isso;
 *   2. as rotas de `ROTAS_DE_CORPO_GRANDE` NÃO têm o corpo lido antes do auth. Sem token, recebem
 *      o 401 sem que o servidor gaste parse nenhum; com token, `jsonDepoisDoAuth()` aceita até
 *      `LIMITE_GRANDE`.
 *
 * A lista é curta de propósito e cada entrada diz POR QUE precisa de mais. Rota nova nasce com o
 * teto pequeno; ampliar é uma decisão escrita aqui, não um acidente de montagem.
 */
import express, { type RequestHandler } from 'express'

/** Teto de toda rota antes do auth, e das rotas comuns depois dele. */
export const LIMITE_PADRAO = '100kb'
/** Teto das rotas de `ROTAS_DE_CORPO_GRANDE`, só depois do auth. */
export const LIMITE_GRANDE = '5mb'

/**
 * Prefixos (caminho completo) cujo corpo JSON legitimamente passa de 100 KB.
 *
 * - `/api/sessions`: `POST /` e `PUT /:id/utterances` levam até 5.000 falas (`validation.ts`).
 * - `/api/vocab/bulk-add`: até 500 cartões com frase de exemplo.
 * - `/api/import/anki/export`: até 5.000 cartões para montar o `.apkg`.
 * - `/api/ai` e `/api/gemini`: prompts de tradução e do tutor com contexto da sessão.
 */
export const ROTAS_DE_CORPO_GRANDE: readonly string[] = [
  '/api/sessions',
  '/api/vocab/bulk-add',
  '/api/import/anki/export',
  '/api/ai',
  '/api/gemini',
]

/** O caminho pertence a uma rota de corpo grande? Casa o prefixo inteiro, nunca pedaço de nome. */
export function aceitaCorpoGrande(caminho: string): boolean {
  return ROTAS_DE_CORPO_GRANDE.some((p) => caminho === p || caminho.startsWith(`${p}/`))
}

/**
 * O parser montado NO TOPO da pilha. Pula as rotas de corpo grande — elas são lidas depois do
 * auth, por `jsonDepoisDoAuth()`. `express.json` não relê um corpo já lido, então as rotas que
 * montam o próprio parser (o webhook do Asaas, com 100 KB) continuam funcionando.
 */
export function jsonAntesDoAuth(): RequestHandler {
  const pequeno = express.json({ limit: LIMITE_PADRAO })
  return (req, res, next) => (aceitaCorpoGrande(req.path) ? next() : pequeno(req, res, next))
}

/** O parser das rotas de corpo grande, montado DEPOIS do `authMiddleware`. */
export function jsonDepoisDoAuth(): RequestHandler {
  return express.json({ limit: LIMITE_GRANDE })
}
