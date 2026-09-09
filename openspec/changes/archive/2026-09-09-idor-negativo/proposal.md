## Why

O isolamento entre contas era coberto por testes escritos a mao para algumas rotas. Uma rota nova
com `:id` nascia sem cobertura e ninguem sabia — a suite passava por nao testar o que nao conhecia.

## What Changes

- `tests/seguranca/idor.test.ts` GERA os casos a partir da matriz: rotas privadas com parametro no
  caminho. Rota nova com `:id` derruba a suite ate alguem declarar como semea-la.
- Cada caso semeia recurso NOVO de A, B chama com CORPO VALIDO, confere que o recurso de A continua
  intacto, e SO ENTAO A repete a chamada — sem esse ultimo passo uma rota que responde 404 para
  todo mundo "isolaria" perfeitamente.
- 19 rotas cobertas, 0 vazamentos. Quatro desvios de FORMA de resposta registrados com razao.

## Nao-escopo

Corrigir os quatro desvios de forma. Nenhum vaza dado, nenhum tem efeito e nenhum serve de oraculo
de existencia; viram decisao do dono, registrada no relatorio da fase.
