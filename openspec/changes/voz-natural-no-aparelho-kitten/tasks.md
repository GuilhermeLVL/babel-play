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
- [ ] 4.3 Dono: publicar no R2, `VITE_VOZ_KITTEN_URL` no staging, ligar a flag, ouvir no computador, celular e Safari
- [ ] 4.4 Seletor de voz do leitor: a opção "Voz natural (no aparelho)" (`@kitten`) e as vozes do Kitten no elenco
- [ ] 4.5 Inglês fora do léxico: exportar o BART do repositório para ONNX (hoje, regras simples)
