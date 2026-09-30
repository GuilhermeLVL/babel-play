# Feature flags e configuração remota

Fase 6b. Liga, desliga e configura partes do produto **sem deploy**. As Fases 7 (modo convidado) e
8 (banners, pop-ups e paywall de planos) são construídas em cima disto.

| Peça                                               | Onde                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Avaliação (pura, cliente e servidor)               | `src/core/flags.ts`                                                              |
| Forma do payload de ofertas                        | `src/core/ofertas.ts` (tipos + padrão), `server/lib/ofertas.ts` (zod)            |
| Tabela + semente                                   | `server/db/migrations/0031_flags_remotas.sql`, `server/db/repositories/flags.ts` |
| Cache, validação, travas, `flagLigada(req, chave)` | `server/lib/flags.ts`                                                            |
| Rota pública                                       | `GET /api/flags` — `server/routes/flags.ts`                                      |
| Admin                                              | `GET /api/admin/flags`, `PUT /api/admin/flags/:chave` — `server/routes/admin.ts` |
| CLI de operação                                    | `node dist-server/operacao.cjs flags …` — `server/operacao/flags.ts`             |
| Cliente                                            | `src/lib/flags.ts` (`useFlag`, `useConfigRemota`, `flagLigada`, `configRemota`)  |

## O que é uma flag (e o que ela NUNCA é)

Uma flag é um **interruptor de produto**: mostrar, esconder, experimentar, configurar texto. O
resultado vai para o navegador, e o navegador pode mentir.

- **Nunca use flag para segurança.** Quem pode acessar dado de quem é RBAC (`server/lib/rbac.ts`)
  e o escopo por `UserId` dos repositórios.
- **Nunca use flag para cota ou direito de plano.** Quem pode gastar nuvem é
  `server/lib/entitlements.ts` e `server/lib/usageQuota.ts`, no servidor. Uma flag pode _mostrar_ a
  oferta do Pro; quem _concede_ o Pro é a assinatura.
- **Portas de emergência vencem flags.** `CHECKOUT_ENABLED=0` desliga `vender_planos` para todo
  mundo, qualquer que seja a regra no banco (a trava está em `server/lib/flags.ts`, que consulta
  `estadoDaAbertura()` em vez de copiar a lógica de `abertura.ts`). A porta é do plantão (variável
  de ambiente, sem banco no caminho); a flag é do produto (quem vê a venda, onde, para quantos).

## Regras

Uma flag tem `habilitada` (o interruptor mestre) e `regras` (todas opcionais; ausente = sem
restrição). As restrições se combinam com **E**.

| Regra          | Exemplo                                | Semântica                                                                                                                                                      |
| -------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `habilitada`   | `false`                                | Desligada para todos, sem exceção.                                                                                                                             |
| `ids`          | `["<userId>", "<uuid da instalação>"]` | Alvo individual: quem está na lista recebe a flag ligada **independentemente das outras regras**. Para liberar _só_ para a lista, combine com `percentual: 0`. |
| `planos`       | `["convidado", "free"]`                | Plano do contexto na lista. Valores: `convidado` (sem conta), `free`, `essencial`, `pro`, `selfhost`.                                                          |
| `idiomas`      | `["pt", "es"]`                         | Idioma da interface. `pt` casa `pt-BR` e vice-versa; `pt-BR` não casa `pt-PT`. Idioma desconhecido não passa.                                                  |
| `versaoMinima` | `"0.2.0"`                              | Versão do app (semver; o `+sha` é ignorado) maior ou igual. Versão desconhecida não passa.                                                                     |
| `percentual`   | `10`                                   | 0–100 das pessoas, por balde estável (abaixo). Sem id estável, só `100` passa.                                                                                 |

### Percentual estável

`balde = FNV-1a(chave + ":" + id) % 100`; a flag liga quando `balde < percentual`.

- **Determinístico.** O mesmo id cai sempre no mesmo balde. A flag não pisca entre requisições nem
  entre recarregamentos.
- **Independente entre flags.** A chave entra no hash, então os primeiros 10% de um experimento
  não são os primeiros 10% de todos os outros.
- **Monotônico.** Subir de 10% para 30% só _acrescenta_ gente; ninguém que já via deixa de ver.
- **Qual id.** O da conta quando há token válido (estável entre aparelhos); senão, o UUID da
  instalação (`x-babel-instalacao`, gerado e guardado no `localStorage` pelo cliente). Quem entra
  na conta pode mudar de balde uma vez (troca do id da instalação pelo da conta). Para um
  experimento em que isso importa, restrinja por `planos`.

## Como o cliente recebe

`GET /api/flags` é **pública** (antes do auth, como `/api/abertura`): o anônimo e o convidado
também precisam dela. Cabeçalhos de contexto que o cliente manda:

| Cabeçalho            | Conteúdo                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| `Authorization`      | Opcional. Válido → plano da assinatura. Ausente ou inválido → `convidado` (sem 401). |
| `x-babel-instalacao` | UUID aleatório da instalação. Malformado é ignorado.                                 |
| `x-babel-idioma`     | Idioma da interface.                                                                 |
| `x-babel-versao`     | Versão do bundle. Ausente → a do servidor.                                           |

A resposta é `{ "flags": { "<chave>": { "ligada": true, "payload": … } } }`. Só sai o resultado:
**nunca** regras, listas de ids, percentual ou descrição. O `payload` só vai com a flag ligada.
`Cache-Control: private, max-age=30`, `ETag` (revalidação responde 304) e `Vary` nos cabeçalhos
acima. No modo público, a rota tem balde próprio de 60 leituras por minuto por IP.

No **modo sem conta**, o `apiFetch` desvia tudo para o servidor em memória, **menos** `/api/flags`
(`PASSAM_DIRETO` em `src/data/efemero/nucleo.ts`).

### No código do cliente

```tsx
import { useFlag, useConfigRemota, ehConfigDeOfertas } from '../lib/flags';
import { OFERTAS_PADRAO } from '../core/ofertas';

const convidado = useFlag('modo_convidado'); // boolean
const ofertas = useConfigRemota('oferta_planos', OFERTAS_PADRAO, ehConfigDeOfertas);
```

- **Fallback seguro.** Flag ausente = desligada. Payload ausente, desligado ou fora da forma = o
  padrão embutido que você passa (ele deve ser uma constante de módulo).
- **Offline e primeiro paint.** O último valor conhecido fica em `localStorage['babel.flags']` e é
  lido de forma síncrona. Falha de rede, 503 ou resposta estranha não mudam nada.
- **Atualização.** Na primeira vez que um hook monta; ao focar a aba (no máximo a cada 30 s); a cada
  5 min; quando a identidade ou o idioma mudam.

### No código do servidor

```ts
import { flagLigada } from '../lib/flags';

if (!(await flagLigada(req, 'modo_convidado'))) {
  responderErro(res, 404, 'rota inexistente', 'rota_inexistente');
  return;
}
```

Flag inexistente ou falha ao ler o banco = desligada (o lado seguro de um interruptor de produto é
"como antes da feature"). O cache do processo dura **30 s** e é invalidado em toda escrita pela
rota admin. A topologia é processo único (ADR 0006); a CLI escreve de outro processo, então a
mudança feita por ela aparece em até 30 s.

## Criar e mudar uma flag

**Pela API** (admin; `support` só lê):

```http
PUT /api/admin/flags/nova_tela
{ "descricao": "Tela nova de revisão", "habilitada": true, "regras": { "percentual": 10 } }
```

O corpo faz _merge_ com a flag atual: mande só o que muda. `"payload": null` apaga o payload.
Chave: minúsculas, dígitos e `_`, começando por letra. Flag nova exige `descricao`. Regra ou
payload inválidos respondem 400 com `detalhes` (a lista do que está errado). Toda escrita grava
`atualizado_por` (o id do admin) e emite o evento `flag_alterada`/`flag_criada` no log.

**Pela CLI de operação** (na máquina de produção):

```sh
node dist-server/operacao.cjs flags listar
node dist-server/operacao.cjs flags ligar modo_convidado
node dist-server/operacao.cjs flags desligar modo_convidado
node dist-server/operacao.cjs flags definir oferta_planos '{"habilitada":true,"regras":{"planos":["free"],"percentual":20}}'
```

Não há tela admin no cliente (não existia nenhuma); a API e a CLI são as duas portas.

**Flag que existe desde o deploy** entra pela semente de uma migração (`INSERT OR IGNORE`), como a
0031, para nunca sobrescrever o que o operador já mudou.

## Payloads com forma conhecida

Chave com schema registrado em `SCHEMAS_DE_PAYLOAD` (`server/lib/flags.ts`) tem o payload
validado na escrita. Na leitura, payload fora da forma é descartado com um `warn`, e o cliente cai
no padrão. Chave sem schema aceita qualquer JSON de até 32 KB.

### `oferta_planos` (Fase 8)

```json
{
  "gatilhos": [
    {
      "id": "cota_acabou",
      "momento": "fim_de_cota",
      "componente": "modal",
      "titulo": { "pt": "Sua cota do mês acabou", "en": "You have used this month's quota" },
      "texto": "Com um plano pago você continua usando a nuvem.",
      "cta": { "pt": "Ver planos", "en": "See plans" },
      "maxPorDia": 1,
      "maxPorSemana": 3,
      "intervaloMinHoras": 12,
      "planos": ["free", "essencial"]
    }
  ]
}
```

- `momento`: `fim_de_cota`, `modelo_premium`, `conquista`, `fim_de_sessao`, `convidado_para_conta`, `cota_proxima`.
- `componente`: `banner`, `modal`, `aviso_cota`, `comparacao`.
- `titulo`, `texto`, `cta`: **texto** é uma chave do i18n (o português é a chave, como no resto do
  app); **objeto** é o texto literal por idioma, para mudar sem deploy o que ainda não está no
  catálogo. `resolverTextoRemoto` (`src/core/ofertas.ts`) escolhe: idioma exato, depois o idioma
  base, depois `pt`, depois o primeiro.
- `maxPorDia` ≤ `maxPorSemana`; `intervaloMinHoras` entre exibições do mesmo gatilho. São tetos
  de educação contados no aparelho, não cota.
- `variante` (opcional, `[a-z0-9_-]{1,24}`): rótulo de experimento A/B que vai para as métricas.
- Quem lê o payload, as regras de frequência, os momentos e as métricas de conversão:
  [`docs/ofertas.md`](ofertas.md).
- Até 50 gatilhos, ids únicos.

## Flags semeadas (migração 0031)

| Chave             | Estado inicial                     | Para quê                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modo_convidado`  | desligada                          | Fase 7: o menu da conta diz "convidado" e os tetos disparam `babel:oferta`. Ver `openspec/audits/2026-09-25-prontidao/fase7-convidado.md`.                                                                                          |
| `nuvem_convidado` | desligada, `planos: ["convidado"]` | Fase 7: IA de nuvem para convidado (usuário anônimo do Supabase, criado no primeiro uso). As cotas e o antiabuso ficam no servidor (`server/lib/convidado.ts`). Com ela desligada, a nuvem do convidado responde 403 `exige_conta`. |
| `oferta_planos`   | desligada, com 4 gatilhos          | Fase 8: banners, modais e paywall. **Ligada pela 0039** (abaixo).                                                                                                                                                                   |
| `vender_planos`   | **ligada**                         | Mostrar a venda. Espelha o comportamento atual; `CHECKOUT_ENABLED=0` a força para desligada.                                                                                                                                        |

## Flags semeadas depois

| Chave                   | Migração | Estado inicial                | Para quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oferta_planos`         | 0039     | **ligada**, com 6 gatilhos    | Ofertas de planos ligadas por padrão (decisão do dono, 29/09). A 0039 liga a flag e completa o payload com `fim_de_sessao` e `conquista` (banners, só para o Grátis) além dos quatro gatilhos da 0031 — antes esses dois momentos caíam em `sem_gatilho`. Só altera a linha da semente (`atualizado_por = 'semente'`): se o operador já mexeu, a escolha dele vale. Banco novo e banco antigo terminam iguais. `modo_convidado` e `nuvem_convidado` seguem desligadas. As regras antichateação do motor valem sempre (`docs/ofertas.md`).                                                                                                                                                      |
| `nuvem_gratuita_alivio` | 0040     | desligada, `planos: ["free"]` | A10 do plano "Grátis sem travar": 3 h/mês de nuvem para aparelho fraco na conta Grátis. A flag só liga o produto; o limite é do servidor e é por CONTA (`FRANQUIA_DE_ALIVIO` em `src/core/planos.ts`: 10.800 s e teto de US$ 0,13), com pool do dia de no máximo 20% do orçamento diário e reserva de 80% para quem paga (`server/lib/nuvemDeAlivio.ts`). Perfil protegido só com o responsável. Antes de ligar: `AI_BUDGET_USD_DAY` definido (é dele que sai o pool) e a retenção zero da Groq ligada no console. Desligada, a conta Grátis que pedir o alívio recebe 503 `alivio_desligado` e segue no aparelho. Número de migração provisório (Fase C).                                     |
| `voz_natural`           | 0046     | desligada, `planos: ["premium","selfhost"]` | E4 da Fase E (modo intérprete): a voz natural da nuvem lê a tradução em voz alta (`POST /api/ai/tts`, `server/ai/ttsProxy.ts`). A flag só liga o produto; quem pode é o entitlement `vozNatural` e o limite são as cotas de caracteres por mês e por dia (`vozCaracteresMes`/`vozCaracteresDia`), a admissão `tts` e o orçamento. **Antes de ligar:** a chave do provedor (`DEEPINFRA_API_KEY` numa perna `tts` do `IA_PROVEDORES`), a sonda de contrato do Chatterbox e a retenção confirmada no contrato e registrada em `docs/lgpd/operadores.md` e `ropa.csv` (T13). Desligada: 503 `voz_natural_desligada` e a voz do aparelho lê. Número provisório (0044/0045 reservadas). |
| `recompensas_v2`        | 0036     | desligada                     | Recompensas v2 (`docs/economia-v2.md`): **só as TELAS novas** (Personalizar, maestria, temporada, resumo da prática). Desde a revisão de 27/09 as regras de economia do servidor — baú por desempenho, reembolso do corte do catálogo (`POST /api/metrics/seeds/reembolso`, pedido pelo cliente uma vez por sessão depois que as métricas carregam, com a flag ligada ou não), fuso gravado, sessão só com palavra salva, rodada gravada uma vez — valem SEMPRE: são correções legais e de integridade, não um experimento. O aviso do reembolso é por conta (`avisoPendente`). Na edição estática não há flag remota: liga com `VITE_RECOMPENSAS_V2=1` no build (`src/lib/recompensasV2.ts`). |

## Boas práticas

- **Toda flag nasce com data para morrer.** Escreva na `descricao` quando ela deve sair. Flag de
  lançamento que chegou a 100% vira código sem `if` no deploy seguinte, e a linha sai da tabela.
  Uma flag esquecida é um `if` que ninguém mais sabe testar dos dois lados.
- **Remover:** (1) tire o uso do código e publique; (2) depois, apague a linha
  (`DELETE FROM flags WHERE chave = '…'`, ou numa migração). O cliente trata a ausência como
  desligada, então a ordem inversa desligaria a feature para quem ainda roda o bundle antigo.
- **Nomeie pelo que a pessoa vê**, não pela sprint: `modo_convidado`, não `fase7_v2`.
- **Uma flag, uma decisão.** Não combine duas features numa chave só para economizar linha.
- **Ids na lista são dado pessoal pseudonimizado.** Use para testar com contas internas, não como
  cadastro de clientes; limpe a lista quando o teste acabar.
- **Payload é público.** Tudo o que estiver nele chega a qualquer navegador para quem a flag está
  ligada. Nunca coloque segredo, preço que o servidor não confere, nem regra de negócio.

## Reversão

A migração é aditiva. `DROP TABLE flags` remove tudo: `/api/flags` passa a responder 503 e o
cliente segue com o último valor conhecido (ou, sem ele, tudo desligado e os padrões embutidos).
Hoje nenhuma tela lê as flags semeadas; quando a Fase 8 passar a ler `vender_planos`, um `DROP`
esconderia a venda — reverta junto o código que a lê.
