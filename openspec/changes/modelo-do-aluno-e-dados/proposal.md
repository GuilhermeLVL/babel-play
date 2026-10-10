> **O app trabalha pelo aluno.** Levantamento do código: `docs/auditoria/2026-10-10-dados-metricas-e-selecao.md`.
> Pesquisa: `docs/auditoria/2026-10-10-ciencia-do-aprendizado-e-dados.md`. Nada desta proposta foi implementado;
> cada fatia espera o sim do dono, e as que mexem em dado gravado dizem o risco.

## Why

O pedido do dono (10/10/2026): o usuário traz conteúdo de muitas fontes e o app deve guardar isso sem inchar
nem poluir o banco, tirar métricas, devolvê-las de forma agrupada e sutil, e usar os dados para escolher o
que mostrar, em que ordem e em que dificuldade, na revisão e nos jogos, com base em método reconhecido.

O levantamento mostrou que hoje:

- **O banco só cresce.** Um usuário pesado (50 sessões, 5.000 cartões, 1 ano) ocupa 43,2 MB, metade em
  índices (medido em banco sintético). Nada apagado sai: tudo recebe `deleted_at`. Não há `VACUUM`,
  `ANALYZE` nem `PRAGMA optimize` no banco vivo.
- **A chave que junta palavras iguais junta palavras diferentes** (`src/core/texto/palavra.ts:22-28`):
  `schön` = `schon`, `año` = `ano`, `avó` = `avô`, `がっこう` = `かっこう`; hindi e tailandês perdem vogais.
  A segunda palavra que colide nunca vira cartão. E não há forma base: `run`, `runs`, `running` são três.
- **A frase é copiada em cada ocorrência** e `vocab_occurrences.utterance_id` nunca é preenchido.
- **Não há um seletor de itens.** A fila da Revisão é montada no navegador; o servidor e o cliente escolhem
  itens de jogo por regras diferentes; há três definições de "palavra difícil"; a dificuldade do jogo é uma
  tabela fixa que não conversa com a dificuldade do cartão.
- **A nota de jogo entra na memória igual à da Revisão**, inclusive em jogo de reconhecer.
- **`review_logs` não guarda** a origem da nota, o formato, o tempo de resposta nem a meta usada.
- **As métricas são recontadas do zero** a cada pedido (até 533 ms numa leitura, no sintético).

A pesquisa corrigiu três ideias de partida, e a proposta segue a pesquisa:

- A "regra dos 85%" não foi testada em pessoas; o alvo de acerto é escolha de produto.
- Para palavras, o que ajuda é o espaçamento, não intercalar. Fácil e difícil alternados entram pelo prazer
  da sessão, e isso é dito como aposta.
- O app mede "você conhece X% das palavras deste vídeo", não "você entende X%". Nível CEFR por contagem de
  palavras não se sustenta.

## What Changes

Três peças, em fatias independentes (`tasks.md`). A ordem vai do que só lê e mede para o que migra dado.

### 1. Dados: guardar menos e melhor

- Completar `review_logs` (origem, formato, tempo de resposta, meta e retenção prevista na hora).
- Tabela de agregados diários por usuário e idioma; as métricas passam a ler dela.
- Estado por item nos jogos (acertos, erros, último resultado) em vez de reler todas as rodadas.
- Limpeza diária: apagamento físico do que tem `deleted_at` antigo, `PRAGMA optimize`, checkpoint do WAL.
- Corrigir a chave de dedup por idioma (acentos e marcas que distinguem palavras ficam) e separar os
  cartões que foram fundidos por engano. **Risco alto: mexe em dado gravado.**
- Dicionário único por idioma com forma base e faixa de frequência; cartões e ocorrências apontam para ele.
- Ocorrência aponta para a fala em vez de copiar a frase.
- Depois dos agregados: histórico bruto por 180 dias, e o resto compactado (palavra, dia, nota).

### 2. Modelo do aluno e seletor único

- Três estimativas por palavra: vai lembrar (FSRS, que já existe), consegue este exercício (Elo com
  desconto de chute), provavelmente conhece (por faixa de frequência, para palavra nunca vista).
- Um seletor em `src/core`, usado pela Revisão e por todos os jogos, no servidor e na edição estática:
  quais itens, em que ordem, em que dificuldade.
- Regra de jogo × memória: só recordar sem alternativas conta como revisão; reconhecer não mexe na agenda;
  erro sob pressão de tempo não vira lapso; um efeito por palavra por dia.
- Revisão com meta de 90%, descendo até 85% quando a carga estoura; palavras novas limitadas pela carga
  prevista e escolhidas pelo que destravam do conteúdo do próprio usuário.
- Jogos com alvo de acerto de 80 a 90%: começa fácil, termina fácil, sobe rápido e desce devagar.
- Medir a calibração do FSRS (previsto × real) antes de qualquer ajuste; pesos por usuário só depois, no
  máximo uma vez por mês.

### 3. Métricas devolvidas ao usuário

- Na tela principal, três: palavras na memória, carga prevista e regularidade (dias ativos em 28, sem
  punição). As outras nove da pesquisa ficam na Memória dos Cartões e em Estatísticas.
- Contagem por forma base, com desconto de chute. Cobertura dita como "você conhece X% das palavras".
- Agrupamento por fonte, no padrão do catálogo de fontes (Tudo, Por idioma, Das minhas sessões, Do Anki).

## Impact

- Migrações novas e uma de correção de dado (a chave de dedup), com backup, ensaio em cópia e reversão
  escrita antes de rodar.
- `src/core/minigames/**`, `src/core/learning/**`, `Study.tsx`, `Play.tsx`, `server/routes/{vocab,metrics}.ts`,
  repositórios de vocabulário e de revisões; a edição estática ganha o mesmo seletor no aparelho.
- Privacidade: tempo de resposta e erros são dado de comportamento. Não entram em anúncio nem em perfil, e
  não se infere condição de aprendizagem a partir deles (ECA Digital e LGPD; pede advogado, junto com a
  consulta dos anúncios).

## Fora desta proposta

Trocar UUID das tabelas existentes, comprimir texto no SQLite, deduplicar traduções das falas, rede neural
de rastreio de conhecimento, nível CEFR por contagem, nota automática de pronúncia.

## Apostas declaradas

Sem estudo que as sustente, só raciocínio: jogo alimentando a repetição espaçada com peso menor, o alvo de
80 a 90% nos jogos, abrir e fechar a rodada com item fácil, a proporção de palavras novas. Cada uma entra
com a medida que vai dizer se funcionou.
