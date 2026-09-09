- [x] 1.1 `dois-dispositivos.e2e.ts`: 8 execucoes consecutivas verdes (4 em desktop-1280 + 4 em mobile-375, `--repeat-each=4`)
- [x] 1.2 `tests/caracterizacao/seeds-concorrencia.test.ts`: 6 compras simultaneas somando mais que o saldo, e o mesmo `spendId` tres vezes em paralelo

## O que a corrida ensinou (2026-09-09)

A primeira versao afirmava `final === saldo - gasto` e falhava de forma intermitente (medido:
esperado 19, veio 39). A causa nao e corrida no servidor: o `saldo` comparado era de ANTES dos
recarregamentos de pagina, e recarregar a Loja faz o app creditar o que a tela avalia (+20 Seeds,
com `seedsCreditadas` inalterado — a parcela veio de `seedsGanhasDeEventos`). O teste passou a
comparar com o retrato imediatamente anterior a corrida, o que devolve uma assercao EXATA, e
anota os campos do perfil que mudaram.

O invariante do servidor se manteve em todas as execucoes: `seedsGastas` cresce exatamente o preco
do que foi aceito, no maximo uma compra passa quando so uma cabe, e o saldo nunca fica negativo.
