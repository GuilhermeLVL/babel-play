# Documentação

Índice da pasta `docs/`, por assunto. **O estado atual do lançamento está em [ESTADO-DO-LANCAMENTO.md](ESTADO-DO-LANCAMENTO.md)**: se um documento daqui divergir dele ou do código, vale o estado do lançamento e, acima dele, o código. A descrição do produto como ele é, com `arquivo:linha`, está em [`../openspec/specs/`](../openspec/specs/).

## Produto e planos

- [ESTADO-DO-LANCAMENTO.md](ESTADO-DO-LANCAMENTO.md): decisões fixadas, o que está pronto e o que falta; a fonte do estado de hoje.
- [monetizacao.md](monetizacao.md): opções de monetização, requisitos e a recomendação (Grátis + Premium).
- [estrategia-comercial-e-custos-br.md](estrategia-comercial-e-custos-br.md): custo medido, pacote, teste e gatilhos de venda para o Brasil.
- [alternativas-de-custo-e-eficiencia.md](alternativas-de-custo-e-eficiencia.md): como entregar o mesmo com menos IA (Bergamot, legendas importadas, roteamento).
- [CUSTOS-E-SERVICOS.md](CUSTOS-E-SERVICOS.md): serviços de terceiros, quanto custam e o que a v1 precisa.
- [ofertas.md](ofertas.md): quando banners, avisos e o modal de planos podem aparecer.
- [economia-v2.md](economia-v2.md): recompensas e economia de créditos.
- [selecao-de-conteudo.md](selecao-de-conteudo.md): como cada jogo escolhe o que cai.
- [minigames_spec.md](minigames_spec.md): especificação da suíte de minigames.
- [curriculo-gamificacao-sla.md](curriculo-gamificacao-sla.md): currículo de aquisição de segunda língua baseado em gamificação.
- [fala-do-mic-e-traducao-comunicativa.md](fala-do-mic-e-traducao-comunicativa.md): voz do dono no cenário "conversa" e tradução comunicativa.
- [asaas-notificacoes.md](asaas-notificacoes.md): avisos de cobrança por e-mail ao cliente.
- [design/](design/): desenho de telas (avisos de plano, captura no computador, Quest).
- [vitrine.md](vitrine.md): o app completo na sua máquina, com login e cobrança de mentira.

## Operação, deploy e runbook

- [LANCAMENTO.md](LANCAMENTO.md): o passo a passo do dono para colocar o app no ar, com o custo mensal.
- [runbook.md](runbook.md): operar em produção (saúde, logs, métricas, rotação de segredos, sintomas conhecidos).
- [deploy.md](deploy.md): deploy do modo público multiusuário (Worker da Cloudflare e Docker).
- [deploy-checklist.md](deploy-checklist.md): checklist para cada ida à produção.
- [STAGING.md](STAGING.md): o staging no Worker `frasy-staging`.
- [escala.md](escala.md): critérios de escala, gatilhos e comandos.
- [slo.md](slo.md): objetivos de nível de serviço iniciais.
- [flags.md](flags.md): feature flags e configuração remota.
- [versionamento.md](versionamento.md): versionamento, compatibilidade da API e migrações.
- [observabilidade-langfuse.md](observabilidade-langfuse.md): custo e qualidade da IA por usuário, plano e função.
- [edicao-estatica.md](edicao-estatica.md): a edição estática (Cloudflare Pages), sem servidor Node.
- [auth/](auth/): provedores e modelos de e-mail do login ([EMAILS-E-PROVEDORES.md](auth/EMAILS-E-PROVEDORES.md)).

## Segurança e LGPD

- [`../SECURITY.md`](../SECURITY.md): como reportar vulnerabilidades e o que está no escopo.
- [lgpd/operadores.md](lgpd/operadores.md): operadores de dados pessoais.
- [lgpd/ropa.csv](lgpd/ropa.csv): registro das operações de tratamento.
- [metodologia-de-auditoria.md](metodologia-de-auditoria.md): o método com que o projeto se mede.
- [FONTES.md](FONTES.md): atribuição e licenças dos dados embutidos (vocabulário, traduções, frases).

## Arquitetura e decisões

- [arquitetura.md](arquitetura.md): visão geral das camadas (documento histórico de 24/07; o vigente está em `openspec/specs/`).
- [adr/](adr/): registros de decisão de arquitetura (modelo em [adr/0000-modelo.md](adr/0000-modelo.md)).
- [i18n.md](i18n.md): como a interface é internacionalizada; [i18n-como-testar.md](i18n-como-testar.md) é o roteiro de teste.
- [testes-regressao.md](testes-regressao.md): roteiro de testes e regressão ponta a ponta.
- [testar-no-quest.md](testar-no-quest.md): testar no Meta Quest e no celular.
- [superpowers/](superpowers/): specs e planos de implementação de funcionalidades.
- [redesign/](redesign/): fontes do redesenho.
- [prototipos/](prototipos/): protótipos de interface.

## Auditorias e históricos

- [auditoria/](auditoria/): auditorias datadas de produto, segurança, desempenho, acessibilidade e prontidão (a mais recente de produção: [2026-10-15-prontidao-producao.md](auditoria/2026-10-15-prontidao-producao.md)).
- [auditoria/2026-08-27-desempenho-da-edicao-leve.md](auditoria/2026-08-27-desempenho-da-edicao-leve.md): auditoria de desempenho da edição leve.
- [`../openspec/audits/`](../openspec/audits/): relatórios de auditoria ligados às changes do OpenSpec.
- [historico/](historico/): planos e registros superados, só para entender por que algo é como é (veja o [README da pasta](historico/README.md)).
- [historico/auditoria-migracao.md](historico/auditoria-migracao.md) e [historico/estrategia-reuso-web.md](historico/estrategia-reuso-web.md): a migração do app desktop para a web.

## Pesquisa

- [pesquisa/](pesquisa/): estudos que embasaram decisões, sem valor de instrução.
- [pesquisa/viabilidade-web-inferencia.md](pesquisa/viabilidade-web-inferencia.md): viabilidade de rodar a IA na web, sem depender de provedor.
- [pesquisa/captura-audio.md](pesquisa/captura-audio.md): o que dá e o que não dá para capturar de áudio no navegador.
- [pesquisa/i18n-lacunas.md](pesquisa/i18n-lacunas.md): o problema de internacionalizar de verdade e como a indústria resolve.
- [pesquisa/loja-roadmap.md](pesquisa/loja-roadmap.md): referências e roadmap da loja de personalização.
- [pesquisa/motor-anki/](pesquisa/motor-anki/): relatórios do motor de importação Anki.
