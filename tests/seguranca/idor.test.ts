/**
 * IDOR — o usuário B tentando alcançar o recurso de A pelo id de A.
 *
 * GERADO A PARTIR DA MATRIZ (`_matriz.ts`): a lista de casos não é escrita à mão, ela sai das rotas
 * PRIVADAS que têm parâmetro no caminho, lidas do `app._router.stack`. É o que faz o teste
 * envelhecer bem — uma rota nova com `:id` não passa despercebida, ela DERRUBA a suíte no caso
 * `toda rota privada com parametro tem semeadura declarada` até alguém dizer como semeá-la.
 *
 * O que cada caso faz, nesta ordem:
 *   1. semeia um recurso NOVO do usuário A (um por caso — assim um DELETE legítimo de A no fim não
 *      contamina o caso seguinte);
 *   2. o usuário B chama a rota com o id de A, com CORPO VÁLIDO onde a rota exige corpo — um 400 de
 *      schema não prova isolamento nenhum, prova que a validação roda antes da autorização;
 *   3. confere que o recurso de A continua lá (B não pode ter efeito, nem quando a resposta é 200);
 *   4. só então A chama a mesma rota, para provar que a semeadura era real e o caso não passou por
 *      vacuidade — uma rota que responde 404 para todo mundo "isolaria" perfeitamente.
 *
 * O QUE É FALHA: 5xx, o corpo da resposta de B carregando o marcador de A, ou o recurso de A tendo
 * mudado. O esperado é 403 ou 404; qualquer outro status precisa estar em `STATUS_FORA_DO_PADRAO`
 * com a razão — as entradas de lá são respostas SEM dado e SEM efeito, registradas para não
 * passarem por normais.
 *
 * `/api/admin` fica FORA da regra de IDOR: aquelas rotas são cross-tenant por desenho (é a única
 * porta para dado de outro dono, e o `requireRole` é a guarda). Elas entram no último caso, com a
 * expectativa de 403 para quem não tem papel.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { lerMatriz, type Matriz } from './_matriz'

/** Aparece dentro de todo dado semeado de A. Se ele voltar numa resposta de B, vazou. */
const MARCADOR = 'zzmarcadordousuarioa'

/** WebM mínimo: os magic bytes do EBML mais enchimento — `detectarAudio` decide pelo conteúdo. */
const AUDIO_WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60, 0x21)])

/** PNG 1×1, para a sessão de A ter capa embutida de verdade (senão `/capa` é 404 para os dois). */
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * Um alvo pronto: o caminho concreto com o id de A, o que mandar no corpo, e como conferir que o
 * recurso de A continua intacto depois da tentativa de B.
 */
interface Alvo {
  caminho: string
  corpo?: unknown
  raw?: Buffer
  headers?: Record<string, string>
  aindaExiste: () => Promise<boolean>
}

/**
 * As respostas que NÃO são 403 nem 404, com a razão de cada uma.
 *
 * Nenhuma delas devolve dado de A nem tem efeito — o que elas fazem é responder igual para id
 * alheio e para id inexistente, o que é a postura certa (não confirma que o id existe). Ficam
 * registradas aqui porque "200" numa tabela de IDOR precisa de explicação escrita, e não de um
 * `.toBe(200)` que alguém copiou.
 */
const STATUS_FORA_DO_PADRAO: Record<string, { status: number; razao: string }> = {
  'DELETE /api/sessions/:id': {
    status: 200,
    razao:
      'a rota lê a sessão com `sessionsRepo.get(req.userId, id)` (que devolve `undefined` para sessão alheia, e por isso nem o áudio é tocado), chama `remove` também escopado e responde `{ok:true}` sem olhar o resultado. Nada de A é apagado — o caso confere isso relendo a sessão logo depois — e a resposta é idêntica à de um id inventado.',
  },
  'DELETE /api/vocab/:id': {
    status: 200,
    razao:
      'a rota descarta o booleano de `vocabRepo.remove` e responde `{ok:true}` sempre — inclusive para id inexistente. Nada é apagado (o UPDATE tem `AND user_id`), nada de A volta, e não dá para distinguir "não era seu" de "não existe".',
  },
  'GET /api/vocab/:id/ocorrencias': {
    status: 200,
    razao:
      '`vocabRepo.ocorrencias` filtra por `user_id`, então a consulta de B devolve a lista VAZIA — o mesmo que para um id inventado. 200 com `[]` não é dado de A.',
  },
  'POST /api/vocab/:id/review': {
    status: 400,
    razao:
      '`vocabRepo.review` lança "card não encontrado" quando o `get` escopado não acha, e o `catch` da rota transforma em 400. Deveria ser 404 (é a mesma condição de `PATCH /api/vocab/:id`), mas não vaza nem altera nada — é forma de resposta, não isolamento.',
  },
}

describe('IDOR — usuario B contra os recursos de A', () => {
  let s: AppDeTeste
  let m: Matriz
  let ta: string
  let tb: string
  /** Semeadura por rota, montada depois do `subirApp` porque toda ela precisa do app de pé. */
  let semeaduras: Record<string, () => Promise<Alvo>>

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
    const { criarApp } = await s.load('../../server/http/app')
    m = lerMatriz(criarApp({}))
    ta = await s.token('usuario-a')
    tb = await s.token('usuario-b')
    /* As duas contas precisam EXISTIR antes: o `authMiddleware` provisiona no primeiro request. */
    await s.get('/api/me', ta)
    await s.get('/api/me', tb)

    /* ── semeadores, um por tipo de recurso ─────────────────────────────────────────────── */

    /** Uma sessão de A com uma fala, recém-criada. Devolve os dois ids. */
    const novaSessao = async (): Promise<{ id: string; uid: string }> => {
      const r = await s.post(
        '/api/sessions',
        {
          title: `sessao ${MARCADOR}`,
          kind: 'live',
          sourceLang: 'en',
          targetLang: 'pt',
          status: 'done',
          utterances: [
            {
              idx: 0,
              source: 'mic',
              speakerName: 'A',
              sourceLang: 'en',
              sourceText: `fala ${MARCADOR}`,
              targetLang: 'pt',
              translatedText: `traducao ${MARCADOR}`,
              tStartMs: 0,
              tEndMs: 1000,
            },
          ],
        },
        ta,
      )
      const criada = (await r.json()) as { id: string }
      const detalhe = (await (await s.get(`/api/sessions/${criada.id}`, ta)).json()) as {
        utterances: Array<{ id: string }>
      }
      return { id: criada.id, uid: detalhe.utterances[0].id }
    }
    const sessaoExiste = (id: string) => async () => (await s.get(`/api/sessions/${id}`, ta)).status === 200

    /**
     * Um cartão de vocabulário de A, um por rota.
     *
     * A PALAVRA PRECISA SER PALAVRA. A primeira versão semeava `${MARCADOR}1`, `${MARCADOR}2`… e o
     * `bulkAdd` descartava tudo em silêncio: a régua de qualidade (`core/learning/quality.ts`)
     * reprova dígito na palavra como `palavra-ruido`. O marcador foi para a TRADUÇÃO, que é o campo
     * que volta no corpo das respostas e é onde o vazamento apareceria.
     */
    const novoCartao = async (palavra: string): Promise<string> => {
      await s.post(
        '/api/vocab/bulk-add',
        {
          cards: [
            {
              word: palavra,
              back: `traducao ${MARCADOR}`,
              sentence: `frase com ${palavra}.`,
              srcLang: 'en',
              tgtLang: 'pt',
            },
          ],
        },
        ta,
      )
      const lista = (await (await s.get('/api/vocab', ta)).json()) as Array<{ id: string; word: string }>
      const achado = lista.find((c) => c.word === palavra)
      if (!achado) throw new Error(`semeadura de cartão falhou: ${palavra}`)
      return achado.id
    }
    const cartaoExiste = (id: string) => async () => {
      const lista = (await (await s.get('/api/vocab', ta)).json()) as Array<{ id: string }>
      return lista.some((c) => c.id === id)
    }

    /** Um baralho Anki de A com uma nota e um ledger de import — sem `.apkg`, direto no repositório. */
    const { ankiRepo } = await s.load('../../server/db/repositories/anki')
    const { asUserId } = await s.load('../../server/lib/authContext')
    const A = asUserId('usuario-a')
    let contadorDeDeck = 0
    const novoBaralho = async (): Promise<{ deckId: string; importId: string }> => {
      const n = ++contadorDeDeck
      const deck = await ankiRepo.criarOuAcharDeck(A, {
        nome: `baralho ${MARCADOR} ${n}`,
        arquivoOrigem: `${MARCADOR}-${n}.apkg`,
      })
      const imp = await ankiRepo.criarImport(A, { deckId: deck.id, arquivo: `${MARCADOR}-${n}.apkg` })
      await ankiRepo.gravarNotas(A, deck.id, imp.id, [
        { guid: `${MARCADOR}-${n}`, frente: `frente ${MARCADOR}`, verso: `verso ${MARCADOR}` },
      ])
      return { deckId: deck.id, importId: imp.id }
    }
    const baralhoExiste = (id: string) => async () => {
      const decks = (await (await s.get('/api/anki/decks', ta)).json()) as Array<{ id: string }>
      return decks.some((d) => d.id === id)
    }

    /** Uma credencial de IA de A (o segredo vai cifrado para `secrets`; a rota nunca o devolve). */
    const novaCredencial = async (): Promise<string> => {
      const r = await s.post(
        '/api/ai/credentials',
        { label: `credencial ${MARCADOR}`, kind: 'openai', secret: `sk-${MARCADOR}` },
        ta,
      )
      return ((await r.json()) as { id: string }).id
    }
    const credencialExiste = (id: string) => async () => {
      const lista = (await (await s.get('/api/ai/credentials', ta)).json()) as Array<{ id: string }>
      return lista.some((c) => c.id === id)
    }

    semeaduras = {
      'GET /api/sessions/:id': async () => {
        const { id } = await novaSessao()
        return { caminho: `/api/sessions/${id}`, aindaExiste: sessaoExiste(id) }
      },
      'PATCH /api/sessions/:id': async () => {
        const { id } = await novaSessao()
        return { caminho: `/api/sessions/${id}`, corpo: { title: 'renomeado por B' }, aindaExiste: sessaoExiste(id) }
      },
      'DELETE /api/sessions/:id': async () => {
        const { id } = await novaSessao()
        return { caminho: `/api/sessions/${id}`, aindaExiste: sessaoExiste(id) }
      },
      'PATCH /api/sessions/:id/meta': async () => {
        const { id } = await novaSessao()
        return { caminho: `/api/sessions/${id}/meta`, corpo: { pinned: true }, aindaExiste: sessaoExiste(id) }
      },
      'PUT /api/sessions/:id/utterances': async () => {
        const { id } = await novaSessao()
        return {
          caminho: `/api/sessions/${id}/utterances`,
          corpo: {
            utterances: [
              {
                idx: 0,
                source: 'mic',
                speakerName: 'B',
                sourceLang: 'en',
                sourceText: 'sobrescrito por B',
                targetLang: 'pt',
                translatedText: 'x',
                tStartMs: 0,
                tEndMs: 10,
              },
            ],
          },
          aindaExiste: sessaoExiste(id),
        }
      },
      'PATCH /api/sessions/utterances/:uid': async () => {
        const { id, uid } = await novaSessao()
        return {
          caminho: `/api/sessions/utterances/${uid}`,
          corpo: { sourceText: 'sobrescrito por B' },
          /* Aqui "intacto" é mais do que existir: o texto de A não pode ter mudado. */
          aindaExiste: async () => {
            const d = (await (await s.get(`/api/sessions/${id}`, ta)).json()) as {
              utterances: Array<{ id: string; sourceText: string }>
            }
            return d.utterances.some((u) => u.id === uid && u.sourceText.includes(MARCADOR))
          },
        }
      },
      'GET /api/sessions/:id/capa': async () => {
        const { id } = await novaSessao()
        await s.patch(`/api/sessions/${id}/meta`, { imageUrl: PNG_1X1 }, ta)
        return { caminho: `/api/sessions/${id}/capa`, aindaExiste: sessaoExiste(id) }
      },
      'POST /api/sessions/:id/audio': async () => {
        const { id } = await novaSessao()
        return {
          caminho: `/api/sessions/${id}/audio`,
          raw: AUDIO_WEBM,
          headers: { 'content-type': 'audio/webm' },
          aindaExiste: sessaoExiste(id),
        }
      },
      'GET /api/sessions/:id/audio': async () => {
        const { id } = await novaSessao()
        await s.chamar('POST', `/api/sessions/${id}/audio`, {
          token: ta,
          raw: AUDIO_WEBM,
          headers: { 'content-type': 'audio/webm' },
        })
        return { caminho: `/api/sessions/${id}/audio`, aindaExiste: sessaoExiste(id) }
      },
      'GET /api/vocab/:id/ocorrencias': async () => {
        const id = await novoCartao('harvest')
        return { caminho: `/api/vocab/${id}/ocorrencias`, aindaExiste: cartaoExiste(id) }
      },
      'PATCH /api/vocab/:id': async () => {
        const id = await novoCartao('garden')
        return { caminho: `/api/vocab/${id}`, corpo: { back: 'reescrito por B' }, aindaExiste: cartaoExiste(id) }
      },
      'POST /api/vocab/:id/review': async () => {
        const id = await novoCartao('bridge')
        return { caminho: `/api/vocab/${id}/review`, corpo: { grade: 3 }, aindaExiste: cartaoExiste(id) }
      },
      'DELETE /api/vocab/:id': async () => {
        const id = await novoCartao('lantern')
        return { caminho: `/api/vocab/${id}`, aindaExiste: cartaoExiste(id) }
      },
      'GET /api/anki/decks/:id/notas': async () => {
        const { deckId } = await novoBaralho()
        return { caminho: `/api/anki/decks/${deckId}/notas`, aindaExiste: baralhoExiste(deckId) }
      },
      'POST /api/anki/decks/:id/ativar': async () => {
        const { deckId } = await novoBaralho()
        return { caminho: `/api/anki/decks/${deckId}/ativar`, corpo: { limite: 1 }, aindaExiste: baralhoExiste(deckId) }
      },
      'POST /api/anki/decks/:id/desativar': async () => {
        const { deckId } = await novoBaralho()
        return { caminho: `/api/anki/decks/${deckId}/desativar`, corpo: {}, aindaExiste: baralhoExiste(deckId) }
      },
      'DELETE /api/anki/decks/:id': async () => {
        const { deckId } = await novoBaralho()
        return { caminho: `/api/anki/decks/${deckId}`, corpo: { confirmar: true }, aindaExiste: baralhoExiste(deckId) }
      },
      'GET /api/anki/imports/:id': async () => {
        const { deckId, importId } = await novoBaralho()
        return { caminho: `/api/anki/imports/${importId}`, aindaExiste: baralhoExiste(deckId) }
      },
      'DELETE /api/ai/credentials/:id': async () => {
        const id = await novaCredencial()
        return { caminho: `/api/ai/credentials/${id}`, aindaExiste: credencialExiste(id) }
      },
    }
    /* Migração do banco efêmero + provisionamento das duas contas passam dos 10 s de default. */
  }, 60_000)

  afterAll(async () => {
    await s?.encerrar()
  })

  /** As rotas que a matriz manda testar: privadas, com parâmetro, fora de `/api/admin`. */
  const alvosDaMatriz = () =>
    m.rotas.filter((r) => r.privada && r.parametros.length > 0 && !r.caminho.startsWith('/api/admin'))

  it('toda rota privada com parametro tem semeadura declarada', () => {
    const chaves = alvosDaMatriz().map((r) => r.chave)
    expect(chaves.length, 'a matriz não encontrou rota com parâmetro — a leitura da pilha quebrou').toBeGreaterThan(10)
    const semSemeadura = chaves.filter((c) => !(c in semeaduras))
    expect(semSemeadura, 'rota com id no caminho e sem caso de IDOR: declare a semeadura em `idor.test.ts`').toEqual([])
    const orfas = Object.keys(semeaduras).filter((c) => !chaves.includes(c))
    expect(orfas, 'semeadura para rota que não existe mais: apague').toEqual([])
  })

  it('B nao alcanca o recurso de A em nenhuma rota com id no caminho', async () => {
    const resultados: Array<{ chave: string; statusB: number; statusA: number; vazou: boolean; intacto: boolean }> = []
    const achados: string[] = []

    for (const rota of alvosDaMatriz()) {
      const alvo = await semeaduras[rota.chave]()
      const opcoes = { body: alvo.corpo, raw: alvo.raw, headers: alvo.headers }

      const rB = await s.chamar(rota.metodo, alvo.caminho, { ...opcoes, token: tb })
      const corpoB = await rB.text()
      const vazou = corpoB.includes(MARCADOR)
      const intacto = await alvo.aindaExiste()

      /* A por ÚLTIMO: alguns verbos são destrutivos, e é a confirmação de que a semeadura vale. */
      const rA = await s.chamar(rota.metodo, alvo.caminho, { ...opcoes, token: ta })

      resultados.push({ chave: rota.chave, statusB: rB.status, statusA: rA.status, vazou, intacto })

      if (rB.status === 200 && vazou) {
        // ACHADO DE SEGURANCA: 200 com dado de A para o token de B — não corrigido aqui de
        // propósito (decisão do dono, Fase 4). Ver o relatório da rodada.
        achados.push(`${rota.chave}: 200 com dado de A no corpo`)
      }
    }

    if (process.env.MATRIZ === '1') {
      const linhas = [
        '',
        '## IDOR — B contra A',
        '',
        '| Rota | B | A | vazou? | recurso de A intacto? |',
        '| --- | --- | --- | --- | --- |',
      ]
      for (const r of resultados)
        linhas.push(
          `| \`${r.chave}\` | ${r.statusB} | ${r.statusA} | ${r.vazou ? 'SIM' : 'não'} | ${r.intacto ? 'sim' : 'NÃO'} |`,
        )
      console.log(`${linhas.join('\n')}\n`)
    }

    /* 1. o corpo de B nunca carrega o marcador de A — é a definição operacional de vazamento. */
    expect(achados, 'ACHADO DE SEGURANCA: rota devolvendo dado de outro usuário').toEqual([])
    expect(resultados.filter((r) => r.vazou).map((r) => r.chave)).toEqual([])

    /* 2. a tentativa de B não teve efeito nenhum sobre o recurso de A. */
    expect(
      resultados.filter((r) => !r.intacto).map((r) => r.chave),
      'a chamada de B alterou o recurso de A',
    ).toEqual([])

    /* 3. nada de 5xx: uma exceção não tratada é falha de isolamento com outro nome (e, em rota de
          escrita, um vetor barato de derrubar o processo com id alheio). */
    expect(resultados.filter((r) => r.statusB >= 500).map((r) => r.chave)).toEqual([])

    /* 4. o status é 403 ou 404, ou está registrado com a razão em `STATUS_FORA_DO_PADRAO`. */
    const foraDoPadrao = resultados.filter((r) => r.statusB !== 403 && r.statusB !== 404)
    const naoRegistradas = foraDoPadrao
      .filter((r) => STATUS_FORA_DO_PADRAO[r.chave]?.status !== r.statusB)
      .map((r) => `${r.chave} respondeu ${r.statusB}`)
    expect(
      naoRegistradas,
      'status inesperado para acesso cruzado: registre em STATUS_FORA_DO_PADRAO com a razão, ou corrija a rota',
    ).toEqual([])

    /* 5. o caso não passou por vacuidade: a MESMA chamada, com o token de A, funciona. */
    const semeaduraMorta = resultados
      .filter((r) => r.statusA === 404 || r.statusA === 401 || r.statusA === 403)
      .map((r) => `${r.chave} respondeu ${r.statusA} para o próprio dono`)
    expect(semeaduraMorta, 'a semeadura não produziu recurso alcançável — o caso estaria "isolando" o nada').toEqual([])
  }, 60_000)

  it('as excecoes de status registradas ainda descrevem o comportamento', () => {
    for (const [chave, { razao }] of Object.entries(STATUS_FORA_DO_PADRAO)) {
      expect(
        m.rotas.some((r) => r.chave === chave),
        `exceção para rota inexistente: ${chave}`,
      ).toBe(true)
      expect(razao.trim().length, `${chave} sem razão escrita`).toBeGreaterThan(40)
    }
  })

  /**
   * `/api/admin` é cross-tenant POR DESENHO — é a única porta para dado de outro dono, e o que a
   * fecha é o `requireRole`, não o escopo por `UserId`. Então a pergunta muda: em vez de "B alcança
   * o recurso de A?", é "quem não tem papel é barrado em TODAS elas?".
   */
  it('rotas de /api/admin respondem 403 para usuario sem papel', async () => {
    const rotas = m.rotas.filter((r) => r.caminho.startsWith('/api/admin'))
    expect(rotas.length).toBeGreaterThanOrEqual(9)
    const corpos: Record<string, unknown> = {
      'PATCH /api/admin/users/:id': { role: 'admin' },
      'PATCH /api/admin/users/:id/plan': { plan: 'pro' },
    }
    const fora: string[] = []
    for (const rota of rotas) {
      /* O id de A no lugar do parâmetro: é a tentativa realista — B mirando a conta de A. */
      const caminho = rota.caminho.replace(/:\w+/g, 'usuario-a')
      const r = await s.chamar(rota.metodo, caminho, { body: corpos[rota.chave], token: tb })
      const texto = await r.text()
      if (r.status !== 403 || texto.includes(MARCADOR)) fora.push(`${rota.chave} → ${r.status}`)
    }
    expect(fora, 'rota admin alcançada por conta sem papel').toEqual([])
  }, 30_000)
})
