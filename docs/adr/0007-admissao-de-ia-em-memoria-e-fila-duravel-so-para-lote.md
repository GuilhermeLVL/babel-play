# ADR 0007 — Controlar a admissão de IA ao vivo em memória e usar fila durável só para lote

- **Data:** 2026-09-25
- **Estado:** proposto
- **Change OpenSpec:** `prontidao-producao`

## Contexto

Toda chamada de IA é síncrona dentro do request, sem fila (`server/ai/sttProxy.ts`, `mtProxy.ts`). A conta Groq
é única para o app: 20 STT/min, 1.000 pedidos/dia e 200K tokens/dia por modelo na camada grátis
(`docs/auditoria/eval/bancada-2026-09.md:130`). Capacidade medida: 2–4 pessoas falando ao mesmo tempo; o limite
por minuto quebra a partir de ~67 cadastrados (`fase2-escala.md` §3). Cada 429 vira 3 pedidos por causa da
retentativa (`sttProxy.ts:263-274`), e o STT não tem disjuntor. A legenda ao vivo é tempo real: do fim da fala
à legenda traduzida são ~1,9 s; uma resposta que chega 10 s depois não tem valor.

## Decisão

A IA ao vivo passa por **controle de admissão em memória**: token bucket por provedor e modelo com os limites da
conta, prioridade por plano (Pro, depois Essencial, depois convidado, com reserva para pagantes), uma chamada de
STT em voo por usuário, disjuntor também no STT, nenhuma retentativa em 429 e respeito a `Retry-After`. Sem
saldo, o servidor responde 429 `nuvem_ocupada` com `Retry-After` e o cliente usa o motor local imediatamente. A
importação na nuvem (lote) usa **fila durável** numa tabela `jobs` do próprio banco, com idempotência pela chave
do pacote, retry com backoff e prioridade por plano, consumida por um worker no mesmo processo.

## Alternativas consideradas

- **Fila durável para tudo (BullMQ/Redis).** Rejeitada: acrescenta Redis e espera a uma legenda que precisa de
  menos de 2 s; na fila, o pedido perde o valor antes de ser atendido.
- **Sem controle, só aumentar o plano do provedor.** Rejeitada: o upgrade está indisponível agora e, mesmo com
  ele, um usuário ainda consome a cota de todos sem prioridade.
- **Fila em memória para o ao vivo.** Rejeitada pelo mesmo motivo; recusar rápido e cair no local é mais útil.

## Consequências

Melhor: o limite do provedor não é ultrapassado de propósito; quem paga é atendido primeiro; o usuário sempre vê
legenda (local quando a nuvem está cheia). Pior: com mais de um processo o bucket em memória diverge — passa
para o banco compartilhado junto com o ADR 0006. Proibido: retentar 429 no mesmo provedor.

## Como isto é cobrado

Testes: 25 STT simultâneos com bucket de 20/min resultam em 20 atendidos, 5 com 429 e `Retry-After` e 0
retentativas; Pro atendido antes de Essencial com o bucket quase vazio; 2ª chamada de STT do mesmo usuário
recusada enquanto a 1ª está em voo. Métrica de admissões recusadas por motivo e plano (Fase 5).
