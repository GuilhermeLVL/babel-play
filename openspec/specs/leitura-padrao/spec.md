# leitura-padrao Specification

## Purpose

Definir em que perfil de exibição e em que escala de fonte o app abre para quem chega sem
preferência gravada — e garantir que a preferência de quem já escolheu sempre vença o padrão.

## Requirements

### Requirement: Primeira visita em Produtividade

Na primeira visita (sem preferência gravada) o app SHALL carregar no perfil de exibição `pro`
com escala de fonte `md` e o menu na posição `left`.

Este requisito SUBSTITUI o anterior ("primeira visita em `senior` com fonte `lg`", da change
`2026-09-07-leitura-ampliada-padrao`). A troca foi decisão do dono em 2026-09-12, no redesign v4,
por dois motivos medidos em tela: o protótipo aprovado desenha a grade densa de cartões, que é o
que `pro` renderiza — em `senior` a mesma tela vira uma lista sequencial, e nenhuma comparação
entre o app e o design fechava; e o rail à esquerda é a navegação do design, enquanto o padrão
`top` punha a barra em cima.

O que NÃO mudou, e é o que mantinha o requisito antigo de pé: Leitura ampliada continua a um
clique em Personalizar, sem cadeado e sem custo, porque é acessibilidade e não cosmético
(ux-v2 §4.4). O que mudou foi qual perfil é o PADRÃO, não quem pode usar qual.

#### Scenario: Preferência do usuário vence

- **WHEN** existe `babel.age_profile` gravado (local ou vindo do servidor)
- **THEN** o valor gravado é usado e o padrão novo não interfere

#### Scenario: Escolher Leitura ampliada numa sessão limpa também ajusta a fonte

- **WHEN** a pessoa troca para o perfil `senior` e NÃO há `babel.font_scale` gravado
- **THEN** a escala de fonte passa a `lg` junto, sem ela precisar ajustar duas coisas

#### Scenario: O padrão não desliga a revelação progressiva de quem precisa dela

- **WHEN** o perfil ativo é `kids` ou `senior`
- **THEN** `coreOnly` continua verdadeiro e as abas densas seguem atrás do botão "Mais"
