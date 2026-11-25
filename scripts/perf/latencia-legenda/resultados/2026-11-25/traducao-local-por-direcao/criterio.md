# Critério dos A/B da tradução local por direção (X→en) e da meta es→pt

Escrito e commitado ANTES de qualquer rodada de decisão desta change (openspec `traducao-local-por-direcao`, tarefas 1.1b, 4.1, 4.5, 5.3). As medições de 21/11 (`docs/auditoria/2026-11-21-traducao-local-por-direcao.md`) são exploratórias, marcadas `emulado`, e não decidem nada. Nada daqui roda antes da sessão de bancada única (depois da Onda 4).

## Decisões do dono assumidas (25/11, recomendações de `docs/backlog/decisoes-do-dono.md`, item 30)

- Licença dos pesos par a par, começando por es, fr, it e de. O ato de marcar `aprovadoPeloDono: true` continua do dono [D]; nada é publicado sem ele.
- Teste cego pt-BR ADIADO: en→pt segue opus-mt `>>pt_br<<` (4.3 e 4.4 abertas).
- Runtime Mozilla 0.4.9 mantido: 5.1 e 5.2 (runtime novo) ficam fora enquanto o aparelho real não estourar a memória.

## Ordem

Simulação offline leve primeiro; triagem curta (3 rodadas, parada antecipada se o braço Bergamot já perde); só a finalista vai à medição longa. Pré-voo antes de cada rodada demorada (modelos em cache, tampa aberta, `caffeinate`, sem outro teste pesado). Todo resultado sem aparelho real sai marcado `emulado` e não declara ganho de celular.

## A. Qualidade (4.1): `mt.mjs` + `pontuar.py`

- Sistemas: `local:opus-mt` (A) × `bergamot:<par>` (B); pares X→en publicáveis (es, fr, it, de, na ordem de aprovação); corpora `fleurs:<X>-en`.
- Métricas: COMET e chrF++, diferença pareada B − A com IC 95% (bootstrap pareado, `src/core/eval/bootstrap.ts`), n por par no relatório.
- Aprovado por par: limite inferior do IC 95% de B − A >= −1,0 ponto em COMET e em chrF++ (margem de ruído). Ganho só é declarado se o IC não cruzar 0. Par com n < 50: `inconclusivo`.
- Reprovado: limite superior do IC de B − A < 0 em qualquer das duas métricas.

## B. Memória e latência (só o runtime 0.4.9)

Leitura de 0.4.9 × opus-mt: RSS/heap de pico, p75 de ms por frase, erros do 2º modelo carregado em sequência. Sem comparação com runtime novo. Aceite: limite superior do IC 95% pareado do RSS de pico (B − A) < 0 e zero erro no 2º modelo.

## C. `fimDaFalaAteLegendaMs` (5.3): `ab.mjs` pareado

- A = opus-mt, B = Bergamot, pares X→en, perfil desktop (tampa aberta), 12 rodadas VÁLIDAS por braço e cenário, intercaladas, aquecimento descartado; rodada inválida é refeita, nunca completada com dado de outra execução.
- Guarda: limite superior do IC 95% de B − A no p75 <= +100 ms (resolução da bancada, igual à decisão de 22/11). Taxa de falha ao lado, com B <= A + 1 pp.
- Qualidade e memória lado a lado na mesma tabela. Vale só para desktop; celular real é a 5.5 [R].

## D. Meta es→pt (4.5, herdada de `traducao-sem-rota-no-celular` 5.2/6.2)

- Rotas comparadas: pivô es→en→pt (Bergamot + opus-mt; medido em 17/11: 2,33 a 2,89) × modelo direto es→pt, se houver um publicável com licença aprovada.
- Instrumento: juiz LLM via `claude -p` (sem créditos de API, no máximo 3 em paralelo), as mesmas frases, ordem embaralhada, nota de 1 a 5.
- Meta: nota média do modelo direto >= 3,0 de 5, com o IC 95% ao lado. Sem modelo direto, ou abaixo de 3,0, o pivô segue com o rótulo "tradução aproximada" (decisão 2 do dono, opção a) e a 4.5 fecha como "não atingida", com a nota por rota no relatório.

## Regras gerais

- Nenhum limiar muda depois de ver dados; se mudar, é reescrito antes e marcado.
- A flag `traducao_local_por_direcao` segue desligada em produção; os braços de laboratório ligam por chave local.
