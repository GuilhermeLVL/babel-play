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

- [ ] 3.1 Receptor (`src/lib/captura/daExtensao.ts`): `pedir` ao abrir `/capturar?fonte=extensao`, valida com
      `validarDaExtensao`, junta quadros por `seq` (avisa quadro perdido), entrega Float32 ao pipeline do VAD.
      Verificar: teste com `window.postMessage` simulado; e2e com a extensão falsa.
- [ ] 3.2 Estado na tela: "Extensão conectada" / "Sem extensão: usar o seletor" (cai no `getDisplayMedia`).
- [ ] 3.3 Com `fonte=extensao` ausente, nada muda (sem listener, sem custo).

## 4. Loja **[D]**

- [ ] 4.1 Ícones, capturas, descrição pt-BR e en, política de privacidade no site público.
- [ ] 4.2 Origem de produção em `matches`/`web_accessible_resources` e `URL_DO_APP`.
- [ ] 4.3 Conta de desenvolvedor, justificativas por permissão, envio e revisão (Chrome Web Store e Edge Add-ons).
- [ ] 4.4 Decidir listada x não listada na primeira versão.
