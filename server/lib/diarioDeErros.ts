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
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'

import type { SinkDeErro } from './logger'

/** Dias de diário mantidos. Além disso o arquivo é apagado na primeira escrita do dia seguinte. */
const DIAS_PADRAO = 14

const diaDe = (agora: Date) => agora.toISOString().slice(0, 10)
const doDia = (agora: Date) => `${diaDe(agora)}.jsonl`

/**
 * O ARQUIVO QUE ESTE PROCESSO ESCREVE.
 *
 * Em cluster, N processos abriam o MESMO `.jsonl` e cada um mantinha o seu contador de poda: N
 * escritores no mesmo arquivo e N varreduras do diretorio por dia (auditoria de 2026-09-07, achado
 * A61). `appendFileSync` e atomico o bastante para linhas curtas, mas nao ha por que apostar nisso
 * — um arquivo por processo remove a aposta e ainda diz qual worker registrou o que.
 *
 * Fora do cluster o nome nao muda: quem ja tem diario continua com os mesmos arquivos.
 */
function arquivoDoProcesso(agora: Date): string {
  const emCluster = Number(process.env.CLUSTER_WORKERS || 0) > 1
  return emCluster ? `${diaDe(agora)}.${process.pid}.jsonl` : doDia(agora)
}

/** Todos os arquivos de um dia, de todos os processos. */
function arquivosDoDia(dir: string, agora: Date): string[] {
  const prefixo = diaDe(agora)
  try {
    return readdirSync(dir)
      .filter((n) => n.startsWith(prefixo) && n.endsWith('.jsonl'))
      .sort()
      .map((n) => path.join(dir, n))
  } catch {
    return []
  }
}

/**
 * Apaga diários mais velhos que `manter` dias.
 *
 * Roda no máximo uma vez por dia (guardada por `ultimaPodaEm`) porque varrer o diretório a cada
 * erro seria pagar I/O de listagem no caminho de erro — o oposto do que este módulo quer.
 * Falha em silêncio: não conseguir podar é um problema de espaço em disco, não motivo para
 * derrubar o request que estava sendo observado.
 */
function podar(dir: string, manter: number, agoraMs: number): void {
  // O relógio vem de fora (é o mesmo `agora` injetável do sink): com `Date.now()` aqui a poda
  // ignorava o relógio de teste e apagava o diário "de ontem" assim que o calendário real passava.
  const limite = agoraMs - manter * 86_400_000
  try {
    for (const nome of readdirSync(dir)) {
      if (!/^\d{4}-\d{2}-\d{2}(\.\d+)?\.jsonl$/.test(nome)) continue
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
  /**
   * Este processo poda o diretório?
   *
   * Em cluster, todos podavam: N varreduras do mesmo diretório por dia, com N-1 delas sem nada a
   * fazer. Poda é manutenção do volume, e volume tem um dono — o primário.
   */
  podarAqui?: boolean
}

/** O diretório do sink ATIVO — preenchido por `diarioEmArquivo`, lido por `lerUltimosErros`. */
let dirAtivo: string | null = null

export function diarioEmArquivo({ dir, manter = DIAS_PADRAO, agora = () => new Date(), podarAqui = true }: OpcoesDoDiario): SinkDeErro {
  mkdirSync(dir, { recursive: true })
  dirAtivo = dir // registrado = legível: é o que permite GET /api/admin/erros sem re-resolver o caminho
  let ultimaPodaEm = ''

  return (evento) => {
    try {
      const hoje = agora()
      const marca = diaDe(hoje)
      if (podarAqui && marca !== ultimaPodaEm) {
        ultimaPodaEm = marca
        podar(dir, manter, hoje.getTime())
      }
      appendFileSync(path.join(dir, arquivoDoProcesso(hoje)), `${JSON.stringify(evento)}\n`, 'utf8')
    } catch {
      /*
       * Engolido pelo mesmo motivo que o logger engole sink que lança: um diário que não consegue
       * escrever não pode derrubar o request cujo erro ele existe para registrar. O evento já foi
       * para o stderr antes de chegar aqui, então nada se perde além da durabilidade.
       */
    }
  }
}

/**
 * Os últimos erros do diário — hoje e ontem, mais recentes primeiro.
 *
 * FECHA A LACUNA DOCUMENTADA NO TOPO DESTE ARQUIVO: o diário gravava e NINGUÉM lia — "ele não
 * alerta, ninguém é acordado", e a leitura era grep manual no disco do servidor. Com isto o
 * `GET /api/admin/erros` mostra o que está quebrando sem SSH.
 *
 * Linha ilegível vira `{ bruto }` em vez de sumir: diário de erros que esconde erro do próprio
 * formato seria a piada errada.
 */
export function lerUltimosErros(limite = 100, agora: () => Date = () => new Date()): { dir: string | null; erros: unknown[] } {
  if (!dirAtivo) return { dir: null, erros: [] }
  const hoje = agora()
  const ontem = new Date(hoje.getTime() - 86_400_000)
  const linhas: unknown[] = []
  for (const dia of [ontem, hoje]) {
    // TODOS os arquivos do dia: em cluster há um por processo, e ler só o do próprio processo
    // devolveria um recorte arbitrário do que aconteceu.
    for (const arquivo of arquivosDoDia(dirAtivo, dia)) {
      try {
        const texto = readFileSync(arquivo, 'utf8')
        for (const l of texto.split('\n')) {
          if (!l.trim()) continue
          try { linhas.push(JSON.parse(l)) } catch { linhas.push({ bruto: l.slice(0, 300) }) }
        }
      } catch { /* arquivo pode ter sido podado entre a listagem e a leitura */ }
    }
  }
  return { dir: dirAtivo, erros: linhas.slice(-limite).reverse() }
}
