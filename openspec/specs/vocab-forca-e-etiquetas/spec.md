# vocab-forca-e-etiquetas Specification

## Purpose

Força 1–4 derivada do FSRS e etiquetas do usuário no vocabulário. Criada pela change `vocab-forca-e-etiquetas` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-vocab-forca-e-etiquetas/proposal.md` para o porquê.

## Requirements

### Requirement: Força da palavra de 1 a 4, derivada do agendador

A força de um cartão SHALL ser uma função pura da estabilidade do FSRS e do número de esquecimentos, nunca um valor
marcado à mão: 1 (Nova) sem estabilidade ou sem repetição; 2 (Reconhecida) com estabilidade abaixo de 3 dias; 3
(Familiar) de 3 até menos de 21 dias; 4 (Firme) com 21 dias ou mais. Um cartão com 3 esquecimentos ou mais MUST perder
um nível, sem cair abaixo de 2. A interface MUST mostrá-la com texto acessível ("Força N de 4: nome"), não só por
cor. A marcação "Já sei" MUST continuar sendo outra coisa e MUST NOT alterar a força.

#### Scenario: Limiares

- **WHEN** um cartão revisado tem estabilidade 2,9, 3, 20,9 ou 21 dias e nenhum esquecimento
- **THEN** a força é 2, 3, 3 e 4, respectivamente

#### Scenario: Cartão novo

- **WHEN** o cartão não tem estabilidade ou tem zero repetições
- **THEN** a força é 1, mesmo que tenha esquecimentos registrados

#### Scenario: Esquecimentos rebaixam

- **WHEN** um cartão de estabilidade 40 dias tem 3 esquecimentos
- **THEN** a força é 3, e um de estabilidade 10 dias com 8 esquecimentos fica em 2

#### Scenario: Texto acessível

- **WHEN** a força 3 é mostrada como quatro tracinhos
- **THEN** o elemento tem o rótulo "Força 3 de 4: familiar" e os tracinhos são ocultos para leitor de tela

### Requirement: Etiquetas do usuário no cartão

A pessoa SHALL poder dar etiquetas livres a um cartão seu. O servidor MUST normalizar cada etiqueta (minúsculas, sem `#`
inicial, espaços viram `-`, só letras, números, `-` e `_`), remover repetidas e recusar com 400 uma lista com mais de
10 etiquetas, ou com uma etiqueta vazia ou acima de 32 caracteres, sem gravar nada. A rota MUST exigir autenticação e
MUST responder 404 para um cartão que não é da conta. As etiquetas MUST sair em `GET /api/vocab`, no histórico da
palavra e na exportação da conta.

#### Scenario: Normalização

- **WHEN** a pessoa envia `["  Filme ", "#Viagem de Ferias", "filme"]`
- **THEN** o cartão fica com `["filme", "viagem-de-ferias"]` e a resposta devolve essa lista

#### Scenario: Tetos

- **WHEN** a lista tem 11 etiquetas distintas, ou uma etiqueta de 33 caracteres, ou uma etiqueta que só tem pontuação
- **THEN** a resposta é 400 e as etiquetas anteriores continuam; 10 etiquetas e 32 caracteres são aceitos

#### Scenario: Só do dono

- **WHEN** outra conta envia etiquetas para o id de um cartão que não é seu, ou sem token
- **THEN** a resposta é 404 (ou 401 sem token) e o cartão não muda

#### Scenario: Limpar

- **WHEN** a pessoa envia `[]`
- **THEN** o cartão fica sem etiquetas

#### Scenario: Sugestão

- **WHEN** a pessoa abre o editor de etiquetas de uma palavra
- **THEN** as etiquetas que já usa em outras palavras (com a contagem de `GET /api/vocab/etiquetas`) aparecem como
  sugestão

### Requirement: Filtrar e ordenar o catálogo por força, etiqueta e revisão

`GET /api/vocab/pagina` SHALL aceitar o filtro `etiquetas` (o cartão MUST ter todas as pedidas, já normalizadas) e
`forcas` (valores de 1 a 4; o cartão MUST ter uma delas, com a MESMA regra de `forcaDoCartao`), e as ordens `forca`
(mais fracas primeiro) e `proximaRevisao` (a mais próxima primeiro, sem data por último). A paginação por cursor MUST
percorrer cada cartão uma vez nessas ordens. Um valor de força fora de 1–4 MUST ser recusado com 400.

#### Scenario: Etiquetas

- **WHEN** o catálogo filtra por `filme,trabalho`
- **THEN** só voltam os cartões que têm as duas etiquetas

#### Scenario: Força

- **WHEN** o catálogo filtra por `forcas=3`
- **THEN** voltam os cartões de força 3, inclusive o de estabilidade alta rebaixado por esquecimentos

#### Scenario: Ordens

- **WHEN** a ordem é `forca` ou `proximaRevisao`, com páginas de 2 cartões
- **THEN** a soma das páginas tem cada cartão uma vez, e a ordem é a pedida

### Requirement: Etiquetas na exportação

O `.apkg` exportado MUST levar as etiquetas de cada palavra como tags da nota do Anki. O CSV MUST ganhar a coluna
`etiquetas` quando alguma palavra exportada tiver etiqueta, e MUST ficar como antes quando nenhuma tiver.

#### Scenario: Tags do Anki

- **WHEN** a palavra tem as etiquetas `filme` e `viagem`
- **THEN** a nota exportada tem as tags `filme viagem`
