## Context

O detalhe técnico completo está em `docs/specs/2026-10-28-avatar-interprete.md` (arquitetura, receita, licença, menores,
tiers, estados, boca, emoção, soletração, privacidade, carregamento, loja, i18n, métricas, juiz). Este arquivo registra só
as decisões e as alternativas.

O app tem: intérprete com dois lados `meu|outro` (`interprete.ts`), fila de voz (`filaDeFala.ts`), `TtsEngine` com
`onStart/onEnd/onError`, nuvem em `<audio>` sem alinhamento, leitor com uma voz, PiP por documento/vídeo/painel, foto do
perfil só local, `TipoDaLoja` fechado, CSP com ativos grandes por `VITE_*`.

## Goals / Non-Goals

**Goals:** avatar como camada opcional sobre o que já existe, sem mudar cota nem direito; orçamento por tier; fallback 2D.
**Non-Goals:** ver `proposal.md`.

## Decisions

1. **Core puro e renderer lazy.** `core/avatar` não importa `three`. O renderer vive em `lib/avatar` e entra por
   `import()`; o arranque do app não paga o chunk. Alternativa descartada: só 2D (perde mãos articuladas).
2. **Receita JSON versionada, rejeita campo desconhecido.** O avatar salvo é dado, não código. Alternativa descartada:
   guardar o GLB do usuário no servidor (privacidade).
3. **Boca por amplitude/cadência.** Sem visemas reais (a nuvem não devolve alinhamento). O limite é documentado.
4. **Flags de interruptor, não de direito.** Três flags independentes com dependência lógica (`avatar_sinais` e
   `avatar_elenco` exigem `avatar_3d`).
5. **Armazenamento local em IndexedDB próprio (`frasy-avatar`)**, com `try/catch`; o arquivo nunca vai ao servidor.
6. **Tiers:** fraco <= 20k triângulos, desktop <= 70k, PiP usa o tier fraco.

## Risks / Trade-offs

- Licença de modelo de terceiros: ler o `meta` é triagem, não parecer (aviso, regra estrita para menor, parecer do dono).
- Peso do chunk e CPU em celular fraco (tier, modo economia, 2D, medição no M7).
- Safari e COEP `credentialless` (CORS no R2, teste no Safari real, pendência do dono).
- Sinais errados causam dano a pessoas surdas (só soletração, rótulo fixo, flag própria, revisão por surdos).

## Migration Plan

A migração PG 0015 semeia as 3 flags desligadas; reversão por `DELETE FROM flags`. O código só entra atrás de `avatar_3d`.

## Open Questions

Ver "Pendências do dono" em `proposal.md`.
