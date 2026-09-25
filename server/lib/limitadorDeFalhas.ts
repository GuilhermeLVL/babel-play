/**
 * LIMITADOR DE FALHAS — conta só o que FALHOU, e só depois de falhar.
 *
 * POR QUE NÃO É MAIS O `express-rate-limit` (auditoria de prontidão 2026-09-25, fase 2 §2.5).
 * O balde anti-força-bruta era um `rateLimit` com `skipSuccessfulRequests`. Essa opção não "pula"
 * o sucesso: ela CONTA toda requisição na entrada e ESTORNA na saída quando a resposta não é de
 * falha. Duas consequências medidas:
 *
 *   1. Sob concorrência o estorno chega tarde. Com mais de 30 requisições simultâneas do mesmo IP
 *      — uma escola, um escritório, qualquer NAT —, todas somavam antes de qualquer uma terminar,
 *      e 88–100% recebiam 429 SEM nenhuma falha de autenticação. As barradas também não estornam
 *      (o 429 é "falha" para a lib), então o contador ficava PRESO no teto: depois disso até uma
 *      conexão sozinha recebia 429 por 15 minutos.
 *   2. Todo request bem-sucedido custava DUAS escritas no SQLite (soma + estorno), para um
 *      contador que no fim valia zero.
 *
 * O DESENHO. Na entrada o limitador só LÊ o contador da chave e recusa se ele já está no teto. A
 * escrita acontece só em `res.on('finish')` e só quando a resposta é de falha (`falhou`). Sucesso
 * nunca escreve, então não há o que estornar nem o que vazar.
 *
 * O PREÇO, aceito de propósito: ler e depois decidir não é atômico. Numa rajada de falhas
 * SIMULTÂNEAS todas leem o mesmo valor e passam, e o teto pode ser excedido pelo número de
 * tentativas em voo na mesma janela. Para força bruta isso é irrelevante — o teto é de 30 por
 * quarto de hora, a rajada seguinte já encontra o contador cheio — e é o oposto do erro anterior:
 * aqui o desvio é a favor de quem usa, lá era contra.
 *
 * A janela é fixa, com o mesmo balde `rl:<n>` do `createDbRateLimitStore`, na mesma tabela
 * `usage_counters` — sem tabela nem migração nova.
 */
import type { Request, RequestHandler, Response } from 'express'

import { usageCountersRepo } from '../db/repositories/usageCounters'
import { asUserId } from './authContext'
import { chaveDoRequest } from './rateLimitStore'
import { responderErro } from './respostaDeErro'

interface OpcoesDoLimitadorDeFalhas {
  /** Métrica do balde em `usage_counters` (um balde por limitador — achado A27). */
  metric: string
  janelaMs: number
  /** Quantas falhas cabem na janela; a próxima requisição da chave recebe 429. */
  teto: number
  /** O que conta como falha. */
  falhou: (req: Request, res: Response) => boolean
  /** Código estável do envelope de erro do 429. */
  code: string
  mensagem: string
}

export function criarLimitadorDeFalhas(o: OpcoesDoLimitadorDeFalhas): RequestHandler {
  let podarEm = 0

  const numeroDoBalde = (t: number) => Math.floor(t / o.janelaMs)
  const balde = (t: number) => `rl:${numeroDoBalde(t)}`

  /** Poda baldes vencidos de vez em quando — só roda quando há falha, que é quando há o que podar. */
  function podarSePreciso(agora: number): void {
    if (agora < podarEm) return
    podarEm = agora + 5 * o.janelaMs
    usageCountersRepo.prune(o.metric, balde(agora - o.janelaMs)).catch(() => {
      /* poda é best-effort */
    })
  }

  return (req, res, next) => {
    const chave = asUserId(chaveDoRequest(req))
    const agora = Date.now()
    const janela = balde(agora)

    /* SÓ LEITURA na entrada. `get` é a leitura sem escrita do repositório; decidir com ela é
       aceitável aqui justamente porque a escrita é posterior e condicional (ver o cabeçalho). */
    usageCountersRepo
      .get(chave, o.metric, janela)
      .then((falhas) => {
        if (falhas >= o.teto) {
          const fimDoBalde = (numeroDoBalde(agora) + 1) * o.janelaMs
          const segundos = Math.max(1, Math.ceil((fimDoBalde - agora) / 1000))
          res.setHeader('Retry-After', String(segundos))
          responderErro(res, 429, o.mensagem, o.code, { tentarDeNovoEmSegundos: segundos })
          return
        }

        /* A escrita só existe no caminho da falha. O balde é o da ENTRADA: uma requisição que
           atravessa a virada da janela conta na janela em que foi admitida. */
        res.on('finish', () => {
          if (!o.falhou(req, res)) return
          usageCountersRepo
            .increment(chave, o.metric, janela)
            .then(() => podarSePreciso(Date.now()))
            .catch(() => {
              /* Contar falha é defesa, não caminho crítico: um erro de banco aqui não pode virar
                 exceção não tratada depois de a resposta já ter saído. */
            })
        })
        next()
      })
      .catch(next)
  }
}
