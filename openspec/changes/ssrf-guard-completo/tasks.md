> Origem: auditoria `openspec/audits/2026-09-13-pre-deploy/` (GAP-002), provado por PoC em
> `evidencias/poc-ssrf.txt` (6 bypass de 8). Nenhuma change ativa cobria SSRF.
>
> **STATUS 2026-09-13: IMPLEMENTADO** na branch `fix/pre-deploy-p0` (commit `92cfb98`). Guard
> canonicaliza IPv4-mapped/NAT64 e cobre CGNAT/198.18/multicast (fail-closed); proxy IA com
> `redirect:'manual'`. Teste `tests/seguranca/ssrf-vetores.test.ts` (10/10); PoC agora 0 bypass.
> Resíduo documentado: DNS rebinding via pin de IP não foi feito (redirect fechado cobre o vetor
> principal). `server/import/web.ts` já revalida cada hop. Ver `IMPLEMENTATION_REPORT.md`.

## 1. Fechar a canonicalização em `server/ai/ssrf.ts`

- [ ] 1.1 `isPrivateIp` reduz IPv4-mapped (`::ffff:a.b.c.d` e forma hex `::ffff:7f00:1`) ao IPv4 e
      checa como IPv4; endereço que não canonicaliza para IP público → bloqueado (fail-closed)
- [ ] 1.2 Adicionar faixas: `100.64.0.0/10`, `198.18.0.0/15`, `192.0.0.0/24`, NAT64 `64:ff9b::/96`
- [ ] 1.3 Manter a mensagem sem o IP resolvido (não virar scanner de rede interna)

## 2. Fechar redirects e rebinding nos dois consumidores

- [ ] 2.1 `server/ai/proxy.ts`: `fetch` com `redirect: 'manual'`; revalidar `assertPublicUrl` a cada
      hop OU conectar ao IP validado (pin)
- [ ] 2.2 `server/import/web.ts`: confirmar que o loop de redirects manuais já revalida cada hop
      (a auditoria observou 4 MB/15 s/re-checagem por hop — validar que cobre IPv6 mapeado)

## 3. Regressão

- [ ] 3.1 `tests/seguranca/ssrf-vetores.test.ts` com os 8 vetores do PoC (6 bloqueiam, 2 públicos passam)
- [ ] 3.2 Reproduzir o harness da auditoria e ver `0 bypass`
- [ ] 3.3 Caso de redirect público→interno e de rebinding

## 4. Portões

- [ ] 4.1 `npx vitest run tests/seguranca` · `npm run typecheck` · `npm run lint` · `npm run audit:gate`
