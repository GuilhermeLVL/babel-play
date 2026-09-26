# ADR 0009 — Guardar áudio só no R2, em streaming, com retenção e varredura de órfãos, sem depender dele para estar no ar

- **Data:** 2026-09-25
- **Estado:** proposto
- **Change OpenSpec:** `prontidao-producao`

## Contexto

O armazenamento tem interface única, disco local ou S3/R2 (`server/lib/armazenamento.ts:219-236`). O áudio é
Opus 24 kbps (~11 MB/h), com retenção de 90 dias (`retencaoDeAudio.ts`) e cota por plano atômica
(`storageQuota.ts:117-128`). Medido em 25/09: o upload de 120 MB é lido inteiro e duplicado na memória (241 MB
de arrayBuffers), e 4 simultâneos passam de 1 GB (`fase2-escala.md` §2.3). O `/api/ready` inclui o R2
(`server/routes/health.ts:123-144`): uma falha do R2 tira a única máquina do roteamento. Órfãos só são removidos
quando um áudio substitui outro (`server/routes/sessions.ts:264`); não há varredura. A mídia não tem backup.

## Decisão

Em produção o áudio vive **só no R2**, enviado em **streaming** (sem bufferizar o corpo), com no máximo 1 upload
grande em voo por usuário e 2 por processo. A retenção de 90 dias continua, com índice em `sessions(created_at)`.
Uma **varredura semanal de órfãos** compara o R2 com o banco e remove o que está sem dono há mais de 7 dias. O R2
sai do `/api/ready`: indisponível, o upload responde 503 e o resto do app segue no ar. A mídia não ganha backup
próprio: o usuário pode baixar os áudios, e duplicá-los não se justifica agora.

## Alternativas consideradas

- **Disco local do Fly.** Prende áudio a uma máquina (o P0 antigo) e disputa o volume com o banco.
- **Upload direto do navegador ao R2 com URL pré-assinada.** Melhor para escala, mas exige checar cota e duração
  antes de assinar; fica como evolução quando houver mais de uma máquina.
- **Backup da mídia em outro bucket.** Dobra o custo de armazenamento de um dado que o usuário pode baixar.

## Consequências

Melhor: memória por upload constante; falha do R2 não derruba o serviço. Pior: áudio perdido no R2 não se
recupera. Proibido: `express.raw` para corpos acima de 5 MB.

## Como isto é cobrado

Teste de memória (`scripts/perf/escala/upload-memoria.mjs`): 4 uploads de 120 MB com RSS abaixo de 600 MB; teste
de `/api/ready` 200 com R2 indisponível; teste da varredura com um órfão plantado.
