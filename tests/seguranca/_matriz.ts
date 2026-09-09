/**
 * A MATRIZ ROTA × GUARDA, LIDA DO EXPRESS EM TEMPO DE EXECUÇÃO.
 *
 * A primeira tentativa foi estática — varrer `server/routes/*.ts` com expressão regular e deduzir
 * a guarda pelo texto do handler. Deu falso positivo em série: um handler que delega a um auxiliar
 * (`deckDoUsuario`, `parseOr400`, `requireRole` importado de outro módulo) parece desprotegido para
 * quem lê só o corpo da função, e um router montado duas vezes parece montado uma. Pior, o que
 * decide se uma rota é pública NÃO está no arquivo da rota: está na ORDEM da montagem
 * (`server/http/app.ts`) — o mesmo router antes do `authMiddleware` é público e depois dele é
 * privado. Nenhuma regex sobre o arquivo do router consegue enxergar isso.
 *
 * Aqui a fonte é o próprio `app._router.stack` (Express 4) DEPOIS de `criarApp()` ter rodado: a
 * pilha real, na ordem real, com os limitadores que foram realmente montados. Uma rota nova aparece
 * sozinha; um `app.use` movido de lugar muda a classificação sem ninguém precisar lembrar.
 *
 * Este arquivo não é `*.test.ts` de propósito: ele é lido por `matriz-de-rotas.test.ts` (que cobra a
 * matriz) e por `idor.test.ts` (que a usa para GERAR os casos). Importar um arquivo de teste de
 * dentro de outro faria o vitest registrar os mesmos testes duas vezes.
 */

/* O formato interno do Express não é tipado publicamente; estas são as partes que a leitura usa. */
interface CamadaExpress {
  name: string
  handle: unknown
  regexp: RegExp & { fast_slash?: boolean }
  keys?: Array<{ name: string | number }>
  route?: { path: string; methods: Record<string, boolean> }
}

export interface Limitador {
  /** `L1`, `L2`… na ordem de montagem — é assim que a matriz em Markdown os cita. */
  rotulo: string
  /** Posição na pilha: um limitador só alcança o que vem DEPOIS dele. */
  ordem: number
  /** Prefixos que ele cobre (um `app.use([...], limitador)` vira vários). */
  prefixos: string[]
}

export interface RotaDaMatriz {
  metodo: string
  /** Caminho completo, com os parâmetros como o Express os declara (`/api/vocab/:id`). */
  caminho: string
  chave: string
  /** Montada DEPOIS do `authMiddleware`. */
  privada: boolean
  /** Verbo que altera estado. */
  escrita: boolean
  /** Rótulos dos limitadores que a alcançam. */
  limitadores: string[]
  /** Nomes dos parâmetros de caminho (`['id']`), na ordem. */
  parametros: string[]
}

export interface Matriz {
  rotas: RotaDaMatriz[]
  limitadores: Limitador[]
  /** Posição do `authMiddleware` na pilha; `-1` se ele não foi montado. */
  ordemDoAuth: number
}

const VERBOS_DE_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * O caminho de uma camada, a partir da expressão que o Express compilou.
 *
 * Não dá para ler a string original: o `Layer` do Express 4 guarda só o `RegExp`. A decodificação é
 * o inverso exato do que o `path-to-regexp` 0.1 gera — `fast_slash` para `use('/')`, uma alternativa
 * por caminho quando o `use` recebeu um array, e `(?:([^\/]+?))` para cada parâmetro, na ordem de
 * `keys`.
 */
function caminhosDaCamada(camada: CamadaExpress): string[] {
  if (camada.regexp.fast_slash) return ['']
  const chaves = camada.keys ?? []
  let proxima = 0
  /* `app.use(['/a','/b'], fn)` compila para `^\/a…|^\/b…`: a única barra vertical de topo é a que
     antecede um `^`, então as de dentro de `(?=\/|$)` ficam onde estão. */
  return camada.regexp.source.split(/\|(?=\^)/).map((alternativa) => {
    let s = alternativa.replace(/^\^/, '')
    s = s.replace(/\\\/\?\(\?=\\\/\|\$\)$/, '') // sufixo de `use(...)`: `\/?(?=\/|$)`
    s = s.replace(/\\\/\?\$$/, '') // sufixo de rota terminal: `\/?$`
    s = s.replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, () => `:${String(chaves[proxima++]?.name ?? 'param')}`)
    return s.replace(/\\(.)/g, '$1')
  })
}

/** O `express-rate-limit` v7 pendura estas duas no middleware que devolve — é o que o identifica. */
function ehLimitador(handle: unknown): boolean {
  return (
    typeof handle === 'function' &&
    Object.prototype.hasOwnProperty.call(handle, 'resetKey') &&
    Object.prototype.hasOwnProperty.call(handle, 'getKey')
  )
}

/**
 * O `authMiddleware` é reconhecido pelo NOME da função que `makeAuthMiddleware` devolve.
 *
 * O sufixo numérico não é paranoia: o transform do vitest renomeia a função para `authMiddleware2`
 * quando o módulo também exporta a constante `authMiddleware`, e uma comparação exata classificaria
 * a pilha inteira como pública.
 */
function ehAuth(camada: CamadaExpress): boolean {
  return /^authMiddleware\d*$/.test(camada.name)
}

function alcanca(prefixo: string, caminho: string): boolean {
  return prefixo === '' || caminho === prefixo || caminho.startsWith(`${prefixo}/`)
}

function parametrosDe(caminho: string): string[] {
  return caminho
    .split('/')
    .filter((s) => s.startsWith(':'))
    .map((s) => s.slice(1))
}

/** Lê a matriz de um app já montado por `criarApp()`. */
export function lerMatriz(app: unknown): Matriz {
  const pilha = ((app as { _router?: { stack: CamadaExpress[] } })._router?.stack ?? []) as CamadaExpress[]

  let ordemDoAuth = -1
  const limitadores: Limitador[] = []
  const cruas: Array<{ metodo: string; caminho: string; ordem: number }> = []

  pilha.forEach((camada, ordem) => {
    if (ehAuth(camada)) ordemDoAuth = ordem
    if (ehLimitador(camada.handle)) {
      limitadores.push({ rotulo: `L${limitadores.length + 1}`, ordem, prefixos: caminhosDaCamada(camada) })
      return
    }
    if (camada.route) {
      /* Rota registrada direto no app (o health público, o stub 403 do YouTube). */
      for (const verbo of Object.keys(camada.route.methods)) {
        if (verbo === '_all') continue
        cruas.push({ metodo: verbo.toUpperCase(), caminho: camada.route.path, ordem })
      }
      return
    }
    const sub = (camada.handle as { stack?: CamadaExpress[] })?.stack
    if (!sub) return
    /* Router montado: o prefixo vem da camada, o resto de cada rota interna. */
    for (const prefixo of caminhosDaCamada(camada)) {
      for (const interna of sub) {
        if (!interna.route) continue
        const relativo = interna.route.path === '/' ? '' : interna.route.path
        for (const verbo of Object.keys(interna.route.methods)) {
          if (verbo === '_all') continue
          cruas.push({ metodo: verbo.toUpperCase(), caminho: prefixo + relativo, ordem })
        }
      }
    }
  })

  /* `POST /api/import/youtube` existe DUAS vezes: o stub 403 do modo público, registrado no app, e
     a rota real dentro do router. O Express despacha para a PRIMEIRA, então é ela que a matriz
     descreve — manter as duas faria a mesma rota aparecer com dois veredictos. */
  const vistas = new Set<string>()
  const rotas: RotaDaMatriz[] = cruas
    .filter((r) => {
      const k = `${r.metodo} ${r.caminho}`
      if (vistas.has(k)) return false
      vistas.add(k)
      return true
    })
    .map((r) => ({
      metodo: r.metodo,
      caminho: r.caminho,
      chave: `${r.metodo} ${r.caminho}`,
      privada: ordemDoAuth >= 0 && r.ordem > ordemDoAuth,
      escrita: VERBOS_DE_ESCRITA.has(r.metodo),
      /* Um limitador montado DEPOIS da rota não a alcança — a ordem é o comportamento. */
      limitadores: limitadores
        .filter((l) => l.ordem < r.ordem && l.prefixos.some((p) => alcanca(p, r.caminho)))
        .map((l) => l.rotulo),
      parametros: parametrosDe(r.caminho),
    }))

  rotas.sort((a, b) => a.caminho.localeCompare(b.caminho) || a.metodo.localeCompare(b.metodo))
  return { rotas, limitadores, ordemDoAuth }
}

/** A matriz em Markdown — o que o relatório da Fase 4 publica. */
export function matrizEmMarkdown(m: Matriz): string {
  const linhas: string[] = []
  linhas.push('## Matriz rota × guarda')
  linhas.push('')
  linhas.push('| Método | Caminho | Acesso | Escrita | Limitador |')
  linhas.push('| --- | --- | --- | --- | --- |')
  for (const r of m.rotas) {
    linhas.push(
      `| ${r.metodo} | \`${r.caminho}\` | ${r.privada ? 'privada' : 'PÚBLICA'} | ${r.escrita ? 'sim' : '—'} | ${r.limitadores.join(', ') || '—'} |`,
    )
  }
  linhas.push('')
  linhas.push('### Limitadores, na ordem de montagem')
  linhas.push('')
  linhas.push('| Rótulo | Prefixos cobertos |')
  linhas.push('| --- | --- |')
  for (const l of m.limitadores) linhas.push(`| ${l.rotulo} | ${l.prefixos.map((p) => `\`${p}\``).join(', ')} |`)
  return linhas.join('\n')
}

/**
 * Imprime a matriz quando `MATRIZ=1`. Fora disso o teste fica calado: uma tabela de oitenta linhas
 * em toda execução da suíte esconderia a saída que importa.
 */
export function imprimirSePedido(m: Matriz): void {
  if (process.env.MATRIZ !== '1') return
  console.log(`\n${matrizEmMarkdown(m)}\n`)
}
