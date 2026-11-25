## Why

O app já funciona em parte sem internet (transcrição e tradução no aparelho com modelo baixado, jogos com o que já está
no aparelho, leitor), mas ninguém diz isso à pessoa. Quando a rede cai, ela não sabe se vale tentar ou esperar, e a IA na
nuvem simplesmente falha. A pesquisa do core (X6) pede um "modo offline declarado": dizer, com honestidade, o que
funciona e o que não funciona sem rede.

## What Changes

- Uma regra pura em `src/core/modoOffline.ts`: dado o estado (online, modelo de fala baixado, modelo de tradução baixado,
  motor local disponível), devolve a lista do que funciona e do que não funciona, com o motivo.
- Uma faixa discreta (`AvisoSemRede`), só enquanto `navigator.onLine` é falso, reaproveitando a `FaixaDeAvisoDoQuest`.
  Resume o que funciona e o que espera a rede. Pode ser dispensada na sessão.
- A lista completa aparece também na seção "Uso sem internet" do Diagnóstico (já existente). Nenhum menu novo.

## Impact

- Sem mudança de cota, plano, servidor ou provedor. Só leitura do estado que o app já tem (`navigator.onLine`,
  manifesto dos modelos baixados, `recursosDoAparelho`).
- Textos novos de UI passam pelo `t()` e entram nos catálogos de i18n.
