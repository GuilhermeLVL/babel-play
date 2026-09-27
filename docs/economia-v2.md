# Economia — recompensas v2 (27/09/2026)

Spec: `docs/superpowers/specs/2026-09-27-recompensas-v2-design.md` (7.1–7.3, 5.1). Plano: onda 2.
Não é parecer jurídico; as restrições legais estão na seção 3 da spec.

## Fontes de Seeds (`REGRAS`, `src/core/learning/economia.ts`)

Só resultado paga. Saíram a **presença** (abrir o app) e os **minutos de captura** — Decreto
12.880/2026, art. 9º. `tests/economia-sem-tempo.test.ts` varre `REGRAS`, `PESOS_SEEDS` e `PESOS_XP`.

| Ação | Seeds | XP | Limite / conferência |
| --- | --- | --- | --- |
| Palavra nova salva da captura | 1 | 0 | até 30 por dia local (derivado: cartão do caderno com `sessionId`) |
| Fichar uma palavra no caderno | 1 | 2 | — |
| Acertar uma revisão | 2 | 5 | — |
| Acertar um item de jogo | 1 | 3 | — |
| Rodada sem erro (3 estrelas) | 5 | 15 | mínimo de itens do jogo |
| Meta do dia (20 acertos no dia) | 15 | 20 | crédito `meta:<AAAA-MM-DD>`, hoje/ontem no fuso do usuário, conferido no servidor |
| Nível de maestria | 20 × nível | — | onda 3 (`maestria:<jogo>:<n>`) |
| 7 dias seguidos de prática | 25 | 50 | dia de prática = revisão, rodada ou palavra salva |
| Conquista | varia | varia | conferida no servidor |

A ofensiva (`streakDays`, `streakPresenca`/`maiorSequenciaPresenca` — nomes antigos, conteúdo novo)
conta dias de prática. `POST /api/metrics/presenca` continua gravando, só como estatística.

## Baú (`decidirBau`, `src/core/economiaAutoridade.ts`)

- Só com rodada de 2+ estrelas (precisão ≥ 75%), conferida nas linhas gravadas; no máximo **3 por dia
  local** (fuso enviado pelo cliente; ausente = `America/Sao_Paulo`). O 4º responde 200 com
  `semBau: 'teto'` e não grava nada.
- Chances à vista na resposta e no modal: **75% comum · 25% raro**; o 5º baú seguido sem raro é raro.
- Faixa sorteada sem peça nova: vira Seeds — **comum 15, raro 40** (`reason: bau:repetido:<r>`).
- Peça nova: a peça + 5 Seeds (`SEEDS_DO_DROP`). Idempotente por `roundId`. Nunca pago, nunca por Créditos.

## Corte do catálogo e reembolso (`src/core/reembolso.ts`)

Saíram 97 itens: 27 cursores, 33 packs de emoji, 2 aprimoramentos, a partícula "Chuva de Emojis",
10 capacidades de emoji da galeria, 12 rastros (fica um por forma à venda) e as 12 fontes/posições
(que viraram opção livre em "Acessibilidade e layout"). `POST /api/metrics/seeds/reembolso` devolve,
uma vez, cada gasto `loja:`/`croma:` de item removido e todo `aprimoramento:*` como
`reembolso:<reason>` — idempotente pelo índice único de `seed_credits`. Pago com Créditos
(`dourada-3/5/7`) vira o equivalente (tema Aurora, até a onda 4). O cliente chama uma vez por sessão
com a flag `recompensas_v2` ligada e mostra o aviso uma vez só.

## Calibragem (`npx tsx scripts/economia/simular-ritmo.ts`)

30 dias, semente fixa, pesos reais do core, baú de `decidirBau` e maestria no desenho da onda 3.

| Perfil | Por dia | Seeds/dia | Seeds em 30 dias | Baús | Peças |
| --- | --- | --- | --- | --- | --- |
| Leve | 10 revisões + 1 rodada | 37,5 | 1.126 | 18 | 11 |
| Típico | 25 revisões + 3 rodadas + 10 palavras + meta | 165,2 | 4.956 | 69 | 13 |
| Intenso | 60 revisões + 8 rodadas + 30 palavras + meta | 370 | 11.099 | 90 | 13 |

Meta do dono, no perfil típico e só com Seeds: um comum a cada 2–3 dias, um raro por semana, um épico
a cada 2–3 semanas. Preços antigos × fator por raridade, preservando a ordem dentro da faixa:

| Raridade | Antes | Agora | Dias do perfil típico |
| --- | --- | --- | --- |
| Comum | 45–60 | **350–450** | 2,1–2,7 |
| Raro | 100–140 | **1.000–1.300** | 6,1–7,9 |
| Épico | 220–240 | **2.600–3.000** | 15,7–18,2 |
| Lendário | 600 | **5.200** | 31,5 |

`tests/economia-calibragem.test.ts` reprova se peso ou preço mudar sem refazer a conta.

### O que a simulação mostrou e o dono precisa decidir

- **O nível abre antes das Seeds.** O XP cresce ~1,5–3× mais rápido que as Seeds; com os preços
  calibrados, todo item de hoje (todos têm `nivel`) destrava por nível antes de a pessoa juntar o
  atalho. O preço só vale para itens SEM nível — a onda 4 deve criar os itens novos só com Seeds (ou
  subir o `nivel` dos atuais).
- **O baú pesa ~23% da renda típica** depois que a coleção sorteável (hoje só 13 peças comuns/raras)
  acaba e ele passa a pagar 15/40 por repetido. Com o catálogo da onda 4 isso cai.
- **Croma (15–60) e "pular rodada" (40) não foram recalibrados**: continuam sendo o destino barato
  das Seeds que sobram.

## Histórico — economia v2 de 2026-08-28 (substituída pelas recompensas v2)

### O problema medido

Seeds eram `palavrasCapturadas × 1 + revisõesCertas × 4`, e `palavrasCapturadas` é a soma de palavras
dos transcritos. Uma importação de 325 palavras rendia **325 Seeds sem nenhuma ação**; jogar não rendia
Seed; presença, sequência e tempo de sessão não existiam. Com a Loja custando 30-400, quem só capturava
comprava metade do catálogo sem jogar.

### A regra agora (uma fonte só: `src/core/learning/economia.ts` → `REGRAS`)

| Ação | XP | Seeds | Limite |
| --- | --- | --- | --- |
| Abrir o app no dia | 10 | 5 | 1×/dia |
| 7 dias seguidos de presença (a cada 7) | 50 | 25 | por marco, nunca cobrado de volta |
| Cada 5 min de sessão gravada | 10 | 1 | 30 min/dia (6 Seeds) |
| Salvar a sessão | 25 | 0 | |
| Fichar uma palavra no caderno | 2 | 1 | |
| Revisão certa | 3+2 | 2 | |
| Item de jogo certo | 1+2 | 1 | |
| Rodada 100% (≥ mínimo do jogo) | 15 | 5 | |
| Conquista | varia | varia | 1× |

Palavra capturada continua dando 2 XP e **zero Seeds**. Dia ativo típico ≈ 86 Seeds; o lendário mais
caro (600) sai em ≈ 7 dias (teste `economia.test.ts` trava entre 5 e 8).

Preços: comum 40-60 · raro 100-140 · épico 200-260 · lendário 380-600. Aprimoramentos 50/110/220.
Pular rodada mantendo combo: 40.

### Persistência (edição leve = IndexedDB, `data/efemero`)

- Stores novos (`store.ts` v2): `presencas {dia}` e `creditos {creditoId, amount, xp}`; o `upgrade`
  cria só o que falta.
- Rotas: `POST /api/metrics/presenca` (idempotente por dia local) e `POST /api/metrics/seeds/creditar`
  (idempotente por `creditoId`), mesmo padrão de `gastar`.
- `AppMetrics` ganhou campos **opcionais**: `presencas, streakPresenca, maiorSequenciaPresenca,
  sequencias7, capturaMinutos, capturaMinutosPremiados, rodadasPerfeitas, seedsCreditadas, xpCreditado,
  idiomas`. A edição completa (Postgres) ainda não os calcula: `deriveProgress` trata ausência como
  zero. **Follow-up da edição completa:** tabelas `presencas`/`creditos` + os mesmos agregados em
  `server/db/repositories/metrics.ts`.

### Conquistas (`src/core/learning/conquistas.ts`)

14 conquistas com progresso `atual/meta` e recompensa fixa. Quatro dão cosméticos que a Loja **não
vende** (`exclusivoDe` no catálogo): tema Aurora (Constante, 30 dias), partículas Cometa (Ouvinte,
60 min), cursor Coroa (Perfeccionista, 10 rodadas 3★), rastro Arco-íris (Colecionador, todos os
eventos raros). O cliente (`lib/conquistas.ts`) só marca a conquista DEPOIS de o crédito entrar no
servidor; sem rede, tenta de novo na próxima avaliação.

Onde ver: aba **Conquistas & como ganhar** dentro da Loja (edição leve) e aba **Conquistas** no
Perfil (edição completa). A tabela "Como ganhar" é gerada de `REGRAS`: o que está escrito é o que é
creditado.

### Saldos antigos

Recalculados pela regra nova (decisão do dono): Seeds são função dos contadores, então quem só
capturou perde o saldo "de graça". Compras já feitas continuam possuídas (posse local).
