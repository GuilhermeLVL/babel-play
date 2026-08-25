/**
 * DIÁRIO DE ERROS EM DISCO — o destino que não depende de escolher fornecedor.
 *
 * O achado F5-04 travou por uma decisão que não é técnica: qual serviço de monitoramento adotar.
 * Enquanto ela não vem, o efeito medido continua valendo — um erro em produção só aparece quando
 * alguém reclama, porque o stdout de um container é volátil: `docker logs` guarda o que a política
 * do daemon deixar, e um restart leva o resto. Não é que ninguém tenha ESCOLHIDO ler; é que muitas
 * vezes já não há o que ler.
 *
 * Este sink resolve a metade do problema que independe de fornecedor: **durabilidade e consulta**.
 * Cada evento de nível `error` — já saneado pela allowlist do logger, nunca os campos crus — vira
 * uma linha JSON num arquivo por dia, com rotação. Custa zero, não tem conta, não sai da máquina,
 * e transforma "não faço ideia do que aconteceu ontem às 3h" em um `grep`.
 *
 * O QUE ELE **NÃO** FAZ, e isto precisa ficar escrito porque é a diferença entre resolver e
 * parecer resolver: ele não ALERTA. Ninguém é acordado. Descobrir que houve um pico de erro
 * continua dependendo de alguém olhar, ou de um destino externo — que é justamente a decisão em
 * aberto. Trocar Sentry por um arquivo e declarar o achado fechado seria trocar o problema por um
 * mais silencioso.
 *
 * Escrita SÍNCRONA e append-only, de propósito. O caminho que chega aqui já está tratando um erro;
 * um `await` a mais introduz um ponto de falha exatamente onde a informação é mais preciosa, e o
 * volume é baixo por definição — se o volume de erro for alto o bastante para o custo de I/O
 * importar, o problema não é o log.
 */
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import type { SinkDeErro } from './logger'

/** Dias de diário mantidos. Além disso o arquivo é apagado na primeira escrita do dia seguinte. */
const DIAS_PADRAO = 14

const doDia = (agora: Date) => `${agora.toISOString().slice(0, 10)}.jsonl`

/**
 * Apaga diários mais velhos que `manter` dias.
 *
 * Roda no máximo uma vez por dia (guardada por `ultimaPodaEm`) porque varrer o diretório a cada
 * erro seria pagar I/O de listagem no caminho de erro — o oposto do que este módulo quer.
 * Falha em silêncio: não conseguir podar é um problema de espaço em disco, não motivo para
 * derrubar o request que estava sendo observado.
 */
function podar(dir: string, manter: number): void {
  const limite = Date.now() - manter * 86_400_000
  try {
    for (const nome of readdirSync(dir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(nome)) continue
      const alvo = path.join(dir, nome)
      if (statSync(alvo).mtimeMs < limite) unlinkSync(alvo)
    }
  } catch { /* espaço em disco não é motivo para derrubar o caminho de erro */ }
}

export interface OpcoesDoDiario {
  /** Diretório dos arquivos. Criado se não existir. */
  dir: string
  /** Quantos dias manter. Padrão 14. */
  manter?: number
  /** Injeta o relógio nos testes — sem isto a rotação só seria observável esperando um dia. */
  agora?: () => Date
}

export function diarioEmArquivo({ dir, manter = DIAS_PADRAO, agora = () => new Date() }: OpcoesDoDiario): SinkDeErro {
  mkdirSync(dir, { recursive: true })
  let ultimaPodaEm = ''

  return (evento) => {
    try {
      const hoje = agora()
      const arquivo = doDia(hoje)
      const marca = arquivo.slice(0, 10)
      if (marca !== ultimaPodaEm) {
        ultimaPodaEm = marca
        podar(dir, manter)
      }
      appendFileSync(path.join(dir, arquivo), `${JSON.stringify(evento)}\n`, 'utf8')
    } catch {
      /*
       * Engolido pelo mesmo motivo que o logger engole sink que lança: um diário que não consegue
       * escrever não pode derrubar o request cujo erro ele existe para registrar. O evento já foi
       * para o stderr antes de chegar aqui, então nada se perde além da durabilidade.
       */
    }
  }
}
