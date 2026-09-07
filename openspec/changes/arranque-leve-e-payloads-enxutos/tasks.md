## 1. Medicao antes

- [ ] 1.1 `scripts/perf/medir-rotas.mjs` (latencia p50/p90 e bytes por rota) e tamanhos do build por chunk; registrar linha de base no PR

## 2. Arranque

- [ ] 2.1 Remover `export * from './catalogoMestre'` de `core/index.ts` e `export * from '@core'` de `galeria/passe.ts`; import sob demanda em `Loja`
- [ ] 2.2 `manualChunks` para `recharts` e `@huggingface/transformers`; `eventosDeJogo` com um tipo de import
- [ ] 2.3 Arranque gzip < 120 KB (medido)

## 3. Payloads

- [ ] 3.1 `GET /api/vocab/resumo` (contagens por fonte/idioma/recorte/nivel em uma consulta agregada)
- [ ] 3.2 Lobby usa `resumo` + `para-jogo`; `Metrics` usa `pagina`; pos-rodada relê so os cartoes tocados
- [ ] 3.3 Nenhuma tela baixa > 300 KB para abrir (medido)

## 4. Perfil

- [ ] 4.1 `computeProfile` em agregados SQL; mesma saida provada por `audit-m06-appmetrics-contract`
- [ ] 4.2 `Metrics` recebe `metrics` de `App`; um `fetchMetrics` por tela
- [ ] 4.3 `migrarLeitnerParaFsrs` uma vez (marca)

## 5. Medicao depois

- [ ] 5.1 Repetir o script; colar antes/depois em `docs/auditoria-performance.md`
- [ ] 5.2 `npm test`, e2e e Lighthouse de `/jogar` sem regressao
