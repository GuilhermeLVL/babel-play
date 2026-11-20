# O que falta para o Frasy ir ao ar 100% como planejado (02/11/2026)

Levantado a partir de produção (`frasy.com.br`, sondada em 02/11) e dos documentos. Onde este arquivo e o código divergirem, o código vence. O índice geral é `docs/ESTADO-DO-LANCAMENTO.md` (datado de 21/10; a seção 0-bis dele aponta para cá).

## O que está no ar (verificado em 02/11)

- Worker de produção (`frasy`) respondendo 200 em `frasy.com.br`, banco no ar, deploy pelo `deploy-worker.yml` com migrações, fumaça e rollback automático.
- Só a flag `oferta_planos` está ligada. Desligadas: `anuncios`, `venda_planos_v3`, `venda_planos_v4`, `venda_familia`, `venda_pro4`, `ia_de_estudo`, `voz_natural`, `voz_no_aparelho`, `audiolivros*`, `avatar_*`, `aquecer_stt_na_intencao`, `stt_*`, `nuvem_*`.
- Segredos do Worker de produção (nomes): `SECRET_KEY`, `SIGNUP_ENABLED`, `CHECKOUT_ENABLED`, `ASAAS_WEBHOOK_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. NÃO há `ASAAS_API_KEY`, chave de IA, `RESEND_API_KEY`/`EMAIL_REMETENTE`, DSN do Sentry nem segredo do Turnstile.
- `/planos` mostra os preços da v3 (Premium R$ 19,90 / R$ 149,90). Os planos v4 (Plus, Família, Pro) só existem no staging.
- Pesos da voz no aparelho publicados em `modelos.frasy.com.br/supertonic-3` (CORS para `frasy.com.br` e o staging), CSP já libera o domínio.
- O Worker `frasy-anuncios` NÃO está implantado.

## Login (cadastro de contas)

| Item                                                                                                                                                                 | Quem                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Supabase Pro: redirects, Google OAuth, TOTP, DPA (`LANCAMENTO.md §3`)                                                                                                | dono (painel)                       |
| Resend: domínio com SPF/DKIM/DMARC; `RESEND_API_KEY`, `EMAIL_REMETENTE`, `APP_URL` nos secrets (`§4`). Sem isso o convite ao responsável de menor de 16 anos não sai | dono (conta) + assistente (secrets) |
| Turnstile: site key no build (`VITE_TURNSTILE_SITE_KEY`) e segredo no Supabase                                                                                       | dono (painel) + assistente          |
| Abrir `SIGNUP_ENABLED` (runbook §0.6)                                                                                                                                | dono                                |
| Provar login real e E2E com conta real                                                                                                                               | assistente, depois das contas acima |

## Pagamentos

| Item                                                                                                         | Quem                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Conta Asaas PJ de produção e `ASAAS_API_KEY` (a base real já está no `wrangler.jsonc`)                       | dono + assistente (secret)      |
| Conferir que não há assinatura manual antiga a R$ 39,90 ou R$ 179                                            | dono                            |
| Decidir e-mails de cobrança do Asaas (ligar ou não)                                                          | dono                            |
| Escolher v3 ou v4 na produção: `SITE_FLAGS_DE_VENDA` no Environment, flags `venda_planos_v*`, `ia_de_estudo` | dono decide, assistente executa |
| Termos §3–§4 validados pelo advogado antes de abrir anual e 12x (`ANUAL_ENABLED`)                            | dono + advogado                 |
| Contador: ME no Simples, NFS-e a partir de 01/11/2026                                                        | dono                            |
| Abrir `CHECKOUT_ENABLED`                                                                                     | dono                            |
| Provado: cobrança no sandbox (mensal, anual, 12x, estorno)                                                   | feito                           |

## IA

| Item                                                                                                                  | Quem                                 |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Chaves pagas (OpenRouter + reserva Groq) com retenção zero e teto de gasto; sem reserva o boot avisa `ia_sem_reserva` | dono (contas) + assistente (secrets) |
| Ligar `ia_de_estudo` e `nuvem_gratuita_alivio`                                                                        | dono                                 |
| Teto em dólar por conta (`TETO_USD_MES_*`) e alerta do pool da amostra grátis                                         | dono decide números                  |
| Subir o limite da chave do OpenRouter e preencher a planilha de calibração (fecha a medição de qualidade)             | dono                                 |
| `voz_natural`: registrar a retenção do provedor na LGPD antes                                                         | dono                                 |

## Anúncios

| Item                                                                                             | Quem                       |
| ------------------------------------------------------------------------------------------------ | -------------------------- |
| Escolher e aprovar a rede (recomendação: Google Ad Manager por origem própria)                   | dono                       |
| Consulta jurídica sobre o ECA Digital antes de ligar `anuncios`                                  | dono + advogado            |
| Revisar os 12 guias (`revisado: true`): a rede exige conteúdo público revisado                   | dono                       |
| Publicar `frasy-anuncios` e definir `VITE_ANUNCIOS_ORIGEM`/`ANUNCIOS_ORIGEM`                     | assistente, depois da rede |
| `ads.txt` (precisa de `ADSENSE_PUB_ID`)                                                          | dono + assistente          |
| Pronto: consentimento, recompensa do premiado no servidor, CSP por flag, política de privacidade | feito                      |

## Voz de alta qualidade

| Item                                                                                                               | Quem            |
| ------------------------------------------------------------------------------------------------------------------ | --------------- |
| Parecer jurídico da OpenRAIL-M (menores, rótulo de voz sintética)                                                  | dono + advogado |
| Ligar `voz_no_aparelho` em produção                                                                                | dono            |
| Safari em navegação privada: o OPFS falha; hoje o app avisa e segue com a voz do sistema. Melhor esconder a oferta | assistente      |
| Provado em 02/11 contra o CDN real: Chromium (33 s) e WebKit (15 s) baixam os 401 MB, 10 vozes, síntese ok         | feito           |

## Operação e conformidade

| Item                                                                                                                                 | Quem                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Sentry (DSN no build e no Worker) e UptimeRobot                                                                                      | dono (contas) + assistente |
| `contato@frasy.com.br` (Email Routing) e campos [DONO] da política de privacidade (razão social, CNPJ, DPAs)                         | dono                       |
| Teste de carga contra a produção real e as 16 conferências de `LANCAMENTO.md §10`; depois o passo a passo de abrir a venda (§11-bis) | assistente + dono          |
