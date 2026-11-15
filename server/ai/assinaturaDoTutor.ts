/**
 * A ASSINATURA DO TURNO DO TUTOR (OWASP LLM01, revisão de segurança de 15/11/2026).
 *
 * O histórico da conversa mora no navegador (`src/lib/ichat/conversas.ts`) e volta ao servidor a cada
 * pergunta. Sem prova de origem, um turno `assistant` do corpo é texto do CLIENTE no papel do modelo: quem
 * chama a rota à mão inventa "respostas anteriores" do tutor (prefill, many-shot) e o puxa para fora de "só
 * idiomas" e da instrução de segurança de menores (`server/lib/idade.ts`).
 *
 * Então toda resposta do tutor sai com um HMAC-SHA256 do servidor sobre a CONTA, a FUNÇÃO e o TEXTO, e
 * `prepareLlmRequest` só repassa ao provedor o turno `assistant` cuja assinatura confere. A chave é derivada
 * da chave de hash do servidor (`obterChaveDeHash`, que já é derivada do `SECRET_KEY`) com um rótulo próprio,
 * como as outras HMACs (`convidado.ts`, `testePremium.ts`): vazar uma não entrega as outras.
 *
 * POR QUE NÃO AMARRA À CONVERSA OU À POSIÇÃO. O texto assinado é uma resposta que o servidor de fato deu a
 * esta conta, já sob o `system` e a instrução de menor; reordenar respostas genuínas não fabrica conteúdo
 * novo. E o cliente corta o histórico antigo para caber no teto (`pedidoDoTutor`), então amarrar ao turno
 * anterior quebraria conversas legítimas. Sem prazo pelo mesmo motivo: as conversas ficam no aparelho.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const ROTULO = 'babel-play:tutor:turno:v1'

let chaveDoTurno: Buffer | null = null
async function chave(): Promise<Buffer> {
  // Import tardio, como em `convidado.ts`: carregar este módulo não decide quando a chave é lida.
  chaveDoTurno ??= createHmac('sha256', (await import('../crypto')).obterChaveDeHash())
    .update(ROTULO)
    .digest()
  return chaveDoTurno
}

const mac = (k: Buffer, userId: string, texto: string): Buffer =>
  createHmac('sha256', k).update(`${ROTULO}\n${userId}\ntutor\n${texto}`).digest()

/**
 * Um assinador SÍNCRONO para a conta (a chave é lida antes): a rota responde no gancho `aoDecidir`, que é
 * síncrono, e uma promessa solta ali poderia responder depois da limpeza (e morrer no Worker).
 */
export async function assinadorDoTutor(userId: string): Promise<(texto: string) => string> {
  const k = await chave()
  return (texto) => mac(k, String(userId), texto).toString('base64url')
}

/** A assinatura (base64url, 43 caracteres) de uma resposta do tutor para esta conta. */
export async function assinarTurnoDoTutor(userId: string, texto: string): Promise<string> {
  return (await assinadorDoTutor(userId))(texto)
}

/**
 * Um verificador SÍNCRONO para a conta (a chave é lida uma vez, antes): `prepareLlmRequest` é puro e
 * síncrono. Assinatura que não é string de 43 caracteres base64url não confere.
 */
export async function verificadorDeTurnos(userId: string): Promise<(texto: string, assinatura: unknown) => boolean> {
  const k = await chave()
  return (texto, assinatura) => {
    if (typeof assinatura !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(assinatura)) return false
    const recebida = Buffer.from(assinatura, 'base64url')
    const esperada = mac(k, String(userId), texto)
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada)
  }
}
