## Why

Hoje o Frasy abre direto no app sem login (decisão de 01/09, `src/components/conta/exigeConta.ts`). Quem não tem conta grava
até 5 sessões e guarda 80 palavras no navegador (`src/core/tetoAnonimo.ts`), lê livros à vontade e só esbarra em convites que
podem ser dispensados. O dono quer converter mais: deixar experimentar **uma sessão completa** e, a partir daí, **exigir
login** de adultos; nos **livros**, o catálogo fica visível e **ler pede conta**; **menores** mantêm um caminho leve (uso local
como hoje, sem cadastro forçado).

O uso sem conta roda só com motores do aparelho (sem custo de servidor), então a trava é de produto e de conversão, não de
segurança. Isso é coerente com `docs/flags.md` ("flag nunca é cota nem segurança"): a regra fica no core e a flag
`acesso_restrito_sem_conta` só liga o fluxo novo.

## What Changes

- **Uma sessão livre.** Sem conta, a pessoa grava 1 sessão de legenda, tradução ou intérprete e joga com as palavras dela.
- **Segundo uso abre a porta.** Ao iniciar a 2ª sessão, abrir um livro ou voltar ao app depois do 1º uso, abre a porta de
  entrada (`PortaDeEntrada`) com a pergunta "Você tem 18 anos ou mais?".
- **Faixa autodeclarada, só no aparelho.** A resposta fica em `babel.faixa_sem_conta` (`'adulto' | 'menor'`), nunca vai ao servidor.
- **Adulto: login obrigatório**, sem "Continuar sem conta"; depois do login volta ao destino
  (`guardarIntencao`/`consumirIntencao`) e o `ModalDeMigracao` sobe a sessão local sem duplicar.
- **Menor de 18: modo local como hoje** (5 sessões, 80 palavras, livros livres), com convite neutro e sem pressão.
- **Livros:** catálogo e fichas livres; "Ler" pede conta (adulto). A rota direta `/livros/<id>/ler` sem conta cai na porta
  com a intenção guardada.
- **Fora da regra:** edição estática, self-host e o convidado de nuvem (`modo_convidado`).
- **Tudo atrás da flag `acesso_restrito_sem_conta`**, semeada DESLIGADA, solta aos poucos por `percentual`.
- **Site:** "Entrar" vai a `/app?entrar=login` e ganha "Criar conta" (`/app?entrar=signup`).
- **Funil anônimo (sem id):** `porta_exibida`, `porta_faixa_menor`, `porta_cadastro_iniciado`, `conta_criada_pela_porta`.

## Capabilities

### Modified Capabilities

- `modo-anonimo`: o teto passa a conviver com a porta de entrada; novos requisitos para a sessão livre, a porta, a faixa
  declarada, o caminho do menor, a migração na volta e os livros.

## Impact

- Código: `src/core/acessoSemConta.ts` (regra pura), `src/lib/faixaSemConta.ts`, `src/components/conta/exigeConta.ts`,
  `src/components/conta/PortaDeEntrada.tsx`, `src/App.tsx`, `src/lib/pedirConta.ts`, `src/lib/livros/`, `scripts/site/`.
- Dados: flag `acesso_restrito_sem_conta` (migração PG 0022 e SQLite 0064), `docs/flags.md`, `PainelFlags`.
- Métricas: quatro eventos novos no alfabeto fechado de `server/routes/metricasOfertas.ts`.
- Testes: `tests/app-gate-anonimo.test.tsx`, `tests/funil-login.test.tsx`, `tests/convites-sem-conta.test.tsx` ganham casos com
  a flag ligada; novo e2e `acesso-sem-conta-v2`. `tests/e2e-estatica/*` intocados.
- Menores (ECA Digital/LGPD): a faixa não é coletada pelo servidor; textos revisados pela skill `copy-br-etica`.
