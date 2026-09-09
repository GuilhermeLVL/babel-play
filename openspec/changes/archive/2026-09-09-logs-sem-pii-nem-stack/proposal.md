## Why

O logger tem allowlist de CAMPOS desde o M-01 e promete que dado do usuario nunca vai para o log. A
allowlist e sobre a CHAVE, nao sobre o VALOR — e `error` e uma chave permitida de texto livre.
Medido com drizzle 0.44: o ORM escreve os VALORES VINCULADOS dentro de `message`, de `stack` e de uma
propriedade `params`. O driver do libsql sozinho nao faz isso. Toda escrita que falhava despejava o
conteudo do usuario no log, entrando por dentro do unico campo que a allowlist deixa passar.

## What Changes

- `server/lib/redacao.ts` (`redigirErro`) aplicado DENTRO de `log()` — chokepoint unico, pelo mesmo
  motivo que a allowlist mora la.
- Corta o rabo `params:` do drizzle preservando a query e os quadros do stack, e-mail, e as tres
  formas de segredo que este servidor manuseia.
- O dump multilinha de `console.error` sai de producao; o stack passa a ir DENTRO da linha JSON, no
  campo `stack`, redigido e truncado.

## Nao-escopo

Adivinhar CPF ou telefone por formato. O padrao colide com id, timestamp e numero de linha, e o
corte do `params:` ja tira a fonte deles.
