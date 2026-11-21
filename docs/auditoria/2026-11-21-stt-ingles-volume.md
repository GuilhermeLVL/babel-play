# STT em inglês: volume e rota (openspec `stt-ingles-volume-e-rota`)

Estado em 2026-11-21T03:12:30-03:00: **código entregue, medição NÃO feita**. A rodada "antes" parou no primeiro pedido com
`HTTP 401 {"error":{"message":"User not found."}}` do OpenRouter (a chave `OPENROUTER_API_KEY` do `.env` local
não é aceita pelo provedor). Custo: US$ 0,00 (1 pedido recusado, nada cobrado). Nenhum número abaixo é novo: os de
09/10/2026 vêm de `2026-10-09-medicoes-de-nuvem.md`. Não foi usada nenhuma outra chave.

## Critério de decisão (escrito ANTES de qualquer rodada "depois"; 2026-11-21T03:12:30-03:00)

Mesmas 100 falas FLEURS en e 100 pt, mesma chave, mesmo modelo, em sequência no mesmo dia; `--ganho` usa a função
entregue (`src/core/audio/normalizarVolume.ts`).

1. **Liga `stt_nuvem_normalizar`** só se: WER en da nuvem normalizada ≤ 8%; a diferença pareada contra o "antes" (en) tem
   limite superior < 0; o WER pt não piora além do IC 95% pareado do "antes"; a latência mediana e o p95 não pioram mais de 10%.
2. **A rota do inglês vira "nuvem primeiro"** só se a nuvem normalizada vencer o motor local de inglês da rota `auto`
   (Moonshine base) com IC 95% pareado (limite superior da diferença < 0) **e** a flag estiver ligada. Empate (como −0,9
   [−2,2; +0,3] contra o Parakeet) não basta. Sem medição registrada em `src/core/rota/medicoesDeStt.ts`, o inglês fica no aparelho.
3. WER en normalizado > 8%: a flag não liga e o inglês fica no aparelho.

## Resultado

|                          | WER en                                                     | WER pt          | Latência mediana / p95 | n   |
| ------------------------ | ---------------------------------------------------------- | --------------- | ---------------------- | --- |
| Antes (rota padrão)      | não medido hoje (09/10: 27,8% [22,1–33,9]; mediana 981 ms) | não medido hoje | não medido hoje        | 100 |
| Depois (função entregue) | **não medido**                                             | **não medido**  | **não medido**         | 100 |

**Decisão:** sem a medição, o critério não é satisfeito. Efeito no código: `medicoesDeStt.nuvemNormalizada = null`, logo
o inglês fica no aparelho (padrão novo, com a flag desligada ou ligada), e a flag continua desligada. Nada foi ligado.

## Medido offline (sem rede, sem custo): o ganho da função nas falas da bancada

| Conjunto  | Ganho (dB) p10 / mediana / p90 | Falas no teto de 40 dB | Falas sem ganho | Pico mediano (percentil 99,9) |
| --------- | ------------------------------ | ---------------------- | --------------- | ----------------------------- |
| fleurs_en | 6,0 / 40,0 / 40,0              | 56 de 100              | 0               | −44,4 dBFS                    |
| fleurs_pt | 1,1 / 7,0 / 13,8               | 0 de 100               | 1               | −9,9 dBFS                     |

Em 56 falas de inglês o teto de 40 dB limita o ganho (o pico final fica abaixo de −3 dBFS); é o mesmo teto do
diagnóstico de 09/10 (6,1%), então a expectativa é de resultado parecido, mas **isso não substitui a medição**.

## Limite: Ogg Opus × ganho (tarefa 5.2)

A bancada envia WAV. Opus 24 kbps não piorou o WER em setembro, mas só sem ganho. A interação com áudio amplificado
**não foi medida**; precisa da rodada manual no navegador (bancada `navegador/`) antes de ligar a flag.

## Como repetir

```bash
export BANCADA_NUVEM_ENV=<arquivo .env com OPENROUTER_API_KEY válida>   # o padrão do script é um caminho do Windows
export BANCADA_SAIDA=docs/auditoria/eval/bancada-2026-11-stt-volume BANCADA_TETO_USD=0.10
T="node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/nuvem"
$T/stt.mjs --conjuntos fleurs_en,fleurs_pt           # antes (sem ganho)
$T/stt.mjs --conjuntos fleurs_en,fleurs_pt --ganho   # depois (função entregue)
$T/pontuar.mjs   # WER, IC 95%, "ANTES × DEPOIS" pareado, latência p50/p95
```

Custo estimado: cerca de US$ 0,013 por lote de 100 falas (~US$ 0,05 as quatro rodadas). Depois: preencher
`medicoesDeStt.ts` (`nuvemNormalizada` e `nuvemNormalizadaContraLocal['moonshine-base']`, pareada contra
`bancada-2026-10-navegador/casos.json`) e reaplicar o critério.
