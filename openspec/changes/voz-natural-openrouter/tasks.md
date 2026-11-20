## 1. Testes primeiro

- [x] 1.1 `tests/vozNaturalOpenRouter.test.ts`: pedido ao OpenRouter com `provider` de retenção zero, vozes por idioma
      (Kokoro e MAI), lista de retenção zero, nível de voz, só planos pagos, preço no orçamento
- [x] 1.2 `tests/integration/tts.test.ts`: teste de 3 dias recusado sem provedor nem cota; Kokoro de ponta a ponta com
      fetch simulado; plano básico nunca chega ao MAI; plano boa usa o MAI; falha do OpenRouter devolve os caracteres
- [x] 1.3 `tests/temVozDaNuvem.test.ts`: a tela aplica a mesma regra

## 2. Servidor

- [x] 2.1 `VOZES_COM_RETENCAO_ZERO_NO_OPENROUTER` em `server/ai/parametrosDoProvedor.ts`
- [x] 2.2 Catálogo do Kokoro e do MAI (`vozesPorIdioma`, `sufixoDaVoz`, `nivel`), `provider` no corpo,
      `conferirRetencaoZero`, `input_references` como clonagem, `pernasDoNivelDeVoz` (`server/ai/provedoresDeVoz.ts`)
- [x] 2.3 Registro recusa voz do OpenRouter sem retenção zero conferida (`server/ai/registroDeProvedores.ts`)
- [x] 2.4 Núcleo: `vozDaNuvemLiberada` no lugar do entitlement puro, pernas pelo nível de voz, chave do cache com a voz
      do idioma (`server/ai/nucleo/sintetizarVoz.ts`)
- [x] 2.5 Preços `openrouter:hexgrad/kokoro-82m` (4) e `openrouter:microsoft/mai-voice-2.1-flash` (15) no orçamento

## 3. Planos e custo

- [x] 3.1 `vozDaNuvemLiberada` e os modelos padrão em `src/core/vozNatural.ts`
- [x] 3.2 `FRANQUIA_DO_TESTE.vozCaracteresMes = 0`; tetos de Premium, Ao Vivo, Família e Pro (`src/core/planos.ts`)
- [x] 3.3 Modelo de custo a US$ 4/1M e bloco "VOZ BOA" (`scripts/ia/modeloDeCusto.ts`, `scripts/ia/simular-custo.ts`)
- [x] 3.4 `npm run ia:custo` antes e depois, nas misturas de 3%, 8% e 15% (no `design.md`)

## 4. Cliente e registro

- [x] 4.1 `temVozDaNuvem` em `src/lib/entitlements.ts`, usada em `LiveCapture.tsx` e no padrão de `vozDaNuvem.ts`
- [x] 4.2 Kokoro na função `tts` de `ops/ia-provedores.openrouter.json` (MAI fora); `npm run ia:validar` válido em
      desenvolvimento e produção

## 5. Verificação

- [x] 5.1 `npx vitest run` completo, `npm run typecheck`, lint dos arquivos tocados

## 6. Com o dono (fora desta change)

- [ ] 6.1 Registrar a voz do OpenRouter (Kokoro: DeepInfra/Together; MAI: Azure) em `docs/lgpd/operadores.md` e
      `docs/lgpd/ropa.csv`
- [ ] 6.2 Pôr o Kokoro no `IA_PROVEDORES` do staging, ligar `voz_natural` lá e ouvir pt/en/es
- [ ] 6.3 Decidir a mistura v4 de 3% (aceitar ou baixar a voz do Plus) e se o MAI entra no Ao Vivo com teto ≤ 130 mil
