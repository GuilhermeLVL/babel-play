/**
 * DESLIGAMENTO GRACIOSO — o que acontece entre o SIGTERM e o processo morrer (Fase 5).
 *
 * ANTES DESTE ARQUIVO NÃO ACONTECIA NADA. Medido com `grep -rn "SIGTERM\|SIGINT\|process.on("
 * server server.ts scripts tests` em 2026-09-09: **zero ocorrências** em todo o repositório. Sem
 * nenhum listener registrado, o Node aplica o comportamento padrão do sinal — terminar o processo
 * imediatamente. Ou seja, o `docker stop` (que manda SIGTERM e só depois de 10 s manda SIGKILL) e
 * o Ctrl+C do desenvolvedor matavam o servidor no meio do que ele estivesse fazendo:
 *
 *   - uma requisição em curso morria sem resposta — o cliente vê "conexão fechada", que é
 *     indistinguível de erro de rede, e no `POST /api/sessions` isso significa não saber se a
 *     sessão gravada existe ou não;
 *   - o WAL do SQLite ficava por checkpointar. Não é perda de dado (o WAL é o registro durável),
 *     mas o arquivo `-wal` sobrevive ao processo e o próximo boot paga a recuperação; num volume
 *     que é restaurado por CÓPIA DE ARQUIVO — que é o que `scripts/backup.mjs` faz —, levar o
 *     `.db` sem o `-wal` ao lado perde tudo o que só estava no WAL. Medido nesta árvore sobre uma
 *     cópia de `data/babel.db`: gravar uma sessão de 1.500 falas deixa **659.232 bytes** em
 *     `babel.db-wal`; o `PRAGMA wal_checkpoint(TRUNCATE)` do desligamento dobra isso no `.db`
 *     (11.665.408 → 12.251.136 bytes) e zera o `-wal`.
 *
 * A ORDEM AQUI É A CORREÇÃO, e cada passo existe por um motivo distinto:
 *
 *   1. `antes()` — no primário do cluster, repassa o sinal aos workers e DESLIGA o respawn. Sem
 *      isto o `cluster.on('exit')` do `server.ts` refaz cada worker que morre, inclusive durante o
 *      desligamento: o primário sai e deixa filhos recém-forkados órfãos segurando a porta.
 *   2. `server.close()` — para de ACEITAR conexão nova; as em curso seguem até terminar. É o
 *      inverso do que se espera do nome, e é exatamente o que se quer aqui.
 *   3. checkpoint e fechamento do banco — nesta ordem, porque o `client.close()` derruba a
 *      conexão e não sobra por onde mandar o PRAGMA depois.
 *
 * O PASSO QUE NÃO EXISTE AQUI, e por quê: `server.closeIdleConnections()`. O manual de qualquer
 * desligamento gracioso manda chamá-lo, porque historicamente uma conexão keep-alive OCIOSA (sem
 * requisição nenhuma em curso) segurava o callback do `close()` até o cliente desistir — um
 * servidor sem trabalho pendente esperaria o teto inteiro. Medido aqui antes de escrever a linha:
 * com um socket keep-alive aberto por uma `GET /api/health` anterior, o dreno leva **2 ms** sem a
 * chamada. O Node passou a derrubar a conexão ociosa dentro do próprio `close()` na v19, e este
 * projeto exige `>=22` (`package.json`) e roda em `node:22-slim` (`Dockerfile`). Uma chamada que
 * não muda nada nas versões suportadas é ruído que sugere um problema que não existe.
 *
 * O TETO ESTOURADO SAI COM 1, e isso é uma afirmação sobre o mundo, não um detalhe: passar de 10 s
 * significa que alguma requisição não terminou e foi abandonada. Sair com 0 diria ao orquestrador
 * "terminei o que tinha para fazer", e ele registraria um encerramento limpo — o `docker stop`
 * mandaria SIGKILL logo em seguida de qualquer jeito, e ninguém saberia que houve trabalho
 * perdido. O código 1 é o único canal que sobra para dizer isso.
 *
 * ALTERNATIVA RECUSADA: usar uma biblioteca de desligamento (`stoppable`, `http-terminator`). As
 * duas resolvem o mesmo passo 3, com a diferença de derrubarem ativamente a conexão ociosa em vez
 * de esperar — coisa que o Node passou a oferecer nativamente em 18.2 com
 * `closeIdleConnections()`. Trazer dependência para um método que já existe na plataforma seria
 * pagar supply chain por nada; e o resto (o repasse ao cluster, o checkpoint do WAL) nenhuma das
 * duas faz.
 */

/** O que este módulo precisa de um `http.Server` — só isto, para o teste poder passar um dublê. */
export interface ServidorDrenavel {
  close(cb?: (err?: Error) => void): unknown
}

/**
 * Teto do dreno.
 *
 * 10 s é o mesmo prazo que o `docker stop` dá por padrão entre o SIGTERM e o SIGKILL — escolher
 * mais seria escrever um teto que o ambiente não deixa cumprir, e a conta ficaria pior: o SIGKILL
 * chegaria ANTES do checkpoint, que é o passo que só este código faz. Quem opera com uma janela
 * diferente (`terminationGracePeriodSeconds` no Kubernetes, `docker stop -t`) ajusta por
 * `DESLIGAMENTO_TIMEOUT_MS`.
 */
export const TETO_DE_DRENO_PADRAO_MS = 10_000

export interface AlvosDeDesligamento {
  /** O servidor HTTP a drenar. Ausente (worker que ainda não escutou), pula o dreno. */
  servidor?: ServidorDrenavel
  /** Teto do dreno em ms. Ausente, lê `DESLIGAMENTO_TIMEOUT_MS` e cai no padrão. */
  tetoMs?: number
  /** Roda SÍNCRONO, antes de qualquer coisa: é onde o primário repassa o sinal aos workers. */
  antes?: () => void
  /** Substitui o encerramento do banco. Só o teste passa, para observar a ordem sem fechar o dele. */
  encerrarBanco?: () => Promise<void>
}

/** O teto efetivo, com a variável de ambiente no meio. Valor inválido cai no padrão, nunca em 0. */
export function tetoDeDreno(explicito?: number): number {
  if (explicito !== undefined && Number.isFinite(explicito) && explicito > 0) return explicito
  const doAmbiente = Number(process.env.DESLIGAMENTO_TIMEOUT_MS)
  return Number.isFinite(doAmbiente) && doAmbiente > 0 ? doAmbiente : TETO_DE_DRENO_PADRAO_MS
}

/**
 * Para de aceitar conexão e espera as em curso, até `tetoMs`.
 *
 * @returns `true` se drenou dentro do teto.
 */
export async function drenar(servidor: ServidorDrenavel, tetoMs: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    let assentou = false
    const fim = (drenou: boolean) => {
      if (assentou) return
      assentou = true
      resolve(drenou)
    }
    /* `unref()` para o temporizador não ser, ele próprio, o motivo de o processo continuar vivo:
       se o dreno acabar antes, o event loop precisa poder esvaziar sem esperar este relógio. */
    const relogio = setTimeout(() => fim(false), tetoMs)
    if (typeof relogio.unref === 'function') relogio.unref()
    servidor.close(() => {
      clearTimeout(relogio)
      fim(true)
    })
  })
}

/**
 * Checkpoint do WAL e fechamento do cliente libsql.
 *
 * Import DINÂMICO de propósito: este módulo é carregado pelo bootstrap antes de o banco existir em
 * alguns caminhos (o `server.ts` aborta por configuração incoerente antes do `dbReady`), e um
 * import estático abriria a conexão só por estar no topo do arquivo.
 *
 * `TRUNCATE` e não `PASSIVE`: o passivo desiste quando há leitor ativo e devolve `busy` sem
 * reclamar — justamente o caso de um desligamento com requisições terminando. O truncate espera e
 * zera o arquivo `-wal`, que é o que faz um backup por cópia do `.db` ficar completo.
 *
 * Banco REMOTO não leva PRAGMA: journal e checkpoint são decisão do servidor libsql do outro lado
 * (a mesma regra que `server/db/db.ts:71` já aplica).
 */
async function encerrarBancoPadrao(): Promise<void> {
  const { client, bancoLocal } = await import('../db/db')
  if (bancoLocal) {
    try {
      await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (err) {
      // Falhar o checkpoint não impede o resto: o WAL continua durável, só não foi dobrado no .db.
      console.error('[desligamento] checkpoint do WAL falhou:', String(err).slice(0, 160))
    }
  }
  try {
    ;(client as { close?: () => void }).close?.()
  } catch {
    /* já fechado */
  }
}

/**
 * O desligamento inteiro. Nunca lança: quem chama usa o retorno como código de saída.
 *
 * @returns 0 quando drenou dentro do teto; 1 quando o teto estourou (ver o bloco do topo).
 */
export async function desligarComGraca(motivo: string, alvos: AlvosDeDesligamento = {}): Promise<number> {
  const teto = tetoDeDreno(alvos.tetoMs)
  try {
    alvos.antes?.()
  } catch (err) {
    console.error('[desligamento] passo anterior ao dreno falhou:', String(err).slice(0, 160))
  }

  const t0 = Date.now()
  const drenou = alvos.servidor ? await drenar(alvos.servidor, teto) : true
  const decorrido = Date.now() - t0

  await (alvos.encerrarBanco ?? encerrarBancoPadrao)()

  if (drenou) {
    console.log(`[desligamento] ${motivo}: conexões drenadas em ${decorrido} ms; saindo com 0`)
    return 0
  }
  console.error(
    `[desligamento] ${motivo}: TETO de ${teto} ms estourado com requisição em curso — ` +
      'ela foi abandonada, e é por isso que a saída é 1',
  )
  return 1
}

/**
 * Registra SIGTERM e SIGINT.
 *
 * `once` por sinal e uma trava comum: o segundo Ctrl+C não pode reentrar no dreno e fechar o banco
 * duas vezes. Ele também não força saída imediata — quem quer matar na marra manda SIGKILL, e
 * transformar o segundo sinal em `exit(1)` daria ao operador uma forma fácil de perder exatamente
 * a escrita que este arquivo existe para preservar.
 */
export function registrarDesligamento(alvos: AlvosDeDesligamento = {}): void {
  let emCurso = false
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sinal, () => {
      if (emCurso) return
      emCurso = true
      void desligarComGraca(sinal, alvos).then((codigo) => process.exit(codigo))
    })
  }
}
