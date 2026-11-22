> **"Teste rápido de vocabulário": semeia as palavras conhecidas para a conta não começar fria.** Referência de mercado
> (engenharia reversa em `docs/pesquisa/2026-11-ecossistema-de-aprendizado/engenharia-reversa-extensoes.md`): Language
> Reactor e Migaku fazem um teste curto no começo para marcar "palavras conhecidas" e o app já nasce útil.

## Why

Quem chega sabendo inglês vê tudo "novo": a cobertura de um texto subestima, o contador "Palavras que você conhece"
começa em zero e a pessoa teria de marcar "Já sei" palavra por palavra. A marcação "Já sei" sem cartão já existe
(`vocab-conhecidas-e-ignoradas`); falta um jeito rápido de preenchê-la com honestidade.

## What Changes

- **Núcleo puro** (`src/core/vocabulario/testeDeVocabulario.ts`, `pseudopalavras.ts`): o teste é montado em seis
  faixas CEFR (A1 a C2) com 10 palavras reais amostradas da lista de referência (`palavrasPorNivel`, em
  `cefrWordlist.ts`) e 3 PSEUDOPALAVRAS plausíveis por faixa (~23%), no método "sim/não" do LexTALE. Amostra
  determinística pela semente. Adaptativo: para na faixa em que a pessoa não sabe a maioria das palavras reais.
  Resultado: nível estimado, palavras estimadas (na escala da lista de referência) e o conjunto a marcar = as que
  ela marcou "sei" + todas as palavras das faixas de acerto alto (≥ 80% corrigido) em sequência desde A1. A taxa de
  chute (pseudopalavras marcadas "sei") corrige as taxas; chute alto cancela a semeadura. Só inglês por enquanto
  (único idioma com lista de níveis e pseudopalavras); outro idioma entra acrescentando as duas listas.
- **Servidor**: `PUT /api/vocab/marcadas/lote` (até 3.000 chaves de um idioma, só `conhecida`) e
  `POST /api/vocab/marcadas/lote/desfazer`. O lote é atômico no teto de 20.000 por conta (mesma trava
  `travarUsuario`) e segue a precedência: não sobrescreve "Ignorar", não marca palavra com cartão. Espelho sem conta
  equivalente (`src/data/efemero/rotas/palavrasMarcadas.ts`). O cliente atualiza o índice de marcadas de uma vez
  (`marcarLoteNoIndice`, uma publicação).
- **UI**: diálogo "Descubra quantas palavras você já sabe", aberto do bloco "Palavras que você conhece" (Vocabulário).
  Uma palavra por vez, "Sei"/"Não sei" (botões, S/N ou setas), barra de etapas, resultado com o nível e "vamos marcar
  N palavras como conhecidas", confirmar e "Desfazer todas".
- **i18n**: chaves novas em `public/i18n/{en,es,ar}.json`.

## Impact

- É um DIAGNÓSTICO: não dá XP nem Seeds, não tem tempo, contagem regressiva nem nota (Decreto 12.880/2026, art. 9º;
  linguagem acolhedora para menores). Nada novo é guardado fora das marcações existentes (retenção zero preservada).
- Contrato da API: duas rotas novas (`tests/contratos/api-contrato.json`).
- Fora do escopo: entrada pela cobertura sem histórico (hoje a linha só some; um convite ali precisa decidir a
  navegação até o Vocabulário), outros idiomas, ajuste fino dos limiares com dados reais.
