## 0. Spike

- [x] 0.1 Kitten 2 mini e pico no `onnxruntime-web` (WebGPU e WASM), Chromium e WebKit do Playwright (`scripts/voz/kitten/spike/`)
- [x] 0.2 Entrada do modelo e caminho texto→fonemas; licença: espeak (GPL) só no pt/es do pacote Python → fonetizador próprio
- [x] 0.3 Medidas: carga, RTF por backend, memória; P1/P2 pt iguais às amostras Python (mesmos fonemas)
- [x] 0.4 Fonetizador contra o oráculo local (CER) e pelo ASR (Whisper small)

## 1. Puro

- [x] 1.1 `src/core/voz/kitten.ts`: arquivos (bytes, sha256), vozes, ids, estilo, corte, `.npz`, trechos
- [x] 1.2 `src/core/voz/kitten/{frase,pt,es,en,fonemas}.ts`: fonetizador
- [x] 1.3 `src/core/harness/vozKitten.ts`: oferta, variante, tamanho/confirmação, `quemLeEmVozAlta`; `haVozAceita`

## 2. Motor

- [x] 2.1 `pesosNoAparelho.ts` (comum à Supertonic) e `kittenLocal.worker.ts` (download por idioma, sessões, WebGPU conferido)
- [x] 2.2 `kittenLocal.ts` (cliente + adaptador `neural-local`) e o `resolver` injetável em `motorNoAparelho.ts`
- [x] 2.3 `lib/voz/vozKitten.ts`: portão, estado, escolha, `quemLe`; motor global e leitor usam `quemLe`

## 3. Tela, flag, config

- [x] 3.1 Ajustes → Modelos no aparelho: seção "Voz natural" (baixar/confirmar/progresso/cancelar, voz, ouvir, apagar), i18n en/es
- [x] 3.2 Flag `voz_kitten` (PG 0020, SQLite 0062, snapshots, journals, PainelFlags, docs/flags.md, baseline)
- [x] 3.3 `VITE_VOZ_KITTEN_URL` em `server/lib/config.ts`, `.env.production.example` e CSP `connect-src` (com teste)
- [x] 3.4 `scripts/modelos/publicar-kitten-no-r2.ts` (sem publicar)

## 4. Prova

- [x] 4.1 Testes: fonetizador, puro, portão, worker, motor global, flag, CSP, espelho, chunk
- [x] 4.2 App real no Chromium: baixar o pt, `quemLe('pt') = kitten`, `speak()` lê pelo Kitten (`scripts/voz/kitten/spike/e2e-app.mjs`)
- [ ] 4.3 **[D][R]** Publicar no R2 (`npx tsx scripts/modelos/publicar-kitten-no-r2.ts`, na mesma sessão do R2 das outras frentes), `VITE_VOZ_KITTEN_URL` no staging, ligar `voz_kitten` só para o id do dono, ouvir no computador, no celular real (pico) e no Safari. Verificar: `curl -I` de cada arquivo de `kitten-tts-2/<variante>/` dá 200 com o sha256 do manifesto; em Ajustes → Modelos no aparelho a seção "Voz natural" baixa o pt, "ouvir" toca, e `quemLe('pt')` devolve `kitten`; nota de escuta (inteligível, sem corte) registrada em `docs/` com data e aparelho.
- [ ] 4.4 Seletor de voz do leitor: a opção "Voz natural (no aparelho)" (`@kitten`) e as vozes do Kitten no elenco. Revisão de 25/11: confirmado pendente. O motor global e o leitor já usam `quemLe` (`LeitorDoLivro.tsx:536`, `motorGlobal.ts`), mas `src/components/voz/SeletorDeVoz.tsx` não tem a opção, então a escolha explícita pelo Kitten só existe em Ajustes. Verificar: teste de componente de `SeletorDeVoz` com a flag ligada e o modelo baixado (opção aparece, com tamanho e baixar/apagar), com a flag desligada (opção ausente) e com perfil protegido (opção presente, pois a licença serve a todos); e2e do leitor lendo um parágrafo pelo Kitten em `scripts/voz/kitten/spike/e2e-app.mjs`.
- [ ] 4.5 (OPCIONAL, baixa prioridade) Inglês fora do léxico: exportar o BART do repositório para ONNX (hoje, regras simples). Verificar: CER do inglês com palavras fora do CMUdict (lista de 200 nomes e termos) menor que o das regras atuais, medido com o mesmo ASR da tarefa 0.4, e o peso extra dito ao baixar.

## 5. Fechamento da revisão de 25/11/2026

- [ ] 5.1 **[D]** Decidir o motor local de voz (Kitten ou Supertonic) e, escolhido o Kitten, arquivar `voz-no-aparelho` (ou reduzi-la a "voz premium opcional fora do perfil protegido"). Verificar: decisão e data em `docs/pendencias-do-dono.md`; a pergunta 3 de `openspec/changes/README-ordem-2026-11-23.md` respondida.
- [ ] 5.2 **[R]** Medir no celular real e no Safari de 6 GB: carga do pico, RTF, memória e tempo até a 1ª palavra, e a queda para a voz do sistema quando falta memória. Verificar: tabela em `docs/` com aparelho, variante, RTF < 1 e pico de memória; o limite de memória do Safari não derruba a aba (a legenda e o Whisper seguem de pé).
