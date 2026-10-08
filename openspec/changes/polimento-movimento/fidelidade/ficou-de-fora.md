# O que o desenho antigo tinha e o protótipo não mostra

Regra do dono (08/10/2026): o protótipo manda na tela. O que existe na versão antiga e não aparece no
protótipo **não é portado**; fica anotado aqui, para ele decidir depois o que volta. O que não se vê
(gravação, nota de revisão, atalhos de teclado) continua funcionando por baixo.

| Tela | O que ficou de fora | Onde estava | O que fazia |
|---|---|---|---|
| Menu lateral | Biblioteca e Vocabulário a um toque | `TrilhoDoQuest.tsx` (`NO_TRILHO`, pedido de 02/10) | Abriam direto; agora estão no painel "Mais" |
| Início | Selo "N dias seguidos" no alto | `InicioDoQuest.tsx` | Mostrava a ofensiva; a frase continua na linha do progresso |
| Início | Cartão "Vocabulário" como segundo caminho | `InicioDoQuest.tsx` | Levava ao Vocabulário quando não havia nada para revisar; agora é "Conversar" |
| Jogos | Botão "Pausar" na tela | `casca/CascaDaRodada.tsx` | Pausava a rodada; a pausa continua por Esc e P |
| Jogos | Passo a passo guiado da primeira partida | `TourGuiado.tsx` | Apontava as peças uma a uma; deu lugar à explicação em três telas |
| Jogos | Contagem 3-2-1 antes da rodada (menos no Duelo) | `casca/CascaDaRodada.tsx` | Preparava a largada |
| Rali | Aceitar sinônimo como resposta | `TenseTennisGame.tsx` | Valia outra palavra de mesmo sentido |
| Fim de rodada | Raspadinha e "Revelar a recompensa" | `ResultadoDaRodada.tsx` (ramo `qj-fim`) | Revelava a recompensa da rodada |
| Fim de rodada | "+N Seeds" da rodada | idem | Mostrava as Seeds ganhas (continuam sendo creditadas) |
| Fim de rodada | Recorde ("Novo recorde", "faltam N pts") | idem | Comparava com o seu melhor |
| Fim de rodada | Barra de maestria | idem | Mostrava o avanço da maestria do jogo (continua sendo gravada) |
| Fim de rodada | Precisão em % e o título "N de M" | idem | Resumo numérico |
| Fim de rodada | Missões do dia e ofensiva (`ResumoDaPratica`) | idem | Mostrava o que a rodada fez pelas missões |
| Fim de rodada | "N rodadas seguidas · multiplicador ×N" e "Trocar mantendo o combo" | idem | Combo entre rodadas, com gasto de Seeds |
| Fim de rodada | "Próxima recompensa … Ver recompensas" | idem | Atalho para as recompensas |
| Fim de rodada | Faixa de ranking (`EnvioAoRanking`) | idem | Enviava a pontuação ao ranking |
| Fim de rodada | "Ver o que escapou" e "Refazer só as erradas" | idem | Tabela de erros e acertos, e nova rodada só com os erros |
| Fim de rodada | "De novo, pelas 3 estrelas" | idem | Repetia as mesmas palavras |
| Fim de rodada | Som, rajada e tranco por estrela; pontos subindo | idem | Comemoração da contagem |
| Rodada | Contorno de socorro nas ajudas | `HudDaRodada.tsx` (`data-socorro`) | Trocado pelo pulso "quer uma ajuda?" |
| Rodada | "+N" e nome dos eventos raros da camada do app | `[data-flutuante]` | Ficam escondidos durante a partida (o protótipo tem o próprio "+N") |
| Intérprete | Histórico dentro de cada metade | `ModoInterprete.tsx` (`ListaDaMetade`) | Falas anteriores, "Ver N mais antigas", "Ir ao fim"; agora só na lista |
| Intérprete | Tocar palavra ou frase para ouvir, corrigir a fala e guardar | `TextoTocavel`, `FolhaDeEdicao` | Edição e estudo dentro da conversa |
| Intérprete | Botões de falar dentro da lista; lembrar a tela "Conversa" | `int-conversa-acoes`, `babel.interprete.tela` | Falar sem sair da lista |
| Intérprete | Teclas visíveis nos botões | `kbd` | Os atalhos 1/2/R/P/Esc continuam valendo |
| Intérprete | Ícones de estado no botão grande | `ModoInterprete.tsx` | Quadrado ao ouvir, espera ao abrir, ondas no automático |
| Intérprete | Aviso do cadeado que sumia em 7 s | idem | Agora o aviso fica |
| Intérprete | Tela de entrada (título, três passos, "Começar conversa") | `PaginaDoInterprete.tsx` | O protótipo abre direto na conversa |
| Intérprete | Cartão da nuvem no headset | `NuvemDoQuest` | **Atenção:** era por ele que se ligava a nuvem nesta tela no Quest |
| Intérprete | Linha "A tradução dos dois lados fica pronta no aparelho…" | `PaginaDoInterprete.tsx` | Explicava o modo no aparelho |
| Capturar | Cabeçalho "Capturar" com subtítulo e botão "Intérprete" | `LiveCapture.tsx` (`CabecalhoDeTela`) | Título e atalho; o Intérprete segue no menu |
| Capturar | Cartão "Espaço de gravação" com "Foco cheio" | `LiveCapture.tsx` (`.estudio`) | Abria a conversa em tela cheia |
| Capturar | Chip do par de idiomas com bandeiras | `LiveCapture.tsx` | Agora é o chip do topo |
| Capturar | Cartão "Falantes" | `LiveCapture.tsx` | Identificava e renomeava quem fala |
| Capturar | Conversa em balões com palavra clicável no texto | `ChatTranscript` | Tocar a palavra direto na fala; agora é pela folha da frase |
| Capturar | Coluna "Analista de Vocabulário" | `VocabularyPanel` | Verbete, exemplos, mandar praticar |
| Capturar | Painel redimensionável da transcrição | `EditablePanel` | Ajustava a altura |
| Capturar | Ondas do nível do som ao lado do relógio | `OndasDoNivel` | Mostrava som entrando |
| Capturar | "Você" / "Som do headset" em cada fala | `LegendaAoVivoDoQuest` | Dizia de quem era a fala com duas fontes |
| Capturar | Escolha da fonte na tela pronta do headset | `CapturaNoCelular` (`cel-fonte`) | Som do headset, microfone ou os dois; vale o que estava guardado |
| Capturar | "Como começar" em três passos, link Diagnóstico, "Abrir a sessão salva" | `CapturaNoCelular` | Onboarding e atalhos |
| Capturar | Folha da palavra: Devagar/Normal, definição, frase de exemplo, "Sempre traduzir assim" | `FolhaDaPalavra` | Velocidade da voz, verbete, glossário pessoal |
| Capturar | Flutuantes dentro da página: aparência, travar, recolher, ritmo, histórico, cartão da palavra | `LegendasFlutuantes` | Continuam na janela por cima de tudo do Chrome e do Edge |
| Capturar | Arrastar a pega para fechar a folha | `FolhaDeBaixo` | Fecha por toque fora e Esc |
