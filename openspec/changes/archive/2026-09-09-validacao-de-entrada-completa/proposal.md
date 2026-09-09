## Why

O gateway de IA repassava `{ ...req.body }` inteiro ao provedor, quatro handlers liam `req.params`
cru, os cabecalhos do STT entravam sem formato, a recusa de SSRF respondia HTTP 200 e dois erros
ecoavam o corpo do provedor externo ao cliente.

## What Changes

- `llmChatCompletionsSchema`, `providerTestSchema` e `sttHeadersSchema` em `server/validation.ts`;
  `z.strictObject`, entao campo desconhecido e 400.
- `idParamSchema` nos quatro `req.params` crus (sessions `:uid`, vocab, duas rotas de admin).
- Recusa de SSRF vira 400 com `code: 'destino_bloqueado'`, sem o IP resolvido no corpo.
- O texto do upstream sai da resposta e vai para o log; o cliente recebe
  `code: 'provedor_indisponivel'` e o `requestId`.
- Envelope de erro unico nas duas rotas de metrics que fugiam do padrao.

## Nao-escopo

Reescrever o formato de erro do produto. Seis snapshots de contrato foram atualizados, um por
correcao, e nenhum outro mudou.
