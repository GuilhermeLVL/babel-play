## 1. Serializacao

- [ ] 1.1 `caminhoDaComposicao` inclui `filtro` (JSON) quando presente e omite `fonte/fonteRef/lang`
- [ ] 1.2 Teto de tamanho da query (`validation.ts` ja limita listas); acima do teto, `POST /api/vocab/para-jogo` com o mesmo schema

## 2. Testes

- [ ] 2.1 `tests/composicaoDeRodada.test.ts`: URL gerada contem `filtro`; precedencia; teto
- [ ] 2.2 `tests/integration/filtro-composicao.test.ts`: `compor` contra o Express com filtro por baralho, por sessao e por recorte `pedindoRevisao`
- [ ] 2.3 `npm test` verde
