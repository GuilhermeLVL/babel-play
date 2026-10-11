## 1. Fatia 1: a tela, a porta e o que já tem dado real (10/10/2026)

- [x] 1.1 `GET /api/vocab/resumo` com ETag por versão (`server/db/repositories/resumoDosCartoes.ts`, contrato em `src/core/learning/resumoDosCartoes.ts`), teste de integração e cliente (`src/data/rotas/cartoes.ts`)
- [x] 1.2 Rota `/cartoes` com as cinco abas no endereço; a revisão em `/cartoes/estudar[/<sessão>]`; `/revisar` e `/vocabulario` levam ao lugar novo
- [x] 1.3 Aba Hoje com os cinco estados pelo dado real (`lib/cartoes/estadoDeHoje`), retenção da semana, previsão de 7 dias, "Só 10 agora", "Mais N novas" e "Nasceu da legenda"
- [x] 1.4 Aba Baralhos: Tudo, por idioma, por sessão, Trilha e Anki, com as três contagens; "Revisar este" para Tudo e sessão; jogar, ver cartões, ativar mais, abrir a sessão, gerenciar
- [x] 1.5 Aba Palavras: o catálogo que já existia, embutido
- [x] 1.6 Aba Trazer e levar: `.apkg` com o relatório do que veio e do que não veio; os quatro formatos de levar
- [x] 1.7 Aba Memória: retenção contra a meta, previsão de 30 dias, calendário de 12 semanas, botões usados, cartões por estado
- [x] 1.8 Navegação: trilho (Biblioteca e Cartões sobem; Estatísticas e Personalizar no "Mais"), barra de cinco com "Praticar", ladrilho fixo no Início, selo do dia
- [x] 1.9 Testes de unidade, de componente e de navegador; prova lado a lado (`scripts/polimento/roteiros/cartoes-*.json`)

## 2. Confiança na revisão (limites e opções na conta)

- [ ] 2.1 Limite diário de verdade no servidor: novas por dia e revisões por dia, com contador por dia guardado na conta (hoje cortam cada rodada e ficam em `localStorage`)
- [ ] 2.2 Opções da revisão na conta (meta de retenção, limites, ordem, formato), valendo em todos os aparelhos
- [ ] 2.3 Cartão "Teto de hoje" da aba Hoje e o teto da pilha, com o contador real
- [ ] 2.4 Quem erra revê na mesma sessão (passos de aprendizagem ou fim da fila)
- [ ] 2.5 Aviso quando a nota não foi gravada (sem rede), com nova tentativa
- [ ] 2.6 "Estudo livre" como escolha explícita, fora da agenda; fim do baralho inteiro como padrão quando nada vence

## 3. A revisão melhorada (`cartoes2.js`)

Feita em 10/10/2026 na VERSÃO ENXUTA (`cartoes-enxuto-src`), com Minha voz, a cena no verso e as práticas: o que entrou, o que cada prática grava e o que ficou de fora estão em `revisao-enxuta.md`.

- [x] 3.1 A fala original da sessão no cartão (`vocab_occurrences.utterance_id`), a frase destacada, "Abrir na sessão"
- [ ] 3.2 Formatos novos (lacuna) e alternar a frase a cada revisão
- [x] 3.3 Modo de dois botões como opção (quatro continuam o padrão)
- [x] 3.4 Gestos no celular: tocar vira, deslizar dá nota, segurar abre as ações
- [x] 3.5 Fim da rodada com as palavras que mudaram de estado e "virar jogo" com as mesmas
- [ ] 3.6 Enterrar até amanhã (feito: "Deixar para amanhã"), informações do cartão (feito, sem a tabela de revisões), bandeira (falta: não há campo)
- [ ] 3.7 Tempo medido por cartão (destrava os tempos estimados da tela e o número "Tempo" da Memória)

## 4. Baralhos e recortes

- [ ] 4.1 Recorte da revisão por idioma, por baralho do Anki e pela Trilha ("Revisar este" em todos; seletor de idioma no cabeçalho)
- [ ] 4.2 Retenção e próxima revisão por baralho
- [ ] 4.3 Opções por baralho (entrar na revisão, novas por dia, prioridade), Mapa do conteúdo e Curadoria na folha do baralho
- [ ] 4.4 Exportar um baralho ou uma seleção

## 5. Sanguessugas e pilha acumulada

- [ ] 5.1 Baralhos "Difíceis" e "Suspensas"; aviso de palavra difícil com as três saídas
- [ ] 5.2 Saídas da pilha: espalhar pelos próximos dias, adiar as que aguentam esperar, sem novas até zerar
- [ ] 5.3 "Só as difíceis" na aba Hoje

## 6. Navegador de cartões

- [ ] 6.1 Filtros por estado, baralho, sessão, idioma e etiqueta
- [ ] 6.2 Etiquetas e seleção em massa (suspender, mover, etiquetar, exportar)
- [ ] 6.3 A folha da palavra com todas as ocorrências, a fala original e "Perguntar ao tutor"
- [ ] 6.4 Decidir o destino das três abas de análise do Vocabulário (hoje seguem dentro de "Palavras")

## 7. Anki

- [ ] 7.1 Mapear campos (terminar `motor-anki-mapeador`)
- [ ] 7.2 Ler o arquivo sem gravar, para o relatório vir antes de trazer
- [ ] 7.3 Colar uma lista e CSV avulso
- [ ] 7.4 Baralhos do Anki desativados na lista, e desativar e apagar no desenho novo

## 8. Sequência e memória avançada

- [ ] 8.1 Sequência com congelamento na aba Hoje (o mapa por dia de prática e de congelamento, que o servidor calcula e não expõe) e no calendário
- [ ] 8.2 Ajustes da memória avançados: passos, dias leves, limiar de difícil, lembrete por revisão vencida
- [ ] 8.3 Otimizar os parâmetros com o histórico; FSRS-6

## 9. Descoberta do resto ("Mapa das portas", `cartoes3.js`)

- [ ] 9.1 Importar único, "Exportar" único, tecla "?" com os atalhos
- [ ] 9.2 Busca ampliada (abre a palavra, acha ações, baralhos e as telas que ficavam de fora)
- [ ] 9.3 Tutor no "Mais", idioma da interface no "Mais", as portas plantadas na Biblioteca, na Sessão, no Intérprete e na Ajuda
- [ ] 9.4 Contagens nas abas de "Praticar" e na aba Baralhos
