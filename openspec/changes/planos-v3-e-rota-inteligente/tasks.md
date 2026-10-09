# Tarefas

Nada começa antes de o dono ver o protótipo e responder `design.md` seção 10. As trilhas Q, 4 e 5 não
dependem de decisão comercial. Em toda etapa: `tsc --noEmit`, `tsc -p tsconfig.estrito.json --noEmit`,
lint e só os testes dos arquivos tocados; a suíte inteira roda na CI.

## 0. Decisões

- [ ] 0.1 Dono responde as 14 perguntas de `design.md`
- [ ] 0.2 ADR novo substituindo o 0011
- [ ] 0.3 Conferir no Asaas e nos bancos que não há assinatura em `essencial`, `pro`, R$ 39,90 ou R$ 179

## Q. Qualidade no aparelho (medir, depois adotar)

- [ ] Q.1 Bancada: Parakeet v3 no navegador (int8 em WASM, fp16 em WebGPU) em pt, es, fr, de
- [ ] Q.2 Bancada: as mesmas 100 falas em fp16 e fp32 na rota de celular e Quest
- [ ] Q.3 Sondar a fala do navegador processada no aparelho (pt-BR, en, es) em Chrome e Edge reais
- [ ] Q.4 Diagnóstico no Quest (fala, vozes, WebGPU)
- [ ] Q.5 Verificar Moonshine v2 em fluxo para inglês
- [ ] Q.6 Tabela única de qualidade (`src/core/rota/qualidade.ts`) com teste
- [ ] Q.7 Correção determinística de vocabulário e nomes, com teste de falsos positivos
- [ ] Q.8 Adotar o que as medições confirmarem, um modelo por vez

## 1. Matriz preparada para vários planos pagos

- [ ] 1.1 `PLANOS_PAGOS` e `ehPlanoPago` derivados da matriz; tirar `'premium'` à mão de admissão,
      `jaAssinou`, intenção do webhook e `PLANOS_DA_FLAG`
- [ ] 1.2 Entitlements do cliente gerados da matriz
- [ ] 1.3 `tests/planos-n-pagos.test.ts`; os testes existentes passam sem alteração

## 2. Capacidades e cotas novas (ainda dois planos)

- [ ] 2.1 `semAnuncios`, `sttAoVivo`, nível de voz e `sttAoVivoSegundosMes` em `src/core/planos.ts`
- [ ] 2.2 `/api/me/entitlements` devolve os campos; testes de matriz e de rota

## 3. Contador por nível

- [ ] 3.1 Métrica `stt_live_seconds` e reserva com nível em `server/lib/usageQuota.ts`
- [ ] 3.2 `/api/me/uso` e `src/lib/uso.ts` com o restante por nível
- [ ] 3.3 Testes de reserva concorrente e estorno no nível certo

## 4. Política de rota em modo sombra

- [ ] 4.1 `src/core/rota/politicaDeRota.ts` compondo `routeStt`, `escolherMotorDoMic` e `routeMt`
- [ ] 4.2 `tests/politicaDeRota.test.ts`: tabela aparelho × plano × tarefa × estado e os invariantes
- [ ] 4.3 Conferência em desenvolvimento contra a decisão atual; zero divergência com a flag desligada

## 5. Transparência

- [ ] 5.1 Selo de três etiquetas na captura e no intérprete, lendo a decisão
- [ ] 5.2 Motivo ao toque e folha "Como isto funciona" com "Testar sem internet"
- [ ] 5.3 Aviso de mudança de rota, fora do meio da fala
- [ ] 5.4 Consentimentos separados; perfil protegido travado
- [ ] 5.5 Textos nos quatro catálogos; testes de componente; prova lado a lado com o protótipo

## 6. Rota inteligente valendo

- [ ] 6.1 Migração da flag `rota_inteligente` (desligada)
- [ ] 6.2 A política decide em `pipelineDeFala`, `traducaoDaFala` e no gateway
- [ ] 6.3 e2e de captura com a flag ligada e desligada
- [ ] 6.4 Ligar por percentual e acompanhar as quedas de rota

## 7. Os quatro planos na matriz, venda fechada

- [ ] 7.1 `essencial` e `aovivo` na matriz com cotas e preços; tirar apelidos e preços legados
- [ ] 7.2 Migração de dados das flags e das ofertas, idempotente e com reversão escrita
- [ ] 7.3 Flag `venda_planos_v3` desligada; teste de valores cobráveis distintos
- [ ] 7.4 Reescrever `planos-matriz.test.ts` e os testes de migração e de configuração

## 8. Cobrança e troca de plano

- [ ] 8.1 `/assinar` aceita os planos novos; teste de 14 dias no plano decidido
- [ ] 8.2 `POST /api/billing/trocar` e a alteração de valor no Asaas
- [ ] 8.3 Testes de webhook, anual, 12x, troca e chargeback por plano; conferência no sandbox

## 9. Telas

- [ ] 9.1 Planos com quatro cartões, comparação e perguntas, com as horas da matriz
- [ ] 9.2 Medidor de nuvem em Ajustes e na captura; seletor de nível com cadeado
- [ ] 9.3 Ofertas nos momentos do protótipo (fim das horas, áudio difícil, celular, Quest)
- [ ] 9.4 Telas da assinatura, admin e textos "Grátis ou Premium"; prova lado a lado

## 10. Nuvem ao vivo

- [ ] 10.1 Escolher o serviço por medição, com retenção zero
- [ ] 10.2 Transporte em fluxo, reserva em blocos de 30 s e corte no servidor
- [ ] 10.3 Adaptador no gateway e degrau `nuvem-ao-vivo` na política; flag `stt_ao_vivo`
- [ ] 10.4 Dez minutos contínuos estáveis no Quest e num celular; custo medido contra a estimativa

## 11. Anúncios

- [ ] 11.1 Teste real de um anúncio com o isolamento ligado, em página de bancada
- [ ] 11.2 `politicaDeAnuncio.ts` e `EspacoDeAnuncio`, com a tabela de testes
- [ ] 11.3 Consentimento de anúncios, data de criação da conta, política de privacidade
- [ ] 11.4 CSP por configuração só com a flag; teste da CSP estreita intacto com ela desligada
- [ ] 11.5 Espaços do protótipo, um por vez, começando pelo premiado
- [ ] 11.6 Consulta jurídica (ECA Digital) antes de ligar
