## 1. Puro

- [x] 1.1 `src/core/voz/supertonic.ts`: arquivos fixados (bytes, sha256), vozes, preparo do texto, corte, ids, velocidade
- [x] 1.2 `src/core/harness/vozNoAparelho.ts`: `ofertaDaVozNoAparelho` com testes da matriz

## 2. Motor

- [x] 2.1 Worker (`supertonicLocal.worker.ts`): OPFS + Range + sha256, sessões WebGPU→WASM, síntese
- [x] 2.2 Cliente (`supertonicLocal.ts`) e motor (`lib/voz/motorNoAparelho.ts`): fila com prioridade, pré-busca 2 à frente,
      queda para a voz do aparelho, `liberar()`
- [x] 2.3 `VITE_VOZ_MODELO_URL` em `server/lib/config.ts`, `.env.production.example` e CSP `connect-src` (com teste)

## 3. Escolha e narração

- [x] 3.1 Opção no `SeletorDeVoz` com custo, baixar/progresso/cancelar, pronta, apagar; textos via `t()` (en/es)
- [x] 3.2 Narrador: motor neural guardado, cancelar, pré-busca, liberar ao parar, aviso de queda, chip "Voz sintetizada"
- [x] 3.3 Elenco com F1–F5/M1–M5 e voz do narrador (padrão F1)

## 4. Flag e carga tardia

- [x] 4.1 Flag `voz_no_aparelho` (PG 0018, SQLite 0060, snapshots, journals, PainelFlags, docs/flags.md, baseline)
- [x] 4.2 Teste de chunk: o código do motor só por `import()`

## 5. Prova

- [x] 5.1 Demo `vozap` (porta 3192) e evidências no Chromium (áudio local, destaque, RTF, liberação, flag desligada,
      elenco, capturas desktop e 390 px)
- [ ] 5.2 Dono: ouvir no Safari do Mac de 6 GB; publicar os pesos no R2; revisão jurídica da OpenRAIL-M
