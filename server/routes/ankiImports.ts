/**
 * IMPORTAÇÃO DO ANKI EM LOTES (Fase 3 da migração para o Cloudflare Workers), montada sob `/api/anki`
 * pelo `ankiRouter` — mesmos middlewares: conta obrigatória e conta liberada.
 *
 *  - POST /imports                → abre o import: acha/cria o baralho e o ledger (`gravando`)
 *  - POST /imports/:id/notas      → grava um lote de até 500 notas
 *  - POST /imports/:id/fechar     → marca as ausentes, conclui e ativa o primeiro lote jogável
 *
 * POR QUE EM LOTES. A antiga rota binária (`POST /api/import/anki`, removida) precisava de disco temporário e de um
 * SQLite no servidor para abrir o `.apkg`, coisas que o Worker não tem. Agora quem lê o arquivo é o
 * navegador (`src/lib/anki/lerApkg.ts`), e o servidor só recebe as notas, em pedaços que cabem no
 * teto de corpo (`LIMITE_GRANDE`).
 *
 * O SERVIDOR NÃO CONFIA NO CLIENTE: a limpeza do campo (`limparCampo`), a identidade (`guidDaNota`,
 * derivada do conteúdo LIMPO quando não há guid), o hash da estrutura e a régua de qualidade
 * (`avaliarCartao`, perfil `'curado'`) são refeitos aqui, nota por nota, como a rota antiga fazia.
 *
 * Um import de outro usuário (ou inexistente) responde 404 nos dois casos — não revela qual.
 */
import { type Request, type Response, Router } from 'express'

import { decidirIdiomaOrigem, limparCampo, TETO_DE_NOTAS, versoEhDefinicao } from '../../src/core/anki'
import { avaliarCartao } from '../../src/core/learning/quality'
import { type AnkiImport, ankiRepo, lerPorMotivo, type NotaParaGravar } from '../db/repositories/anki'
import { vocabRepo } from '../db/repositories/vocab'
import { guidDaNota, hashDaEstrutura } from '../import/identidadeDaNota'
import { erroDeRota } from '../lib/erroDeRota'
import { responderErro } from '../lib/respostaDeErro'
import { abrirImportAnkiSchema, idParamSchema, lotesDeNotasSchema, parseOr400 } from '../validation'

export const ankiImportsRouter = Router()

/** Erro inesperado (banco): loga inteiro, responde genérico com o `requestId`. */
function falhaInterna(req: Request, res: Response, err: unknown): void {
  responderErro(
    res,
    500,
    erroDeRota(err, { event: 'anki_import_error', route: req.path, requestId: req.requestId }),
    'erro_interno',
  )
}

/**
 * O import do usuário, ainda aberto. Responde e devolve `null` quando não é: 404 se não existe ou é de
 * outra pessoa, 409 `import_fechado` se já foi concluído (ou falhou, ou foi abandonado).
 */
async function importAberto(req: Request, res: Response, id: string): Promise<AnkiImport | null> {
  const imp = await ankiRepo.lerImport(req.userId, id)
  if (!imp) {
    responderErro(res, 404, 'import não encontrado', 'import_nao_encontrado')
    return null
  }
  if (imp.estado !== 'gravando') {
    responderErro(res, 409, 'este import já foi fechado', 'import_fechado')
    return null
  }
  return imp
}

ankiImportsRouter.post('/imports', async (req, res) => {
  const body = parseOr400(abrirImportAnkiSchema, req.body, res)
  if (!body) return
  try {
    /* A amostra também vem do cliente: limpa aqui antes de olhar a escrita (S11) ou comparar frente
       com verso — uma tag HTML não pode decidir o idioma do baralho. */
    const amostra = body.amostra.map((a) => ({ frente: limparCampo(a.frente), verso: limparCampo(a.verso) }))

    /* S11: o idioma declarado vem do LOBBY, não do arquivo; `decidirIdiomaOrigem` o confere contra a
       escrita real das frentes antes de carimbar: importar um baralho japonês com o lobby em inglês carimbava
       `srcLang='en'` em milhares de cartões, e um cartão rotulado com o idioma errado nunca mais aparece
       certo no filtro. Sem idioma nenhum o cartão vira `idioma-incerto` na triagem; por isso o idioma
       declarado precisa chegar aqui. */
    const idioma = decidirIdiomaOrigem(
      body.idiomaOrigem ?? null,
      amostra.map((a) => a.frente),
    )
    /* Verso que repete a frente é definição monolíngue, não tradução: o idioma-alvo é o de origem. */
    const monolingue = versoEhDefinicao(amostra)

    const nomeDoDeck = body.baralhos?.[0] || body.arquivo.replace(/\.[^.]+$/, '') || 'baralho'
    const deck = await ankiRepo.criarOuAcharDeck(req.userId, {
      nome: nomeDoDeck,
      nomeNoArquivo: body.nomeNoArquivo ?? body.baralhos?.[0] ?? null,
      arquivoOrigem: body.arquivo,
      idiomaOrigem: idioma.idiomaOrigem,
      idiomaAlvo: monolingue ? idioma.idiomaOrigem : (body.idiomaAlvo ?? null),
    })
    const imp = await ankiRepo.criarImport(req.userId, { deckId: deck.id, arquivo: body.arquivo, bytes: body.bytes })
    await ankiRepo.atualizarImport(imp.id, { estado: 'gravando' })
    // Um import aberto por baralho: o anterior ainda aberto (aba velha, envio interrompido) sai.
    await ankiRepo.marcarSubstituidos(req.userId, deck.id, imp.id)

    res.json({
      importId: imp.id,
      deckId: deck.id,
      idiomaOrigem: idioma.idiomaOrigem,
      // Presente só quando o idioma declarado e a escrita da amostra se contradisseram.
      ...(idioma.avisoIdioma ? { avisoIdioma: idioma.avisoIdioma } : {}),
    })
  } catch (err) {
    falhaInterna(req, res, err)
  }
})

ankiImportsRouter.post('/imports/:id/notas', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(lotesDeNotasSchema, req.body, res)
  if (!body) return
  try {
    const imp = await importAberto(req, res, p.id)
    if (!imp) return

    /* O LOTE INTEIRO É CONFERIDO ANTES DE GRAVAR: uma nota que fica vazia depois de limpar (só HTML,
       só mídia) recusa o lote todo com o índice dela, e nada dele entra — o cliente que mandou uma
       nota assim leu o arquivo errado, e gravar metade esconderia isso. */
    const notasParaGravar: NotaParaGravar[] = []
    for (const [indice, n] of body.notas.entries()) {
      const frente = limparCampo(n.frente)
      const verso = limparCampo(n.verso)
      if (!frente || !verso) {
        responderErro(res, 400, 'nota sem frente ou verso depois da limpeza', 'nota_invalida', { indice })
        return
      }
      // Exemplo igual à frente ou ao verso não é exemplo (mesma regra do leitor, `montarNota`).
      const exemploLimpo = n.exemplo ? limparCampo(n.exemplo) : ''
      const exemplo = exemploLimpo && exemploLimpo !== frente && exemploLimpo !== verso ? exemploLimpo : undefined

      const veredito = avaliarCartao(
        { word: frente, translation: verso, sentence: exemplo ?? '', srcLang: undefined } as never,
        { origem: 'curado' },
      )
      const motivoDescarte = veredito.serve ? null : (veredito.motivo ?? 'descartada')

      notasParaGravar.push({
        // Derivado do conteúdo LIMPO quando não há guid: estável entre dois imports do mesmo arquivo.
        guid: guidDaNota({ guid: n.guid, notetype: n.notetype, frente, verso }),
        notetype: n.notetype ?? null,
        estruturaHash: n.campos.length ? hashDaEstrutura(n.campos) : null,
        // Os campos ORIGINAIS, por nome e com HTML — é o que sustenta remapear sem reimportar.
        camposBrutos: JSON.stringify({ campos: n.camposBrutos, midia: n.midia, lacunas: n.lacunas }),
        frente,
        verso,
        exemplo: exemplo ?? null,
        tags: n.tags.length ? n.tags.join(' ') : null,
        motivoDescarte,
      })
    }

    /* GUID REPETIDO NO MESMO LOTE (duas notas idênticas sem guid, ou um arquivo com guid duplicado)
       batia no índice único de `anki_notes` no meio do INSERT: 500 e import `falhou`. A última vence,
       como num reimport, e cada repetida descartada conta como `iguais` na resposta deste lote — sem
       entrar na reserva do teto, porque não vira linha nenhuma. */
    const porGuid = new Map<string, NotaParaGravar>()
    for (const n of notasParaGravar) {
      porGuid.delete(n.guid)
      porGuid.set(n.guid, n)
    }
    const repetidas = notasParaGravar.length - porGuid.size
    const unicas = [...porGuid.values()]
    const porMotivo: Record<string, number> = {}
    for (const n of unicas) {
      if (n.motivoDescarte) porMotivo[n.motivoDescarte] = (porMotivo[n.motivoDescarte] ?? 0) + 1
    }

    /* O TETO É RESERVADO ANTES DE GRAVAR, numa instrução atômica (`reservarNotasDoImport`): conferir
       `imp.notasLidas` aqui e somar depois deixava lotes paralelos furarem o teto juntos. Só depois
       de a nota inteira ser válida, para um lote recusado não gastar espaço. */
    const reserva = await ankiRepo.reservarNotasDoImport(req.userId, imp.id, unicas.length, TETO_DE_NOTAS)
    if (reserva === 'inexistente') return responderErro(res, 404, 'import não encontrado', 'import_nao_encontrado')
    if (reserva === 'fechado') return responderErro(res, 409, 'este import já foi fechado', 'import_fechado')
    if (reserva === 'teto') {
      return responderErro(res, 400, `um import aceita no máximo ${TETO_DE_NOTAS} notas`, 'teto_de_notas')
    }

    let r: Awaited<ReturnType<typeof ankiRepo.gravarNotas>>
    try {
      r = await ankiRepo.gravarNotas(req.userId, imp.deckId, imp.id, unicas)
    } catch (err) {
      /* A reserva já foi somada e não volta: o import fecha como `falhou` (como a rota antiga fazia),
         e o que já entrou fica — reimportar completa, sem duplicar, pelo guid. */
      const msg = erroDeRota(err, { event: 'anki_import_error', route: req.path, requestId: req.requestId })
      await ankiRepo.atualizarImport(imp.id, { estado: 'falhou', erro: msg }).catch(() => {})
      return responderErro(res, 500, msg, 'erro_interno')
    }
    const descartadas = Object.values(porMotivo).reduce((a, b) => a + b, 0)
    // Incrementos: cada lote soma o que gravou (ver `atualizarImport`). `notasLidas` já foi somado na reserva.
    await ankiRepo.atualizarImport(imp.id, {
      notasNovas: r.novas,
      notasAtualizadas: r.atualizadas,
      notasDescartadas: descartadas,
    })
    if (descartadas) await ankiRepo.somarPorMotivo(imp.id, porMotivo)

    res.json({ novas: r.novas, atualizadas: r.atualizadas, iguais: r.iguais + repetidas, descartadas, porMotivo })
  } catch (err) {
    falhaInterna(req, res, err)
  }
})

ankiImportsRouter.post('/imports/:id/fechar', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    const imp = await importAberto(req, res, p.id)
    if (!imp) return
    /* Fechar sem nenhum lote marcaria o baralho INTEIRO como ausente do arquivo: é cliente com
       defeito, não arquivo vazio (o leitor recusa arquivo sem notas antes de abrir). O import fica
       aberto, e nada no baralho muda. */
    if (imp.notasLidas === 0) {
      responderErro(res, 400, 'nenhuma nota foi enviada neste import', 'import_vazio')
      return
    }

    /* O FECHAMENTO É REIVINDICADO ANTES DE QUALQUER EFEITO: um `UPDATE ... WHERE estado = 'gravando'`
       atômico. Dois `fechar` em paralelo passavam juntos pelo `importAberto` e ativavam o lote duas
       vezes; agora só quem trocou o estado segue, e o outro recebe 409. */
    if (!(await ankiRepo.reivindicarFechamento(req.userId, imp.id))) {
      responderErro(res, 409, 'este import já foi fechado', 'import_fechado')
      return
    }

    /* AUSENTES: nota do baralho que não veio em nenhum lote deste import. Num arquivo TRUNCADO (mais
       de `TETO_DE_NOTAS` notas; o leitor só manda as primeiras) as notas além do corte também viram
       `ausente_no_arquivo` — a mesma semântica da rota antiga, que só via as notas lidas. Nada é
       apagado: um reimport que as traga as devolve ao estado de antes. */
    try {
      await ankiRepo.marcarAusentesForaDoImport(req.userId, imp.deckId, imp.id)
    } catch (err) {
      /* A reivindicação acima já marcou `concluido`; se a marcação de ausentes falhar, o import voltaria
         a aparecer fechado sem os ausentes marcados e um novo `fechar` receberia 409. Devolve o estado
         para `gravando` (reabre a trava) e relança: o cliente vê 500 e pode fechar de novo. */
      await ankiRepo.atualizarImport(imp.id, { estado: 'gravando' }).catch(() => {})
      throw err
    }

    /**
     * FALHA NA ATIVACAO NAO VIRA "ZERO ATIVADAS" (auditoria de 2026-09-07, achado A29) — o mesmo
     * contrato da rota antiga: o import NÃO é desfeito (as notas já entraram), e a resposta diz que
     * a primeira leva não virou cartão jogável, em vez de um `ativadas: 0` que parece baralho vazio.
     */
    let ativadas = 0
    let erroDeAtivacao: string | null = null
    try {
      ativadas = (await vocabRepo.ativarLote(req.userId, imp.deckId)).ativadas ?? 0
    } catch (err) {
      erroDeAtivacao = erroDeRota(err, { event: 'import_ativacao_error', route: req.path, requestId: req.requestId })
    }

    // Os contadores são os do ledger: `imp` foi lido depois do último lote e o `fechar` não os muda.
    res.json({
      importId: imp.id,
      deckId: imp.deckId,
      resumo: {
        ativadas,
        notas: imp.notasLidas,
        novas: imp.notasNovas,
        atualizadas: imp.notasAtualizadas,
        iguais: imp.notasLidas - imp.notasNovas - imp.notasAtualizadas,
        descartadas: imp.notasDescartadas,
        porMotivo: lerPorMotivo(imp.porMotivo),
      },
      ...(erroDeAtivacao ? { erroDeAtivacao, code: 'ativacao_falhou' } : {}),
    })
  } catch (err) {
    falhaInterna(req, res, err)
  }
})
