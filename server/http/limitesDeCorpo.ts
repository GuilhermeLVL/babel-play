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
 * - `/api/ai` e `/api/tutor`: prompts de tradução e do tutor com contexto da sessão.
 * - `/api/anki/imports`: um lote da importação do Anki em lotes leva até 500 notas, cada uma com os
 *   campos brutos (HTML) do baralho (`lotesDeNotasSchema` em `validation.ts`).
 */
export const ROTAS_DE_CORPO_GRANDE: readonly string[] = [
  '/api/sessions',
  '/api/vocab/bulk-add',
  '/api/ai',
  '/api/tutor',
  '/api/anki/imports',
]

/** Teto das rotas de `ROTAS_DE_CORPO_MEDIO`, só depois do auth. */
export const LIMITE_MEDIO = '1mb'

/**
 * Prefixos com teto PRÓPRIO, entre o padrão e o grande, lidos também só depois do auth.
 *
 * - `/api/leitura`: o lote de anotações do leitor (até 200, cada uma com citação de 500 caracteres e nota de
 *   4.000). O cliente corta os lotes por BYTES abaixo de 90 KB (`src/lib/livros/anotacoesDoLivro.ts`); 1 MB é a
 *   folga de quem fala com a API direto, sem chegar aos 5 MB do teto grande.
 */
export const ROTAS_DE_CORPO_MEDIO: readonly string[] = ['/api/leitura']

/** Teto das rotas de `ROTAS_DE_CORPO_MINIMO`. */
export const LIMITE_MINIMO = '8kb'

/**
 * O outro lado da mesma disciplina: rotas PÚBLICAS cujo corpo legítimo é minúsculo, e que por isso
 * não precisam nem dos 100 KB do teto padrão.
 *
 * - `/api/metricas`: a telemetria anônima de captura (`server/routes/metricasCaptura.ts`). Quatro
 *   listas de até 200 números e dois nomes de motor — ~6 KB no pior caso legítimo. Sem conta e sem
 *   token, é a rota em que o custo de um corpo grande cai inteiro sobre o servidor.
 */
export const ROTAS_DE_CORPO_MINIMO: readonly string[] = ['/api/metricas']

const casaPrefixo = (lista: readonly string[], caminho: string): boolean =>
  lista.some((p) => caminho === p || caminho.startsWith(`${p}/`))

/** O caminho pertence a uma rota de corpo grande? Casa o prefixo inteiro, nunca pedaço de nome. */
export function aceitaCorpoGrande(caminho: string): boolean {
  return casaPrefixo(ROTAS_DE_CORPO_GRANDE, caminho)
}

/** O caminho é lido depois do auth (corpo grande ou médio)? */
const lidoDepoisDoAuth = (caminho: string) =>
  casaPrefixo(ROTAS_DE_CORPO_GRANDE, caminho) || casaPrefixo(ROTAS_DE_CORPO_MEDIO, caminho)

/**
 * O parser montado NO TOPO da pilha. Pula as rotas de corpo grande — elas são lidas depois do
 * auth, por `jsonDepoisDoAuth()`. `express.json` não relê um corpo já lido, então as rotas que
 * montam o próprio parser (o webhook do Asaas, com 100 KB) continuam funcionando.
 */
export function jsonAntesDoAuth(): RequestHandler {
  const pequeno = express.json({ limit: LIMITE_PADRAO })
  const minimo = express.json({ limit: LIMITE_MINIMO })
  return (req, res, next) => {
    if (lidoDepoisDoAuth(req.path)) return next()
    return (casaPrefixo(ROTAS_DE_CORPO_MINIMO, req.path) ? minimo : pequeno)(req, res, next)
  }
}

/** O parser das rotas de corpo grande, montado DEPOIS do `authMiddleware`. */
export function jsonDepoisDoAuth(): RequestHandler {
  return express.json({ limit: LIMITE_GRANDE })
}

/** O parser das rotas de corpo médio (`ROTAS_DE_CORPO_MEDIO`), montado DEPOIS do `authMiddleware`. */
export function jsonMedioDepoisDoAuth(): RequestHandler {
  return express.json({ limit: LIMITE_MEDIO })
}
