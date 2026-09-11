## Why

Cada tela abria com um cabeçalho escrito à mão em tamanho próprio (Hub `text-3xl md:text-4xl`,
Vocabulário `text-2xl md:text-3xl`, Biblioteca com dois títulos). O protótipo v3 tem uma hierarquia
só. E os cartões de indicador do protótipo (kicker em mono acima de um número grande) não existiam
como variante do `Ladrilho`.

## What Changes

- `ui/CabecalhoDeTela`: kicker + `h1.titulo-de-tela` + subtítulo + ações à direita. Nasce com dois
  consumidores, Início e Vocabulário; textos e `t()` intactos.
- `ui/Ladrilho` ganha `variante="kpi"` (rótulo em mono acima, número de 23 px).
- `tests/primitivosDeUi.test.tsx`: três casos para o cabeçalho (um h1 por tela, ações preservadas,
  sem espaço vazio).
- `PainelEscuro` e `CartaoDeJogo`, previstos no plano para esta fase, ficam para a F6, onde nascem
  os dois consumidores reais (regra de admissão da pasta `ui/`).

## Nao-escopo

Nenhuma outra tela muda de cabeçalho nesta fase; as demais entram na fase da própria tela.
