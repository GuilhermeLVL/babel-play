# Decisões desta mudança

## 1. Pergunta 9 — o passivo histórico de Seeds: RECONCILIAR

**A decisão do dono (07/09):** "pode mexer à vontade, a aplicação ainda não tem usuários, apenas
eu testando, pode alterar à vontade para fazer o que é melhor."

Com isso, "perdoar" e "manter" deixam de ser as duas opções: as duas existiam para proteger o saldo
de terceiros, e não há terceiros. A escolha passa a ser sobre qual banco é mais fácil de raciocinar
daqui em diante, e a resposta é o banco que obedece à regra.

**A regra aplicada, e ela vale para qualquer linha de qualquer época:** o valor de um crédito é
`valorDoCredito(creditoId)`, e nada mais. Daí saem três casos, sem julgamento caso a caso:

| caso | ação |
|---|---|
| o `creditoId` não resolve | soft-delete (`deleted_at`) |
| resolve e o valor diverge | `amount`, `xp` e `reason` passam a ser os da regra |
| resolve e bate | nada |

Soft-delete e não `DELETE`: o razão continua auditável, e as duas consultas que somam o saldo já
filtram `deleted_at` — foi o achado P2-N2 que obrigou a isso, e desfazê-lo aqui reabriria o mesmo
buraco pelo outro lado.

**O script:** `scripts/economia/reconciliar-creditos.ts`. Padrão é RELATÓRIO; só escreve com
`--aplicar`. Idempotente por construção — a segunda execução não acha nada a fazer, porque a
primeira deixou tudo igual à regra.

**O que ele encontrou e fez no banco real (07/09), com cópia de segurança antes:**

| | |
|---|---|
| linhas vivas em `seed_credits` | 45 |
| já corretas | 23 |
| a corrigir | 0 |
| soft-deletadas | 22 |
| Seeds creditadas | 2.923 → 2.004 (−919) |

As 22 são de dois formatos que o passe não emite mais: `passe:t1:slot-<n>` (14 linhas, do desenho
anterior, em que cada casa creditava) e `passe:t1:cofre-d<N>` sem a posição (5 linhas), mais os
cofres da década 1, que o catálogo atual preenche inteira com item, e um `conquista:smoke-a7` de
teste. Nenhuma linha precisou de correção de VALOR: as que sobreviveram já batiam com
`slotsDoPasse()`. O `conquista-dinheiro-infinito` de 10.000 Seeds já estava soft-deletado por uma
limpeza anterior, e o script corretamente não o toca.

## 2. Os drops NÃO entram nesta mudança — e não por escolha

A proposta previa `POST /api/metrics/drops/registrar` e `/abrir/:id`, com o `drop:<id>` como
terceira família de `valorDoCredito`. **Esse código não existe em `main`.** `src/lib/drops.ts`,
`ModalDropDePartida` e `registrarFimDePartida` faziam parte da camada de gamificação não rastreada
que foi guardada na branch `gamificacao-v2-wip` quando a árvore foi limpa (decisão (b) do dono).

Implementar a família `drop:*` agora seria escrever a autoridade de um evento que nada emite:
nenhuma rota a chamaria, nenhum teste a exercitaria de verdade, e ela envelheceria até a hora em
que a camada voltasse — provavelmente com outro formato de id. O que existe hoje é o contrário
disso: `valorDoCredito` RECUSA `drop-partida-bau-<timestamp>` com 400 e código
`credito_desconhecido`, e há teste prendendo essa recusa. Quando a camada voltar, ela encontra o
lugar exato onde declarar o que um drop vale.

## 3. `poliglota` e `duelista` saíram da lista de "não confere"

`CONQUISTAS_CONFERIVEIS` marcava três conquistas como não conferíveis pelo servidor. Duas delas
não eram subjetivas — o dado é que não existia:

- `poliglota` lê `idiomas`, e `sessions.source_lang` está gravado desde sempre; faltava
  `computeProfile` contar;
- `duelista` lê o combo, que o cliente MEDIA e ENVIAVA, e que `rodadaSchema` descartava por não
  declarar o campo. Não havia nem coluna.

Com a coluna `combo` (migração 0025) e `idiomas` no perfil, as duas passam a ser conferidas. Sobra
`colecionador`, que conta eventos raros vistos — estado que só o navegador tem. Para ela o servidor
credita o valor correto sem conferir a condição, e a exposição é de 100 Seeds e 120 XP, uma vez.

## 4. Por que o gasto atômico não usa transação

O comentário que documentava a corrida propunha rodar `computeProfile` dentro de `emTransacao`. O
custo é alto e o desenho é ruim: são cinco varreduras de tabela seguradas por uma transação de
ESCRITA, o que serializa o banco inteiro para conferir o saldo de uma pessoa.

O que a mudança faz é mover a condição para dentro do próprio INSERT
(`INSERT ... SELECT ... WHERE soma_dos_gastos + este <= teto`). O teto — as Seeds GANHAS — é
calculado fora, e isso é seguro porque **ganho só cresce**: um teto de milissegundos atrás é
conservador. No pior caso recusa uma compra que teria passado, e o retry seguinte passa. O oposto,
cobrar além do saldo, não pode acontecer.

A conferência antecipada continua, e não é redundante: ela é quem sabe dizer *quanto falta* no 402.
O teto do INSERT sabe barrar, não sabe explicar.

Para os Créditos (a moeda comprada) a trava é ainda mais direta, porque as duas metades do saldo
são tabelas: o SQLite calcula `compras pagas − gastos >= amount` dentro do INSERT, sem teto vindo
de fora.

## 5. A derivação métrica → XP/nível/saldo virou uma função só

`eventosDeMetricas` e `economiaDeMetricas`, em `src/core/learning/xp.ts`. O mesmo mapeamento de
treze campos existia duas vezes — em `src/lib/progress.ts` (a tela) e em `economiaDoUsuario` (a
cobrança) — e concordava só enquanto ninguém acrescentasse um evento novo.

Não foi economia de linhas: é o que permite ao servidor efêmero conferir NÍVEL e SALDO, que é o que
faltava para ele aplicar a mesma autoridade. Sem isso, ele precisaria de uma terceira cópia.
