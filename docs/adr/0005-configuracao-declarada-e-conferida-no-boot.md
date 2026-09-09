# ADR 0005 — Manter a configuração declarada e conferida no boot, sem centralizar as 60 leituras

- **Data:** 2026-09-09
- **Estado:** aceito
- **Change OpenSpec:** `adr-configuracao`

## Contexto

O plano desta rodada previa transformar `server/lib/config.ts` num schema Zod avaliado uma vez no
boot, com os 40+ `process.env` diretos passando a importar dele. Medindo antes de executar:

| medida | valor |
|---|---|
| arquivos do servidor que leem `process.env` | 18 |
| leituras diretas (`process.env.NOME`) | 60 |
| leituras **dinâmicas** (`process.env[variavel]`) | 2 — `storageQuota.ts` e `usageQuota.ts` |
| variáveis declaradas em `config.ts` (`VARIAVEIS`) | 57 |
| variáveis lidas e **não** declaradas | 0 |

O inventário está completo, é conferido no boot (`conferirConfiguracao`), a falta de uma variável
crítica registra falha e faz `/api/health` responder `degraded` em vez de o servidor subir mudo, e
`tests/integration/config-inventario.test.ts` cobra que uma leitura nova apareça na declaração. A
regra ast-grep `env-fora-de-config` impede leitura dentro de handler de rota.

E o próprio arquivo já explica, em `server/lib/config.ts:14-22`, por que **não** centraliza as
leituras: a maioria é `const` de módulo, resolvida uma vez no carregamento, que é o padrão certo.

## Decisão

**O desenho atual fica. Não haverá objeto de configuração tipado por Zod substituindo as 60
leituras.** O que muda é o que estava genuinamente fora do contrato:

1. As **duas leituras dinâmicas** (`process.env[`${plano}_STORAGE_MB`]` e a equivalente de
   `usageQuota`) passam a declarar explicitamente cada nome que podem produzir. Elas são invisíveis
   ao `grep`, ao inventário e à regra ast-grep — a única classe de leitura que o desenho atual
   realmente não alcança.
2. A regra `env-fora-de-config` passa a cobrir também `process.env[$X]`, para a próxima leitura
   dinâmica não nascer invisível.
3. O cliente ganha um inventário próprio: `import.meta.env.VITE_*` não é coberto por nada hoje, e
   `VITE_SELF_HOST_MODELS` e `VITE_OLLAMA_URL` não estão declarados em lugar nenhum.

## Alternativas consideradas

**O schema Zod completo, como o plano previa.** Reescreveria 60 pontos de leitura para resolver um
problema que a medição não encontrou: nenhuma variável lida está fora do inventário, e nenhuma
declarada deixou de ser lida. O ganho seria coerção e tipo — reais, mas menores que o risco de
tocar em 18 arquivos de infraestrutura, incluindo os que decidem se o servidor sobe. Uma
refatoração cujo defeito correspondente não existe é churn.

**Centralizar só as leituras de `server/lib/diretorios.ts` (11) e `server/ai/provedores.ts` (9).**
São as duas maiores concentrações, e as duas já são `const` de módulo com fallback documentado. O
mesmo argumento se aplica.

## Consequências

Melhora: a classe de leitura que escapava do inventário deixa de escapar, e o cliente passa a ter
inventário. O custo de manutenção não sobe.

Piora: continua não havendo coerção nem tipo — `process.env.PORT` é `string | undefined` e cada
leitor faz o seu `Number(...)`. Um dia isso morde; o registro fica aqui para quando morder.

Fica registrado como **dívida deliberada**: se um bug de configuração aparecer por falta de
coerção, este ADR é substituído em vez de discutido do zero.

## Como isto é cobrado

`tests/integration/config-inventario.test.ts` (já existe) cobra que toda leitura esteja declarada.
A regra `env-fora-de-config` ganha o padrão dinâmico. O inventário do cliente ganha o seu teste.
