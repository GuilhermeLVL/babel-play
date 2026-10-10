# Cartões e descoberta: pesquisa, auditoria e conceito da tela nova

Data: 10/10/2026. Branch lida: `feat/polimento-movimento` (`dc293280`). Somente leitura: nada foi executado, nenhuma tela foi aberta. Contagens de toques vêm da leitura do código, não de navegação real.

Marcação da pesquisa: **[C]** confirmado em fonte primária lida nesta data; **[R]** relato de fórum, blog ou imprensa; **[I]** inferência; **[M]** citado de memória, não lido nesta sessão (tratar como não confirmado). As fontes (F1…F32) estão no fim.

Limites da pesquisa, para ler antes de confiar:
- Nenhum tópico de r/Anki, r/languagelearning ou r/LearnJapanese foi lido diretamente; as queixas vêm do fórum do Anki, de blogs que resumem tópicos e de imprensa estudantil. A frequência das queixas não foi medida.
- Não foram lidas fontes primárias de RemNote, Clozemaster, LingQ, Quizlet e Memrise (telas e limites atuais); AnkiMobile também não.
- As páginas foram lidas por um resumidor automático: citações literais devem ser conferidas antes de irem para material público.

---

## Parte 1. O que quem estuda com cartões precisa

### 1.1 Funções indispensáveis

| Função | O que é, como o Anki faz | Evidência |
|---|---|---|
| Agendamento FSRS com retenção desejada | Padrão 90%; o manual chama de a configuração mais importante e avisa que a carga sobe forte acima de 90%. Faixa 0,70 a 0,97; 80 a 95% é o razoável | [C] F1, F5 |
| Otimização de parâmetros | Ajusta os pesos ao histórico da pessoa; "uma vez por mês basta"; com poucas centenas de revisões não vale | [C] F1, F5 |
| Reagendar ao mudar | Desligado de fábrica. No fórum, subir de 90 para 95% com a opção ligada levou um baralho de 150 para mais de 4.000 revisões por dia | [C] F1; [R] fórum do Anki |
| Dias leves e balanceamento | "Easy Days" desloca vencimentos; o balanceador escolhe, dentro da folga, dias com menos carga (24.11) | [C] F1; [R] F7 |
| Limites diários | Novos por dia e revisões por dia. Regra do manual: 20 novos por dia dá cerca de 200 revisões por dia; com atraso, parar os novos | [C] F1 |
| Ordem e mistura | Novos misturados, antes ou depois; revisões por vencimento e depois aleatório | [C] F1 |
| Passos de aprendizagem | Com FSRS: poucos passos, menores que um dia (10 ou 30 min). Quem erra revê o cartão na mesma sessão | [C] F1, F5 |
| Quatro botões com intervalo escrito | Errei = não lembrou; Difícil = lembrou com esforço; Bom; Fácil. Dá para usar só Errei e Bom. Usar Difícil quando errou infla os intervalos (o FSRS Helper tem função só para consertar isso) | [C] F2, F5, F8 |
| Sanguessugas | 8 lapsos: etiqueta e suspende; o conselho é reescrever, apagar ou esperar | [C] F3 |
| Enterrar, suspender, desfazer, editar, bandeira, info do cartão | Tudo dentro da revisão, sem sair dela | [C] F2, F9 |
| Navegador de cartões | Barra lateral (baralhos, etiquetas, buscas salvas), tabela com colunas (vencimento, intervalo, lapsos, revisões, etiquetas, criado), editor embaixo, ações em massa | [C] F4 |
| Áudio | Toca sozinho, tecla para repetir; TTS no AnkiDroid | [C] F1, F2, F9 |
| Cartão com frase de contexto | jpdb: toda frase tem uma só palavra desconhecida; Migaku: frase, áudio, captura de tela e definição num clique a partir da legenda | [C] F11, F14 |
| Importação e exportação `.apkg` | O pacote leva notas, tipos de nota (modelos), mídia e, opcionalmente, agendamento. Importadores de terceiros costumam perder agendamento, modelos com HTML/JS e às vezes a mídia. Baralho compartilhado não traz agendamento, por desenho | [C] F3b; [R] F20 a F23 |
| Sincronização e offline | Sincroniza pelo AnkiWeb; estudar sem rede é o esperado | [C] F9; [M] offline |

### 1.2 Úteis, mas secundárias

- Estudo personalizado (baralho filtrado): mais novos hoje, rever os esquecidos, adiantar, pré-visualizar, por etiqueta [C] F3c.
- Etiquetas e sub-baralhos [C] F4.
- Estatísticas completas: previsão de carga, calendário, retenção real (Errei = falha; o resto = acerto), tempo, botões usados, intervalos, dificuldade e estabilidade [C] F3d.
- Gestos configuráveis (AnkiDroid) [C] F9.
- Lacuna (cloze), reverso, digitar a resposta [M]; lacuna também em Mochi e Readwise [R] F15, [C] F13.

Enfeite para este app [I]: avanço automático, cronômetro na tela, quadro branco, imagem obrigatória.

### 1.3 Queixas recorrentes e como os bons respondem

| Queixa | Evidência | Resposta dos bons produtos |
|---|---|---|
| Pilha de revisões depois de dias sem estudar; a "parede" de 300 cartões é ponto de desistência | [R] F17; fórum do Anki | jpdb: "não entre em pânico", faça quantos quiser, vencidos ordenados por chance de lembrar, "abandonar" vencidos [C] F11, F12. FSRS Helper: adiar, agendar pausa, achatar com teto por dia [C] F8. Fórum do Anki: baralho filtrado só de atrasados e zero novos por uns dias [R] |
| Culpa e esgotamento | [R] F17 | Readwise: cerca de 5 itens por dia e sessões extras opcionais [C] F13 |
| Curva de aprendizado e interface datada | [R] F18; [C] F13 | Mochi e Migaku: dois botões (lembrei, esqueci), algoritmo escondido [R] F15, [C] F14 |
| "Ease hell" do algoritmo antigo | [R] F17 | FSRS |
| Cartões ruins e sem contexto | [C] F10 (regras do Wozniak) | Cartão nascido de conteúdo real: Migaku, jpdb [C] F11, F14 |
| Recurso gratuito que vira pago (Quizlet 2022); conteúdo da comunidade removido (Memrise 2024) | [R] F24, F25 | Exportação aberta; o vocabulário é da pessoa |

### 1.4 Revisão agradável sem estragar a memória

O que a pesquisa sustenta:
- Testar ganha de reler em 2 dias e 1 semana (Roediger e Karpicke, 2006) [C] F27. A tela tem de pedir a lembrança antes de mostrar.
- Espaçar funciona, e o intervalo ótimo cresce com o prazo (Cepeda et al., 2006, 317 experimentos) [C] F28.
- Com a resposta mostrada depois, lembrar livremente rende mais que múltipla escolha (Kang, McDermott e Roediger, 2007) [C] F29. "Lembrar" como padrão está certo; "Escolher" é apoio.
- Gamificação tem efeito pequeno e só o ganho cognitivo é estável nos estudos rigorosos (Sailer e Homner, 2020) [C] F30.
- Sequência de dias: as pessoas passam a cuidar do número, e quebrar a sequência desmotiva de modo especial (Silverman et al., 2023) [R] F31. Sequência só com perdão (o app já tem congelamentos).
- Informação mínima por cartão, uma incógnita por vez, exemplos pessoais resistem à interferência (Wozniak) [C] F10.
- Contexto: uma frase só não supera o par palavra e tradução (Webb, 2007); a tradução na língua da pessoa ajuda (Laufer e Shmueli, 1997) [R] F32. Conclusão para o app [I]: a frase e o áudio da sessão são pista e exemplo; o alvo do cartão continua sendo uma palavra com tradução.

O que atrapalha [I, apoiado em F27 e F29]: mostrar a resposta cedo, dica demais, premiar volume (XP por cartão incentiva apertar "Bom"), animação que atrasa o próximo cartão.

Não confirmado: efeito de sons e animação, duração ideal de sessão, ansiedade causada por sequência. De memória [M]: dificuldades desejáveis (Bjork, 1994), intercalação (Rohrer e Taylor, 2007), código duplo (Paivio).

### 1.5 Padrões de tela

- **Painel de baralhos (Anki, AnkiDroid)**: lista com sub-baralhos e três contagens por linha: azul novos, vermelho aprendendo, verde a revisar; tocar no nome começa o estudo [C] F2, F9.
- **Revisão (Anki)**: pergunta, "Mostrar resposta" (Espaço), quatro botões com o próximo intervalo, três contadores no topo, teclas 1 a 4 [C] F2.
- **jpdb**: página "Learn" com os baralhos em ordem (a ordem define de onde vêm os novos), cobertura por obra, frase de exemplo borrada na frente, teclas separadas para áudio da palavra e da frase, modo aprovar ou reprovar [C] F11, F12.
- **Readwise**: um cartão "Revisão diária" no topo, um item por vez [C] F13.
- **Migaku**: cartão rico e "palavras conhecidas" como número central [C] F14.
- **Navegador (Anki)**: barra lateral, tabela, editor, pré-visualizar, localizar e substituir, achar duplicatas [C] F4.
- **Estatísticas (Anki)**: Hoje, Previsão, Calendário, Revisões, Contagem por estado, Tempo, Intervalos, Dificuldade, Estabilidade, Por hora, Botões, Retenção real [C] F3d.
- **"O que estudar hoje"**: uma entrada só, com "X para rever, Y novas, cerca de N min" [I].

### 1.6 As dez necessidades, em ordem

1. Agenda confiável que não pune a ausência [C] F1, F11.
2. Teto de carga de verdade: novas por dia e revisões por dia [C] F1.
3. Sair do atraso com um toque (adiar, espalhar, teto) [C] F8.
4. Nota sem ambiguidade: "errou = Errei"; dois botões como opção [C] F2, F5.
5. Cartão com frase real, áudio e uma só incógnita [C] F10, F11, F14.
6. Desfazer, editar, suspender e enterrar dentro da revisão [C] F2, F9.
7. Palavra que erra de novo volta na mesma sessão; sanguessuga é avisada [C] F1, F3.
8. Importação `.apkg` honesta: dizer o que veio e o que não veio [C] F3b.
9. Navegador com busca e filtros por estado, baralho e etiqueta [C] F4.
10. Estatísticas mínimas da memória: previsão, retenção real, calendário [C] F3d.

---

## Parte 2. O que o app já tem de cartões e onde está escondido

### 2.1 A Revisão

- Tela: `src/components/views/Study.tsx` (lógica) e `src/components/views/revisao/quest/RevisaoDoQuest.tsx` (desenho). Endereço `/revisar`, que não é uma tela própria: é a pseudo-view `study`, renderizada dentro da sessão (`src/lib/rotas.ts:15-16`, `src/components/views/Analysis.tsx:645-650`).
- **Como se chega**: não há item de menu. Portas: ladrilho "Revisar N palavras" no Início, que só existe com conta e com palavra vencida (`src/components/views/quest/InicioDoQuest.tsx:155-166`); Mais > Vocabulário > "Revisar agora" (3 toques; `vocab/quest/VocabularioDoQuest.tsx:173`); Buscar > "Revisar agora" (`src/components/BuscaGlobal.tsx:141`); fim de captura, linha da Biblioteca, iChat e perfil. **Sem palavra vencida, a Revisão some do Início** e o caminho mais curto é de 3 toques. O voltar da Revisão leva ao Vocabulário (`Study.tsx:588`), ou seja, ela se comporta como filha de uma tela que está dentro do "Mais".
- **Algoritmo**: FSRS-5 próprio, com os 19 pesos de fábrica, fixos (`src/core/learning/scheduler.ts:50-54`); o servidor é a autoridade (`server/routes/vocab.ts:266-283`). O Anki já está no FSRS-6 [C] F6. Meta de retenção ajustável de 80 a 97% (`scheduler.ts:80-82`). Os intervalos escritos nos botões são a conta real (`Study.tsx:120-140`).
- **Funciona**: quatro notas com intervalo e teclas 1 a 4, Espaço, Z; Desfazer real no servidor (`server/routes/vocab.ts:286`); Ouvir (voz do sistema); Editar cartão abre a folha da palavra em modo de edição (`Study.tsx:663-683`); Suspender com desfazer (`Study.tsx:556-586`); três formatos (Lembrar, Digitar, Escolher) e Produção ativa; fim de rodada com números reais e "Jogar com as mesmas"; a frase de onde a palavra veio aparece no cartão.
- **Pela metade**:
  - "Novas por dia" e "Revisões por dia" **não são por dia**: cortam a fila de cada rodada, sem contador diário (`Study.tsx:366-367`). Abrir a Revisão de novo traz mais 20 novas.
  - As seis opções ficam em `localStorage` (`Study.tsx:71-76, 97-103`): não acompanham a pessoa entre aparelhos, e a meta de retenção viaja em cada nota (`Study.tsx:279`).
  - "Errei" marca o cartão para agora (`scheduler.ts:138`), mas ele **não volta na mesma rodada** (`Study.tsx:333-340`): só aparece no fim como "Ainda vencem N palavras agora". Não há passos de aprendizagem.
  - Sem nada vencido, "Revisar" abre o **baralho inteiro** (`Study.tsx:363`): é adiantar revisão, que o manual do Anki não recomenda como hábito [C] F3c.
  - Sem rede, a nota não é gravada e a rodada segue sem avisar (`Study.tsx:285-287`). [I] a pessoa acha que revisou.
  - "Escolher" sorteia alternativas do vocabulário inteiro, sem olhar o idioma (`Study.tsx:505-510`).
  - O recorte da revisão só existe por sessão (`Study.tsx:177-180`): não há "revisar só este baralho", "só este idioma", "só as difíceis".
  - Missões e sequência no fim da revisão existem (`ResumoDaPratica`), atrás da flag `recompensas_v2`, desligada (`Study.tsx:715, 746`).
- **Falta** em relação à Parte 1: limite diário de verdade, reaparecer na sessão, enterrar, sanguessugas (a coluna `lapses` existe, `server/db/schema.ts:138`, sem tela), bandeira, otimização de parâmetros, saída do atraso (adiar, espalhar), dias leves, modo de dois botões, gestos de toque (nenhum em `Study.tsx` nem em `revisao/`), áudio original da fala no cartão, imagem.

### 2.2 Baralhos e Anki

- Tela `src/components/views/BaralhoAnki.tsx` com três abas: Trazer, Levar, Gerenciar (`BaralhosAnki.tsx`). **Como se chega**: Mais > Vocabulário > "Trazer do Anki" (3 toques) ou Jogar > chip da fonte > "Trazer ou gerenciar" (3 toques). Não está junto das outras importações da Biblioteca.
- **Funciona**: lê os três formatos de `.apkg`, inclusive o comprimido atual (`server/import/anki.ts:13-21`); guarda cada importação como baralho, com todos os campos brutos por nome, etiquetas e tipo de nota; reimportar atualiza pelo `guid`; as notas entram **em lotes de 300**, nunca todas de uma vez (`server/db/repositories/vocab.ts:160`); desativar e apagar são ações separadas e o histórico de revisão fica (`openspec/specs/acervo-anki/spec.md`); lista de notas com busca e filtro de estado; "Jogar só com este".
- **O que se perde na entrada, e a tela diz**: mídia (áudio e imagem) e o agendamento do Anki (`server/import/anki.ts:29-31`). A importação de mídia foi cancelada e as tabelas removidas (`server/db/schema.ts:936`, `openspec/changes/archive/2026-09-08-motor-anki-midia-cancelada`). Os modelos (HTML e CSS do cartão) não são usados: o cartão vira palavra, tradução e frase.
- **Exportar**: `.apkg` no esquema legado, o compatível, sem mídia e sem agendamento (`server/import/ankiExport.ts:17-25`); também CSV, TXT para Quizlet e relatório (`vocab/ExportarVocabulario.tsx:29-34`).
- **Pela metade**: o Mapeador de campos (`openspec/changes/motor-anki-mapeador`: 13 tarefas feitas, 19 abertas) e o baralho nos jogos de frase (`motor-anki-jogos`: 13 feitas, 14 abertas).
- **Falta**: "Revisar este baralho" (só existe jogar); painel de baralhos com contagens novo, aprendendo, a revisar; filtro "Anki" no catálogo (a origem aparece na linha, mas não é filtro: `vocab/CatalogoDePalavras.tsx:48-53`); etiquetas do Anki visíveis fora da lista de notas; trazer o agendamento como opção.

### 2.3 Vocabulário

- `src/components/views/Metrics.tsx` (endereço `/vocabulario`). **Como se chega**: Mais > Vocabulário (2 toques); cada palavra, 3.
- Aba "Minhas palavras": convite da revisão, quatro números (Guardadas, Novas, Aprendendo, Em revisão) e o catálogo com busca, cinco ordenações, filtro por nível e por origem, 200 por vez, resolvido no servidor. Mais três abas de análise.
- Folha da palavra (`vocab/GavetaDaPalavra.tsx`): ouvir em duas velocidades, tradução com procedência, verbete, "Onde apareceu" (frase, sessão, tempo da fala), "Na sua memória" (próxima revisão, estabilidade, dificuldade, acertos); edita tradução, frase e nível; suspender, excluir, exercitar, revisar.
- **Falta**: filtro por estado (vencida, nova, suspensa, difícil), por sessão, por baralho, por idioma; seleção em massa; ir da palavra para a fala na sessão e tocar o áudio original; estado "dominada" (não existe; há Nova, Aprendendo, Em revisão, Suspensa).
- "Estudos & notas" da Leitura são anotações por frase guardadas só no navegador (`Reading.tsx:411-414`); não viram cartão e não sincronizam.

### 2.4 Estatísticas da memória

- Estatísticas tem "Revisões nos próximos 7 dias" e um calendário de 12 semanas em minutos (`Estatisticas.tsx:578-614`); o Vocabulário tem "Palavras revisadas por dia" (7 dias). O perfil tem retenção por fase (`perfil/AbaProgresso.tsx:316-335`).
- **Falta**: retenção real medida contra a meta, botões usados, carga além de 7 dias, sanguessugas, tempo por cartão.

### 2.5 O que existe no servidor e não tem tela

- `review_logs` guarda nota, estabilidade antes e depois, vencimento antes e depois e dias decorridos (`server/db/schema.ts:261-276`): é o que a retenção real e a otimização de parâmetros precisam.
- `vocab_cards.lapses` (sanguessugas), `cloze_prompt` e `cloze_answer` (cartão de lacuna), `difficulty_score` (`schema.ts:138-157`).
- `vocab_occurrences.utterance_id` liga cada encontro da palavra à fala gravada (`schema.ts:238`): é a ponte para tocar o áudio original no cartão.
- Campos brutos, etiquetas e nomes de mídia de cada nota do Anki.
- `GET /api/vocab/distribuicao-dificuldade` (`server/routes/vocab.ts:151`): não conferi se alguma tela usa.

---

## Parte 3. Mapa do que está escondido

Trilho: Início, Capturar, Intérprete, Jogar, Estatísticas, Personalizar, Buscar, Mais (`src/components/shell/TrilhoDoQuest.tsx:80`). Na barra de cinco do celular, Estatísticas e Personalizar descem para o "Mais". Toques contados a partir do Início, no computador.

| Recurso | Onde mora | Toques | Por que é difícil achar |
|---|---|---|---|
| Revisão | pseudo-view dentro da sessão; ladrilho condicional no Início | 1 com palavra vencida; 3 sem | Sem item de menu; some do Início quando nada vence; volta para o Vocabulário |
| Vocabulário | Mais > Vocabulário | 2 | Dentro do "Mais" desde 08/10 (`ficou-de-fora.md:9`) |
| Biblioteca | Mais > Biblioteca; link no Início só se já houver sessão | 2 | Dentro do "Mais"; lista de 4 por página |
| Biblioteca completa (filtros finos, fila de importação) | `Library.tsx:445+` | 3, por acidente | Só abre pelo botão Importar; não existe botão próprio |
| Importar YouTube, link, documento, áudio, texto | Mais > Biblioteca > Importar > fonte | 4 | Dentro do "Mais"; YouTube só no self-host; o Início só oferece importar quando não há sessão |
| Importar Anki | Mais > Vocabulário > Trazer do Anki | 3 | Longe das outras importações |
| Sessão aberta (Transcrição, Leitura, Jogos, Visão geral) | Início > sessões recentes, ou Biblioteca | 1 a 4 | Não é destino de menu |
| Leitura | sessão > aba Leitura | sessão + 1 | Só dentro de sessão, em aba |
| Estudos & notas | sessão > Leitura > chip | sessão + 2 | Nome não diz o que é; só neste navegador |
| Desenho livre | sessão > Leitura > Desenho livre | sessão + 2 | Só dentro de sessão e aba |
| Voz, idioma e tom | sessão > Leitura > botão no pé | sessão + 2 | Botão de texto no fim da faixa |
| Exportar sessão | sessão > Exportar | sessão + 1 | Só dentro de sessão |
| Exportar transcrição (.srt, .vtt) | Mais > Biblioteca > linha > Exportar transcrição | 4 | Dois "Exportar" para a mesma sessão; sem porta no headset |
| iChat / tutor | botão flutuante global (`IChat.tsx:836`) | 1 | Some na captura, com folha aberta e em jogo no celular; nome "iChat · Context" não diz o que faz; saiu da tela de Planos |
| Nuance | tocar numa fala (Captura ou Transcrição) | 2 ou mais | Só aparece ao tocar numa fala; Premium |
| Glossário "Sempre traduzir assim" | grava na folha da palavra; lista em Mais > Ajustes, no fim da aba Idiomas | 2 a 4 | Gravar e listar em lugares diferentes |
| Legendas flutuantes | Capturar > Legendas flutuantes | 2 | Só na tela de Capturar; sem porta no headset |
| Conversa virtual | Intérprete > "Virtual" | 3 | Rótulo não diz o que é; sem porta no celular e no headset |
| Histórico do intérprete | Intérprete > "Conversa" | 2 | Rótulo "Conversa"; vazio fora de conversa em curso |
| Diagnóstico | só pela URL `/diagnostico` (ladrilho só no headset) | sem porta | A Busca também não o acha |
| Temporada, Conquistas, Maestria, Loja | abas de Personalizar | 2 (3 no celular) | Dentro de uma tela cujo nome fala de aparência |
| Seeds e Créditos | chip em Personalizar | 2 | Nada indica que o chip é clicável |
| Recordes e ranking | Jogar > Opções > Recordes | 3 a 4 | Atrás de "Opções" |
| Mapa do conteúdo, Curadoria do baralho | Jogar > Opções | 3 | Atrás de "Opções"; a Curadoria é condicional |
| Trilha | Jogar > chip da fonte > Trilha | 3 | É uma fonte, não um destino |
| Praticar pronúncia (sombra da fala) | folha da frase | sessão + 2 | Só na folha; sem porta no headset |
| Menu de prática (falar a frase, ditado, duelo, adicionar ao baralho) | botão direito sobre texto selecionado | sem toque | Só por botão direito: não existe no celular nem no headset |
| Busca (Ctrl K) | trilho no computador; dentro do "Mais" no celular | 1 (2 no celular) | Não acha Ajuda, Diagnóstico, Anki, exportar, abas de Personalizar, jogo específico; palavra achada abre o Vocabulário, não a palavra |
| Atalhos de teclado | Mais > Ajuda > cartão de atalhos | 2 a 3 | Lista só 4; não há tecla "?"; os do Intérprete (1, 2, R, P) e do Desenho livre não estão em lista nenhuma |
| Modo desempenho, tema, som | pé do "Mais"; também Ajustes > Aparência | 2 | No pé de um painel |
| Idioma da interface e os três eixos | Mais > Ajustes > seletor | 3 | Dentro do "Mais"; o par da captura e o do Jogar trocam em outros lugares |
| Auditoria de idioma | Mais > Ajustes, no fim da aba | 2 e rolar | Sem âncora |
| Lembrete de estudo | Mais > Ajustes > Notificações | 3 | Lembra pela meta de minutos, não pelas revisões vencidas; entrega por push não achada no código |
| Relatório semanal | Mais > Ajustes > Notificações > Ver exemplo | 4 a 5 | Só aparece com o resumo ligado |

Sem porta nenhuma no desenho novo: Polir sessão (`analise/PolirSessao.tsx`, sem importador), Editar a fala (`ficou-de-fora.md:104`), o player com velocidade, laço e barra arrastável (`ficou-de-fora.md:106`), a faixa "Revisar as palavras desta sessão" (`ficou-de-fora.md:107`), o selo de dias seguidos no Início (`ficou-de-fora.md:10`).

Padrão que se repete: o que é **conteúdo da pessoa** (sessões, palavras, cartões) foi para o "Mais", e o que é **acessório** (Estatísticas, Personalizar) ficou no trilho.

---

## Parte 4. Proposta de conceito

Regra do dono em vigor: o protótipo manda na tela. Tudo abaixo é para virar protótipo primeiro (`docs/prototipos/polimento-movimento-src`), e só depois código.

### 4.1 A tela nova

**Nome**: "Cartões" (recomendado: diz o objeto e não promete resultado), "Memória" ou "Estudar". Endereço `/cartoes`; `/revisar` e `/vocabulario` continuam valendo.

**O que contém**, de cima para baixo:

1. **Hoje**: um cartão só. "12 para rever, 5 novas, uns 4 min" e o botão "Estudar agora". Ao lado, a sequência com os congelamentos e a retenção da semana contra a meta.
2. **Baralhos**: lista com três contagens por linha (novas, aprendendo, a revisar), como no Anki. Os baralhos nascem sozinhos:
   - "Tudo";
   - por idioma;
   - "Das minhas sessões", e dentro dele um por sessão (título e capa da sessão);
   - Trilha;
   - cada baralho do Anki importado, com "N de M notas ativadas" e "Ativar mais";
   - "Difíceis" (sanguessugas) e "Suspensas".
   Tocar no baralho abre a folha dele: Estudar, Jogar com este, Ver cartões, Opções do baralho.
3. **Cartões** (o navegador): o catálogo de hoje, com filtros novos por estado, baralho, sessão, idioma e etiqueta, e seleção em massa (suspender, mover para difíceis, excluir, exportar).
4. **Trazer e levar**: Anki `.apkg`, lista de palavras colada, CSV; exportar.
5. **Memória** (estatísticas só de cartões): previsão de 30 dias, retenção real contra a meta, calendário de revisões, botões usados, palavras por estado.

**Estados**:
- Vazio: três caminhos lado a lado: "Capturar uma sessão", "Trazer um baralho do Anki", "Começar pela Trilha".
- Primeiro uso com palavras: "Suas 34 palavras das sessões já são cartões. Comece por 10." Sem falar de algoritmo.
- Dia cumprido: "Tudo em dia. A próxima abre amanhã com 8." Oferece jogo com as mesmas palavras ou mais 5 novas; **não** oferece rever o baralho inteiro.
- Pilha acumulada (mais vencidas que o teto do dia): "Você tem 240 esperando. Hoje são 40, começando pelas que você mais tem chance de lembrar." Opções: "Espalhar pelos próximos 7 dias" e "Sem novas até zerar". Nenhum número em vermelho.

**Revisão melhorada, o que entra**:
- Limite diário de verdade, com contador por dia, guardado na conta.
- Quem erra revê na mesma sessão (um passo de 10 min, ou no fim da fila).
- **Tocar a fala original** da sessão no verso, além da voz sintética; a frase com a palavra destacada; o título e a capa da sessão; "Abrir na sessão" leva ao trecho.
- Enterrar até amanhã, marcar como difícil, info do cartão (histórico de notas).
- Aviso de sanguessuga aos 8 erros, com três saídas: editar, trocar a frase por outra ocorrência, suspender.
- Aviso quando a nota não foi gravada (sem rede), com nova tentativa.
- Modo simples de dois botões (Esqueci, Lembrei) como opção; quatro botões continuam para quem vem do Anki.
- Gestos no celular: tocar vira; deslizar para os lados dá nota; segurar abre as ações.
- Escolha do que estudar: o baralho, a sessão ou o idioma aparecem no topo da rodada.
- Tecla "?" com os atalhos.

**O que sai ou muda**: o rótulo "Novas por dia" só fica se for por dia; "Voltar ao Vocabulário" vira "Voltar aos Cartões"; a rodada do baralho inteiro quando nada vence vira "Estudo livre", escolha explícita e marcada como fora da agenda; XP por cartão dá lugar a XP pela sessão concluída [I: não premiar volume, F30].

**O que é "profissional"** (numa folha "Opções avançadas", fora do caminho de quem não quer): meta de retenção com a previsão de carga ao lado, limites diários, ordem, passos, limiar de sanguessuga, dias leves, "Otimizar para a minha memória" (automático, mensal, usando `review_logs`), importação com relatório do que veio e do que não veio, mapeador de campos, exportação `.apkg`.

**O que é "divertido" sem atrapalhar**: virada do cartão com a pele equipada; som curto na nota; barra da sessão; fecho com as palavras que mudaram de estado; "Jogar com as mesmas"; sequência com perdão; missões do dia ligadas à revisão. Nada disso aparece antes de a pessoa tentar lembrar.

**O que este app faz e o Anki não**:
- O cartão nasce da legenda: palavra, frase, **o áudio de quem falou** e a sessão de origem, sem a pessoa montar nada.
- Uma palavra vista em várias sessões tem várias frases; o cartão pode alternar a frase a cada revisão [I: exemplos variados].
- Virar jogo: qualquer baralho abre nos jogos, e os jogos que escrevem na memória contam como revisão.
- Um toque numa palavra da legenda, do intérprete ou da leitura cria o cartão.
- Imagem: hoje não existe no cartão. Viável: o quadro do vídeo no momento da fala (sessões de vídeo) ou a capa da sessão. Depende de decisão sobre armazenamento.

**Reaproveitado**: `Study.tsx` e `RevisaoDoQuest.tsx` (rodada, opções, desfazer, suspender, formatos), `CatalogoDePalavras`, `GavetaDaPalavra`, `BaralhoAnki` e `BaralhosAnki`, `ExportarVocabulario`, a previsão e o calendário de `Estatisticas.tsx`, `ResumoDaPratica`, as peles de cartão, `/api/vocab/*`, `/api/anki/*`, `review_logs`, `vocab_occurrences`.
**Novo**: a tela-casa, os baralhos automáticos com contagens, o recorte da revisão por baralho, sessão e idioma, o limite diário no servidor, reaparecer na sessão, enterrar, sanguessugas, a saída do atraso, o áudio original no cartão, os filtros novos e a seleção em massa, as estatísticas de retenção, os gestos, a otimização.

### 4.2 Onde ela mora

**Recomendada (A): conteúdo no trilho, acessório no "Mais".**
- Computador: Início, Capturar, Intérprete, **Biblioteca**, **Cartões**, Jogar; Buscar e Mais no pé.
- Vocabulário deixa de ser destino: vira a aba "Cartões" da tela nova (as três abas de análise vão para Estatísticas).
- Estatísticas desce para o "Mais" e continua a um toque pela linha de progresso do Início; a parte de memória mora na aba "Memória" dos Cartões.
- Personalizar desce para o "Mais" e ganha porta pelo chip de Seeds do Início.
- Celular, barra de cinco: Início, Capturar, **Cartões**, Jogar, Mais. O Intérprete vira o seletor "Legenda | Conversa" no alto do Capturar e mantém o ladrilho "Conversar" no Início.
- Porquê: são as coisas da pessoa que se abrem todo dia; estatística e aparência são visita ocasional.
- Custo: desfaz a ordem do protótipo de 08/10 e, no celular, tira do Intérprete a porta própria pedida em 30/09. **É decisão do dono.** A barra de cinco conta os botões pela posição (`TrilhoDoQuest.tsx:161-164`), então mexer na ordem pede cuidado no CSS.

**Alternativa B: "Praticar".** Um destino só com duas abas, Cartões e Jogos. Trilho: Início, Capturar, Intérprete, Biblioteca, Praticar, Estatísticas. No celular: Início, Capturar, Intérprete, Praticar, Mais. Mantém o Intérprete; em troca, os cartões ficam a dois toques e dividem a casa com os jogos.

**Alternativa C: mínima.** O trilho não muda. "Cartões" toma o lugar de "Vocabulário" no "Mais" e o Início ganha um ladrilho fixo "Cartões" (com o número do dia quando há, "Tudo em dia" quando não). Barata e reversível; não resolve Biblioteca nem o resto.

Em qualquer das três: **o ladrilho de revisão do Início deixa de ser condicional.**

### 4.3 A porta proposta para cada recurso escondido

| Recurso | Porta proposta |
|---|---|
| Revisão | Tela Cartões; ladrilho fixo no Início |
| Vocabulário | Aba "Cartões" da tela nova; a Busca abre a palavra, não a lista |
| Biblioteca | Trilho (A e B); botão "Importar" visível no cabeçalho |
| Importar (tudo) | Um "Importar" único, na Biblioteca e na Busca, com as fontes: link, arquivo, texto, Anki |
| Biblioteca completa | Os filtros finos viram "Filtros" na Biblioteca nova |
| Leitura, Transcrição, Jogos da sessão | Na linha da sessão, três atalhos: Ler, Ouvir, Jogar |
| Estudos & notas | Renomear para "Minhas anotações"; "Virar cartão" em cada anotação; guardar na conta |
| Desenho livre | Fica na Leitura; entra na Busca como ação |
| Exportar sessão e transcrição | Um "Exportar" só, na sessão e na linha da Biblioteca |
| iChat / tutor | Renomear para "Tutor"; item no "Mais"; "Perguntar ao tutor" na folha da palavra e no verso do cartão |
| Nuance | Demonstração na primeira fala; item em Ajuda |
| Glossário | Seção própria "Meu glossário" em Ajustes > Idiomas, com âncora; link na folha da palavra |
| Legendas flutuantes | Além do Capturar, ação na Busca |
| Conversa virtual | Rótulo "Conversa por chamada" (ou o que o dono preferir); item em Ajuda |
| Histórico do intérprete | Rótulo "Histórico"; conversas passadas na Biblioteca |
| Diagnóstico | Ajuda e suporte > "Diagnóstico do aparelho", em todo aparelho; achável na Busca |
| Temporada, Conquistas, Loja | Chip de Seeds e nível no Início abre a Temporada; conquistas de revisão aparecem no fecho da sessão |
| Recordes, Mapa do conteúdo, Curadoria | Sair de trás de "Opções": Recordes no cabeçalho do Jogar; Mapa e Curadoria na folha do baralho, em Cartões |
| Trilha | Baralho "Trilha" em Cartões |
| Praticar pronúncia | Botão no verso do cartão e na folha da palavra |
| Menu de prática | Os mesmos itens na folha da frase (toque), além do botão direito |
| Busca | Indexar Ajuda, Diagnóstico, Anki, exportar, abas de Personalizar, jogos, baralhos e ações ("Importar baralho", "Estudar difíceis") |
| Atalhos | Tecla "?" global, com a lista completa por tela |
| Modo desempenho, tema, som | Ficam; entram na Busca como ações |
| Idioma da interface | Chip do idioma no alto do "Mais" |
| Lembrete | "Lembrar quando houver revisão" em Cartões > Opções |
| Polir sessão, Editar a fala, player completo | Decisão do dono: voltar ou apagar o código |

### 4.4 Ordem de implementação, em fatias

1. **Protótipo** da tela Cartões (Hoje, Baralhos, estados) e da navegação escolhida. Aprovação do dono.
2. **Porta**: rota `/cartoes`, item de menu, ladrilho fixo no Início, voltar corrigido. Só reaproveita o que existe.
3. **Consertos de confiança na revisão**: limite diário de verdade e opções na conta; quem erra revê na sessão; aviso de nota não gravada; fim do "baralho inteiro" como padrão.
4. **Baralhos automáticos** com contagens e "Estudar este" (recorte por baralho, sessão e idioma, no servidor).
5. **Cartão com a fala original**: áudio da fala, frase destacada, "Abrir na sessão".
6. **Navegador**: filtros por estado, baralho, sessão, idioma; seleção em massa.
7. **Pilha acumulada**: teto do dia, espalhar, sem novas até zerar. Enterrar e sanguessugas.
8. **Memória**: retenção real, previsão de 30 dias, calendário de revisões, botões usados.
9. **Anki**: terminar o Mapeador; relatório do que veio e do que não veio; "Revisar este baralho".
10. **Celular**: gestos; modo de dois botões.
11. **Avançado**: otimização de parâmetros, dias leves, FSRS-6. Só com histórico suficiente.
12. **Descoberta do resto**: Busca ampliada, tecla "?", Importar único, renomeações, Diagnóstico em Ajuda.

### 4.5 Decisões que são do dono

- Navegação A, B ou C; no celular, o que sai da barra de cinco.
- Nome da tela.
- Imagem no cartão (quadro do vídeo): guardar ou não.
- Trazer o agendamento do Anki como opção (hoje é recusado de propósito).
- Dois botões ou quatro como padrão.
- O que fazer com Polir sessão, Editar a fala e o player completo.

---

## Fontes

Todas acessadas em 10/10/2026.

- F1 https://docs.ankiweb.net/deck-options.html
- F2 https://docs.ankiweb.net/studying.html
- F3 https://docs.ankiweb.net/leeches.html
- F3b https://docs.ankiweb.net/exporting.html
- F3c https://docs.ankiweb.net/filtered-decks.html
- F3d https://docs.ankiweb.net/stats.html
- F4 https://docs.ankiweb.net/browsing.html
- F5 https://raw.githubusercontent.com/open-spaced-repetition/fsrs4anki/main/docs/tutorial.md (defasado: fala em FSRS-4.5)
- F6 https://github.com/ankitects/anki/releases
- F7 https://newreleases.io/project/github/ankitects/anki/release/25.07 e https://newreleases.io/project/github/ankitects/anki/release/24.11
- F8 https://github.com/open-spaced-repetition/fsrs4anki-helper
- F9 https://docs.ankidroid.org/
- F10 https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge
- F11 https://www.jpdb.io/faq e https://www.jpdb.io/
- F12 https://jpdb.io/changelog
- F13 https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights e https://docs.readwise.io/readwise/guides/mastery
- F13b https://docs.readwise.io/readwise/guides/themed-reviews
- F14 https://migaku.com/faq/features e https://migaku.com/
- F15 https://www.nextlang.co/how-to/mochi-cards-best-practices (30/09/2026)
- F15b https://mochi.cards/
- F16 https://languavibe.com/mochi-vs-anki/ (29/08/2026)
- F17 https://www.neonlingo.com/blog/anki-burnout
- F18 https://migaku.com/blog/language-fun/flashcard-best-practices-language-learning (06/03/2026)
- F19 https://migaku.com/blog/youtube/how-to-grade-srs-flashcards-for-language-learners-the-migaku-bible-method
- F20 https://www.algoapp.ai/support/solutions/e6465ac1/can-i-use-my-existing-anki-apkg-decks-with-algoapp-/
- F21 https://www.studydaily.app/en/guides/does-importing-an-apkg-keep-your-scheduling (27/04/2026)
- F22 https://forums.ankiweb.net/t/the-apkgs-file-exported-from-anki-has-a-corrupted-binary-media-file/62359 (08/06/2025)
- F23 https://www.repetrax.com/blog/how-to-import-anki-deck-to-web (01/05/2026)
- F24 https://bmgator.org/33901/news/changes-to-quizlet-cause-frustration-among-students/ e https://baronnews.com/2022/10/20/quizlets-upgrade-isnt-an-upgrade-at-all/
- F25 https://en.wikipedia.org/wiki/Memrise e https://eurolinguiste.com/memrise-is-doing-away-with-user-generated-content-now-what/
- F26 https://www.mickmel.com/readwise-at-the-end/ (22/09/2023)
- F27 https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf
- F28 https://pubmed.ncbi.nlm.nih.gov/16719566/
- F29 https://www.gwern.net/docs/spaced-repetition/2007-kang.pdf
- F30 https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056
- F31 https://www.colorado.edu/business/news/2023/04/20/research-streaks-marketing-tech-barasch e https://www.psychologytoday.com/us/blog/ulterior-motives/202306/how-broken-streaks-sap-motivation
- F32 https://nflrc.hawaii.edu/rfl/item/178 e https://ejournals.ukm.my/gema/article/view/3876
- Fórum do Anki, lidos por resumo de busca: https://forums.ankiweb.net/t/i-raised-fsrs-desired-ret-and-reviews-shot-up-radically/55628 , https://forums.ankiweb.net/t/review-pacing-after-returning-to-anki/38931 , https://forums.ankiweb.net/t/restoring-number-of-reviews-to-previous-back-up/45566

## Incertezas

- Reddit não foi lido diretamente; a frequência das queixas é impressão, não medida.
- Telas e limites atuais de Quizlet, Memrise, Clozemaster, RemNote, LingQ e AnkiMobile: não confirmados.
- Versão do FSRS no Anki: FSRS-6 desde a 25.07 [R]; a 26.09 atualiza a biblioteca para 6.6.2 [C]. FSRS-7 não confirmado.
- Padrões 20 novas e 200 revisões do Anki, tipos de nota e offline: de memória.
- Efeito de sons e animação, duração ideal de sessão, ansiedade por sequência: sem estudo encontrado.
- Código: nada foi executado. Não conferi a entrega real do lembrete (push, e-mail), o que o servidor exige de plano para o tutor, nem se `distribuicao-dificuldade` tem tela. Os valores das flags são os de `docs/flags.md`, não os do banco de produção.
- A consequência de "nota não gravada sem rede" e de "alternativas de outro idioma" foi lida no código, não reproduzida.
