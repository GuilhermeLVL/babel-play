# O que falta no Babel Play: auditoria de lacunas por tela (23/09/2026)

Comparação do protótipo `docs/prototipos/consistencia-telas.html` e do app real (`src/`) com o que
apps de estudo e de assinatura maduros entregam (Duolingo, Anki, Babbel, Spotify, Notion, Stripe) e
com as regras brasileiras (LGPD, CDC, Decreto 11.034/2022).

**Legenda:** P1 = falta que um usuário sente logo ou que tem peso legal · P2 = padrão esperado,
ausência perceptível · P3 = acabamento. ✅ = implementado no protótipo nesta rodada.

## 1. Entrada: login e cadastro

O app real tem entrar com e-mail/senha, Google, "esqueci a senha" por link e "continuar sem conta"
(`src/components/Login.tsx`). Faltam:

| # | Lacuna | Por quê | Prioridade | Protótipo |
|---|---|---|---|---|
| 1.1 | Data de nascimento no cadastro e fluxo do responsável para menores de 12 | LGPD art. 14: dado de criança exige consentimento específico de um dos pais. O público do app inclui crianças (perfil kids) | P1 | ✅ |
| 1.2 | Senha com no mínimo 8 caracteres e medidor de força | Hoje o mínimo é 6. A NIST SP 800-63B recomenda 8+ e checagem contra senhas vazadas | P1 | ✅ |
| 1.3 | Verificar e-mail por código de 6 dígitos, com reenviar e contagem | Hoje só existe o link. O código funciona no celular sem trocar de app | P2 | ✅ |
| 1.4 | Tela "Defina uma nova senha" com confirmação e requisitos visíveis | O `ResetPassword.tsx` existe, mas sem medidor nem confirmação | P2 | ✅ |
| 1.5 | Mostrar e ocultar senha, `autocomplete` certo e aviso de Caps Lock | Padrão de formulário acessível | P2 | ✅ |
| 1.6 | Mensagem genérica em erro de login e aviso de muitas tentativas | Evita enumerar contas e explica o bloqueio temporário | P2 | ✅ |
| 1.7 | Termos e Privacidade legíveis ANTES de criar a conta, com aceite explícito | Hoje o texto fica abaixo de "continuar sem conta" | P2 | ✅ |
| 1.8 | Entrar com Apple | Obrigatório na App Store quando existe login social. Só vale se houver app iOS | P3 | — |

## 2. Conta, segurança e dados

Hoje: 2FA por TOTP, trocar senha e sair (`auth/SecurityPanel.tsx`). Faltam:

| # | Lacuna | Por quê | Prioridade | Protótipo |
|---|---|---|---|---|
| 2.1 | Sessões e aparelhos ativos, com "sair deste aparelho" e "sair de todos" | Padrão de segurança (Google, GitHub, Notion) | P1 | ✅ |
| 2.2 | Trocar e-mail com confirmação no endereço novo | Hoje não há como | P2 | ✅ |
| 2.3 | Excluir conta, com confirmação digitada e prazo de 30 dias para desistir | LGPD art. 18, VI (eliminação). A App Store e o Google Play exigem exclusão dentro do app | P1 | ✅ |
| 2.4 | Baixar os meus dados (JSON/CSV) com aviso de quando fica pronto | LGPD art. 18, II e V (acesso e portabilidade) | P1 | ✅ |
| 2.5 | Consentimentos revogáveis: métricas de uso, e-mails de novidades, melhoria da IA com trechos | LGPD art. 8, §5 | P1 | ✅ |
| 2.6 | Histórico de atividade da conta (entradas, trocas de senha, 2FA) | Auditoria para o próprio usuário | P3 | ✅ |
| 2.7 | Códigos de recuperação do 2FA | Sem eles, perder o celular é perder a conta | P2 | ✅ |

## 3. Notificações

Não existe central de notificações nem preferência de aviso. Faltam:

| # | Lacuna | Por quê | Prioridade | Protótipo |
|---|---|---|---|---|
| 3.1 | Central de notificações (sino) com não lidas, marcar todas como lidas e ir para o item | Padrão de app com eventos (revisão vencida, conquista, fatura) | P2 | ✅ |
| 3.2 | Preferências por tipo e por canal (no app, e-mail, push) | Evita spam e segue o opt-in da LGPD | P1 | ✅ |
| 3.3 | Lembrete diário de revisão com horário escolhido | É o motor de retenção de todo app de idioma (Duolingo, Anki) | P1 | ✅ |
| 3.4 | Horário silencioso | Padrão de notificação respeitosa | P3 | ✅ |
| 3.5 | Resumo semanal por e-mail | Relatório de progresso fora do app | P2 | ✅ |

## 4. Estatísticas e relatórios

Hoje: KPIs soltos no Início, "Visão geral" com um gráfico de 7 dias no Vocabulário, e métricas por
sessão. Faltam:

| # | Lacuna | Por quê | Prioridade | Protótipo |
|---|---|---|---|---|
| 4.1 | Tela própria de Estatísticas, com filtro de período (7 dias, 30 dias, 90 dias, tudo) | Uma pergunta, "estou evoluindo?", precisa de um lugar | P1 | ✅ |
| 4.2 | KPIs com variação contra o período anterior | Número sem comparação não diz se melhorou | P1 | ✅ |
| 4.3 | Minutos de estudo por dia (barras) | Constância é o preditor de aprendizado | P1 | ✅ |
| 4.4 | Vocabulário acumulado ao longo do tempo (linha) | Mostra o crescimento | P2 | ✅ |
| 4.5 | Calendário de atividade (mapa de calor de 12 semanas) | Padrão GitHub/Duolingo para ofensiva | P2 | ✅ |
| 4.6 | Previsão de revisões dos próximos 7 dias | Padrão Anki: planejar a carga | P2 | ✅ |
| 4.7 | Acerto por jogo e por nível (CEFR) | Mostra onde a pessoa está fraca | P2 | ✅ |
| 4.8 | Tooltip em cada ponto e alternativa em tabela para cada gráfico | Acessibilidade: o número não pode depender só do gráfico | P1 | ✅ |
| 4.9 | Exportar relatório (PDF e CSV) e relatório semanal | Professores e alunos pedem para compartilhar | P2 | ✅ |
| 4.10 | Estados de carregando (esqueleto) e sem dados | Hoje a tela vazia não explica nada | P2 | ✅ |

## 5. Perfil

Hoje: nome, meta, bio, interesses e progresso. Faltam:

| # | Lacuna | Por quê | Prioridade | Protótipo |
|---|---|---|---|---|
| 5.1 | Foto de perfil (enviar, recortar, remover) com as iniciais como padrão | Padrão de identidade | P2 | ✅ |
| 5.2 | Meta diária em minutos, ligada ao lembrete e às estatísticas | Sem meta, "progresso" não tem referência | P1 | ✅ |
| 5.3 | Nível atual por idioma (autoavaliação CEFR) | Calibra o conteúdo dos jogos | P2 | ✅ |
| 5.4 | Salvar com feedback (salvo / erro) e aviso de alterações não salvas | Padrão de formulário | P2 | ✅ |

## 6. Transversais: todas as telas

| # | Lacuna | Por quê | Prioridade | Protótipo |
|---|---|---|---|---|
| 6.1 | Atalhos de teclado com ajuda no `?` | App de produtividade (Linear, Notion, Gmail) | P3 | ✅ |
| 6.2 | Aviso de sem conexão, com o que continua funcionando offline | O app roda IA local, e isso precisa aparecer | P2 | ✅ |
| 6.3 | Página de erro e de "não encontrado" com saída | Hoje existe `ErroDaTela.tsx`, mas não há 404 | P2 | ✅ |
| 6.4 | Central de ajuda e "fale com a gente" em um lugar | Decreto 11.034/2022 (SAC acessível) no modo público | P2 | ✅ |
| 6.5 | Sair da conta no menu da conta | Hoje fica escondido na aba de segurança | P2 | ✅ |
| 6.6 | Aviso de cookies e armazenamento só se houver cookie não essencial | LGPD; o self-host não precisa | P3 | — |
| 6.7 | Idioma da interface em outros idiomas | Existe i18n, com traduções incompletas | P3 | — |

## Fora do protótipo (backend ou decisão)

- Checagem da senha contra listas vazadas (HaveIBeenPwned, k-anonimato) no servidor.
- Job de exportação de dados assíncrono e link com validade.
- Janela de 30 dias para desistir da exclusão, e depois anonimizar ou apagar.
- Push notification exige service worker e opt-in do navegador.
- Envio do resumo semanal (fila e template de e-mail).
- Registro de consentimento com data e versão do texto aceito (prova da LGPD).
