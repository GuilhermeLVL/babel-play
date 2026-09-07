## 1. Serializacao

- [x] 1.1 `caminhoDaComposicao` inclui `filtro` (JSON) quando presente. Decisao na implementacao: `fonte/fonteRef/lang` NAO sao omitidos — o servidor ja da precedencia ao filtro (`repositories/vocab.ts:557-563`) e usa os tres como proveniencia da resposta; omiti-los mudaria a proveniencia sem ganho. Coberto por teste de precedencia (`fonte: baralho` + `filtro.fontes: [sessao]` devolve so a sessao).
- [x] 1.2 Teto `TETO_DA_QUERY_DA_COMPOSICAO = 6000` em `composicao.ts`; acima dele `pedidoHttpDaComposicao` devolve `POST /api/vocab/para-jogo` com os mesmos campos (strings) no corpo; `server/routes/vocab.ts` compartilha o handler `paraJogo` e o schema `vocabParaJogoQuerySchema` entre GET e POST. `Play.tsx:buscarComposicaoPeloFunil` repassa `init` ao `apiFetch`.

## 2. Testes

- [x] 2.1 `tests/composicaoDeRodada.test.ts`: URL leva `filtro` em JSON e mantem `fonte/lang`; sem `filtro` nada muda; acima do teto vira POST com o mesmo conteudo; abaixo continua GET
- [x] 2.2 `tests/integration/filtro-composicao.test.ts`: `compor` → handlers GET/POST da rota (em processo) → `selecionarParaJogo` com filtro por baralho, trilha+idioma, sessao (precedencia sobre `fonte`), `pedindoRevisao` e POST com 200 `dificeisIds`
- [x] 2.3 `npm test` verde (2791 testes), typecheck, typecheck:core, lint, ast-grep, i18n:orfas, pseudo --check, audit:gate, e2e
