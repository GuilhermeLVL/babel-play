/**
 * A REQUISIÇÃO TRAZ CREDENCIAL? — o filtro do balde de força bruta (`server/http/app.ts`).
 *
 * O balde de falhas de auth existe contra quem ADIVINHA ou REUSA token: uma requisição que traz
 * credencial e é recusada. Um visitante sem conta não traz nada — e a abertura do app sem login
 * dispara ~10 chamadas `/api/*` que terminam em 401. Contá-las como falha levava o IP inteiro a 429
 * na 3ª abertura (incidente de 2026-11-12; numa escola atrás de NAT, na 1ª).
 *
 * O CANAL. O `authMiddleware` (`server/lib/auth.ts`) só lê o cabeçalho `Authorization`: não há
 * cookie de sessão, token em query string nem cabeçalho do Supabase reconhecido no servidor (o
 * teste "cookie não pode substituir o header" em `tests/seguranca/cabecalhos-e-forca-bruta.test.ts`
 * trava isso). Então o canal é um só, e a regra falha FECHADA: QUALQUER conteúdo no `Authorization`
 * conta — inclusive esquema errado (`Basic …`, token cru, `Bearer` sem token), que o `authMiddleware`
 * recusa com 401 e que é, para o balde, uma tentativa. Só não conta cabeçalho ausente, vazio ou com
 * espaços. Se um dia o `authMiddleware` aceitar outro canal, ele TEM de entrar aqui também.
 */
/** O mínimo da requisição que a regra lê — o `Request` do Express cabe aqui, e os testes passam um objeto simples. */
interface ComCabecalhos {
  header(nome: string): string | undefined
}

export function requisicaoTrazCredencial(req: ComCabecalhos): boolean {
  return (req.header('authorization') ?? '').trim().length > 0
}
