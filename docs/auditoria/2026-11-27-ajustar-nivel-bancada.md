# Bancada do "Ajustar nível" (D1): método, ensaio gratuito e estimativa da rodada real

Data: 2026-11-27. Change: `openspec/changes/leitura-assistida` (tarefa D1). Status: **[B][D] pendente da rodada real** (a comparação dos modelos NÃO foi feita; só o ensaio gratuito).

## 1. O que foi entregue

- `scripts/eval-ia/ajustar-nivel.mjs`: a bancada (modos `--ensaio` e `--real`).
- `scripts/eval-ia/fixtures/ajustar-nivel-corpus.json`: 20 parágrafos originais (10 en, 5 es, 5 pt; A1 a C2; 2 níveis-alvo cada; palavras conhecidas por parágrafo; 4 ajustes de referência escritos à mão; 3 exemplos fixos do juiz).
- `tests/eval/ajustar-nivel-bancada.test.ts`: 8 testes (corpus, candidatos sem Gemini, medidas, juiz, teto de 3 em paralelo, estimativa, agregação).
- `docs/auditoria/eval/ajustar-nivel-v1/ensaio.json`: o bruto do ensaio.

## 2. Método

Para cada (parágrafo, nível-alvo) e cada candidato, o fluxo é o do servidor: gerar com `systemDoAjuste`/`userDoAjuste` (os mesmos prompts), medir com `medirNivel`, decidir com `decidirReescrita` e, só se mandar, fazer a 2a e última chamada. A bancada registra o resultado após 1 chamada e após 2.

| Medida                    | Como                                                                                                                          | Observação                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Acerto do nível           | `medirNivel` (cefrWordlist) no ajustado: exato e dentro de ±1                                                                 | Só onde há confiança (hoje só inglês). es/pt contam como "não medido" e entram só em custo e juiz |
| Palavras conhecidas       | `conhecidasPerdidas` (determinística)                                                                                         | Taxa = conhecidas presentes no original que sobreviveram                                          |
| Custo                     | tokens × preço do catálogo (estimativa); `usage.cost` do OpenRouter (rodada real)                                             | Reserva do pior caso no livro-caixa antes de cada chamada                                         |
| Fidelidade e naturalidade | `claude -p` (sonnet, sem ferramentas, sem sessão), 2 critérios binários com raciocínio antes do veredito, juiz cego ao modelo | Sem créditos de API; no máximo 3 em paralelo                                                      |

Candidatos: lidos de `ops/ia-provedores*.json` (modelos de texto da cascata `rapida` com funções `tutor`/`explicacao`), do mais barato ao mais caro, Gemini recusado. Hoje: `google/gemma-4-26b-a4b-it`, `meta-llama/llama-3.3-70b-instruct`, `deepseek/deepseek-v4.1-flash`. O pedido é montado por `montarCorpo` (o da produção, com retenção zero e sem Google); no ensaio os 3 saíram `foraDaProducao: false`.

## 3. Resultado do ensaio (custo zero de provedor)

- **Classificador no corpus original**: 10/10 parágrafos em inglês medidos; es/pt (10) sem confiança, como esperado. Exatos 3/10, dentro de ±1 nível 9/10. O único erro de 2 níveis é o C2 medido B2 (a lista tem ~2,8 mil palavras e não separa C1/C2); C1 saiu B2 duas vezes (dentro de ±1). Coerente com o 11/12 do `simular-nivel.ts`.
- **Referências à mão**: nível medido bate o alvo em 2 de 4 casos e erra por 1 nos outros 2 (en-01 -> B1 medido A1; en-02 -> A1 medido A2); preservação das conhecidas 100%, 100%, 67% e 100%. Serve de piso: um modelo que não passe disso não vale a chamada.
- **Juiz (3 exemplos fixos)**: concordou nos 3 (bom = fiel e natural; infiel = não fiel; telegráfico = não natural e não fiel). O juiz separa o que deve separar.
- **Pedido offline**: montado para os 3 candidatos, igual ao da produção; pior caso por chamada entre US$ 0,0003 e US$ 0,0008.

## 4. Estimativa de custo da rodada real

40 ajustes (20 parágrafos x 2 alvos) por candidato. Preço do catálogo; saída estimada em 1,2x o texto; 2a chamada em 40% dos ajustes (esperado) ou 100% (pior caso). O juiz não custa API.

| Candidato                         | 1 chamada  | Esperado      | Pior caso     |
| --------------------------------- | ---------- | ------------- | ------------- |
| google/gemma-4-26b-a4b-it         | US$ 0,0024 | US$ 0,0035    | US$ 0,0051    |
| meta-llama/llama-3.3-70b-instruct | US$ 0,0035 | US$ 0,0051    | US$ 0,0075    |
| deepseek/deepseek-v4.1-flash      | US$ 0,0057 | US$ 0,0084    | US$ 0,0123    |
| **Total**                         | US$ 0,0116 | **US$ 0,017** | **US$ 0,025** |

Ressalva: a reserva do livro-caixa usa o preço-teto ZDR (o maior entre os endpoints), que pode ser maior que o do catálogo; use `--teto 1` (sobra enorme). O juiz leva ~120 chamadas de `claude -p` (3 em paralelo; uso da assinatura, não de API).

## 5. Como rodar a rodada real (pelo dono)

```
npx tsx --env-file=.env scripts/eval-ia/ajustar-nivel.mjs --real            # só imprime a estimativa e para
npx tsx --env-file=.env scripts/eval-ia/ajustar-nivel.mjs --real --confirmo --teto 1
```

Saída em `docs/auditoria/eval/ajustar-nivel-v1/resultado.json` (+ `gasto.json`). Regra de decisão sugerida: entre os candidatos com preservação >= 95%, fiel >= 90% e natural >= 90%, escolher o mais barato; comparar o acerto de nível "após 1" contra "após 2" chamadas para decidir se a 2a chamada paga o custo.

## 6. Limites

- Corpus de 20 parágrafos (a tarefa D1 original pedia 50 por nível): suficiente para triagem, não para separar modelos próximos; se dois empatarem, ampliar só a finalista.
- O classificador só mede inglês; es/pt dependem só do juiz. Não há medida de nível confiável para eles até existir lista CEFR.
- A bancada usa o pedido de UM parágrafo; o capítulo (parágrafo a parágrafo) multiplica o custo linearmente.

## 7. Recomendação provisória

Manter **`google/gemma-4-26b-a4b-it`**, o mais barato da cascata `rapida` (menos da metade do custo do DeepSeek v4.1 flash e 30% abaixo do Llama 3.3 70B), como primário do Ajustar nível, com os outros dois de reserva na ordem atual. É provisória: sem a rodada real não há medida de nível, preservação nem fidelidade por modelo. D1 segue **[B][D] pendente da rodada real**; o `design.md` só registra a escolha definitiva depois dela.
