# ADR 0008 — Usar a Groq como provedor principal, OpenRouter ZDR como reserva e o navegador como piso

- **Data:** 2026-09-25
- **Estado:** proposto
- **Change OpenSpec:** `prontidao-producao`

## Contexto

A bancada de 24–25/09 mediu Groq whisper-large-v3-turbo (WER 4,1% pt, 4,9% en, p50 0,37 s) e gpt-oss-120b com
raciocínio "low" (COMET 0,917 no gold de conversa, US$ 0,036 por hora de fala) como a melhor combinação de
qualidade e custo (`docs/auditoria/eval/bancada-2026-09.md`). A reserva configurada é a OpenRouter com ZDR
(`server/ai/provedores.ts:91-110`), mas a chave está expirada; o STT não tem reserva (`sttProxy.ts:213-218`). O
navegador já tem Whisper, Moonshine e opus-mt locais (`src/gateway/sttRouter.ts`). O upgrade da Groq para
Developer está indisponível.

## Decisão

A Groq continua como provedor principal de STT e LLM. A OpenRouter com `zdr:true` é a reserva do LLM e passa a
ser também reserva do STT quando houver modelo equivalente com ZDR. O **piso** é sempre o motor local do
navegador: nenhuma falha de nuvem deixa o usuário sem legenda. Os limites da camada atual da Groq são restrição
de projeto, aplicada pelo ADR 0007.

## Alternativas consideradas

- **Trocar de provedor principal.** Nenhum candidato medido bateu a Groq em qualidade, custo e latência juntos.
- **Autohospedar Whisper em GPU.** Custo fixo de GPU acima de US$ 300/mês sem demanda que o justifique.
- **Só local.** O WER em pt sobe de 4% para 11–19%; é o piso, não o produto pago.

## Consequências

Melhor: a qualidade paga é a medida; falha de provedor degrada, não derruba. Pior: dependência de um provedor
com cota diária global até o upgrade; a reserva só vale com chave válida (pendência do dono). Proibido: modelo
escolhido pelo cliente no caminho pago (P0-3, `7c601a6`).

## Como isto é cobrado

Teste de cascata com Groq em 429, 5xx e timeout; teste de que o cliente cai no local em 429 e 503; aviso no boot
em produção quando não há reserva configurada; troca de modelo só com a bancada (`scripts/eval-fala/bancada/`) e
IC pareado.
