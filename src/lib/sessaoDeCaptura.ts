/**
 * IDENTIFICADOR DA SESSÃO DE CAPTURA — agrupa, no Langfuse, as chamadas de IA de uma mesma aula.
 *
 * Sem ele cada transcrição e cada tradução é um rastro solto, e a pergunta que o dono precisa
 * responder para precificar — "quanto custa UMA hora de aula de um assinante?" — não tem resposta.
 * Com ele, o servidor (`server/ai/telemetriaDeIa.ts`) põe todas as chamadas da captura na mesma
 * sessão do Langfuse.
 *
 * NÃO IDENTIFICA NINGUÉM: é um aleatório novo a cada START, sem relação com a conta, e o servidor
 * ainda o pseudonimiza (HMAC) antes de mandar. Só vai nas rotas de IA — nada mais precisa dele.
 */
let atual: string | null = null;

function aleatorio(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

/** START da captura: um identificador novo. */
export function abrirSessaoDeCaptura(): string {
  atual = aleatorio();
  return atual;
}

/** STOP da captura: as chamadas seguintes (tutor, leitura) não entram na sessão que acabou. */
export function fecharSessaoDeCaptura(): void {
  atual = null;
}

/** O cabeçalho para uma chamada de IA durante a captura; `{}` fora dela ou em outras rotas. */
export function cabecalhoDaSessaoDeCaptura(url: string): Record<string, string> {
  if (!atual) return {};
  return /^\/api\/(ai|tutor)(\/|$)/.test(url) ? { 'x-sessao-captura': atual } : {};
}
