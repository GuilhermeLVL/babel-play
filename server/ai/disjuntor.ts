/**
 * DISJUNTOR E RETENTATIVA DAS CHAMADAS DE IA (Fase 5).
 *
 * O QUE JÁ EXISTIA, medido antes de escrever uma linha, porque empilhar camada sobre camada que já
 * funciona é o defeito mais caro desta parte do código:
 *
 *   - TIMEOUT: existe e é único. `server/ai/llmClient.ts:107` usa `AbortSignal.timeout` com 30 s de
 *     padrão e 12 s na tradução; `server/ai/sttProxy.ts:129`, 30 s. O achado A31 já tinha unificado
 *     as sete cópias da chamada. **Não falta timeout.**
 *   - CASCATA: `server/ai/provedores.ts:111` monta primário + reserva e `server/ai/mtProxy.ts:136`
 *     percorre a lista, com o contrato preso em `tests/integration/mt-cascata-reserva.test.ts`.
 *     Falha do primário — inclusive 4xx — já cai para a reserva. **Não falta fallback.**
 *
 * O QUE FALTAVA, e é o que este arquivo faz: MEMÓRIA ENTRE REQUISIÇÕES. A cascata é cega para o
 * que aconteceu na chamada anterior. Com o primário fora do ar, cada tradução paga os 12 s de
 * timeout dele ANTES de chegar à reserva — medido pelo desenho: 100 traduções seguidas contra um
 * provedor morto são 100 × 12 s de espera de usuário e 100 conexões abertas para nada. O disjuntor
 * transforma isso em cinco tentativas e, depois, resposta imediata pela reserva.
 *
 * ESTADO POR PROCESSO, e isto é deliberado — não é o descuido que
 * `tests/integration/replica-sem-estado-local.test.ts` proíbe. A regra de lá é sobre estado que o
 * servidor PRECISA para responder certo (a chave dos segredos, o teto de cota). O disjuntor é uma
 * OBSERVAÇÃO: "as minhas últimas cinco chamadas a este endereço falharam". Ela é verdadeira por
 * processo — outra réplica, em outra rede, pode estar conseguindo falar com o provedor — e
 * compartilhá-la no banco custaria uma ida ao disco em toda chamada de IA para propagar uma
 * conclusão que cada processo tira sozinho em cinco tentativas.
 *
 * ALTERNATIVA RECUSADA: `opossum`. É a biblioteca de referência para isto e traz o que aqui não
 * existe — janela deslizante, percentual de erro, métricas, `EventEmitter`. Nada disso é usado por
 * uma cascata de dois provedores com política "cinco falhas seguidas": o percentual sobre volume
 * baixo (uma tradução por fala) só produziria ruído, e a semântica dela é envolver uma promessa que
 * REJEITA — enquanto `chamarChat` nunca lança, devolve `{ ok, status, causa }` de propósito
 * (`llmClient.ts:22`). Encaixar as duas exigiria converter valor em exceção e de volta, o que
 * apagaria a causa que o log usa para dizer qual perna quebrou. São 60 linhas contra uma
 * dependência nova no caminho que gasta dinheiro.
 */

/** Cinco falhas SEGUIDAS. Uma só é rede ruim; cinco é o provedor. */
export const FALHAS_PARA_ABRIR = 5

/**
 * Quanto tempo o disjuntor fica aberto.
 *
 * 30 s é o compromisso entre os dois erros possíveis: curto demais e cada janela repõe a espera do
 * timeout no caminho de quem está esperando legenda na tela; longo demais e uma indisponibilidade
 * de 5 s do provedor mantém o tráfego na reserva (mais cara) por minutos. Com 12 s de timeout na
 * tradução, 30 s significa que no pior caso uma pessoa a cada 30 s paga a sondagem.
 */
export const JANELA_ABERTA_MS = 30_000

export type EstadoDoDisjuntor = 'fechado' | 'aberto' | 'meio-aberto'

interface Registro {
  falhasSeguidas: number
  /** Instante em que o estado aberto expira. 0 = não está aberto. */
  abertoAte: number
  /** Já liberou a sondagem desta janela? */
  sondando: boolean
}

const registros = new Map<string, Registro>()

function registroDe(chave: string): Registro {
  let r = registros.get(chave)
  if (!r) {
    r = { falhasSeguidas: 0, abertoAte: 0, sondando: false }
    registros.set(chave, r)
  }
  return r
}

/**
 * A CHAVE é o endereço, não o rótulo.
 *
 * `llm-primario` e `llm-reserva` são papéis, e o mesmo papel aponta para endereços diferentes entre
 * deploys; pior, dois papéis podem apontar para o MESMO endereço (é o que acontece quando alguém
 * configura a reserva no mesmo provedor por engano). O que está fora do ar é o par
 * endereço + modelo — um `model_not_found` é do modelo, não do host —, então é ele que abre.
 */
export function chaveDoProvedor(prov: { base: string; model: string }): string {
  return `${prov.base}·${prov.model}`
}

/** O estado, resolvido no instante da pergunta. Exportado para o log e para os testes. */
export function estadoDoDisjuntor(chave: string): EstadoDoDisjuntor {
  const r = registros.get(chave)
  if (!r || !r.abertoAte) return 'fechado'
  if (Date.now() >= r.abertoAte) return 'meio-aberto'
  return 'aberto'
}

/**
 * Pode chamar este provedor?
 *
 * MEIO-ABERTO LIBERA UMA SONDAGEM SÓ. Liberar todas seria mandar contra um provedor caído todo o
 * tráfego acumulado na janela — o "thundering herd" que reabre o disjuntor e ainda castiga quem
 * está do outro lado tentando voltar. A sondagem que falha reabre a janela inteira; a que dá certo
 * fecha o disjuntor e zera o contador.
 */
export function disjuntorPermite(chave: string): boolean {
  const r = registros.get(chave)
  if (!r || !r.abertoAte) return true
  if (Date.now() < r.abertoAte) return false
  if (r.sondando) return false
  r.sondando = true
  return true
}

/** Chamada que deu certo: o disjuntor fecha e a contagem recomeça do zero. */
export function registrarSucesso(chave: string): void {
  const r = registroDe(chave)
  r.falhasSeguidas = 0
  r.abertoAte = 0
  r.sondando = false
}

/**
 * Chamada que falhou.
 *
 * `status 413` NÃO conta, e essa exceção é o motivo de esta função receber o status: 413 é o teto
 * de tamanho do prompt conferido em `llmClient.ts:88`, ANTES de qualquer socket. Contá-lo abriria o
 * disjuntor de um provedor saudável porque alguém colou um texto grande cinco vezes — e a reserva
 * receberia o mesmo prompt e o mesmo 413, ou seja, o disjuntor teria degradado o serviço sem
 * nenhuma falha do provedor existir.
 */
export function registrarFalha(chave: string, status?: number): void {
  if (status === 413) return
  const r = registroDe(chave)
  r.sondando = false
  r.falhasSeguidas += 1
  if (r.falhasSeguidas >= FALHAS_PARA_ABRIR) r.abertoAte = Date.now() + JANELA_ABERTA_MS
}

/** Apaga o estado. Só os testes usam — em produção o registro vive enquanto o processo viver. */
export function esquecerDisjuntores(): void {
  registros.clear()
}

/**
 * VALE A PENA REPETIR ESTA FALHA?
 *
 * Só 429 e 5xx, e a ausência do TIMEOUT nesta lista é uma decisão, não um esquecimento.
 *
 * Repetir um timeout é a receita clássica, e aqui ela está errada: o timeout é NOSSO (12 s ou 30 s
 * de `AbortSignal.timeout`), não do provedor. Quando ele vence, a requisição pode estar sendo
 * processada do outro lado agora — e no caso do STT, sendo COBRADA por segundo de áudio. Repetir é
 * pagar duas vezes pela mesma transcrição, que é exatamente o "nunca repita requisição que já teve
 * efeito". 429 é recusa explícita antes de qualquer processamento, e 5xx é o provedor dizendo que
 * não fez; nos dois casos não há efeito para duplicar.
 *
 * `status 0` (rede/timeout, ver `llmClient.ts:150`) e 4xx caem fora pela mesma régua: chave
 * revogada ou modelo aposentado não melhoram com insistência — para esses existe a cascata.
 */
export function deveRetentar(status?: number): boolean {
  return status === 429 || (status !== undefined && status >= 500 && status < 600)
}

/** Espera da n-ésima retentativa (n começa em 1). Crescente: 500 ms, 1.500 ms, 4.500 ms. */
export function esperaDaRetentativa(n: number): number {
  return 500 * 3 ** (n - 1)
}
