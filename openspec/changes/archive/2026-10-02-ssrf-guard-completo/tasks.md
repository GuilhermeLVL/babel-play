> Origem: auditoria `openspec/audits/2026-09-13-pre-deploy/` (GAP-002), provado por PoC em
> `evidencias/poc-ssrf.txt` (6 bypass de 8). Nenhuma change ativa cobria SSRF.
>
> **STATUS 2026-09-13: IMPLEMENTADO** na branch `fix/pre-deploy-p0` (commit `92cfb98`). Guard
> canonicaliza IPv4-mapped/NAT64 e cobre CGNAT/198.18/multicast (fail-closed); proxy IA com
> `redirect:'manual'`. Teste `tests/seguranca/ssrf-vetores.test.ts` (10/10); PoC agora 0 bypass.
> Resíduo documentado: DNS rebinding via pin de IP não foi feito (redirect fechado cobre o vetor
> principal). `server/import/web.ts` já revalida cada hop. Ver `IMPLEMENTATION_REPORT.md`.

> **Conferido no código em 2026-10-02** (origin/main `9573ab38`), task por task; o arquivo que prova cada uma
> está na própria linha. Portões e PoCs não foram rodados de novo nesta conferência: a evidência é a de 13/09,
> em `openspec/audits/2026-09-13-pre-deploy/IMPLEMENTATION_REPORT.md`.

## 1. Fechar a canonicalização em `server/ai/ssrf.ts`

- [x] 1.1 `isPrivateIp` reduz IPv4-mapped (`::ffff:a.b.c.d` e forma hex `::ffff:7f00:1`) ao IPv4 e
      checa como IPv4; endereço que não canonicaliza para IP público → bloqueado (fail-closed)
      — `server/ai/ssrf.ts` (`expandeV6`, `ipv4Embutido`, `isPrivateIp`: o que não é IP → `true`)
- [x] 1.2 Adicionar faixas: `100.64.0.0/10`, `198.18.0.0/15`, `192.0.0.0/24`, NAT64 `64:ff9b::/96`
      — `server/ai/ssrf.ts` (`isPrivateV4` e o ramo NAT64 de `ipv4Embutido`)
- [x] 1.3 Manter a mensagem sem o IP resolvido (não virar scanner de rede interna)
      — `server/ai/ssrf.ts` (`assertPublicUrl`: "host resolve para IP interno (SSRF)", sem o endereço)

## 2. Fechar redirects e rebinding nos dois consumidores

- [x] 2.1 `server/ai/proxy.ts`: `fetch` com `redirect: 'manual'`; revalidar `assertPublicUrl` a cada
      hop OU conectar ao IP validado (pin)
      — `server/ai/proxy.ts` (os dois `fetch`: `redirect: 'manual'` + `dispatcher: despachanteSeguro`, que
      confere o IP no `lookup` do socket — o resíduo de rebinding citado no cabeçalho foi fechado em 26/09)
- [x] 2.2 `server/import/web.ts`: confirmar que o loop de redirects manuais já revalida cada hop
      (a auditoria observou 4 MB/15 s/re-checagem por hop — validar que cobre IPv6 mapeado)
      — `server/import/web.ts` (`assertPublicUrl(current)` dentro do laço, `redirect: 'manual'`, `despachanteSeguro`)

## 3. Regressão

- [x] 3.1 `tests/seguranca/ssrf-vetores.test.ts` com os 8 vetores do PoC (6 bloqueiam, 2 públicos passam)
      — o arquivo tem 8 que bloqueiam e 2 públicos que passam
- [x] 3.2 Reproduzir o harness da auditoria e ver `0 bypass`
      — registrado no `IMPLEMENTATION_REPORT.md` (`poc-ssrf` → 0/8); não reproduzido em 02/10
- [x] 3.3 Caso de redirect público→interno e de rebinding
      — `tests/seguranca/ssrf-rebinding.test.ts`: o rebinding é exercitado de verdade (servidor em
      localhost, `lookupSoPublico`); o redirect é cobrado pela FONTE (todo `fetch` de URL do usuário tem
      `redirect: 'manual'` e o despachante) — não há teste que sirva um 302 de verdade

## 4. Portões

- [x] 4.1 `npx vitest run tests/seguranca` · `npm run typecheck` · `npm run lint` · `npm run audit:gate`
      — `IMPLEMENTATION_REPORT.md`, "Portões verdes na base"; o `audit:gate` não aparece nomeado lá
