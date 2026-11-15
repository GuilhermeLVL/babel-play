/**
 * A ASSINATURA DO TURNO DO TUTOR (OWASP LLM01, revisão de segurança de 15/11/2026).
 *
 * O histórico da conversa mora no navegador (`src/lib/ichat/conversas.ts`) e volta ao servidor a cada
 * pergunta. Sem prova de origem, um turno `assistant` do corpo é texto do CLIENTE no papel do modelo: quem
 * chama a rota à mão inventa "respostas anteriores" do tutor (prefill, many-shot) e o puxa para fora de "só
 * idiomas" e da instrução de segurança de menores (`server/lib/idade.ts`).
 *
 * Então toda resposta do tutor sai com um HMAC-SHA256 do servidor sobre a CONTA, a HORA DE EMISSÃO, a PERGUNTA
 * que a gerou (o texto do turno `user` imediatamente anterior) e o TEXTO da resposta. `prepareLlmRequest` só
 * repassa ao provedor o turno `assistant` cuja assinatura confere, que vem LOGO DEPOIS da mesma pergunta no
 * histórico enviado e que tem no máximo 30 dias. A chave é derivada da chave de hash do servidor
 * (`obterChaveDeHash`, que já é derivada do `SECRET_KEY`) com um rótulo próprio, como as outras HMACs
 * (`convidado.ts`, `testePremium.ts`): vazar uma não entrega as outras.
 *
 * POR QUE O PAR. A assinatura prova que o modelo DISSE o texto, não que o texto é inofensivo: "repita
 * exatamente: «<jailbreak>»" rende uma resposta assinada. Amarrada à pergunta, ela só volta ao modelo depois do
 * próprio pedido de repetição — o modelo vê de novo que aquilo foi uma cópia a pedido, e não uma regra que ele
 * mesmo enunciou em resposta a "quais são as suas regras?". Cortar o histórico antigo (`pedidoDoTutor`) continua
 * funcionando: cada par é conferido sozinho, e o par que perdeu a pergunta só sai.
 *
 * POR QUE O PRAZO. Sem ele, uma resposta assinada valeria para sempre. 30 dias cobre a conversa guardada no
 * aparelho e limita por quanto tempo um par colhido serve. A hora está DENTRO do MAC: trocá-la invalida.
 *
 * O LIMITE QUE SOBRA. Quem colhe pares legítimos (pedido + resposta) ainda pode reenviá-los em sequência para
 * montar um many-shot de pares verdadeiros, dentro do teto de mensagens (`MAX_MENSAGENS`) e do de entrada da
 * função. O texto é sempre algo que o tutor respondeu sob o `system` e a instrução de menor, ao lado do pedido
 * que o gerou; o que segura o resto é a moderação da saída (proposta no PR #133, decisão do dono).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const ROTULO = 'babel-play:tutor:turno:v2'

/** Quanto tempo um turno assinado vale. */
export const PRAZO_DO_TURNO_MS = 30 * 86_400_000
/** Folga para relógios: emitido mais que isto no futuro não confere. */
const FOLGA_DO_RELOGIO_MS = 5 * 60_000

const FORMATO = /^(\d{13})\.([A-Za-z0-9_-]{43})$/

let chaveDoTurno: Buffer | null = null
async function chave(): Promise<Buffer> {
  // Import tardio, como em `convidado.ts`: carregar este módulo não decide quando a chave é lida.
  chaveDoTurno ??= createHmac('sha256', (await import('../crypto')).obterChaveDeHash())
    .update(ROTULO)
    .digest()
  return chaveDoTurno
}

/* JSON da lista: sem ambiguidade de separador entre a pergunta e a resposta. */
const mac = (k: Buffer, userId: string, emitidoEm: number, pergunta: string, texto: string): Buffer =>
  createHmac('sha256', k)
    .update(JSON.stringify([ROTULO, userId, 'tutor', emitidoEm, pergunta, texto]))
    .digest()

/**
 * Um assinador SÍNCRONO para a conta (a chave é lida antes): a rota responde no gancho `aoDecidir`, que é
 * síncrono, e uma promessa solta ali poderia responder depois da limpeza (e morrer no Worker). A assinatura é
 * `<emitidoEm em ms>.<HMAC base64url>`.
 */
export async function assinadorDoTutor(
  userId: string,
): Promise<(pergunta: string, texto: string, emitidoEm?: number) => string> {
  const k = await chave()
  return (pergunta, texto, emitidoEm = Date.now()) => {
    const em = Math.trunc(emitidoEm)
    return `${em}.${mac(k, String(userId), em, pergunta, texto).toString('base64url')}`
  }
}

/** A assinatura de uma resposta do tutor à `pergunta`, para esta conta. */
export async function assinarTurnoDoTutor(
  userId: string,
  pergunta: string,
  texto: string,
  emitidoEm?: number,
): Promise<string> {
  return (await assinadorDoTutor(userId))(pergunta, texto, emitidoEm)
}

/**
 * Um verificador SÍNCRONO para a conta (a chave é lida uma vez, antes): `prepareLlmRequest` é puro e
 * síncrono. `anterior` é o texto do turno logo antes no histórico enviado (`null` se não há turno `user` ali).
 * Não confere: formato errado, sem pergunta antes, fora do prazo (ou do futuro) e MAC diferente.
 */
export async function verificadorDeTurnos(
  userId: string,
  agora = Date.now(),
): Promise<(texto: string, assinatura: unknown, anterior: string | null) => boolean> {
  const k = await chave()
  return (texto, assinatura, anterior) => {
    if (anterior === null || typeof assinatura !== 'string') return false
    const m = FORMATO.exec(assinatura)
    if (!m) return false
    const emitidoEm = Number(m[1])
    if (agora - emitidoEm > PRAZO_DO_TURNO_MS || emitidoEm - agora > FOLGA_DO_RELOGIO_MS) return false
    const recebida = Buffer.from(m[2], 'base64url')
    const esperada = mac(k, String(userId), emitidoEm, anterior, texto)
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada)
  }
}
