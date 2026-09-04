## Why

O motor de tradução de nuvem foi escolhido às pressas: o anterior (`llama-3.3-70b-versatile`)
deixou de existir e o `openai/gpt-oss-120b` entrou como substituto medido contra o tradutor local,
**não contra outros candidatos**. Nunca houve comparação entre provedores.

E há dinheiro na mesa. A consulta ao catálogo do OpenRouter mostra o **mesmo modelo** a US$
0,037/0,170 por milhão de tokens, contra US$ 0,15/0,60 na Groq — 4× mais barato só por trocar de
roteador. Há modelos gratuitos, modelos a um terço do preço, e a família **Tencent Hy-MT2**,
*dedicada a tradução*, a partir de 1,8B de parâmetros.

Nenhuma dessas escolhas pode ser feita por preço de tabela: o que decide é qualidade em **fala
espontânea pt-BR**, que é o produto. Falta a bancada que produza esse número.

## What Changes

- Estender `scripts/eval-fala/medir-traducao-llm.mjs` para comparar **N modelos de M provedores**
  numa rodada só, em vez de um modelo por execução.
- Ler preço e identificador **do catálogo ao vivo** do provedor, em vez da tabela fixa em
  `medir-traducao-llm.mjs:119` — preços mudam, e este projeto já perdeu um modelo inteiro em dias.
- Reportar **custo medido** por mil falas (tokens reais de cada modelo), não custo tabelado:
  modelo de raciocínio gasta saída pensando, e isso muda a conta em 3×.
- Acrescentar um **juiz LLM com rubrica** como segunda métrica, ao lado do chrF++. Motivo medido:
  na rodada anterior o chrF++ marcou como fracas duas traduções corretas ("Tá chovendo pra
  caramba", "casinha"), porque compara superfície contra UMA referência. Rankear modelos só por
  chrF++ premiaria quem copia a referência, não quem traduz bem.
- Registrar a **política de uso de dados** de cada provedor testado junto do resultado — vira
  requisito da política de privacidade antes do lançamento.
- **Não muda o produto.** Nenhum arquivo de `src/` ou `server/` é alterado por esta mudança; a
  troca do motor é uma mudança separada, que depende dos números que esta produz.

## Capabilities

### New Capabilities
- `avaliacao-multi-modelo`: comparar modelos de tradução de vários provedores no mesmo gold set,
  com métrica dupla (chrF++ e juiz) e custo medido, produzindo um ranking auditável.

### Modified Capabilities
<!-- Nenhuma: openspec/specs/ está vazio (repositório recém-inicializado) e esta mudança não altera
     requisito de comportamento de produto. -->

## Impact

- **Código**: só `scripts/eval-fala/` e `tests/eval/fixtures/`. Zero mudança em `src/` e `server/`.
- **Dependências**: nenhuma nova. O runner já usa `fetch` e `src/core/eval/chrf.ts`.
- **Externo**: uma chave do OpenRouter em `.env` (`OPENROUTER_API_KEY`), fora do git. Custo estimado
  da bateria completa: abaixo de US$ 2.
- **Dados**: o gold set cresce de 16 para ~60 casos, e entra um subconjunto do FLORES-200
  (`Muennighoff/flores200`, CC BY-SA 4.0, não gated).
- **Risco registrado**: modelos gratuitos costumam ser pagos com dado. O relatório precisa dizer,
  por provedor, o que a política diz sobre uso do conteúdo para treino.
