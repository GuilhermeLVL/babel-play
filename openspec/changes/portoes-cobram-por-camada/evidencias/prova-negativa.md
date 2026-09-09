# Prova negativa dos tres portoes — 2026-09-09

Rota criada em `server/dominios/prova/rotas/prova.ts` (o layout da Fase 3) com as tres violacoes:
`process.env` na rota, `console.log` e `db.select()` direto. Saida dos portoes:

```
=== ast-grep (env-fora-de-config e rota-fala-com-o-banco) na arvore por dominio
  warning[env-fora-de-config]: `process.env` lido dentro de uma rota. Configuração espalhada pelos handlers torna o deploy irreprodutível e esconde de qualquer inventário quais variáveis o servidor realmente exige.
  warning[rota-fala-com-o-banco]: Rota chamando o Drizzle direto. `server/db/repositories/` existe para concentrar a aplicação do `userId`; contornar esse ponto é a classe de falha que F3-06 mediu (vazamento entre contas). Se a chamada é legítima (health probe, por exemplo), ela precisa de motivo escrito.
=== eslint (no-console) na arvore por dominio
    8:3  error  Unexpected console statement  no-console
  ✖ 1 problem (1 error, 0 warnings)
=== limpeza: `server/dominios/` apagado; as 3 linhas de `git status server` sao arquivos
=== de outra change em andamento (strict), nao da prova
```

Os tres portoes acusam na arvore que ainda nao existe. Antes desta change, os dois de ast-grep
usavam `server/routes/*.ts` — um nivel so — e teriam devolvido ZERO achados sobre este mesmo
arquivo, com a cara de codigo limpo.
