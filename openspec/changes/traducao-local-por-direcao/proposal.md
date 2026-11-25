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

## Revisão de 25/11/2026

**Estado:** precisa decisão do dono. A parte de código está pronta e atrás da flag desligada (`traducao_local_por_direcao`, PG 0026 e
SQLite 0068 já na `main`; tabela `rotaPorDirecao.ts` e `vereditoPorDirecao.json`; perfis com `bergamot-local`; teste do `>>pt_br<<`):
tarefas 1.1a, 1.3, 2.1, 2.2 e 3.1 a 3.3. A ferramenta do teste cego existe (`scripts/eval-fala/teste-cego-ptbr/`). Nada mais anda sem
o dono: licença (1.2), avaliadores (4.3), publicação no R2 (6.1), runtime novo (5.1) e aparelho real (5.5).

**O que ficou velho:**

- A migração deixou de ser "provisória": a numeração 0026/0068 está na `main`.
- O critério (1.1) não é mais "não commitado": o do teste cego foi em `ad4a09ed`; falta o dos A/B de decisão (virou 1.1b).
- A change arquivada `bergamot-multi-idioma-via-cdn` (23/11) diz que `VITE_BERGAMOT_MODELOS_URL` sozinha liga o Bergamot; aqui a URL
  só vale com a flag ligada. Ao sincronizar specs, a spec `traducao-local-por-direcao` prevalece. A publicação no R2 é um ato só.
- As medições de latência da legenda passaram a seguir o padrão dos `criterio.md` de `scripts/perf/latencia-legenda/` (A/B pareado,
  guarda com teto, desktop com tampa aberta, 12 válidas, pré-voo), usado no primeiro texto na tela (PR #206). A tarefa 5.3 deve copiar esse padrão.
- A tradução incremental (`traducao_incremental`) NÃO se liga (pendência do dono em `parciais-incrementais`); esta change não depende
  dela. Os parciais do Parakeet em pt/es mexem no STT, não na rota de tradução: sem conflito.
- Resultado medido em desktop emulado (relatório de 21/11): Bergamot pt→en p50 13 ms contra 87 ms e RSS 974 MB contra 1.587 MB;
  chrF++ melhor em pt-en, empate em es-en; en→pt segue PROIBIDO ao Bergamot até o teste cego. Nada disso vale para celular.

**Esforço:** G no total; o caminho curto (X→en nos pares já aprovados: 6.1, 5.4, 5.5 e ligar por etapa) é M. O ramo en→pt (4.3, 4.4)
é independente e pode esperar.
**Valor para quem usa:** médio. Menos download (~31 MB contra ~113 MB por par) e tradução mais rápida em X→en; alto só se o celular
real confirmar (5.5). Quem aprende inglês (en→pt) não ganha nada sem o teste cego.

**Dependências e conflitos:** antes dela, `traducao-sem-rota-no-celular` (#1), que mexe na mesma cadeia (`viaIngles.ts`,
`bergamotModelo.ts`) e na preparação de modelos (`ModelPrepPanel.tsx`); depois dela, `modelos-confiaveis-e-offline` (#5) para o
cache dos pesos. Arquivos em disputa: `src/gateway/adapters/bergamot*.ts`, `src/core/harness/roteadorDeTraducao.ts`,
`src/gateway/profiles.ts`. Custo: R2 sem egress, sem IA paga. Menores: tradução local não envia texto a ninguém; a flag nasce desligada.

**Decisões do dono:**

1. Licença dos pesos Mozilla (1.2): (a) aprovar par a par, começando por es, fr, it e de (os que o pivô para o português precisa);
   (b) aprovar os 15 de uma vez depois de ler o checklist; (c) não publicar e manter o opus-mt. **Recomendo (a)**: MPL-2.0 permite
   hospedar com o aviso, e começar pequeno destrava o resto.
2. Teste cego pt-BR (4.3): (a) recrutar 2 avaliadores brasileiros (cerca de 1 h por pessoa); (b) fixar o opus-mt `>>pt_br<<` no
   en→pt e riscar 4.3 e 4.4; (c) adiar. **Recomendo (c) agora e (a) só depois de 6.1 mostrar ganho em X→en**: o en→pt é a direção
   dominante, mas o risco de pt-PT é real e o ganho (menos 80 MB) só importa no celular.
3. Runtime novo da Mozilla (5.1, dependência nova): (a) aprovar o build vendorizado; (b) ficar no 0.4.9 e só publicar os pares;
   (c) adiar. **Recomendo (b)**: a memória do 0.4.9 já é menor que a do opus-mt (974 MB contra 1.587 MB) e o novo só se justifica se
   o aparelho real (5.5) estourar.
