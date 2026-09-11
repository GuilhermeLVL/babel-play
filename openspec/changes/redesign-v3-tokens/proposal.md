## Why

O protótipo v3 usa 67 hex distintos; 66 % já são tokens do tema `babel`. O que falta são derivadas:
superfície rebaixada e elevada, fundo de campo, hover e borda do accent, divisor e o painel escuro.
Sem elas, cada tela redesenhada inventaria a sua cor, e o teste de contraste não veria nada.

## What Changes

- 11 tokens novos (`--surface-sunken`, `--surface-raised`, `--field-bg`, `--accent-hover`,
  `--accent-border`, `--divider`, `--panel-bg/-surface/-border/-ink/-ink-muted`) em todos os 17 blocos
  de tema de `src/index.css`, como hex literal (babel claro com os valores do protótipo; os demais
  derivados por fórmula, `custom` por `color-mix`), expostos no `@theme` como utilitários.
- `tests/contrastePaletas.test.ts` ganha 14 pares (piso de pares avaliados 70 → 200). Achados que a
  medição impôs (D-017): o hover do primário se afasta da luminância do texto de contraste; as
  superfícies rebaixadas escurecem só até onde `ink-muted` e `accent-ink` aguentam; o painel escuro
  no modo escuro é mais claro que a superfície, com muted próprio.
- Classes: `.btn-solid:hover` pelo token; `.kpi-pill.active` em ink (D-012) com a camada de contraste
  acompanhando; `.field-input` sobre `--field-bg`; novas `.card-panel.escuro`, `.card-panel.bloqueado`,
  `.titulo-de-tela`; borda do card do babel 1,5 px.

## Nao-escopo

Nenhuma tela ou componente `.tsx` muda. `--accent-contrast` intocado (D-011). Seletores da camada
`!important` intocados (só a pílula ativa trocou de regra).
