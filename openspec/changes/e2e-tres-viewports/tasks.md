- [x] 1.1 tres projetos no config; suite atual verde nos tres
- [x] 1.2 sessao de jogo (Memoria, Termo, um cultural)
- [x] 1.3 revisao FSRS
- [x] 1.4 seeds: saldo e gasto na loja
- [x] 1.5 transcricao: a tela de captura e o painel de motor sao verificados nos tres viewports; gravar e transcrever fica `test.skip` ("exige microfone e modelo local")
- [x] 1.6 importacao Anki por fixture
- [x] 1.7 estatisticas
- [x] 1.8 tema e personalizacao
- [x] 1.9 limites do modo anonimo: `test.skip` com o motivo medido — `estaAnonimo()` exige `VITE_AUTH_REQUIRED=1` com projeto Supabase compilado no bundle, e `dev:local` forca `0`; a regra em si segue coberta no core (vitest)
- [x] 1.10 login `test.skip` com motivo

## Resultado da matriz (2026-09-09)

| projeto | passou | pulou | falhou | duracao |
|---|---:|---:|---:|---:|
| mobile-375 | 33 | 5 | 0 | 133 s |
| tablet-768 | 33 | 5 | 0 | 133 s |
| desktop-1280 | 33 | 5 | 0 | 134 s |

Nenhum seletor precisou de correcao por viewport: a dock inferior e a barra superior expoem os
mesmos papeis e nomes acessiveis, e os testes ja falavam por `getByRole`.

Dois dos cinco pulos sao condicionais antigos (`baralhos`, `facetas`: "condicional a haver baralho
importado") — num banco novo por lote eles nao encontram acervo. Os outros tres sao os pulos
declarados (login, transcricao com microfone, teto anonimo).

**Limite da maquina, nao do teste**: o processo do Playwright morre nesta maquina quando um unico
comando passa de ~30 testes (medido: 9/114 e 32/38). A matriz roda em cinco lotes por projeto
(`scripts/testes/matriz-e2e.sh`); na CI (Ubuntu) o comando unico segue valendo.
