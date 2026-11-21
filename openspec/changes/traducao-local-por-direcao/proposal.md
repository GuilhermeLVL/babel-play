## Why

A tradução no aparelho é um dos dois passos que seguram a legenda (`fimDaFalaAteLegendaMs`). Hoje o opus-mt custa ~113 MB
por direção e 130 a 1.196 ms por frase; o Bergamot (motor do Firefox Translations) mede 80 a 130 ms por frase, ~31 MB por par
e já está implementado no app, mas só o pt→en vem embutido: os 15 pares X→en de `paresDoCdn` esperam o R2 e a
`VITE_BERGAMOT_MODELOS_URL` (`docs/LANCAMENTO.md` §2, passo 8). O runtime é o `@browsermt/bergamot-translator` 0.4.9 (2022);
o repositório da Mozilla corrige a memória (~550–743 MB medidos no desktop com o 0.4.9 → ~250–371 MB no build NATIVO; o WASM
não foi medido). Na direção dominante de quem aprende inglês (en→pt-BR) o Bergamot sai em português europeu e o gold de conversa
piora (bancada Etapa 5), então ali o opus-mt com `>>pt_br<<` segue até um teste cego com avaliadores brasileiros decidir.
Por fim, o Bergamot entra nas cadeias escondido sob o id `opus-mt-local` (`src/gateway/index.ts`, `resolveMt`); os perfis não o
declaram, e o disjuntor, a telemetria e o diagnóstico não o enxergam por nome.

Origem: pesquisa `research/frasy-core-stt-mt-desempenho/` (SOL-006, REQ-008/009/017/018/020, E-002/E-003/E-004, ST-09 a ST-13), Lote 2.

## What Changes

- **Flag `traducao_local_por_direcao`**, nascida DESLIGADA (migrações PROVISÓRIAS PG 0026 e SQLite 0068; a numeração é
  conferida no PR contra a `main`). Desligada, o app se comporta como hoje, mesmo com `VITE_BERGAMOT_MODELOS_URL` definida: o
  Bergamot só atende pt→en, com o runtime 0.4.9.
- **(a) X→en**: com a flag ligada, o roteador passa a oferecer os pares de `paresDoCdn` (publicação no R2 = ato do dono, atrás
  do portão de licença) e o worker passa a poder usar o WASM atual da Mozilla (`inference/`, `BERGAMOT_VERSION`), vendorizado
  sem modificação, atrás do portão de memória e de uma chave de build `antigo|novo`.
- **(b) en→pt-BR**: o padrão continua opus-mt com `>>pt_br<<`. Um tradutor leve (Mozilla en→pt; EuroNano, adiado) só entra se
  passar no teste cego pt-BR (portão 2) E sem piora no IC 95% pareado da bancada; a decisão fica registrada em dado, não em código.
- **Perfis**: o Bergamot ganha binding próprio `bergamot-local` nas cadeias de `mt` dos três perfis nativos, antes do
  `opus-mt-local`, com o mesmo `TradutorLocalComBergamot` como composição; o id `opus-mt-local` segue valendo (perfis
  salvos, disjuntor).
- **A/B no laboratório** com `fimDaFalaAteLegendaMs`, qualidade (chrF++ e COMET pareados com IC 95%), memória e download.

## Portões (nada é ligado sem os quatro)

1. **Licença [D]**: pesos Mozilla só com licença declarada (MPL-2.0 só pelo README; corpora não informados): publicar modelo
   no R2 é decisão do dono. EuroNano fica ADIADO (ATTRIBUTIONS lista TED2020 CC BY-NC-ND sem explicar o tratamento).
2. **Teste cego pt-BR [D/humano]** para en→pt: avaliadores brasileiros, pt-PT < 10% e nenhum par pior no IC 95%.
3. **Memória do WASM novo medida no laboratório** antes de trocar o runtime.
4. **Celular real [R]** para qualquer ganho de celular (emulado não aprova).

## Non-Goals

- Mexer em planos, cotas ou preços (`src/core/planos.ts`); nuvem, LLM local ou Gemini (proibido).
- EuroNano, NLLB, HY-MT, Tower+ (licença ou dados): fora deste lote.
- Download em segundo plano depois da 1ª legenda (ST-12, SOL-007) e fila que não acumula (SOL-005): changes próprias.
- Par direto es↔pt (não existe; segue o pivô via inglês).
- Alterar o vendor do Bergamot além de trocar o artefato WASM; qualquer patch exige registro e fonte MPL.

## Impact

- `src/gateway/adapters/bergamotModelo.ts`, `bergamotLocal.ts`, `bergamotWorker.ts`, `modelosDoBergamot.json` (campos de licença e
  `aprovadoPeloDono`), `src/gateway/index.ts` (`resolveMt`), `src/gateway/profiles.ts`, `src/core/harness/roteadorDeTraducao.ts`
  e `registroDeMotores.ts` (rota por direção lida de dado).
- `scripts/modelos/publicar-bergamot-no-r2.ts` (recusa sem `aprovadoPeloDono`), script de build do WASM (novo).
- Laboratório: `scripts/perf/latencia-legenda/` (A/B de latência), `scripts/eval-fala/bancada/` (qualidade), relatório em `docs/auditoria/`.
- Migrações de flag, `docs/flags.md`, `PainelFlags`, `FONTES.md` (atribuição MPL), `docs/LANCAMENTO.md`.
