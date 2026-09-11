# Auditoria da lista de exceções do E2E

Pedida pelo dono em 2026-09-11: *"prove que `e2e-falhas-conhecidas.txt` é igual ao resultado da
main e que nenhum commit da branch adicionou entradas. Imprima o diff."*

**Resultado: a lista NÃO era igual ao resultado da main. Estava errada, e eu a criei.**

---

## 1. O experimento

Quatro corridas da mesma suíte, variando só duas coisas: o código e o banco.

| # | Código | Banco | ok | falhas | As 5 da lista falharam? |
|---|---|---|---|---|---|
| A | `main` @ `2ac979b` (worktree `../babelplay-baseline`) | limpo (4 KB, criado pelo boot) | 95 | 2 | **não — todas passaram** |
| B | `main` @ `2ac979b` | **banco do operador** (12 MB, copiado) | 0 | **15** | **sim, as 5 × 3 viewports** |
| C | branch | banco do operador | 87 | 15 | sim, as mesmas 15 |
| D | branch | isolado (`DATABASE_URL` próprio) | 112 | 2 | **não — todas passaram** |

Comandos: `PORT=3200 BASE_URL=http://localhost:3200 npm run test:e2e` no worktree de baseline (A e
B, com `cp data/babel.db` do repositório principal entre as duas); no principal, `npm run test:e2e`
(C) e o mesmo com `DATABASE_URL=file:./data/gate-e2e.db` (D).

## 2. O diff pedido

```
--- e2e-falhas-conhecidas.txt (o que eu afirmei ser o resultado da main)
+++ resultado real da main com banco limpo (corrida A)
- tests\e2e\fsrs-revisao.e2e.ts:27:3 › Revisao FSRS › avaliar um cartao avanca o progresso e move o due no servidor
- tests\e2e\seeds.e2e.ts:25:3 › Seeds na Loja › o saldo da tela e o do servidor, e o item mais barato diz o que falta ou se compra
- tests\e2e\sessao-de-jogo.e2e.ts:66:3 › Sessao de jogo › Memoria: abre com o baralho, fecha todos os pares e chega ao fim da rodada
- tests\e2e\sessao-de-jogo.e2e.ts:104:3 › Sessao de jogo › Termo: abre com a escada, aceita a palavra digitada e chega ao fim da rodada
- tests\e2e\sessao-de-jogo.e2e.ts:141:3 › Sessao de jogo › Bao (cultural): abre com o baralho, mostra as covas e "Sair" devolve ao lobby
+ [mobile-375]  tests\e2e\fsrs-revisao.e2e.ts:27:3 › Revisao FSRS › avaliar um cartao avanca o progresso e move o due no servidor
+ [tablet-768]  tests\e2e\dois-dispositivos.e2e.ts:54:3 › Dois dispositivos, uma conta › o saldo ganho num aparelho aparece no outro, e a compra simultanea nao deixa saldo negativo
```

Cinco entradas removidas, duas acrescentadas — e as duas que a `main` de fato produz são
**intermitentes**: na corrida parcial anterior (mesmo código, mesmo banco limpo) as duas passaram.
Zero interseção entre a lista e o resultado real.

## 3. Nenhum commit da branch adicionou entradas

`git log -p --follow -- scripts/redesign/e2e-falhas-conhecidas.txt`: o arquivo nasce inteiro, com
as 5 linhas, no commit `1553c1e` (`feat(a11y): axe no gate…`) e nunca mais é tocado até a remoção.
Não houve crescimento silencioso da lista. O defeito foi de **diagnóstico**, não de processo.

## 4. O erro de raciocínio, nomeado

Eu observei: as 5 falham na branch, e a branch não tem mudança de código em relação à `main`.
Concluí: logo são falhas da `main`.

A conclusão não segue. O que a premissa autoriza é apenas *"não são regressão do meu código"*.
Entre a `main` e a branch eu mantive uma variável fixa sem perceber que ela era a causa: **o banco
de dados daquela máquina**. O controle que faltava — rodar a `main` contra o mesmo banco — é
exatamente o que a corrida B faz, e ele mostra que o código nunca esteve envolvido.

Pior: eu **escrevi a causa correta** em `PROGRESSO.md` na mesma sessão ("vem do banco local do
operador, não do produto", "a fila tem 3 cartões vencidos em vez de 6"), e mesmo assim rotulei o
arquivo como "falhas pré-existentes na main". O diagnóstico estava certo e o rótulo, errado.

## 5. Por que isso importa mais do que parece

Uma lista de exceções é uma dívida que se paga com confiança. Enquanto ela existia:

- o gate dizia "verde" com 15 falhas reais em tela;
- qualquer uma das 5 podia passar a falhar por motivo NOVO sem ninguém notar, porque o nome já
  estava na lista de perdão;
- e a suíte ficava dependente de quantos cartões o dono revisou ontem.

## 6. O conserto: eliminar a lista, não corrigi-la

`DATABASE_URL` sempre foi configurável (`server/db/db.ts:16`). O gate passou a rodar o E2E contra
um arquivo descartável, apagado antes de cada corrida, em porta própria (3300) para não
reaproveitar um servidor de desenvolvimento ligado ao banco do operador.

Com o resultado reproduzível, a exigência volta a ser a simples — **zero falhas** — e
`scripts/redesign/e2e-falhas-conhecidas.txt` foi removido do repositório.

## 7. O que o banco limpo revelou

Rodar contra banco vazio é rodar **na experiência de usuário novo**, e ali o axe achou o que o
banco populado escondia:

- **`Sobre.tsx:287`** — `bg-accent … text-white` escrito à mão. Branco sobre `--accent` dá
  **3,61:1** e reprova AA. É o defeito que `index.css:876` já documenta ("`white` some no accent
  branco do vercel-dark e lava no accent verde-claro do mochi"), e a resposta já existia: a classe
  `btn-solid`, que usa `var(--accent-contrast)`. Recriar o botão à mão reintroduziu o problema.
  Corrigido usando a classe.
- **`accent-contrast × accent` passa por 4,54:1** — margem de 0,04 sobre o mínimo. O par É coberto
  por `contrastePaletas.test.ts`, que o aprova; mas o axe, medindo o que foi renderizado, reprovou
  o botão do modal de recompensa. O próprio teste de token avisa disso em `:59` ("o coletor ainda
  achava 2,93:1 … os dois se complementam e nenhum substitui o outro"). Fica registrado como
  decisão de token pendente, não como conserto de passagem.
- A fila de conquistas do banco vazio sobrepunha o modal de recompensa a três rotas durante o scan.
  O modal saiu da varredura **de rota** (`.exclude`), com a pendência declarada de ganhar teste
  próprio — ver `LACUNAS.md`.
