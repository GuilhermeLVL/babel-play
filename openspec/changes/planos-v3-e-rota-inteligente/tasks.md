# Tarefas

> **Revisão de 25/11/2026** (main `897c9d25`). Esta change ficou em duas metades. A dos PLANOS (grupos 0 a 3, 7 a 9) está feita e foi
> SUBSTITUÍDA pela v4 (`docs/specs/2026-10-24-planos-v4.md`, migração 0054, Plus R$ 14,90); a da ROTA INTELIGENTE (4 a 6) foi
> reabsorvida pelo `roteador-adaptativo-em-sombra` (#4 da ordem). Recomendação: arquivar esta change depois de fechar os itens
> "Pendente" abaixo, sem sincronizar o texto antigo da matriz (os preços da v3 são obsoletos), e abrir changes pequenas para o que sobra
> (ver `proposal.md`, "Revisão"). Legenda: **[D]** = decisão ou ato do dono; **[R]** = aparelho real. Em toda tarefa: `npm run typecheck`,
> `npm run lint` e só os testes dos arquivos tocados.

## 0. Decisões

- [x] 0.1 Dono responde as perguntas de `design.md` (delegadas em 09/10, §11).
- [x] 0.2 ADR 0013 (`docs/adr/0013-quatro-planos-por-nivel-de-servico.md`). Pendente: um ADR 0016 para a v4 (o 0013 ainda diz Essencial/Premium/Ao Vivo).
      Verificar: `docs/adr/0016-*.md` existe, marca o 0013 como "substituído parcialmente" e cita o painel de `docs/auditoria/planos-v4-painel/`.
- [ ] 0.3 **[D]** Conferir no Asaas e nos bancos que não há assinatura nem cobrança manual em R$ 39,90, R$ 179 ou nos valores da v3
      (R$ 9,90, R$ 19,90) que a v4 deixou sem venda, e que o sandbox cobra o Plus (R$ 14,90 e R$ 149).
      Verificar: `docs/LANCAMENTO.md` §10 com a data da conferência e o print do sandbox; `tests/integration/billing-por-plano.test.ts` verde.

## Q. Qualidade no aparelho (absorvida por `docs/specs/2026-10-23-modelos-no-aparelho.md`)

- [x] Q.1 Parakeet v3 no navegador em pt e es. Feito: rota "Preciso" e `parakeetProntoNaRota` (`src/gateway/sttRouter.ts`); bancada em `docs/auditoria/`.
- [x] Q.2 fp16 contra fp32 em WebGPU. Feito: o Whisper na GPU usa o encoder fp32 (commit `f94f1118`).
- [ ] Q.3 Sondar a fala do navegador processada no aparelho (pt-BR, en, es) em Chrome e Edge reais. **[R]**
      Verificar: tabela em `docs/auditoria/` com navegador, idioma e se o áudio sai do aparelho; sem ela, `src/core/rota/medicoesDeStt.ts` não ganha linha.
- [ ] Q.4 Diagnóstico no Quest (fala, vozes, WebGPU). **[R]** Verificar: saída do `/diagnostico` no Quest 3 anexada ao relatório.
- [ ] Q.5 Moonshine v2 em fluxo para inglês. Recomendo ABANDONAR: o inglês já fica no aparelho (`ea49a4f1`) e os parciais do Parakeet cobrem pt/es.
- [x] Q.6 Tabela única de qualidade. Feito com outro nome: `src/core/rota/medicoesDeStt.ts` (`MEDICOES_DE_STT`, `inglesNuvemVenceAparelho`).
- [ ] Q.7 Correção determinística de vocabulário e nomes, com teste de falsos positivos. Não existe no código.
      Verificar: `npx vitest run tests/<correcao>.test.ts` com ≥ 30 falsos positivos conhecidos, nenhum corrigido; core sem React nem rede.
- [ ] Q.8 Adotar o que as medições confirmarem, um modelo por vez. Sem tarefa própria: cada modelo novo é uma change.

## 1. Matriz preparada para vários planos pagos

- [x] 1.1 `PLANOS_PAGOS` e `ehPlanoPago` derivados da matriz. Feito: `src/core/planos.ts`.
- [x] 1.2 Entitlements do cliente gerados da matriz. Feito: `tests/planos-n-pagos.test.ts`.
- [x] 1.3 Teste de N planos pagos. Feito: `tests/planos-n-pagos.test.ts`, `tests/planos-v4-matriz.test.ts`.

## 2. Capacidades e cotas novas

- [x] 2.1 `semAnuncios`, `sttAoVivo`, nível de voz e `sttAoVivoSegundosMes`. Feito: `src/core/planos.ts`.
- [x] 2.2 `/api/me/entitlements` devolve os campos. Feito: `tests/planos-capacidades.test.ts`.

## 3. Contador por nível

- [x] 3.1 a 3.3 `stt_live_seconds`, `/api/me/uso` com restante por nível, reserva e estorno no nível certo. Feito: `server/lib/usageQuota.ts`, `src/lib/uso.ts`.

## 4. Política de rota em modo sombra

- [x] 4.1 `src/core/rota/politicaDeRota.ts`. Feito (commit `4d11ffd9`, mais `68fbe7ca` com Parakeet e "aparelho primeiro").
- [x] 4.2 `tests/politicaDeRota.test.ts` e `tests/politicaDeRota-aparelhoPrimeiro.test.ts`.
- [x] 4.3 Conferência contra a decisão atual. Feito: `src/lib/captura/conferenciaDaRota.ts`, `tests/conferenciaDaRotaMt.test.ts`, `tests/conferenciaDaTranscricao.test.ts`.

## 5. Transparência

- [x] 5.1 Selo de etiquetas na captura e no intérprete. Feito: `src/lib/captura/seloDaFala.ts`, `tests/seloDaFala.test.ts`.
- [ ] 5.2 Folha "Como isto funciona" com "Testar sem internet". A folha existe (`FolhaComoFunciona.tsx`), o botão de teste não.
      Verificar: teste de componente: o botão põe o app em modo sem rede simulado e a legenda continua no aparelho; e2e com `context.setOffline(true)`.
- [x] 5.3 Aviso de mudança de rota, fora do meio da fala. Feito: campo `mudou` do selo (`seloDaFala.ts:62`). Verificar na PR de fechamento que o aviso espera o fim da fala (teste).
- [x] 5.4 Consentimentos separados; perfil protegido travado. Feito: `tests/nuvem-primeiro-e-consentimento.test.ts`.
- [ ] 5.5 Textos nos quatro catálogos e prova lado a lado com o protótipo.
      Verificar: `npm run i18n` sem diferença e captura de tela do selo nas quatro línguas (en, es, ar, pt) anexada ao PR.

## 6. Rota inteligente valendo (tocar só depois de `roteador-adaptativo-em-sombra`)

- [ ] 6.1 Migração da flag `rota_inteligente` (desligada). Hoje só existe a menção em `politicaDeRota.ts` e em docs.
      Verificar: migração PG e SQLite idempotentes, `docs/flags.md` com a linha, teste de contagem de flags (nasce desligada).
- [ ] 6.2 A política decide em `pipelineDeFala`, `traducaoDaFala` e no gateway com `politicaLigada: true`.
      Verificar: com a flag desligada, zero divergência da conferência (4.3); ligada, tabela aparelho × plano × tarefa × estado verde.
- [ ] 6.3 e2e de captura com a flag ligada e desligada. Verificar: `npx playwright test tests/e2e/captura-*.e2e.ts` nos dois estados.
- [ ] 6.4 **[D]** Ligar por percentual e acompanhar as quedas de rota. Verificar: reversão ensaiada (flag off).

## 7. Os planos na matriz, venda fechada

- [x] 7.1 a 7.4 Matriz dos planos, migração de dados das flags, `venda_planos_v3`, testes. **Superada pela v4**: `venda_planos_v4`
      (migração 0054) encerra a venda do Essencial, Premium e Ao Vivo. Feito: `src/core/planos.ts`, `tests/planos-matriz.test.ts`, `tests/planos-v4-matriz.test.ts`.

## 8. Cobrança e troca de plano

- [x] 8.1 a 8.3 `/assinar`, `POST /api/billing/trocar`, webhook, anual e 12x. Feito: `tests/integration/billing-por-plano.test.ts`. Conferência no Asaas: ver 0.3.

## 9. Telas

- [x] 9.1 Tela de Planos (agora a v4: Grátis, Plus, Pro em breve, Família em linha). Feito: `tests/planos-tela-v4.test.tsx`.
- [x] 9.2 Medidor de nuvem e seletor de nível com cadeado.
- [ ] 9.3 Ofertas nos momentos do protótipo (fim das horas, áudio difícil, celular, Quest). Parte feita em `src/core/ofertas.ts` e `tests/ofertas-*.test.ts`.
      Verificar: tabela momento × oferta × teste, cada linha com um teste; o que não tiver teste vira tarefa. Texto passa pela skill `copy-br-etica`; nenhuma oferta para menor ("peça aos seus pais").
- [x] 9.4 Telas da assinatura, admin e textos.

## 10. Nuvem ao vivo (adiada: o plano Ao Vivo já não é vendido)

- [ ] 10.1 a 10.4 Serviço de fluxo, transporte, adaptador, 10 min contínuos no Quest e no celular. **[D]** Só retomar se o dono responder
      a pergunta 3 da `proposal.md` (Revisão). Verificar (se retomada): custo medido contra a estimativa, retenção zero e teto em USD declarado.

## 11. Anúncios

- [ ] 11.1 Teste real de um anúncio com o isolamento ligado, em página de bancada. **[R]**
      Verificar: relatório com a página, o isolamento (COOP/COEP) e se o anúncio carregou; sem ele a flag `anuncios` não liga.
- [x] 11.2 `politicaDeAnuncio.ts` e `EspacoDeAnuncio`, com a tabela de testes.
- [x] 11.3 Consentimento de anúncios, data de criação da conta, política de privacidade. Feito: `tests/anuncios-consentimento-e-conta.test.ts`.
- [x] 11.4 CSP por configuração só com a flag.
- [x] 11.5 Espaços do protótipo, começando pelo premiado.
- [ ] 11.6 **[D]** Consulta jurídica (ECA Digital) antes de ligar. Verificar: parecer anexado em `docs/` e a regra de idade da política de anúncios conferida contra ele.
