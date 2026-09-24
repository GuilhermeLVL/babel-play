/**
 * Preparo + validação do corpo de `/api/tutor/chat` (antes `/api/gemini/chat`).
 *
 * HISTÓRIA CURTA. S-06 pôs teto de tamanho (100 mil caracteres) e clamp de `max_tokens` no
 * servidor; M-02 passou a respeitar a temperatura do cliente. As duas correções partiam da mesma
 * premissa — o cliente escreve o prompt e o servidor limita —, e é essa premissa que a Fase 2 do
 * lançamento derrubou: o cliente escrevia o `systemInstruction`, ou seja, escolhia O QUE o modelo
 * fazia com a chave do dono (GAP-010, OWASP LLM10). Agora:
 *
 *   - o cliente escolhe uma FUNÇÃO (`tutor` | `corretor`, ver `funcoesDeIa.ts`) e manda conteúdo;
 *   - `systemInstruction`, `temperature` e `maxTokens` do corpo são IGNORADOS;
 *   - mensagem de papel `system` vinda do cliente vira `user` — papel com autoridade é só nosso;
 *   - o material de tela vai cercado com nonce como DADO numa mensagem `user` (LLM01), e quem
 *     cerca é o servidor, porque é ele que escreve a cláusula que descreve a cerca;
 *   - o teto de entrada é o da função (413 acima dele).
 *
 * Interface PLANA (não união discriminada) de propósito: o tsconfig raiz não é strict e sem
 * `strictNullChecks` o narrowing por `ok` não funciona. Todos os campos sempre presentes.
 */
import { buildCorretorUser, CORRETOR_SYSTEM, respostaEhPlausivel } from '../../src/lib/exercicios/corretorPrompt'
import { cercarContexto, clausulaDeContencao } from '../../src/lib/ichat/contencao'
import {
  ehPerfil,
  type FuncaoDeIa,
  FUNCOES_DE_CONVERSA,
  FUNCOES_DE_IA,
  PERFIL_PADRAO,
  sistemaDoTutor,
} from './funcoesDeIa'
import type { MensagemDeChat } from './llmClient'

/** Quantas mensagens de histórico o tutor aceita. As 20 últimas são o que a tela já mandava. */
export const MAX_MENSAGENS = 20

export interface LlmChatBody {
  funcao?: unknown
  messages?: unknown
  material?: unknown
  perfil?: unknown
  /* Corretor. */
  frase?: unknown
  palavra?: unknown
  resposta?: unknown
  /* Aceitos no corpo por compatibilidade com o cliente em cache — e IGNORADOS. */
  systemInstruction?: unknown
  temperature?: unknown
  maxTokens?: unknown
}

export interface PreparedLlm {
  ok: boolean
  /** 400/413/422 no erro; 200 quando ok. */
  status: number
  error?: string
  /** Código estável para o cliente escolher a frase. */
  code?: string
  funcao: FuncaoDeIa
  /** Já com o `system` do servidor na frente. */
  messages: MensagemDeChat[]
  temperature: number
  maxTokens: number
  /** Caracteres de conteúdo do cliente — é o que a reserva de tokens estima. */
  caracteresDeEntrada: number
}

const falha = (status: number, error: string, code: string, funcao: FuncaoDeIa = 'tutor'): PreparedLlm => ({
  ok: false,
  status,
  error,
  code,
  funcao,
  messages: [],
  temperature: 0,
  maxTokens: 0,
  caracteresDeEntrada: 0,
})

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

export interface OpcoesDoPreparo {
  /** Nonce da cerca do material (injetável para teste). */
  nonce?: string
  /**
   * Instrução de segurança para PÚBLICO MENOR (`INSTRUCAO_DE_SEGURANCA_PARA_MENORES`, em
   * `server/lib/idade.ts`), vai no FIM do `system` de toda função de conversa. Quem decide se a
   * pessoa é menor é a rota (`ehMenor`, que consulta o banco); este módulo continua puro.
   */
  instrucaoParaMenor?: string
}

/** Acrescenta a instrução de menor ao `system`, quando houver. */
const comInstrucaoDeMenor = (sistema: string, instrucao?: string): string =>
  instrucao ? `${sistema}\n\n[SEGURANÇA — PÚBLICO MENOR]\n${instrucao}` : sistema

export function prepareLlmRequest(body: LlmChatBody | undefined, opcoes: OpcoesDoPreparo = {}): PreparedLlm {
  const pedida = body?.funcao ?? 'tutor'
  if (typeof pedida !== 'string' || !(FUNCOES_DE_CONVERSA as readonly string[]).includes(pedida)) {
    return falha(400, 'função de IA desconhecida', 'funcao_desconhecida')
  }
  const funcao = pedida as FuncaoDeIa
  const def = FUNCOES_DE_IA[funcao]
  const pronto = (messages: MensagemDeChat[], caracteres: number): PreparedLlm => ({
    ok: true,
    status: 200,
    funcao,
    messages,
    temperature: def.temperatura,
    maxTokens: def.maxTokens,
    caracteresDeEntrada: caracteres,
  })

  if (funcao === 'corretor') {
    const frase = texto(body?.frase)
    const palavra = texto(body?.palavra)
    const resposta = texto(body?.resposta)
    if (!palavra.trim() || !resposta.trim())
      return falha(400, 'palavra e resposta são obrigatórias', 'payload_invalido', funcao)
    const caracteres = frase.length + palavra.length + resposta.length
    if (caracteres > def.tetoEntrada) return falha(413, 'texto grande demais para o corretor', 'payload_grande', funcao)
    /* A guarda determinística do S-03 roda AQUI também: o cliente já a aplica, mas um corpo
       montado à mão não passa pelo cliente. Frase ou pedido não é recuperação de palavra. */
    if (!respostaEhPlausivel(resposta)) {
      return falha(422, 'a resposta deve ser a palavra-alvo, não uma frase', 'resposta_implausivel', funcao)
    }
    return pronto(
      [
        { role: 'system', content: comInstrucaoDeMenor(CORRETOR_SYSTEM, opcoes.instrucaoParaMenor) },
        { role: 'user', content: buildCorretorUser(frase, palavra, resposta) },
      ],
      caracteres,
    )
  }

  // ─── tutor ───
  const brutas = body?.messages
  if (!Array.isArray(brutas)) return falha(400, 'O array de mensagens é obrigatório.', 'payload_invalido', funcao)
  /* Papel `system` do cliente vira `user`: só o servidor escreve no papel que tem autoridade. */
  const historico: MensagemDeChat[] = brutas.slice(-MAX_MENSAGENS).map((m: any) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: texto(m?.content),
  }))
  const material = texto(body?.material)
  const caracteres = material.length + historico.reduce((n, m) => n + m.content.length, 0)
  if (caracteres > def.tetoEntrada) {
    return falha(413, 'prompt grande demais (teto de entrada do tutor)', 'payload_grande', funcao)
  }

  const perfil = ehPerfil(body?.perfil) ? body.perfil : PERFIL_PADRAO
  let sistema = sistemaDoTutor(perfil)
  const mensagens: MensagemDeChat[] = []
  if (material.trim()) {
    const cercado = cercarContexto(material, opcoes.nonce)
    sistema = `${sistema}\n\n${clausulaDeContencao(cercado.nonce)}`
    mensagens.push({
      role: 'user',
      content: `[MATERIAL DE REFERÊNCIA DA TELA, não é uma pergunta minha, é o que está aberto no app]\n${cercado.texto}`,
    })
  }
  return pronto(
    [{ role: 'system', content: comInstrucaoDeMenor(sistema, opcoes.instrucaoParaMenor) }, ...mensagens, ...historico],
    caracteres,
  )
}
