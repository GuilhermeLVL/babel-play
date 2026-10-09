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
| Memória | Pele de cartão na carta virada, marca de erro, "Quase!", fala ao virar, 3 colunas adaptáveis | `MemoryGame.tsx` | Agora a palavra só é falada ao fechar o par |
| Caça-palavras | Ajudas por pista (raspar, dica de direção, revelar), "destacar letras", setas e Enter na grade | `WordSearchGame.tsx` | O traço por dois toques continua, sem nada na tela |
| Duelo | Anel, selo grande de combo, ondas, cartaz de marco ("N seguidas!"), "rápido +N", contador sob a pergunta | `BlitzGame.tsx` | Enfeites e marcos da sequência |
| Soletrar | Escada de 4 tabuleiros (agora 1 e depois 2; só as 3 primeiras palavras), sinônimo e "quase", cursor por casa, "letras certas", frase de contexto, teclado lado a lado do Quest | `TermoGame.tsx` | Modo mais longo e tolerâncias |
| Frase embaralhada | "Limpar a linha" (virou "Recomeçar"), veredito escrito do Quest, fala de cada palavra ao tocar | `ScrambleGame.tsx` |  |
| Choseong | Aviso "O tempo acabou. Era:", veredito escrito do Quest, tempos por perfil de idade | `ChoseongGame.tsx` | Agora as vogais aparecem em amarelo; tempo só por nível |
| Tabu | Rótulo "Frase", aviso "Não era essa. Era: X", pausa de 1800 ms no erro, segundos por perfil de idade | `TabooGame.tsx` |  |
| Escuta | Rótulo "tocando…", veredito escrito, linha de apoio sob o botão | `EscutaGame.tsx` |  |
| Ditado | "Conferir" desabilitado com campo vazio, aviso "N de T palavras no lugar", veredito escrito, dica sem limite, texto inteiro no campo na segunda chance | `DitadoGame.tsx` | A dica agora é 4/3/2 por nível |
| Caça-conectores | Veredito escrito, frase de instrução própria com ícone | `ConectoresGame.tsx` |  |
| Karaokê | Botão "Parar", "(ouvimos x)" por palavra, tartaruga no "devagar", rótulos por perfil, "· gravando" no placar | `KaraokeGame.tsx` | Clicar "Falar agora" durante a gravação a encerra |
| Jogos (todos) | Rótulo do placar "Fala 2 de 5" | `HudDaRodada.tsx` | Agora "1 de 5 falas", como no protótipo |
| Mala | Selo "Mala aberta / fechada", aviso "Acabaram as vidas. Nesta posição estava: X", paleta reembaralhada a cada nível, vidas e tempo por perfil de idade | `KofferGame.tsx` | Sem vidas a rodada acaba em 900 ms sem dizer a palavra |
| Karuta | Pista escondida com "Ler a pista" como dica paga, mesa nova a cada carta, aviso "O tempo acabou. Era: X", segundos por perfil | `KarutaGame.tsx` | A pista agora está sempre escrita; joga só as cartas da mesa |
| Bao | Palavra inteira mostrada e falada ao perder, alvo maior para criança e sênior | `BaoGame.tsx` | Agora só o aviso "A palavra era X." |
| Vitendawili | Narração em duas falas com silêncio na lacuna | `VitendawiliGame.tsx` | Agora uma fala só; no acerto fala a frase inteira |
| Shiritori | Botão "Ouvir a palavra" na ponta, aviso "O tempo acabou. O elo era: X" | `ShiritoriGame.tsx` |  |
| Cadavre | "Trocar" a palavra por uma de reserva, ouvir cada palavra, painel "A sua frase", ícones de usada e não usada | `CadavreExquisGame.tsx` |  |
| Planos | **Seletor Mensal / Anual**, "equivale a N meses grátis", preço riscado com "economize R$ X" | `Planos.tsx` | **Atenção, é venda:** o cartão agora é sempre o mensal |
| Planos | **As 8 perguntas frequentes auditadas** (CDC art. 49, menores de 18, detalhes do cancelamento, mensal × anual) | `Planos.tsx` | **Atenção, é texto legal:** ficaram as 4 do protótipo, que a especificação chama de rascunho |
| Planos | Faixa da conta no alto, parágrafo de apresentação, sobrancelha "Assinatura" | `Planos.tsx` (`FaixaDaConta`) | Para quem assina continua dentro de "Sua assinatura" |
| Planos | Ícone do plano, selo e contorno "Sugerido para você", rolagem até o cartão sugerido | `Planos.tsx` | Vinha da oferta |
| Planos | Itens do Grátis: "o que você fala não sai dele", tamanho dos modelos, espaço para sessões | `Planos.tsx` |  |
| Planos | Botões "Volta sozinho no fim do teste" e "Voltar ao Grátis"; aviso "o Premium vale até {data}" | `Planos.tsx` | Cancelar continua em "Sua assinatura" |
| Planos | Comparação: grupos, preço no cabeçalho, linha "Sua própria chave de IA (BYOK)" | `Planos.tsx` | A nota do uso justo virou asterisco e rodapé |
| Planos | Consumo: ícones, seção "Hoje", cartão da janela do mês, frase "o uso do dia zera à meia-noite" | `Planos.tsx` |  |
| Oferta | Selo abaixo do texto e o rótulo "Dispensar aviso" | `CartaoDeOfertaDoQuest.tsx` | Virou "Fechar" |
| Personalizar | Inventário por seção na própria tela (Efeitos, Legendas, Cartões, Efeitos de jogo, Moldura e título, Capacidades, Perfis, Acessibilidade) | `Personalizar.tsx`, `Inventario.tsx` | **Continua funcionando**: abre numa folha ao tocar nas linhas Tema, Partículas, Fonte e Menu da Coleção |
| Personalizar | Moldura e título de perfil no cabeçalho | `CascaDePersonalizarNoQuest` | Continuam equipáveis na folha, mas não aparecem no alto |
| Personalizar | Legenda e cartão de exemplo com a pele real; faixa "Prévia do tema… Parar prévia"; descrição de cada tema | `PainelDePrevia.tsx` | A vitrine agora é o exemplo fixo do protótipo |
| Temporada | Pílulas de Seeds e Créditos, miniatura do item em cada casa, selo de canto, paginação por trecho | `PasseDeTemporada.tsx` | Agora é uma trilha só, que rola |
| Loja | Carteira e prateleira de Créditos na tela | `VitrineV2.tsx`, `ComprarCreditos.tsx` | **Continua funcionando**: abre numa folha ao tocar no selo de Seeds do cabeçalho |
| Loja | "Em destaque", prateleiras "Dá para levar agora / Ainda não", "Ver todas as regras", rodapé sobre as Seeds | `Loja.tsx` (clássica) |  |
| Conquistas | Partes "Como ganhar" e "Como subir" dos Desafios | `Loja.tsx` (clássica) |  |
| Biblioteca | Chip "Tela completa" | `BibliotecaDoQuest.tsx` | Abria a Biblioteca de sempre, com capas, filtros finos e a fila de importação; hoje só "Importar" abre essa tela |
| Biblioteca | Ícones por tipo, alfinete na linha fixada, ícones nos botões, lupa no "Nenhum resultado" | `BibliotecaDoQuest.tsx` |  |
| Sessão | Diálogo "Trocar de sessão" | `SessaoDoQuest.tsx` | O chip agora volta à Biblioteca |
| Sessão | Aviso "IA de nuvem não autorizada" acima das abas | `AvisoDeNuvemSemConsentimento` | Era a entrada para autorizar a nuvem nesta tela; continua em Ajustes |
| Sessão | Painel "Polir a tradução da sessão" | `PolirSessao.tsx` | A fala que já tem tradução polida passa a mostrá-la sempre, com o selo "Polida" |
| Sessão | **"Editar a fala"** (corrigir o que foi transcrito), "Ouvir a partir daqui", "Praticar a pronúncia" | `TranscricaoDoQuest.tsx` (diálogo "Opções da fala") | **Atenção:** não há mais como corrigir uma fala no desenho novo |
| Sessão | Palavra clicável direto no texto; folha da palavra com imagem, velocidades e "Praticar" | `VocabularyPanel` | Agora é pela folha da frase e pela folha da palavra do protótipo |
| Sessão | **Player: barra de posição arrastável, relógio, velocidades 0,75× / 1× / 1,25×, Smart Slow-Mo, Loop, Reiniciar** | `PlayerInterativo.tsx` | **Atenção:** o player do protótipo só tem ouvir, fala anterior e próxima fala |
| Sessão | Faixa "Revisar as palavras desta sessão" | `Analysis.tsx` (aba Jogos) |  |
| Sessão | Visão geral: ladrilhos de leitura, densidade, palavras únicas, ppm, riqueza; ocorrências que tocavam o trecho | `VisaoGeralDoQuest.tsx` | Vícios e pausas continuam em Fluência |
