# Economia — recompensas v2 (27/09/2026)

Spec: `docs/superpowers/specs/2026-09-27-recompensas-v2-design.md` (7.1–7.3, 5.1). Plano: onda 2.
Não é parecer jurídico; as restrições legais estão na seção 3 da spec.

## Fontes de Seeds (`REGRAS`, `src/core/learning/economia.ts`)

Só resultado paga. Saíram a **presença** (abrir o app) e os **minutos de captura** — Decreto
12.880/2026, art. 9º. `tests/economia-sem-tempo.test.ts` varre `REGRAS`, `PESOS_SEEDS` e `PESOS_XP`.

| Ação                            | Seeds      | XP    | Limite / conferência                                                                                      |
| ------------------------------- | ---------- | ----- | --------------------------------------------------------------------------------------------------------- |
| Palavra nova salva da captura   | 1          | 0     | até 30 por dia local (derivado: cartão do caderno com `sessionId`)                                        |
| Fichar uma palavra no caderno   | 1          | 2     | —                                                                                                         |
| Acertar uma revisão             | 2          | 5     | —                                                                                                         |
| Acertar um item de jogo         | 1          | 3     | —                                                                                                         |
| Rodada sem erro (3 estrelas)    | 5          | 15    | mínimo de itens do jogo                                                                                   |
| Meta do dia (as 3 missões do dia) | 15 | 20 | crédito `meta:<AAAA-MM-DD>`, hoje/ontem no fuso do usuário, missões conferidas no servidor (onda 5) |
| Nível de maestria               | 20 × nível | —     | `maestria:<jogo>:<n>`, pontos somados das rodadas gravadas (uma vez por `roundId`), conferido no servidor |
| 7 dias seguidos de prática      | 25         | 50    | dia de prática = revisão, rodada ou palavra salva                                                         |
| Conquista                       | 10–200     | 0–300 | uma vez cada (40, 3.305 Seeds no total), conferida no servidor e no espelho                               |

A ofensiva (`streakDays`, `streakPresenca`/`maiorSequenciaPresenca` — nomes antigos, conteúdo novo)
conta dias de prática. `POST /api/metrics/presenca` continua gravando, só como estatística.

## Missões do dia e congelamento (onda 5, `src/core/missoes.ts`)

- **Três missões por dia**, sorteadas com o dia como semente (servidor e navegador chegam às mesmas
  sem guardar nada): revisar 10/15/20 palavras, salvar 3/5 palavras da captura, fechar 1/2 rodadas
  de 2+ estrelas, jogar um jogo nunca jogado (só quando existe). Nenhuma mede tempo.
- **Meta do dia = as três fechadas.** `GET /api/metrics/missoes?fuso=` devolve o progresso contado
  das linhas gravadas; `meta:<dia>` é conferido de novo na rota de crédito (Express e espelho).
- **O dia de uma rodada é o dia em que ela começou**: o cliente manda `duracaoMs` e o servidor grava
  `created_at` = agora − duração (teto de 2 h, `inicioDaRodada`).
- **Congelamento da ofensiva**: a meta creditada rende 1 por semana (seg–dom), guarda até 2; um dia
  sem prática no meio da ofensiva gasta 1 sozinho. Derivado no servidor (`ofensivaComCongelamento`),
  nunca comprado. O perfil protegido não vê congelamento nem aviso de ofensiva.
- **Avisos**: "missão quase completa" (falta uma) 1×/dia, nunca 22h–8h, nunca para perfil protegido.

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

30 dias, semente fixa, pesos reais do core, baú de `decidirBau` e a maestria de `src/core/maestria.ts`.
Refeita com as ondas 3 e 4 juntas (27/09): os efeitos genéricos da onda 3 e os temas, estilos de
legenda e peles de cartão da onda 4 entraram no baú, o repetido sai menos e o perfil típico caiu de
165,2 para **149,9 Seeds/dia**. Para as faixas continuarem na meta, os tetos baixaram: comum 450 →
440 (Linear Indigo, Paletas Escuras) e raro → 1.190 (Mochi 1.180, **Notion 1.300 → 1.190** — nem
os 1.260 da onda 3 nem os 1.220 da onda 4 cabem mais nos 8 dias —, Jardim e Karaokê 1.180, Letreiro
e Combo Chuva de Confete 1.190).

| Perfil  | Por dia                                      | Seeds/dia | Seeds em 30 dias | Baús | Peças |
| ------- | -------------------------------------------- | --------- | ---------------- | ---- | ----- |
| Leve    | 10 revisões + 1 rodada                       | 35,2      | 1.056            | 18   | 18    |
| Típico  | 25 revisões + 3 rodadas + 10 palavras + meta | 149,9     | 4.496            | 69   | 34    |
| Intenso | 60 revisões + 8 rodadas + 30 palavras + meta | 351,1     | 10.534           | 90   | 37    |

Meta do dono, no perfil típico e só com Seeds: um comum a cada 2–3 dias, um raro por semana, um épico
a cada 2–3 semanas. Preços antigos × fator por raridade, preservando a ordem dentro da faixa:

| Raridade | Antes   | Agora           | Dias do perfil típico |
| -------- | ------- | --------------- | --------------------- |
| Comum    | 45–60   | **350–440**     | 2,3–2,9               |
| Raro     | 100–140 | **1.000–1.190** | 6,7–7,9               |
| Épico    | 220–240 | **2.600–3.000** | 17,3–20,0             |
| Lendário | 600     | **5.200**       | 34,7                  |

`tests/economia-calibragem.test.ts` reprova se peso ou preço mudar sem refazer a conta.

### O que a simulação mostrou e o dono precisa decidir

- **O nível abre antes das Seeds.** O XP cresce ~1,5–3× mais rápido que as Seeds; com os preços
  calibrados, todo item de hoje (todos têm `nivel`) destrava por nível antes de a pessoa juntar o
  atalho. O preço só vale para itens SEM nível — a onda 4 deve criar os itens novos só com Seeds (ou
  subir o `nivel` dos atuais). Onda 3: `ItemDaLoja.nivel` ficou opcional; os 10 efeitos genéricos
  são só de Seeds e os 72 itens de maestria não têm nível, preço nem Créditos (`catalogoMaestria.ts`).
- **O baú pesa ~15% da renda típica** (695 de 4.496 em 30 dias): com as ondas 3 e 4 a coleção
  sorteável passou de 13 para 34+ peças comuns/raras, e o baú entrega peça antes de pagar 15/40 por
  repetido. Com margem pequena no lendário (34,7 de 35 dias): mais peças sorteáveis na onda 5 pedem
  a conta de novo.
- **Croma (15–60) e "pular rodada" (40) não foram recalibrados**: continuam sendo o destino barato
  das Seeds que sobram.

### Onda 4 — o catálogo novo e a recalibragem (27/09)

Entraram 19 itens pagos, **todos só com Seeds** (`nivel: NIVEL_SO_SEEDS`, `soPorSeeds()` em
`src/core/loja.ts`: o nível nunca os abre, e a vitrine de nível, a próxima recompensa e o Passe não
os prometem) — a resposta ao "nível abre antes das Seeds" acima. Livres só os padrões (legenda
clássica, cartão padrão).

| Tipo                      | Itens e preço (Seeds)                                          |
| ------------------------- | -------------------------------------------------------------- |
| Tema completo (raro)      | Papel e tinta 1.000 · Rádio 1.100 · Jardim 1.180               |
| Tema completo (épico)     | Neon noturno 2.600 · Fliperama 2.800 · Observatório 3.000\*    |
| Estilo de legenda (comum) | Cinema 350 · Fita 380 · Contorno 420                           |
| Estilo de legenda (raro)  | Vidro 1.000 · Máquina 1.100 · Karaokê 1.180 · Letreiro 1.190\* |
| Pele de cartão (comum)    | Caderno 360 · Selo 440                                         |
| Pele de cartão (raro)     | Vitral 1.050 · Constelação 1.150\*                             |

\* candidato à temporada: na onda 5 virou exclusivo da Temporada 1 (sem preço; volta à Loja um ano
depois do fim com este preço — ver "Temporada com datas").

Os comuns e raros entram no baú, que passa a entregar peça em vez de Seeds de repetido. A conta
com as duas ondas juntas (149,9 Seeds/dia) e os preços que ela moveu estão em "Calibragem", acima.

## Temporada com datas (onda 5, `src/core/temporada.ts`)

Substitui o Passe "lente do nível" de 100 casas (spec 8.3). O Passe, o SKU `passe-t1` e a fileira de
Créditos saíram; `POST /api/billing/creditar-passe` ficou depreciada, sem efeito
(`tests/contratos/api-depreciacoes.json`).

- **Temporada 1 "Observatório":** 01/10/2026 a 25/11/2026 (8 semanas, dia de Brasília). 30 níveis de
  150 XP. XP de temporada = XP da conta (`xpDeEventos`) dos eventos com carimbo dentro da janela.
- **Trilha grátis** (níveis pares): título Luneta (8), Legenda Letreiro (12), Moldura Órbita (18),
  Cartão Constelação (22), tema Observatório (30); Seeds nos outros dez: 60, 70, 80, 90, 100, 110, 120,
  130, 140, 150 = **1.050 Seeds** (`tests/temporada.test.ts` trava entre 900 e 1.200).
- **Trilha de assinante** (todo nível): 15 títulos de estrela e 15 molduras de constelação
  (`catalogoTemporada.ts`), raridade subindo (1–10 comum, 11–20 raro, 21–29 épico, 30 lendário).
  **Nunca Seeds**: Seeds pela assinatura seriam Seeds compráveis. Assinante = plano `essencial`/`pro`
  concedido pelo servidor; na edição estática só existe a trilha grátis.
- **Crédito** `temporada:<id>:<nível>:<gratis|assinante>`, conferido nas duas pontas (XP da janela ≥
  nível × 150; assinatura no Express, 403 no espelho). Não há rota nem motivo de gasto que compre nível.
- **Volta à Loja:** os itens da temporada (os três candidatos da onda 4 e os 32 de perfil) não têm
  preço nem caem no baú; 365 dias depois do fim voltam com Seeds (`precoSeedsDepois`: Observatório
  3.000, Letreiro 1.190, Constelação 1.150; os de perfil 400/1.100/2.800/5.200 por raridade).

### Ritmo (conta à mão com `PESOS_XP`, sem captura)

| Perfil                            | XP de temporada/dia | Nível 30 em | Nível em 56 dias |
| --------------------------------- | ------------------- | ----------- | ---------------- |
| Leve (10 revisões + 1 rodada)     | ≈ 72                | —           | ≈ 26             |
| Típico (25 revisões + 3 rodadas)  | ≈ 199               | ≈ 23 dias   | 30               |
| Intenso (60 revisões + 8 rodadas) | ≈ 512               | ≈ 9 dias    | 30               |

Efeito na calibragem: a trilha grátis soma 1.050 Seeds na temporada (≈ 19/dia em 8 semanas, ≈ 12% da
renda típica de 149,9/dia) e entrega dois raros e um épico que saíram da Loja com Seeds — a meta de
preço da Loja não muda, porque esses três deixaram de ser vendidos.

**Para o dono decidir:** a captura rende `sessao` 25 XP + **2 XP por palavra transcrita**
(`palavraCapturada`), e uma gravação de 10 minutos passa de 1.000 palavras. Com captura, a trilha
inteira pode sair em poucas gravações. É a mesma fórmula do XP da conta (a spec manda usar os mesmos
resultados); se a temporada precisar de ritmo próprio, o ajuste é tirar `palavrasCapturadas` de
`xpDeTemporada` ou pesar menos.

## Histórico — economia v2 de 2026-08-28 (substituída pelas recompensas v2)

### O problema medido

Seeds eram `palavrasCapturadas × 1 + revisõesCertas × 4`, e `palavrasCapturadas` é a soma de palavras
dos transcritos. Uma importação de 325 palavras rendia **325 Seeds sem nenhuma ação**; jogar não rendia
Seed; presença, sequência e tempo de sessão não existiam. Com a Loja custando 30-400, quem só capturava
comprava metade do catálogo sem jogar.

### A regra agora (uma fonte só: `src/core/learning/economia.ts` → `REGRAS`)

| Ação                                   | XP    | Seeds | Limite                            |
| -------------------------------------- | ----- | ----- | --------------------------------- |
| Abrir o app no dia                     | 10    | 5     | 1×/dia                            |
| 7 dias seguidos de presença (a cada 7) | 50    | 25    | por marco, nunca cobrado de volta |
| Cada 5 min de sessão gravada           | 10    | 1     | 30 min/dia (6 Seeds)              |
| Salvar a sessão                        | 25    | 0     |                                   |
| Fichar uma palavra no caderno          | 2     | 1     |                                   |
| Revisão certa                          | 3+2   | 2     |                                   |
| Item de jogo certo                     | 1+2   | 1     |                                   |
| Rodada 100% (≥ mínimo do jogo)         | 15    | 5     |                                   |
| Conquista                              | varia | varia | 1×                                |

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

**Recompensas v2, onda 5:** 40 conquistas em 4 pilares (Vocabulário 9, Escuta 10, Jogos 11,
Constância 10), bronze/prata/ouro nas séries, 3 secretas com dica vaga. Todas conferidas no Express
e no espelho sem conta com o mesmo contexto (`contextoConferivelDeConquistas`,
`tests/contratos/conquistas-paridade.test.ts`); nenhuma lê tempo (o Ouvinte trocou 60 minutos por
5 sessões). Os 14 ids antigos ficam com a mesma recompensa. O ouro entrega moldura ou título fora
de venda (`src/core/catalogoConquistas.ts`); os exclusivos antigos (tema Aurora, partículas Cometa,
rastros Arco-íris e Matrix) continuam.

**Seeds de UMA VEZ, não por dia:** as 40 somam **3.305 Seeds** (as 14 antigas somavam 860) —
≈ 22 dias do perfil típico (149,9/dia), espalhados por meses: o ouro pede 1.000 palavras, 2.000
revisões, 100 sessões, 50 rodadas perfeitas, 100 dias seguidos ou nível 25. Não entram na
calibragem diária (`simular-ritmo.ts`); `tests/conquistas-v2.test.ts` trava o total abaixo de 25
dias típicos. O cliente (`lib/conquistas.ts`) só marca a conquista DEPOIS de o crédito entrar no
servidor; sem rede, tenta de novo na próxima avaliação.

Onde ver: aba **Conquistas & como ganhar** dentro da Loja (edição leve) e aba **Conquistas** no
Perfil (edição completa). A tabela "Como ganhar" é gerada de `REGRAS`: o que está escrito é o que é
creditado.

### Saldos antigos

Recalculados pela regra nova (decisão do dono): Seeds são função dos contadores, então quem só
capturou perde o saldo "de graça". Compras já feitas continuam possuídas (posse local).
