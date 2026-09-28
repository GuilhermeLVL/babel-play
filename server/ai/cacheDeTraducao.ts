/**
 * CACHE DE TRADUÇÃO NO SERVIDOR (Fase 2 do lançamento — não pagar duas vezes pela mesma frase), em
 * DOIS NÍVEIS desde a auditoria de eficiência da IA de 28/09 (relatório §6, fase 1, item 2).
 *
 * Legenda de vídeo, aula gravada e conversa repetem frase o tempo todo. O cliente já guardava as
 * traduções da PRÓPRIA aba (`translationCacheRef`, 300 entradas); o servidor não guardava nada, e
 * cada aba, cada sessão e cada assinante pagava de novo o mesmo "Thank you.".
 *
 * A CHAVE é o SHA-256 de: frase normalizada (`normalizarFrase`) + origem + destino + natureza (fala
 * ou texto) + CONTEXTO da fala + MODELO + VERSÃO DO PROMPT. O modelo entra porque o Pro recebe um
 * modelo maior (`LLM_MODEL_GRANDE`): servir a ele a tradução do modelo menor seria vender uma coisa e
 * entregar outra. A versão do prompt (hash do texto dos prompts, `mtProxy.ts`) entra porque o L2 dura
 * 30 dias e atravessa deploys: prompt novo não herda tradução do antigo. Hash, e não a frase, para a
 * chave não guardar texto de ninguém em claro.
 *
 * FRASE CURTA SEM CONTEXTO (≤ `MAX_PALAVRAS_SEM_CONTEXTO` palavras). A fala do microfone levava os 3
 * turnos anteriores na chave e quase nunca acertava — e é justamente a fala curta ("ok", "thank you",
 * "let's go") que mais se repete e menos depende do contexto. Acima disso o contexto continua na
 * chave: é ele que resolve pronome e tempo, e uma frase longa com contexto diferente pode pedir outra
 * tradução.
 *
 * L1 — EM MEMÓRIA E POR PROCESSO: TTL de 24 h e 2.000 entradas em LRU. Só entra frase de até 500
 * caracteres — legenda e fala, que é o que se repete; parágrafo raramente se repete e ocuparia a
 * memória de cem legendas.
 *
 * L2 — SQLITE (`cache_de_traducao`, migração 0038): sobrevive a deploy e a despejo do L1. TTL de 30
 * dias contado da CRIAÇÃO (o acerto não renova: 30 dias é também o teto de retenção), teto de linhas
 * com poda diária das menos usadas. PRIVACIDADE (LGPD art. 12/14 — o público inclui menores):
 *   - NUNCA guarda quem pediu: sem `user_id`, sem IP. A linha é compartilhada por todos que dizem a
 *     mesma frase, e por isso não é dado do titular (fica fora de `TABELAS_DO_TITULAR`);
 *   - não guarda a frase de origem (só o hash); guarda a TRADUÇÃO, que é o que se serve — e uma
 *     tradução revela a frase. Daí o limite: só vai ao disco texto de até
 *     `MAX_PALAVRAS_PERSISTIDAS` palavras, e fala de até `MAX_PALAVRAS_FALA_PERSISTIDA` (a fala é
 *     conversa espontânea, mais íntima que legenda). Frase curta e normalizada é a única que aceita
 *     partilha global: "thank you" não identifica ninguém; doze palavras de uma conversa podem;
 *   - frase com cara de dado pessoal (número longo, e-mail, endereço web) não vai ao disco.
 *
 * SEM BUSCA APROXIMADA AQUI, de propósito (harness §1.2, M2). O cliente tem a camada aproximada
 * (`src/lib/traducao/memoriaAproximada.ts`: 3-gramas ≥ 0,9, número/negação/pronome/nome idênticos),
 * mas ela precisa do TEXTO de origem para comparar — e este cache só guarda o hash dele, que é a
 * decisão de privacidade acima. Guardar a frase em claro para ganhar a aproximada trocaria uma
 * garantia de LGPD por uma economia pequena: caixa, espaço e pontuação final já caem na
 * `normalizarFrase`, e a variação que sobra (vírgula no meio, uma letra) o cliente resolve antes de
 * a frase chegar aqui.
 *
 * O L2 é carregado PREGUIÇOSAMENTE (import dinâmico do repositório): este módulo é importado
 * estaticamente por testes que ainda não apontaram o `DATABASE_URL` para o banco efêmero, e importar
 * `server/db/db` aqui ligaria o processo ao banco errado. Falha do L2 vira falta, nunca erro de rota.
 */
import { createHash } from 'node:crypto'

import type { cacheDeTraducaoRepo } from '../db/repositories/cacheDeTraducao'
import { log } from '../lib/logger'

export interface TraducaoGuardada {
  texto: string
  /** O modelo que REALMENTE traduziu (pode ser o da reserva) — vai para a procedência. */
  modelo: string
}

interface Entrada extends TraducaoGuardada {
  expiraEm: number
}

const DIA_MS = 86_400_000

export const TTL_PADRAO_MS = DIA_MS
export const MAX_ENTRADAS_PADRAO = 2_000
/** Só frases curtas entram: são as que se repetem. */
export const MAX_CARACTERES_NO_CACHE = 500

/** Até quantas palavras (normalizadas) a chave ignora o contexto da conversa. */
export const MAX_PALAVRAS_SEM_CONTEXTO = 4
/** Até quantas palavras um TEXTO (legenda, importação) vai ao disco (L2). */
export const MAX_PALAVRAS_PERSISTIDAS = 12
/** Até quantas palavras uma FALA (microfone) vai ao disco — sempre sem contexto na chave. */
export const MAX_PALAVRAS_FALA_PERSISTIDA = 4
/** O L2 vale 30 dias desde a criação da linha. */
export const TTL_PERSISTENTE_MS = 30 * DIA_MS
/** Teto de linhas do L2: ~100 mil frases curtas são poucos MB, e a poda diária segura o resto. */
export const MAX_LINHAS_PERSISTIDAS = 100_000

export function criarCacheDeTraducao({ ttlMs = TTL_PADRAO_MS, max = MAX_ENTRADAS_PADRAO } = {}) {
  // `Map` preserva a ordem de inserção: reinserir ao ler faz dela uma LRU sem estrutura extra.
  const mapa = new Map<string, Entrada>()
  return {
    ler(chave: string): TraducaoGuardada | null {
      const e = mapa.get(chave)
      if (!e) return null
      if (e.expiraEm <= Date.now()) {
        mapa.delete(chave)
        return null
      }
      mapa.delete(chave)
      mapa.set(chave, e)
      return { texto: e.texto, modelo: e.modelo }
    },
    guardar(chave: string, valor: TraducaoGuardada): void {
      mapa.delete(chave)
      mapa.set(chave, { ...valor, expiraEm: Date.now() + ttlMs })
      while (mapa.size > max) {
        const maisAntiga = mapa.keys().next().value
        if (maisAntiga === undefined) break
        mapa.delete(maisAntiga)
      }
    },
    esvaziar(): void {
      mapa.clear()
    },
    /** Entradas guardadas agora (inclui as já vencidas que ninguém leu) — para a métrica. */
    tamanho(): number {
      return mapa.size
    },
  }
}

const normalizarContexto = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * A frase como a chave a vê: NFC, minúsculas, espaços colapsados e SEM a pontuação final — "Thank
 * you." e "thank you" são a mesma frase. A INTERROGAÇÃO FICA: "Ready?" e "Ready." são frases
 * diferentes, e em português só a pontuação separa a pergunta da afirmação ("Pronto?" × "Pronto.").
 */
export function normalizarFrase(s: string): string {
  return normalizarContexto(s).replace(/[\s.!,;:…。！，、]+$/u, '')
}

export function contarPalavras(s: string): number {
  const n = normalizarFrase(s)
  return n === '' ? 0 : n.split(' ').length
}

/* Número de 5+ dígitos (telefone, documento, cartão), e-mail ou endereço web: não vai ao disco.
   Heurística barata, de propósito conservadora — errar para o lado de NÃO guardar só custa uma
   tradução paga de novo. */
const PARECE_DADO_PESSOAL = /\d[\d\s.-]{3,}\d|@|https?:\/\/|www\./i

/** Se a frase pode ir ao L2 (disco, compartilhado entre usuários). Ver PRIVACIDADE no topo. */
export function podePersistir(p: { texto: string; falada: boolean }): boolean {
  const palavras = contarPalavras(p.texto)
  const teto = p.falada ? MAX_PALAVRAS_FALA_PERSISTIDA : MAX_PALAVRAS_PERSISTIDAS
  return palavras > 0 && palavras <= teto && !PARECE_DADO_PESSOAL.test(p.texto)
}

export interface ConsultaDeTraducao {
  texto: string
  src?: string
  tgt: string
  falada: boolean
  contexto?: ReadonlyArray<string>
  /** O modelo PLANEJADO (o primeiro da cascata) — o que o plano promete. */
  modelo: string
  /** Hash curto do texto dos prompts (`mtProxy.ts`). */
  versaoDoPrompt?: string
}

export function chaveDeTraducao(p: ConsultaDeTraducao): string {
  const semContexto = !p.falada || contarPalavras(p.texto) <= MAX_PALAVRAS_SEM_CONTEXTO
  const partes = [
    normalizarFrase(p.texto),
    (p.src ?? '').toLowerCase(),
    p.tgt.toLowerCase(),
    p.falada ? 'fala' : 'texto',
    semContexto ? '' : (p.contexto ?? []).map(normalizarContexto).join('\u0001'),
    p.modelo,
    p.versaoDoPrompt ?? '',
  ]
  return createHash('sha256').update(partes.join('\u0000')).digest('hex')
}

/** O cache do processo (L1). */
export const cacheDeTraducao = criarCacheDeTraducao()

/* ── L2 ──────────────────────────────────────────────────────────────────────────────────────── */

type NivelPersistente = typeof cacheDeTraducaoRepo
let nivel2: NivelPersistente | null = null

async function nivelPersistente(): Promise<NivelPersistente> {
  nivel2 ??= (await import('../db/repositories/cacheDeTraducao')).cacheDeTraducaoRepo
  return nivel2
}

const mensagem = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 200)

export type ResultadoDoNivel = 'acerto' | 'falta'

export interface LeituraDoCache {
  guardada: TraducaoGuardada | null
  /** Quem serviu, se alguém serviu. */
  nivel: 'l1' | 'l2' | null
  /** O que cada nível respondeu; `null` = não consultado (frase fora do limite, ou L2 com erro). */
  l1: ResultadoDoNivel | null
  l2: ResultadoDoNivel | null
  /** O L2 foi de fato consultado (o teste de TTL confere). */
  consultouNivel2: boolean
}

/** Frase que cabe no cache (L1 e, se `podePersistir`, L2). */
export const cabeNoCache = (texto: string): boolean => texto.length <= MAX_CARACTERES_NO_CACHE

/**
 * L1, depois L2. O acerto no L2 sobe para o L1 e conta um acerto na linha (`usado_em`, que decide
 * a poda). Nunca lança: erro do banco é falta, com aviso no log.
 */
export async function lerTraducao(c: ConsultaDeTraducao): Promise<LeituraDoCache> {
  const vazio: LeituraDoCache = { guardada: null, nivel: null, l1: null, l2: null, consultouNivel2: false }
  if (!cabeNoCache(c.texto)) return vazio
  const chave = chaveDeTraducao(c)
  const daMemoria = cacheDeTraducao.ler(chave)
  if (daMemoria) return { ...vazio, guardada: daMemoria, nivel: 'l1', l1: 'acerto' }
  if (!podePersistir(c)) return { ...vazio, l1: 'falta' }

  try {
    const repo = await nivelPersistente()
    const agora = Date.now()
    const linha = await repo.ler(chave, agora - TTL_PERSISTENTE_MS)
    if (!linha) return { ...vazio, l1: 'falta', l2: 'falta', consultouNivel2: true }
    const guardada = { texto: linha.traducao, modelo: linha.modelo }
    cacheDeTraducao.guardar(chave, guardada)
    await repo.marcarAcerto(chave, agora).catch((err: unknown) => {
      log('warn', { event: 'mt_cache_l2_acerto_falhou', error: mensagem(err) })
    })
    return { guardada, nivel: 'l2', l1: 'falta', l2: 'acerto', consultouNivel2: true }
  } catch (err) {
    log('warn', { event: 'mt_cache_l2_leitura_falhou', error: mensagem(err) })
    return { ...vazio, l1: 'falta' }
  }
}

/**
 * Guarda no L1 e, se a frase pode (`podePersistir`), no L2. Tradução de mais do dobro do teto da
 * fonte não entra (resposta que desandou). Nunca lança.
 */
export async function guardarTraducao(c: ConsultaDeTraducao, valor: TraducaoGuardada): Promise<void> {
  if (!cabeNoCache(c.texto) || valor.texto.length > MAX_CARACTERES_NO_CACHE * 2) return
  const chave = chaveDeTraducao(c)
  cacheDeTraducao.guardar(chave, valor)
  if (!podePersistir(c)) return
  try {
    const agora = Date.now()
    await (await nivelPersistente()).gravar({
      chave,
      origem: (c.src ?? '').toLowerCase(),
      destino: c.tgt.toLowerCase(),
      modelo: valor.modelo,
      versaoPrompt: c.versaoDoPrompt ?? '',
      traducao: valor.texto,
      criadoEm: agora,
      usadoEm: agora,
    })
  } catch (err) {
    log('warn', { event: 'mt_cache_l2_gravacao_falhou', error: mensagem(err) })
  }
}

/** Uma passada de poda do L2: vencidas (30 dias) e, acima do teto, as menos usadas. */
export async function podarCacheDeTraducao(
  o: { agora?: number; maxLinhas?: number } = {},
): Promise<{ vencidas: number; excedentes: number }> {
  const repo = await nivelPersistente()
  const vencidas = await repo.apagarVencidas((o.agora ?? Date.now()) - TTL_PERSISTENTE_MS)
  const excedentes = await repo.apagarExcedentes(o.maxLinhas ?? MAX_LINHAS_PERSISTIDAS)
  if (vencidas + excedentes > 0) {
    log('info', { event: 'mt_cache_l2_poda', total: vencidas + excedentes })
  }
  return { vencidas, excedentes }
}

/**
 * Liga a poda diária do L2 — o mesmo padrão da limpeza de convidados e da retenção de áudio
 * (`server/lib/limpezaDeConvidados.ts`): no processo que prepara os dados, temporizador com
 * `unref()`, primeira passada minutos depois do boot. Devolve como desligar.
 */
export function agendarPodaDoCacheDeTraducao(o: { atrasoInicialMs?: number; intervaloMs?: number } = {}): () => void {
  let relogio: NodeJS.Timeout | undefined
  const rodar = async () => {
    try {
      await podarCacheDeTraducao()
    } catch (err) {
      log('error', { event: 'mt_cache_l2_poda_erro', error: mensagem(err) })
    }
  }
  const armar = (ms: number) => {
    relogio = setTimeout(() => {
      void rodar().finally(() => armar(o.intervaloMs ?? DIA_MS))
    }, ms)
    relogio.unref?.()
  }
  armar(o.atrasoInicialMs ?? 11 * 60_000)
  return () => {
    if (relogio) clearTimeout(relogio)
  }
}

/**
 * Só para testes: começa cada caso sem traduções guardadas — L1 e, se já foi carregado, o L2 (se
 * não foi, este processo não gravou nada nele). Devolve a promessa: o hook que a retorna (ou a
 * aguarda) só segue com o L2 vazio.
 */
export async function esvaziarCacheDeTraducao(): Promise<void> {
  cacheDeTraducao.esvaziar()
  if (nivel2) await nivel2.esvaziar()
}
