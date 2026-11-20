/**
 * E-MAIL DESCARTÁVEL NÃO GANHA O TESTE (change `teste-de-3-dias`).
 *
 * O teste do Premium é um por e-mail (a marca de `testePremium.ts`), e o e-mail precisa estar confirmado. Os serviços de
 * caixa descartável entregam uma caixa nova, que confirma, em segundos: são o atalho mais barato para repetir o teste.
 * Esta lista barra só o TESTE — a conta e o Grátis continuam abertos para quem usa um desses endereços.
 *
 * É uma lista CURTA e mantida à mão, de propósito: os provedores mais conhecidos, sem dependência nova nem download em
 * tempo de execução. Não pretende ser completa (as listas públicas têm dezenas de milhares de domínios, e mudam toda
 * semana); o resto do freio é o e-mail confirmado e o teto de testes por IP. Para incluir um domínio: só o domínio
 * registrável, em caixa baixa; os subdomínios dele já ficam cobertos.
 */
const DOMINIOS_DESCARTAVEIS: ReadonlySet<string> = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'discard.email',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'grr.la',
  'harakirimail.com',
  'inboxkitten.com',
  'mail.tm',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailnesia.com',
  'mintemail.com',
  'mohmal.com',
  'mytemp.email',
  'nada.email',
  'sharklasers.com',
  'spam4.me',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempmail.dev',
  'tempmail.net',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.de',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
])

/** O domínio do e-mail (ou um domínio acima dele) está na lista de caixas descartáveis? */
export function emailDescartavel(email: string): boolean {
  const e = email.trim().toLowerCase()
  const arroba = e.lastIndexOf('@')
  if (arroba < 0) return false
  const partes = e
    .slice(arroba + 1)
    .replace(/\.$/, '')
    .split('.')
  for (let i = 0; i < partes.length - 1; i++) {
    if (DOMINIOS_DESCARTAVEIS.has(partes.slice(i).join('.'))) return true
  }
  return false
}
