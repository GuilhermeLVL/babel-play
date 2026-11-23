## 1. Modelos e publicação

- [x] 1.1 `gerar-pares-do-bergamot.mjs` e `paresDoCdn` (15 pares, sha256 conferido)
- [x] 1.2 `publicar-bergamot-no-r2.ts` (idempotente, `--seco`)
- [ ] 1.3 Dono: criar o bucket, CORS, publicar e definir `VITE_BERGAMOT_MODELOS_URL` (`docs/LANCAMENTO.md`)

## 2. App

- [x] 2.1 `bergamotModelo.ts` (pares do CDN, `parDoPivo`, `__BERGAMOT_CDN__`) e `vite.config.ts`
- [x] 2.2 `BergamotLocal` com um worker por par; composto com pivô e reserva
- [x] 2.3 `bergamotVenceNoPar`, `modelCache`, título do download

## 3. Verificação

- [x] 3.1 Testes de roteamento, pivô, reserva, `modelCache` e consistência do JSON
- [x] 3.2 Prova no Chromium com um CDN local (ja/es/pt→en)
- [ ] 3.3 Bancada completa (COMET/FLEURS), gold de conversa e memória no celular
