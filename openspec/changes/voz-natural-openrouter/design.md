## Context

O intérprete lê a tradução em voz alta. No Grátis, com a voz do aparelho (`speechSynthesis` ou Kitten no aparelho); nos
pagos, com a voz natural da nuvem (`POST /api/ai/tts` → `server/ai/nucleo/sintetizarVoz.ts`). O núcleo já tem tudo o
que uma função de IA paga precisa: entitlement, flag `voz_natural` (desligada), registro de provedores (`tts`), cache L1
em memória, portão do orçamento, admissão, cota de caracteres no mês e no dia (`vozCaracteresMes`/`vozCaracteresDia`,
`<PLANO>_MONTHLY_TTS_CHARS`/`<PLANO>_DAILY_TTS_CHARS`), cascata e custo por caractere. O cliente
(`src/lib/voz/vozDaNuvem.ts`) já cai na voz do aparelho, na mesma fala, a qualquer recusa, e ainda guarda no aparelho o
áudio que a nuvem já sintetizou.

O que faltava: um provedor que o dono já paga. O padrão era o Chatterbox na DeepInfra (chave que não existe).

Fatos conferidos em 17/11/2026 nas páginas públicas (sem chave):

- `POST https://openrouter.ai/api/v1/audio/speech`, compatível com a OpenAI: `{ model, input, voice, response_format }`.
  O `provider` aceita só `zdr`, `data_collection` e `options`; `order`, `only` e `ignore` NÃO valem para a voz
  (docs "Text-to-Speech"). `input_references` é clonagem de voz.
- `GET /api/v1/endpoints/zdr`: `hexgrad/kokoro-82m` com retenção zero na DeepInfra (US$ 0,62/1M caracteres) e na
  Together (US$ 4/1M); `microsoft/mai-voice-2.1-flash` só na Azure (US$ 15/1M).
- `GET /api/v1/models?output_modalities=speech`, `supported_voices`: Kokoro `pf_dora`/`pm_alex` (pt-BR),
  `af_heart`/`am_michael` (en-US), `ef_dora`/`em_alex` (es)…; MAI `pt-BR-Luana:MAI-Voice-2.1-Flash`, `pt-BR-Pedro…`,
  `pt-PT-Rui…`, `es-ES-Marta…`, 28 regiões. Nos dois a voz decide o idioma.

## Goals / Non-Goals

**Goals:**

- Voz natural paga pelo OpenRouter, com a chave do app, sem gastar nada até o dono ligar a flag.
- Retenção zero obrigatória, recusada por construção.
- Só plano pago com `vozNatural`; Grátis, convidado e teste nunca.
- O modelo mais barato por padrão; o caro só onde a conta fecha.
- Tetos de caracteres coerentes com o custo no pior caso.

**Non-Goals:**

- Mudar oferta, preço, regras de compra ou de menores.
- Ligar a flag, mexer em `IA_PROVEDORES` de produção ou chamar a API real.
- Medir qualidade da voz (fica para o dono ouvir, com a flag ligada no staging).
- Nova tela ou texto de interface: a queda para a voz do aparelho já existe e é silenciosa por desenho.

## Decisions

1. **Mesmo núcleo, nova perna.** O OpenRouter entra como perna `tts` do registro (formato `openai`), não como rota
   nova. Ganha de graça cache, portão, admissão, cota, cascata, disjuntor e custo. Alternativa descartada: cliente
   próprio do OpenRouter para a voz, que duplicaria tudo isso.

2. **Retenção zero em três travas.** (a) Todo corpo para uma base do OpenRouter leva
   `provider: { zdr: true, data_collection: "deny" }`, e `montarPedidoDeVoz` lança se não levar; (b) só modelos de
   `VOZES_COM_RETENCAO_ZERO_NO_OPENROUTER` (Kokoro e MAI, conferidos no `/endpoints/zdr`) viram perna e saem do
   pedido; (c) o registro recusa voz do OpenRouter fora da lista (e pega o `:free`). Como a voz não aceita `ignore`,
   a lista é a única forma de garantir que o Google nunca atenda.

3. **Voz por idioma.** O catálogo ganha `vozesPorIdioma` (chave BCP-47 ou base) e `sufixoDaVoz` (MAI). A voz pedida
   só vale se é do idioma da fala; senão, a primeira do idioma. Região que o modelo não tem cai na primeira da língua
   (`cmn-CN` → `zh-CN`). Sem `speed`: o OpenRouter não garante a velocidade fora da OpenAI.

4. **Só planos pagos.** `vozDaNuvemLiberada({ plan, vozNatural, emTeste })` em `src/core/vozNatural.ts`, usada pelo
   servidor (402 `exige_voz_natural`) e pela tela (`temVozDaNuvem`, para nem pedir). Self-host passa: a chave é do
   dono da instância e o custo não é nosso (suposição declarada: "pago" quer dizer "não custa ao Frasy"). O teste
   perde a franquia de voz (`FRANQUIA_DO_TESTE.vozCaracteresMes = 0`).

5. **O nível decide o modelo.** O catálogo marca o MAI com `nivel: 'boa'`; `pernasDoNivelDeVoz` tira as pernas `boa`
   de quem tem `nivelDeVoz: 'basica'`. O registro continua dizendo a ordem.

6. **Preço no pior endpoint.** O orçamento (`openrouter:hexgrad/kokoro-82m`) e o modelo de custo usam US$ 4/1M, o da
   Together: sem `order`, quem atende é o OpenRouter, e errar para mais é a regra do orçamento. O esperado é ~US$ 0,70
   (o roteador prefere o mais barato).

## Custo (npm run ia:custo -- --usuarios 1000 --essencial 50 --premium 30 --testes 100)

|                      | antes (Chatterbox US$ 1/1M) | depois (Kokoro US$ 4/1M) |
| -------------------- | --------------------------- | ------------------------ |
| Premium no pior caso | US$ 52,86                   | US$ 52,86                |
| Testes no pior caso  | US$ 2,72                    | US$ 2,32 (sem voz)       |
| Total no pior caso   | US$ 98,28                   | US$ 97,88                |
| Margem no pior caso  | US$ 69,51                   | US$ 69,91                |
| Margem típica        | US$ 121,25                  | US$ 121,65               |

Margem do anual por conta, cota cheia, pior custo (R$/mês): Plus 2,71 → 0,19; Família 3,94 → 0,58; Pro 2,29 → 1,17.

Misturas (pior caso, US$): 3% (10 Essencial + 20 Premium) 7,27 → 7,67; 15% (80 + 70) 162,03 → 162,43; v4 8%
(60 Plus + 10 Família + 10 Pro) 50,53 → 15,93; v4 15% 124,81 → 59,71; **v4 3% (20 + 5 + 5) −0,44 → −13,04**. A mistura
v4 de 3% já era negativa antes; a voz do Plus no endpoint mais caro a afunda. Ela só volta a ≥ 0 com a voz do Plus
perto de zero, então fica como decisão do dono (ver Riscos).

### Tetos propostos e aplicados (`src/core/planos.ts`)

| plano                   | antes (mês/dia)  | depois (mês/dia)                                    | voz no pior caso |
| ----------------------- | ---------------- | --------------------------------------------------- | ---------------- |
| Plus                    | 150 mil / 15 mil | 150 mil / 15 mil (inalterado: é o número anunciado) | US$ 0,60         |
| Premium (legado)        | 600 mil / 60 mil | 150 mil / 15 mil (o mesmo dinheiro de antes)        | US$ 0,60         |
| Ao Vivo (fora de venda) | 600 mil / 60 mil | 300 mil / 30 mil                                    | US$ 1,20         |
| Família (em breve)      | 600 mil / 60 mil | 300 mil / 30 mil                                    | US$ 1,20         |
| Pro (em breve)          | 600 mil / 60 mil | 200 mil / 20 mil                                    | US$ 0,80         |
| Teste de 3 dias         | 10 mil           | 0 (sem voz da nuvem)                                | 0                |

`<PLANO>_MONTHLY_TTS_CHARS` e `<PLANO>_DAILY_TTS_CHARS` continuam sobrepondo.

### MAI-Voice: desligado por padrão

O único plano vendável de nível `boa` é o Ao Vivo (R$ 39,90). Com a cota inteira no MAI (US$ 15/1M), a margem mensal no
pior caso é **R$ −13,89** (300 mil caracteres; era R$ −39,09 com os 600 mil de antes). A conta só fecha até ~135 mil
caracteres de MAI por mês. Decisão: o MAI fica no catálogo e no registro aceito, mas FORA dos
`ops/ia-provedores*.json`. Para ligar: declarar `microsoft/mai-voice-2.1-flash` (preço 15) antes do Kokoro no
`IA_PROVEDORES` e baixar `AOVIVO_MONTHLY_TTS_CHARS` para ≤ 130 mil, ou aceitar a margem negativa. O `ia:custo` imprime
essa conta (bloco "VOZ BOA").

## Risks / Trade-offs

- [O OpenRouter manda à Together (6,5× mais cara)] → o orçamento já conta US$ 4/1M; o portão do mês fecha antes.
- [Mistura v4 de 3% negativa no pior caso] → já era (−0,44); com a voz fica −13,04. Opções para o dono: (a) aceitar
  (o pior caso supõe a DeepInfra fora o mês inteiro e todo pagante usando 100% de tudo); (b) Plus com ~40 mil
  caracteres (o mesmo dinheiro de antes), mudando o número anunciado; (c) medir o custo real com a flag no staging e
  recalibrar.
- [Kokoro pt-BR soa pior que Chatterbox] → a flag está desligada; o dono ouve no staging antes de ligar.
- [Pessoa no teste não ouve a voz natural] → é a decisão do dono ("apenas em planos pagos"); a voz do aparelho lê.
- [Voz pedida de outro idioma] → cai na do idioma; nunca lê português com voz inglesa.

## Migration Plan

Nada a migrar: a flag `voz_natural` continua desligada e nenhum secret muda. Para ligar no staging: `IA_PROVEDORES` com o
Kokoro (o `ops/ia-provedores.openrouter.json` já tem), registrar o operador na LGPD, ligar `voz_natural` e ouvir.
Rollback: desligar a flag.

## Open Questions

- O dono aceita a mistura v4 de 3% negativa no pior caso, ou prefere baixar a voz do Plus?
- A qualidade do Kokoro em pt-BR basta? Se não, o MAI no Plus custaria US$ 2,25/mês por conta no pior caso.
