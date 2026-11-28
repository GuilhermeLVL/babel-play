Legenda: **[D]** depende do dono; **[R]** pede aparelho real.

## 1. App: "Legendar agora" e dicas do seletor (feito)

- [x] 1.1 Medir o fluxo e registrar em `docs/auditoria/2026-11-26-captura-com-menos-passos.md`.
- [x] 1.2 `src/lib/captura/dicasDoSeletor.ts`: dicas com detecção de suporte, memória da superfície e do download.
      Verificar: `npx vitest run tests/captura-legendar-agora.test.ts`.
- [x] 1.3 `constraintsDeDisplay` usa as dicas; botão "Legendar agora" na captura.
      Verificar: `npx playwright test legendar-agora` (1 toque e as dicas no pedido).
- [ ] 1.4 **[R]** Conferir no Chrome e no Edge de verdade que a aba vem pré-selecionada no seletor.

## 2. Extensão: esqueleto (feito)

- [x] 2.1 `extensao/` (manifest MV3, service worker, offscreen + worklet, ponte, popup, contrato).
- [x] 2.2 Teste do contrato e dos invariantes do manifesto (`tests/extensao-contrato.test.ts`).
- [ ] 2.3 **[R]** Carregar sem compactação (ver `extensao/README.md`) e confirmar que os quadros PCM chegam à página
      (`window.addEventListener('message')`), com a aba continuando audível.

## 3. App: receber da extensão

- [x] 3.1 (28/11, onda 2: `src/lib/captura/daExtensao.ts` + `startExtensionCapture` em `systemAudio.ts` + `useCapturaDaExtensao`; origem estrita (`event.source === window` e `event.origin` igual), forma pelo contrato, quadro repetido descartado, perdido contado, sem rede nem eval; testes `tests/captura-da-extensao.test.ts` e `tests/e2e/captura-da-extensao.e2e.ts`; atrás da flag `captura_da_extensao`, PG 0053 e SQLite 0092; o áudio de verdade pelo Chrome/Edge segue em 2.3 e 1.4 **[R]**) Receptor (`src/lib/captura/daExtensao.ts`): `pedir` ao abrir `/capturar?fonte=extensao`, valida com
      `validarDaExtensao`, junta quadros por `seq` (avisa quadro perdido), entrega Float32 ao pipeline do VAD.
      Verificar: teste com `window.postMessage` simulado; e2e com a extensão falsa.
- [x] 3.2 (28/11, `AvisoDaExtensao`: conectada, procurando, sem extensão, parada) Estado na tela: "Extensão conectada" / "Sem extensão: usar o seletor" (cai no `getDisplayMedia`).
- [x] 3.3 (28/11: o parâmetro é lido no boot por `fonteDaAbertura.ts`, porque o roteador apaga a busca; sem ele ou sem a flag o receptor nem é baixado e nenhum listener existe, provado no e2e) Com `fonte=extensao` ausente, nada muda (sem listener, sem custo).

## 4. Loja **[D]**

- [ ] 4.1 Ícones, capturas, descrição pt-BR e en, política de privacidade no site público.
- [x] 4.2 (28/11: `https://frasy.com.br`, a do `HOST_DE_PRODUCAO` do `wrangler.jsonc`; a ponte só em `/app/*`; `URL_DO_APP` aponta para `/app/capturar`, a linha de localhost fica comentada para desenvolvimento; **[D]** ainda confirma o domínio final) Origem de produção em `matches`/`web_accessible_resources` e `URL_DO_APP`.
- [ ] 4.3 Conta de desenvolvedor, justificativas por permissão, envio e revisão (Chrome Web Store e Edge Add-ons).
- [ ] 4.4 Decidir listada x não listada na primeira versão.
