/**
 * CACHE DE TRADUÇÃO NO SERVIDOR (Fase 2 do lançamento — não pagar duas vezes pela mesma frase).
 *
 * Legenda de vídeo, aula gravada e conversa repetem frase o tempo todo. O cliente já guardava as
 * traduções da PRÓPRIA aba (`translationCacheRef`, 300 entradas); o servidor não guardava nada, e
 * cada aba, cada sessão e cada assinante pagava de novo o mesmo "Thank you.".
 *
 * A CHAVE é o SHA-256 de: frase normalizada (NFC, espaços colapsados, minúsculas) + origem +
 * destino + natureza (fala ou texto, e o CONTEXTO da fala, que muda pronome e tempo) + MODELO. O
 * modelo entra porque o Pro recebe um modelo maior (`LLM_MODEL_GRANDE`): servir a ele a tradução do
 * modelo menor seria vender uma coisa e entregar outra. Hash, e não a frase, para a chave não
 * guardar texto de ninguém em claro.
 *
 * EM MEMÓRIA E POR PROCESSO, de propósito: é um cache de CUSTO, não de verdade — perder tudo num
 * deploy só custa as primeiras traduções de novo. Um cache compartilhado (Redis) entraria com mais
 * de uma réplica, e o ganho a mais seria pequeno perto do que cada processo já economiza.
 *
 * LIMITES: TTL de 24 h (modelo e prompt mudam por deploy; um dia é o horizonte em que a mesma aula
 * é revista) e 2.000 entradas em LRU. Só entra frase de até 500 caracteres — legenda e fala, que é o
 * que se repete; parágrafo de leitura raramente se repete e ocuparia a memória de cem legendas.
 */
import { createHash } from 'node:crypto'

export interface TraducaoGuardada {
  texto: string
  /** O modelo que REALMENTE traduziu (pode ser o da reserva) — vai para a procedência. */
  modelo: string
}

interface Entrada extends TraducaoGuardada {
  expiraEm: number
}

export const TTL_PADRAO_MS = 24 * 60 * 60 * 1000
export const MAX_ENTRADAS_PADRAO = 2_000
/** Só frases curtas entram: são as que se repetem. */
export const MAX_CARACTERES_NO_CACHE = 500

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

const normalizar = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

export function chaveDeTraducao(p: {
  texto: string
  src?: string
  tgt: string
  falada: boolean
  contexto?: ReadonlyArray<string>
  modelo: string
}): string {
  const partes = [
    normalizar(p.texto),
    (p.src ?? '').toLowerCase(),
    p.tgt.toLowerCase(),
    p.falada ? 'fala' : 'texto',
    p.falada ? (p.contexto ?? []).map(normalizar).join('\u0001') : '',
    p.modelo,
  ]
  return createHash('sha256').update(partes.join('\u0000')).digest('hex')
}

/** O cache do processo. */
export const cacheDeTraducao = criarCacheDeTraducao()

/** Só para testes: começa cada caso sem traduções guardadas. */
export function esvaziarCacheDeTraducao(): void {
  cacheDeTraducao.esvaziar()
}
