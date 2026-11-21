# Critério e protocolo da tradução local por direção (tarefa 1.1)

Data: 2026-11-21. Openspec: `openspec/changes/traducao-local-por-direcao/` (D4 e D6). **Rascunho para commitar ANTES da primeira
rodada com pessoas e antes de qualquer A/B de decisão**: o `[R]`/`[D]` das tarefas 4.3 e 5.3 confere que ele veio antes dos
dados. Mudou o protocolo depois de ver uma saída avaliada, a rodada não vale (a ferramenta detecta: o `protocolo.json` leva o
sha256 e cada planilha leva o carimbo do lote).

> Estado: este arquivo NÃO foi commitado (o lote de laboratório não commita). As medições do relatório
> `2026-11-21-traducao-local-por-direcao.md` são exploratórias e marcadas `emulado`; nenhuma delas decide uma rota.

## 1. Teste cego pt-BR para o en→pt (D4)

Pergunta: um tradutor leve (Mozilla en→pt, `bergamot:en-pt`) escreve português do Brasil bem o bastante para passar à frente do
opus-mt `>>pt_br<<` (controle)? Só o veredito `aprovado` muda `src/core/traducao/vereditoPorDirecao.json`; `reprovado`,
`inconclusivo` e `invalida` mantêm o opus-mt.

| Parâmetro          | Valor                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Frases             | 100 en→pt públicas: 50 de conversa/legenda (`gold:en-pt`) e 50 de texto limpo (`fleurs:en-pt` ou `wmt:en-pt`)     |
| Sistemas           | controle opus-mt `>>pt_br<<` (1º de `--sistemas`) e Mozilla en→pt; EuroNano só se o portão 1 abrir                |
| Cegamento          | item opaco, rótulo do sistema oculto, ordem própria por avaliador, semente fixa, gabarito guardado à parte        |
| Avaliadores        | no mínimo 2 brasileiros nativos, independentes, adultos; planilha sem nome nem e-mail (o dono guarda o vínculo)   |
| Marcas por item    | `brasileiro`, `portugal` ou `indeterminado` + naturalidade 1 a 5                                                  |
| Repetição          | 20 frases (com todas as saídas) vão a todos os avaliadores: base do kappa                                         |
| Kappa              | < 0,40 = `invalida` (a rodada não decide nada)                                                                    |
| (i) pt-PT          | < 10% por avaliador e na união; faixa de 8% a 12% com o IC (Wilson 95%) cruzando 10% = `inconclusivo`             |
| (ii) qualidade     | chrF++ e COMET pareados com IC 95% sem piora (IC inteiro abaixo de 0 = piora) em `fleurs:en-pt` e `gold:en-pt`    |
| (iii) naturalidade | média por frase, diferença pareada contra o controle, IC 95% (bootstrap) sem piora                                |
| Aprovado           | pt-PT < 8% na união e < 10% por avaliador, (ii) e (iii) sem piora. COMET não informado = no máximo `inconclusivo` |
| Reprovado          | pt-PT > 12% na união, ou ≥ 10% com o IC inteiro acima de 10%, ou qualquer métrica/naturalidade pior no IC         |

Ferramenta (não roda com pessoas; os testes usam respostas sintéticas, `tests/testeCegoPtBr.test.ts`):

```
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/mt.mjs --sistemas local:opus-mt,bergamot:en-pt --corpora gold:en-pt,fleurs:en-pt
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/teste-cego-ptbr/gerar.mjs --brutos <mt_*.json> --sistemas local:opus-mt,bergamot:en-pt --saida <pasta>
# commitar <pasta>/protocolo.json; enviar só planilha-A*.csv ou formulario-A*.html; guardar gabarito.json à parte
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/teste-cego-ptbr/apurar.mjs --gabarito <pasta>/gabarito.json \
  --respostas A1=<respostas-A1.csv>,A2=<respostas-A2.csv> --brutos <mt_*.json> [--comet comet.json] --saida relatorio.json
```

`comet.json` = `{ "<corpus>": { "<sistema>": { "ic95": [a, b] } } }`, a diferença pareada COMET (candidato − controle) do `pontuar.py`.

## 2. Os três A/B do laboratório (D6)

Protocolo do laboratório (`protocolo-do-laboratorio-de-latencia.md`): `criterio.md` commitado antes, mesmas falas e mesmo aparelho,
no mínimo 10 rodadas válidas por lado em ABAB com a 1ª descartada, diferença pareada com IC 95% por bootstrap, `emulado` até haver
aparelho real.

1. Runtime (portão 3): 0.4.9 × WASM novo. Primária: memória de pico da aba (e heap do WASM). Troca só se o IC 95% pareado da queda
   exclui 0 e não há erro no 2º modelo em sequência (issue #1488).
2. X→en: opus-mt × Bergamot por par. Primária: `fimDaFalaAteLegendaMs` p75 por classe. Guardas: qualidade (IC 95% pareado, gold de
   conversa não piora) e memória. Par que piora a qualidade ou falha mais não é aprovado.
3. en→pt: opus-mt `>>pt_br<<` × leve, só depois do teste cego, com a mesma primária.
