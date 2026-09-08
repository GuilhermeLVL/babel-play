# CI — 2026-09-08

| ref | SHA | run | resultado | passo que falhou |
|---|---|---|---|---|
| origin/main | 47ecf10 | https://github.com/GuilhermeLVL/babel-play/actions/runs/34278328814 | vermelha | npm test (erro nao tratado speak() sem lang) |
| saneamento/2026-09-08 | 51e4656 | https://github.com/GuilhermeLVL/babel-play/actions/runs/34284978242 | vermelha | Testes de ponta a ponta (banco vazio abre no Onboarding) |
| saneamento/2026-09-08 | d58f538 | https://github.com/GuilhermeLVL/babel-play/actions/runs/34287634703 | **verde** | — |

Das 30 runs de CI visiveis pela API publica antes desta rodada, nenhuma era verde. O log do job exige admin (403); o diagnostico foi por reproducao local (Node 22 + TZ=UTC; banco vazio + CI=1).
