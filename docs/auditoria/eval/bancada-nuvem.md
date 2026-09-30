# Bancada de provedores de nuvem (B5)

Mede DeepInfra, Cerebras e Cloudflare Workers AI contra o que está em produção hoje (Groq). Tudo roda **antes** de qualquer troca de modelo: o B7 só troca os padrões com a decisão que sai daqui.

A metodologia é a de [`bancada-2026-09.md`](bancada-2026-09.md):

- diferença **pareada** caso a caso;
- IC 95% por bootstrap com semente fixa;
- COMET `wmt22-comet-da`;
- o gold de conversa não pode piorar.

## O que é igual à produção

O pedido de cada candidato é montado por [`nuvem.mjs`](../../../scripts/eval-fala/bancada/nuvem.mjs) com as **mesmas funções** do servidor, importadas e não copiadas.

- **Tradução:**
  - o prompt comunicativo (`promptComunicativo.ts`);
  - `max_tokens` proporcional (`maxTokensDaTraducao`);
  - raciocínio e retenção por `parametrosDoProvedor` (extraído para `server/ai/parametrosDoProvedor.ts`);
  - a temperatura da fala (0,2) e o timeout de 12 s, que são literais em `mtProxy.ts`. Um teste de deriva lê o fonte de lá.
- **STT:**
  - o formulário do `sttProxy.ts`: `verbose_json`, idioma e temperatura 0;
  - a triagem `triarSegmentos` e o `filtrarAlucinacao`;
  - o mesmo VAD do navegador (800 ms). O mínimo faturado entra **por trecho**, como na produção.
- **Ajuste de candidato** (sufixo `@esforço`, por exemplo `Qwen/Qwen3.5-9B@none` sem pensamento): a produção ainda não manda esse parâmetro. O bruto marca `foraDaProducao`, e a decisão avisa que o B7 precisa levá-lo para `parametrosDoProvedor` antes da troca.

Mudou em relação à bancada de 24/09: antes ela mandava temperatura 0 e o raciocínio padrão do provedor. Os brutos antigos **não** pareiam com os novos, e o nome do cache agora leva o perfil do pedido.

## Candidatos

Preços consultados em 29/09/2026. Fonte e retenção de cada um estão no registro de `nuvem.mjs`.

| Provedor   | Modelo (id exato)                   | US$/1M entrada · saída | Retenção declarada                            |
| ---------- | ----------------------------------- | ---------------------- | --------------------------------------------- |
| Groq       | `openai/gpt-oss-120b` (produção)    | 0,15 · 0,60            | sem retenção por padrão; ZDR em Data Controls |
| Groq       | `openai/gpt-oss-20b`                | 0,075 · 0,30           | idem                                          |
| DeepInfra  | `openai/gpt-oss-20b`                | 0,03 · 0,14            | "Zero retention" na página do modelo          |
| DeepInfra  | `openai/gpt-oss-120b`               | 0,037 · 0,17           | idem                                          |
| DeepInfra  | `Qwen/Qwen3.5-9B` (`@none`)         | 0,10 · 0,15            | idem                                          |
| DeepInfra  | `google/gemma-4-26B-A4B-it`         | 0,07 · 0,34            | idem                                          |
| Cerebras   | `gpt-oss-120b` (só ele no catálogo) | 0,35 · 0,75            | não retém prompts nem respostas               |
| Cloudflare | `@cf/openai/gpt-oss-20b`            | 0,20 · 0,30            | conteúdo não armazenado nem usado para treino |
| Cloudflare | `@cf/openai/gpt-oss-120b`           | 0,35 · 0,75            | idem                                          |
| Cloudflare | `@cf/google/gemma-4-26b-a4b-it`     | 0,10 · 0,30            | idem                                          |

O Qwen3.5-9B não existe no Cloudflare nem na Cerebras. A Cerebras não tem gpt-oss-20b nem Gemma 4.

| STT (Whisper large-v3-turbo)                   | US$/hora | Mínimo faturado por pedido  |
| ---------------------------------------------- | -------- | --------------------------- |
| Groq `whisper-large-v3-turbo`                  | 0,04     | **10 s**                    |
| DeepInfra `openai/whisper-large-v3-turbo`      | 0,012    | não publicado (por segundo) |
| Cloudflare `@cf/openai/whisper-large-v3-turbo` | 0,03     | não publicado (por segundo) |

A Cerebras não tem STT. O Cloudflare usa formato próprio: JSON com o áudio em base64 na rota `ai/run/<modelo>`, sem temperatura na API.

**Nunca a API do Gemini** (o app atende menores): `nuvem.mjs` recusa qualquer modelo `gemini`. O OpenRouter vai sempre com `zdr` e `ignore` do Google. Esse `ignore` ainda não está na produção; é item do B1.

## Como rodar

**Localmente, em ensaio.** Sem chave, cada provedor é pulado com aviso e nada é gasto:

```
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/sondar-contratos.mjs
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/mt.mjs --sistemas groq:openai/gpt-oss-120b,deepinfra:openai/gpt-oss-20b --corpora gold:en-pt --limite 3
```

As chaves vêm do ambiente ou do `.env.local`, e o valor nunca é impresso. O teto local é `BANCADA_TETO_USD`, com padrão US$ 5, sobre o `gasto.json` acumulado.

**No GitHub.** Actions → _Bancada de nuvem (B5)_ → _Run workflow_. Com `limite` = 3 o ensaio sai por centavos; com 0 roda a execução completa. Pela tabela, a completa custa cerca de **US$ 1**: MT ~0,80 e STT ~0,21.

**Segredos que o dono precisa criar** (Settings → Secrets and variables → Actions → _Repository secrets_):

| Segredo                 | Para quê                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`          | Linha de base. A camada gratuita (200 mil tokens/dia por modelo) **não cobre** a execução completa: use a Developer          |
| `DEEPINFRA_API_KEY`     | DeepInfra                                                                                                                    |
| `CEREBRAS_API_KEY`      | Cerebras                                                                                                                     |
| `CLOUDFLARE_ACCOUNT_ID` | Id da conta (32 hex)                                                                                                         |
| `CLOUDFLARE_AI_TOKEN`   | Token **só** com a permissão Workers AI, separado de qualquer token de deploy. Chega aos scripts como `CLOUDFLARE_API_TOKEN` |
| `OPENROUTER_API_KEY`    | Opcional (só a sonda)                                                                                                        |

## O teto de US$ 3

O workflow fixa `BANCADA_TETO_USD=3` e começa sem `gasto.json`. [`livroCaixa.mjs`](../../../scripts/eval-fala/bancada/livroCaixa.mjs) funciona assim:

1. **Antes de cada tentativa**, reserva o pior caso da chamada:
   - saída igual ao `max_tokens` inteiro;
   - entrada de até 1 token por caractere, mais 256 de cabeçalho;
   - no STT, o custo exato com o mínimo faturado.
2. **Recusa a reserva** que faria gasto + reservas em voo + ela passarem do teto. A chamada não sai.
3. **Acerta pelo custo real** do `usage` quando a resposta chega. O 4xx/5xx cancela (não é cobrado), e a rede caída cobra o reservado.

Modelo sem preço na tabela não é chamado. Se o custo real passar da reserva, o que só acontece com a tabela errada, o gasto fica registrado e a bancada para ali.

Quando o teto ou a cota diária de um provedor param a fila, os casos que já responderam ficam no bruto. A cota tira só aquele sistema; o teto para tudo (`paradoPeloTeto`).

## Como ler a saída

O resumo do job e o artefato `bancada-nuvem` trazem, nesta ordem:

1. **Sonda de contrato** (`sonda-contratos.md`): um pedido mínimo por provedor × modelo.
   - **violação**: modelo fora do catálogo, chave recusada, outro 4xx para o pedido da produção, `usage` ausente, `segments` sem os números da triagem ou pensamento vazando. Violação para o workflow antes da bancada; a entrada `seguir_apesar_da_sonda` libera.
   - **aviso**: 429 ou 5xx.
   - Também mostra os cabeçalhos de limite e a retenção.
2. **Gasto desta execução**, contra o teto.
3. **Decisão** (`decisao-bancada.md`, de [`decisao.mjs`](../../../scripts/eval-fala/bancada/decisao.mjs)): um veredito por função × candidato × base.
   - Por corpus, o IC pareado do Δ orientado (positivo = melhor) classifica em quatro casos: **superior** (acima de 0), **não-inferior** (acima de −margem), **inferior** ou **inconclusivo**.
   - O veredito é o **pior** corpus.
   - **REPROVADO** quando o gold de conversa piora (o IC exclui 0 para baixo, mesmo dentro da margem) ou quando o custo por hora passa do teto.
   - Custo desconhecido não aprova, e MT sem gold é inconclusivo.
   - Margens padrão: COMET 0,01; chrF++ 1; WER 0,5 pt; alucinação 2 pts.
   - Tetos: MT US$ 0,05/h de fala; STT US$ 0,05/h de áudio.
   - Margens e tetos são ajustáveis por `--margem-*` e `--teto-*`, e saem impressos.
   - Avisos: ajuste fora da produção e casos acima dos 12 s de timeout da produção.
4. **Resumo pareado** (`resumo-bancada.md`): cada sistema, IC, latência, US$/h e Δ contra cada base.

Os brutos caso a caso ficam em `brutos/`. **Aprovado** quer dizer que a regra permite a troca; quem troca é o dono, no B7.

## Limites conhecidos

- **Cloudflare + gpt-oss:** o `reasoning_effort` que a produção mandaria não está documentado no chat OpenAI-compatible do Workers AI. A sonda diz se ele é aceito.
- **Qwen3.5 `@none`:** na DeepInfra usa `chat_template_kwargs.enable_thinking=false`; na Cerebras, `reasoning_effort: none`. A sonda acusa pensamento vazando.
- **Temperatura 0,2:** reproduz a produção, mas duas execuções não dão o mesmo texto. O IC pareado absorve essa variação; não compare execuções diferentes caso a caso.
- **Latência:** com ritmo e concorrência 4, a latência medida é a da chamada. A latência do usuário continua em `latencia.mjs`.
