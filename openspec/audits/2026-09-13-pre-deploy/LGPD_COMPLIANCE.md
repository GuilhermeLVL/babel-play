# Evidências de compliance LGPD — estado em 2026-09-13

Público-alvo decidido: **18+** (age gate declaratório, sem consentimento parental).

## O que já está pronto e verificado

| Requisito LGPD | Estado | Evidência |
|----------------|--------|-----------|
| Transparência (art. 6, 9) — política fiel ao tratamento real | ✅ (revisão humana) | `public/privacidade.html` reescrita: e-mail guardado, áudio de sessão salvo enviado, operadores listados (Supabase, Groq, Google Gemini, MyMemory, Openverse, Hugging Face, Asaas), retenção declarada |
| Idade mínima 18+ (evita art. 14 — dados de crianças) | ✅ cláusula legal | `public/termos.html` e `privacidade.html`: "serviço só para maiores de 18 anos" |
| Acesso/portabilidade (art. 18) — exportar dados | ✅ implementado e testado | `GET /api/me/exportar`; `tests/integration/lgpd-conta.test.ts` |
| Eliminação (art. 18) — excluir conta | ✅ implementado e testado | `DELETE /api/me` (exclusão física + desvínculo do login via service role); `tabelas-do-titular.test.ts` quebra se uma tabela nova com `user_id` não for coberta |
| Minimização — CPF não é guardado | ✅ | `server/lib/asaas.ts`; CPF vai direto ao Asaas |
| IP do ranking anonimizado | ✅ | `ip_hash` (SHA-256 salgado e truncado), `schema.ts:750` |

## O que FALTA para o compliance ficar completo (antes do deploy)

| Item | Por que falta | Onde entra |
|------|---------------|------------|
| **UI do age gate 18+** (perguntar e registrar a idade) | A tela vive no `Onboarding.tsx`/`App.tsx`, em churn pesado no redesign-v4 | Rodada sobre o redesign-v4: passo no Onboarding + coluna `age_confirmed_at` (migração) + endpoint |
| **Consentimento real de nuvem** (opt-in) | `cloudConsent: () => true` está fixo em 6 sites (`LiveCapture`, `Analysis`, `Reading`, etc.), todos em churn no redesign-v4. O gateway já respeita `cloudConsent` (`src/core/gateway/gateway.ts:82`) | Rodada sobre o redesign-v4: trocar o `() => true` por preferência persistida; o padrão passa a exigir consentimento |
| **Retenção do payload de billing** (GAP-017) | `billing_events.payload` guarda o JSON cru do Asaas (pode ter nome) sem prazo | P1 |
| **i18n das páginas legais** | Só pt-BR hoje | P1 |
| **DMCA/takedown formal** (GAP-016) | Adicionada linha básica de contato de takedown; falta processo formal | P1 |

## Observação importante sobre a política e o consentimento

A política foi escrita para ser **verdadeira para o código de hoje** (a nuvem pode ser usada e é
visível/controlável no app) e **continuar verdadeira depois do opt-in**. Ela **não** promete
"nada sai no plano grátis" (isso era a mentira do GAP-005). Quando o consentimento real (default
desligado) aterrissar com o redesign-v4, o texto continua correto. **Não fazer deploy público sem a
UI do age gate e o consentimento real**, senão a cláusula 18+ fica sem enforcement e o consentimento
fica só no papel.
