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
| Planos (4 planos, 10/10) | **Selo "Recomendado" fixo no Premium e o rótulo "Tradução Nuance"** | `Planos.tsx` | O recomendado agora é o do aparelho ("Recomendado aqui") |
| Planos (4 planos, 10/10) | Itens do Premium: "variantes e glossário" da Nuance, **"Tutor de IA (iChat) sobre o seu material"**, "Voz natural no modo intérprete (em breve)", "Nuvem sem limite no dia a dia" | `planos/dados.ts` (continua valendo em Assinado e Cancelar) | **Atenção:** o iChat continua no plano, só não é dito na tela. O "sem limite no dia a dia" deu lugar a "20 h de nuvem por mês · até 2 h por dia" |
| Planos (4 planos, 10/10) | Comparação: linhas "Tradução rápida ao vivo", "Tutor de IA (iChat)" e "Armazenamento" | `Planos.tsx` |  |
| Planos (4 planos, 10/10) | Seletor de período com "equivale a N meses grátis"; no anual, "à vista ou em 12x no cartão · economize R$ X" | `Planos.tsx` | Agora "até N% a menos" e "dá R$ X por mês · N% a menos". O 12x continua no checkout |
| Planos (4 planos, 10/10) | Perguntas "O Grátis tem limite?", "O que é \"uso justo\"?", "Qual a diferença entre mensal e anual?" e "Posso passar do mensal para o anual?" | `Planos.tsx` | O teto do dia passou para o item do cartão, o pé da tabela e o Consumo |
| Planos (4 planos, 10/10) | No cartão do próprio plano, "Mudar para o anual / para o mensal" | `Planos.tsx` | O cartão diz "Este é o seu plano"; a troca de ciclo está em Sua assinatura |
| Planos (4 planos, 10/10) | Sua assinatura de quem assina: cartão de resumo (Valor, Próxima cobrança, Pagamento, Assinante desde), a linha "Passar para o anual / para o mensal" e a faixa "Cancelar assinatura" | `planos/SuaAssinatura.tsx` | Viraram o cartão do protótipo. **"Assinante desde" e "Passar para o mensal" não aparecem mais.** Forma de pagamento, pausa, faturas e a faixa do pagamento que falhou CONTINUAM na aba (o protótipo não as mostra; são da cobrança) |
| Planos (4 planos, 10/10) | Consumo: "Chamadas à IA de nuvem", "Tokens de IA (tradução e tutor)" do mês e o aviso "Chamadas e tokens de IA de nuvem fazem parte do Premium" | `Planos.tsx` | Os medidores do mês agora são por nível (Precisão, Ao vivo). "Nuvem hoje" e "IA hoje" CONTINUAM, com a nota do uso justo (CDC) |
| Planos (4 planos, 10/10) | **Do protótipo, fora por decisão (design §11):** "Sincronização entre os seus aparelhos" (item do Essencial e linha da comparação) | `planos4.js:89, 582` | Decisão 9: o Grátis também guarda no servidor |
| Planos (4 planos, 10/10) | **Do protótipo, fora enquanto a flag `anuncios` estiver desligada:** "Com anúncios leves", "Sem anúncios", a linha "Anúncios", "amostra por anúncio", a pergunta "Por que o Grátis tem anúncio?", "Sem anúncios · Nuance", "tira os anúncios" | `planos4.js:79, 83-87, 575, 577, 589` | Decisão 13. Entram sozinhos quando a flag ligar. No lugar da amostra, o Grátis mostra a nuvem de alívio do aparelho fraco (decisão 8) |
| Planos (4 planos, 10/10) | **Do protótipo, frases do Quest ajustadas:** "Sem nuvem não há legenda nem intérprete aqui", "Não existe de graça neste aparelho", "no Quest não existe", "O Quest não deixa um site ouvir o som de outro aplicativo" | `planos4.js:61-66, 586-587` | O inglês roda no aparelho, e o Quest ouve o som do headset pelo compartilhamento de tela (`lib/dispositivo/perfil.ts`, medido em 01/10) |
| Planos (4 planos, 10/10) | **Do protótipo, sem dado no servidor:** "18 consultas neste mês" da Tradução Nuance; "Voltar ao Grátis agora" durante o teste | `planos4.js:639, 658` | O cartão diz só "Incluída"; o teste acaba sozinho (não há rota para encerrá-lo) |
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
| Sessão, Jogos | Lobby embutido (grupo "Pedem mais material", estrela, "?", portas) e os jogos fora dos 4 ladrilhos | `Analysis.tsx` + `Play` | Continuam na tela Jogar |
| Sessão, Leitura | Botão "Parar e voltar ao início", dica "Clique numa palavra…", ícones dos modos e do "Voz, idioma e tom", contagem do chip "Estudos & notas" | `Reading.tsx` | O botão principal continua pausando e retomando |
| Sons | Som do botão ativado pelo teclado | `sfxDelegate.ts` | Com a camada ligada vale a regra do protótipo: só o toque soa |
| Sons | Som de sucesso e de erro dos avisos | `Toast.tsx` | Dão lugar ao som de "aviso" do protótipo |

## Nível de serviço na Captura (protótipo `anuncios-no-gratis`, 10/10/2026)

Porte de `planos4.js:115-437` para `src/components/views/captura/niveis/`. Aqui a tabela é ao contrário
da de cima: o que o **protótipo mostra** e o app **ainda não tem** (pendente, não inventado), e o que
mudou de texto porque a folha só afirma o que o código faz.

| Peça | O que ficou pendente ou mudou | Por quê | O que destrava |
|---|---|---|---|
| Fileira do nível | **Chip "Precisão: ganhar 30 min · Anúncio"** (a amostra de nuvem por anúncio no Grátis). O lugar dele (`.pl-vaga`) fica vazio | A flag `anuncios` não existe | Anúncios no Grátis (`design.md` §11, itens 8 e 13) |
| Folha do cadeado | Bloco "Quer provar antes? Veja um anúncio…" (`.pl-amostra`) | Idem | Idem |
| Seletor | **"Ao vivo" funcionando.** Tem cadeado para todo plano, inclusive o que declara `sttAoVivo`; nesse caso a folha diz "ainda não está disponível" em vez de oferecer plano | O transporte em fluxo não existe no servidor (`design.md` §11, item 12) | Flag `stt_ao_vivo` e o transporte; trocar `TRANSPORTE_AO_VIVO_EXISTE` em `lib/captura/nivelDeServico.ts` |
| Seletor | Etiqueta "amostra" na Precisão do Grátis e a marca "amostra de hoje: 30 min" | Sem anúncios não há amostra | Anúncios no Grátis |
| Seletor | Nível "No aparelho" riscado no Quest ("não existe neste aparelho") | Decisão do dono: no Quest o inglês roda no aparelho | Nada: não vale para o app |
| Tela pronta | **Quest sem legenda** ("No Quest, a legenda precisa da nuvem", "Testar o Premium por 14 dias", "Legenda indisponível aqui") | Idem. A captura do Quest fica como está, só com o seletor e a marca (sem medidor e sem nota) | Nada: não vale para o app |
| Tela pronta | Nota "Este celular não tem tradutor embutido" com "Baixar · grátis" | Fora do pedido desta passada; o app já avisa do tradutor pelo preparo dos modelos | Uma passada própria |
| Marca | Textos "grátis · seu áudio não sai daqui", "Nuvem · Precisão · por trechos · nada fica guardado", "Recurso do aparelho", "Sem internet · no aparelho" | A marca usa o texto do selo da fala (`seloDaFala.ts`): "No aparelho", "Pelo navegador", "Nuvem do Babel" e a forma "Vai…" antes da primeira fala. "Nada fica guardado" não é afirmado: a retenção do provedor não foi conferida | Conferir a retenção zero na conta do provedor |
| Marca | Com as horas esgotadas o protótipo diz "No aparelho · as horas de nuvem acabaram". No app, antes da primeira fala, a marca continua dizendo o previsto ("Vai pela Nuvem do Babel"), em tom de alerta; o chip e a nota dizem que as horas acabaram | A rota de hoje tenta a nuvem primeiro e é o servidor que recusa; a política que desce sozinha por cota (`cota-do-mes`) está desligada e não recebe o restante | Ligar a política (`rota_inteligente`) com o restante por nível |
| Marca | Sem marca quando o provedor é a chave da própria pessoa e ainda não houve fala | O selo não afirma o que não sabe (`nuvemPorChavePropria`) | Nada |
| Como isto funciona | "Como o app escolhe sozinho": o protótipo diz "primeiro o que é grátis… nuvem só quando vale a pena" | Isso é a política nova. Hoje quem tem nuvem no plano vai à nuvem primeiro (`escolhaDeHoje`); a folha descreve o que acontece | Ligar a política |
| Como isto funciona | "O que é enviado": saíram "com a ordem de não guardar" e "nunca é usado para escolher anúncio" | Não conferido no código; ficou "o áudio vai para o nosso servidor" | Retenção conferida; anúncios |
| Como isto funciona | "Modelo baixado neste aparelho: 589 MB" virou a linha real do chip ("Modelo local · N MB") | O tamanho é o do modelo desta rota, e a folha não afirma que já foi baixado | Nada |
| Como isto funciona | **"Testar sem internet"** (spec `transparencia-da-fala`) | O protótipo não tem o botão; não foi inventado | Desenho do dono |
| Folha do cadeado | "No Quest é o único jeito de ter legenda e intérprete" virou "No Quest o inglês roda no aparelho. Vale para os outros idiomas e para áudio com barulho." | Decisão do dono sobre o Quest | Nada |
| Folha do cadeado | A porta "Ver o {plano}" só nomeia plano À VENDA; o plano e as horas vêm da matriz. A tela Planos só sabe destacar o Premium (`lib/ofertas/destaque.ts`) | Com a venda v3 fechada, só o Premium é vendido | Destaque por plano na tela Planos |
| Intérprete | A mesma marca na faixa do meio (`.pl-int-onde`) | Fora do pedido (o intérprete é de outra passada); o CSS continua adiado em `trazer-css.mjs` | Passada do intérprete |
| Ajustes › Processamento | Os três níveis como opções e o medidor do mês | Fora do pedido; CSS adiado | Passada dos Ajustes |

O que o app tem na Captura e o protótipo não mostra **continua onde estava** (nada foi tirado nesta
passada): o seletor "Qualidade" dos Ajustes da captura (Automática, Rápida, Precisa, Nuvem), que grava a
mesma preferência do seletor de nível; o aviso de nuvem sem consentimento; o aviso do uso do dia.

## Intérprete: a tela de entrada antiga e a conversa virtual no desenho novo (10/10/2026)

O botão "Virtual" da conversa levava à ÚLTIMA tela antiga do Intérprete (a página de entrada). Ela foi
apagada: "Virtual" abre a folha `interprete/FolhaDaConversaVirtual.tsx` por cima da conversa, e a conversa
virtual (`interprete/ConversaVirtual.tsx`) passou a desenhar com a tela da conversa nova
(`ConversaDoPrototipo`). O protótipo não desenha a conversa virtual: o que segue é o que a tela antiga
mostrava e a nova não mostra, ou mostra em outro lugar.

| Tela | O que saiu ou mudou de lugar | Onde estava | O que fazia / o que ficou no lugar |
|---|---|---|---|
| Intérprete, entrada | **A página inteira**: cabeçalho "Intérprete · Conversa frente a frente", o cartão escuro "Conversa" com os dois campos de idioma e o botão de inverter, "Começar conversa", o painel "Conversa virtual" e o cartão "Uma conversa, dois idiomas" com os três passos | `PaginaDoInterprete.tsx` (`PaginaDeEntrada`) | Era o preparo da conversa virtual. O Intérprete já abria direto na conversa; os idiomas se trocam pela seta de cada metade (o diálogo de idiomas, que tem o inverter) |
| Intérprete, entrada | As linhas "A tradução dos dois lados fica pronta no aparelho antes da primeira frase.", "Modo automático: o app reconhece sozinho… Dá para trocar para o toque na conversa." e "No Premium, o modo automático…" | Idem | O preparo aparece na faixa da conversa; o automático e o cadeado são o botão "Automático" da faixa |
| Conversa virtual | As pílulas "Eles · ouvindo o computador / Eles · desligado" e "Você · ouvindo / Você · silenciado", e a pílula "Compartilhar áudio" | `ConversaVirtual.tsx` (a faixa) | Viraram as duas colunas: a linha de estado e o botão grande de cada uma (o da outra pessoa, com o monitor, abre o seletor da aba ou tela; o seu liga e silencia o microfone). "Eles" passou a se chamar "A outra pessoa", como no resto da conversa nova (inclusive no Markdown exportado) |
| Conversa virtual | A nota fixa "De fone, o microfone não ouve o que toca no computador." no alto da lista | Idem | É a dica da sua coluna enquanto você ainda não falou; depois da primeira fala ela não aparece mais |
| Conversa virtual | A lista em bolhas como tela ÚNICA, com o que está sendo dito agora em cinza no fim dela | Idem | A tela abre nas duas colunas (o que está sendo dito agora aparece na coluna de quem fala); a lista é o botão "Conversa" da faixa. Ouvir, corrigir e guardar cada fala continuam na lista |
| Conversa virtual | "Exportar" só aparecia com falas | Idem | Fica sempre no alto da lista, como na conversa frente a frente; sem falas, não baixa nada |
| Conversa virtual | **Parar só o som do computador, ou trocar de aba no meio da conversa** | Não existia | Continua não existindo. Ouvindo, o botão grande da outra pessoa fica aceso e travado: parar é sair da conversa (o X) ou encerrar o compartilhamento no navegador. Não foi inventado um controle para isso |
| Conversa virtual | Trocar os idiomas no meio da conversa (a seta de cada metade) e os atalhos de teclado (1, 2, R, P, Esc) | Não existiam na virtual | Continuam não existindo na virtual: as setas e os atalhos são do frente a frente (o microfone por lado) |
| Conversa em curso | "Virtual" tocado numa conversa que já tem falas | `ModoInterprete.tsx` | A conversa virtual é outra sessão: o Encerrar de sempre abre primeiro (salvar ou descartar) e só então a folha. Sem falas, a folha abre na hora |

## Telas enxutas: Capturar e Jogar (10/10/2026)

Porte do protótipo `docs/prototipos/telas-enxutas.html` (`telas-enxutas-src/enxuto.js` e `enxuto.css`, por cima de
`planos4.js`). Vale no computador e no celular; **no headset as duas telas ficam como estavam** (decisão do dono
de 10/10/2026 sobre a captura no Quest, estendida ao Jogar: o pedido foi "computador e celular"). Nenhuma função
saiu: o que mudou de lugar está em `tests/capturaEnxuta.test.tsx`, `tests/lobbyEnxuto.test.tsx` e
`tests/e2e/telas-enxutas.e2e.ts`. O que segue é o que o protótipo mostra e o app faz diferente, ou não faz.

| Tela | O que o protótipo mostra | O que o app faz | Por quê |
|---|---|---|---|
| Capturar, chip de estado | "No aparelho · seu áudio não sai daqui" desde a tela pronta; "Recurso do aparelho · a fala passa pelo navegador" no celular; "Sem legenda"; "amostra de hoje: N min"; "as horas de nuvem acabaram" | O texto é o do **selo da fala** (`seloDaFala.ts`), como era o da marca: antes da primeira fala, "Vai rodar no aparelho · seu áudio não vai sair daqui"; depois, a etiqueta e o detalhe do motor que atendeu. Com as horas esgotadas, o chip fica no tom de alerta e quem diz é a nota da tela pronta | A regra de ouro do selo: nunca "no aparelho" se o áudio saiu, e nada afirmado antes de acontecer. A amostra por anúncio não existe (anúncios fora do escopo) |
| Capturar, chip gravando | "Legendando · no aparelho · inglês → português" | "Legendando" e **onde, pelo selo**: "no aparelho", "pelo navegador", "na nuvem (Precisão)", "no aparelho, depois de tentar a nuvem"; antes da primeira fala atendida, a forma prevista ("vai rodar no aparelho"). O par é o da tela ("detectar → português (BR)" com a detecção ligada; em siglas no celular) | O protótipo inventa o idioma e o lugar; o app diz o que está acontecendo de verdade |
| Capturar, chip sem selo | Não existe (o protótipo sempre tem um nível) | O chip diz "Como isto funciona" e continua abrindo a folha | Sem rota conhecida não há o que afirmar, mas a folha é a única porta do nível, do modelo e da ajuda |
| Capturar, folha | "Modelo local · 589 MB · **Já baixado**. Ver, **trocar** ou apagar o modelo." | "Modelo local · N MB · Ver o modelo, atualizar ou liberar espaço." | A folha não sabe se o modelo foi baixado (quem confere o cache, arquivo por arquivo, é o painel "Modelo no dispositivo"), e esse painel não troca de modelo: mostra o estado, procura atualização e libera espaço |
| Capturar, folha | "O **Grátis** não tem horas de nuvem… O Essencial tem 5 h por mês; o Premium, 20 h." | "O **seu plano** não tem horas de nuvem…", com as horas dos planos **à venda** (da matriz). Perfil protegido e edição estática: a nota não aparece | A tela conhece a capacidade do plano, não o nome dele; e não oferece plano onde não há oferta |
| Capturar, folha | A seta do fim das linhas | 16 px, como aparece no protótipo | A regra de 18 px de `enxuto.css:37` perde, no protótipo, para o tamanho escrito no próprio ícone (veio da captura de produção) |
| Capturar, ajuda | "Ajuda" abre o painel de ajuda do protótipo | Abre o "Guia rápido" de sempre, por cima do painel de ajustes ou depois de a folha fechar | É a ajuda que a captura já tinha |
| Capturar, A− e A+ | Aviso "Tamanho da legenda: 115%" e zoom livre de 85% a 130% | Os degraus de escala de sempre, sem aviso | O comportamento é o real do app (a preferência gravada) |
| Capturar, **Pausar** | Botão novo ao lado do Encerrar ("hoje a tela não tem pausa: é uma proposta") | **Portado, com a pausa de verdade.** A captura já sabia pausar e retomar as fontes: o Encerrar usava (`pausarFontes`/`retomarFontes` em `salvarSessao.ts`, `AudioCapture.setPaused` em `systemAudio.ts`). Pausada: o gravador pausa (o trecho não entra no áudio salvo), a detecção de fala para **entregando a frase em curso**, o reconhecedor do navegador é encerrado, o relógio para; retomar não pede de novo o compartilhamento nem o microfone, e o relógio das legendas pula a pausa | Não foi inventada função: é a mesma pausa, sem o diálogo |
| Capturar, Pausar | "nada está sendo ouvido" | O texto é o do protótipo. O app não processa nem grava nada na pausa, mas **as faixas continuam abertas**: o indicador de microfone ou de compartilhamento do NAVEGADOR segue aceso | Fechar as faixas obrigaria a pedir a permissão e o compartilhamento de novo ao retomar |
| Capturar, Pausar | Nada sobre abrir fontes na pausa | Pausada, **nenhuma fonte nova abre**: o microfone ligado no meio da pausa abre na retomada; o som do computador pedido na pausa avisa "A captura está pausada. Retome para abrir o som do computador." (`fontesDeAudio.ts`) | Uma fonte aberta no meio da pausa nasceria ouvindo, com a tela dizendo o contrário |
| Capturar, relógio | "00:00" em Inter 14 px | IBM Plex Mono 17 px (`.q-tempo` de `quest.css`) | **Já era assim antes desta passada** (o roteiro `capturar-pronta.json` mostra a mesma diferença). A regra é de várias telas; não foi mexida aqui. No celular gravando, o Encerrar fica 8 px mais estreito por causa disso |
| Capturar, celular | Com `&aparelho=celular`: a nota "Este celular não tem tradutor embutido" e "Baixar · grátis" | Não existe | Não é desta passada (já estava fora no porte dos níveis); a prova lado a lado usa o aparelho "computador" nas duas larguras |
| Jogar, sugestão | Três sugestões fixas, e "Outra sugestão" fecha o porquê | A sugestão é a real (`Play.tsx`), "Outra sugestão" gira entre os jogos prontos e o porquê **continua aberto**, com as razões do jogo novo | O dado é o do app; fechar o porquê a cada troca esconderia a razão que a pessoa pediu para ver |
| Jogar, sem sugestão | Não existe (o protótipo sempre tem cartão) | Sem jogo pronto não há cartão: "Sortear um jogo" fica sozinho abaixo do título (e avisa que não há jogo, como a Partida rápida avisava) | A função não pode sumir junto com o cartão |
| Jogar, avisos | Não desenha os avisos (acervo pequeno, sequência encerrada, diagnóstico do material) | Ficam entre as abas e a grade | É onde a ordem do código do protótipo os deixa (`cab.after(sug)`, `sug.after(trilha)`); com um aviso na tela as abas não ficam coladas na grade |
| Jogar, "Buscar e organizar" | Chip sem contador | O chip mostra quantos filtros estão ligados (no celular ele é só o ícone e o contador não aparece; a faixa "N jogos com este filtro" continua logo abaixo) | Dado do app: o chip "Buscar e filtrar" já mostrava |
| Jogar, "Sortear um jogo" | Dica "…(era a Partida rápida)" | A dica de sempre: "Sorteia um jogo aleatório dentre os disponíveis e inicia imediatamente" | O parêntese é comentário do protótipo |
| As duas telas | A chave "Telas: Atual \| Enxuta" da barra | Só em desenvolvimento: `localStorage['babel.px.telasDeProva'] = 'atual'` mostra a arrumação de antes (para a prova lado a lado e para a contagem de controles). Num build de produção a chave não é lida | A barra do protótipo não é app |

**O que o painel "O que mudou" do protótipo deixa "a decidir" e continua a decidir** (o app ficou como o
protótipo): trocar de nível passou de 1 para 2 toques; favoritar um jogo, de 2 para 3; a ajuda da captura, de 1
para 2; A− e A+ só depois do primeiro texto; no celular a grade do Jogar não sobe; em 1280 de largura o texto
pequeno da sugestão quebra em duas linhas.

## Cartões: fatias seguintes (protótipo `cartoes`, 10/10/2026)

A fatia 1 trouxe a tela `/cartoes`, a porta na navegação e as áreas que já têm dado real
(`openspec/changes/cartoes/`). A regra foi a de sempre: a aparência é a do protótipo; o que ele mostra e o app
ainda não faz de verdade **não aparece com número inventado**: fica aqui, com a fatia que o destrava
(`openspec/changes/cartoes/tasks.md`).

| Onde | O protótipo | O app | Por quê |
|---|---|---|---|
| Cabeçalho | Chip "Todos os idiomas" (estudar um idioma por vez) | Não existe | A revisão só aceita o recorte por sessão (`Study.tsx`); por idioma é a fatia 4 |
| Cabeçalho | "Ajustes" abre os "Ajustes da memória" (14 opções: passos, dias leves, otimizar…) | Abre as "Opções da revisão" que já existiam (seis opções, todas valendo) | As outras oito não têm comportamento no app (fatias 2 e 8) |
| Cabeçalho | "+ Palavra" abre um diálogo próprio | Abre o diálogo "Adicionar palavra" que já existia, na aba Palavras | É a função real; o diálogo precisa do baralho, que só a aba Palavras baixa |
| Abas | Contagem na aba Baralhos ("13") | Só a aba Palavras tem contagem | A lista de baralhos junta o resumo com a lista do Anki, lida ao abrir a aba |
| Hoje | "uns 6 min", "uns 2 min", "Leva uns 3 minutos" | Sem tempo estimado | A revisão não mede tempo por cartão; o app só diz tempo medido (`estimativaDeMinutos`). Fatia 3 |
| Hoje | Cartão "4 dias seguidos" com a semana e os congelamentos | Não existe | O servidor calcula a ofensiva com congelamento, mas não expõe o mapa por dia (qual dia foi estudado, qual o congelamento cobriu). Fatia 8 |
| Hoje | Cartão "Teto de hoje" ("5 de 10 novas", "12 de 100 revisões") e "Mudar o teto" | Não existe | Os dois limites valem por RODADA e ficam em `localStorage`: não há contador por dia. Fatia 2 |
| Hoje | Três cartões lado a lado; a previsão embaixo, na largura toda | A retenção da semana e, ao lado dela, a previsão (ocupa as duas colunas que sobraram) | Dos três cartões só um tem dado real; a regra do arranjo está em `styles/cartoesDoApp.css` e sai quando os outros dois entrarem |
| Hoje | "Só as difíceis · 2" | Não existe | A revisão não recorta por número de erros. Fatia 5 |
| Hoje, pilha | "Vamos de 40 **hoje**?", o teto com menos e mais, e "E o resto?" com quatro saídas (teto, espalhar, adiar, sem novas) | "Você tem N esperando. Vamos de R **agora**?", onde R é o tamanho real da rodada (os limites das Opções da revisão); sem as quatro saídas | Não há teto por dia nem reagendamento no servidor. Fatias 2 e 5 |
| Hoje, pilha | "começando pelas que você tem mais chance de lembrar" | "Começando pelas que venceram há mais tempo" | É a ordem real da rodada (`startReviewSession`: vencimento mais antigo primeiro) |
| Hoje, dia cumprido | "Você estudou 26 cartões **em 6 minutos**" | "Você estudou N cartões hoje." | Sem tempo medido |
| Hoje, dia cumprido | "Jogar com as mesmas", "Mais 5 novas", "Estudo livre" | "Jogar" (abre o Jogar, sem recorte) e "Mais N novas" só quando há palavra nunca vista guardada | O Jogar não recorta pelas palavras de hoje; o estudo livre "fora da agenda" não existe (toda nota grava no agendador). Fatias 2 e 3 |
| Hoje, primeiras palavras | "lembrei ou esqueci" | "errei, difícil, bom ou fácil" | Os quatro botões são o padrão (decisão do dono); dois botões é a fatia 3 |
| Hoje, vazio e primeiras | "704 palavras do A1…", "Ativar a Trilha" | "Começar pela Trilha" / "Jogar com a Trilha": abre o Jogar com a fonte Trilha; sem o número | A Trilha não tem ativação em lote: as palavras entram no caderno conforme se joga, e o total dela não está no cliente sem um pedido a mais |
| Hoje, vazio | "Também dá para colar uma lista…" | "Também dá para adicionar uma palavra de cada vez…" | Colar lista não existe (fatia 7) |
| Hoje | "com a frase **e a fala de quem disse**" | "com a frase de onde veio" | A fala original no cartão é a fatia 3 |
| Baralhos | "Revisar este" em todo baralho | Só em "Tudo" e nos de sessão; nos outros, o botão principal é "Jogar com este" | A revisão aceita o baralho inteiro e uma sessão. Fatia 4 |
| Baralhos | Grupo "Para cuidar" (Difíceis, Suspensas) | Não existe | O catálogo não filtra por estado; sanguessugas são a fatia 5 |
| Baralhos | Fatos "Retenção" e "Próxima" de cada baralho | Quatro fatos: Cartões, A revisar, Aprendendo, Novas hoje | O resumo não mede por baralho. Fatia 4 |
| Baralhos | "Ver cartões" em todo baralho | Só em "Tudo" (aba Palavras) e nos do Anki (a lista de notas que já existia) | O catálogo não filtra por sessão nem por idioma. Fatia 6 |
| Baralhos | "Gerenciar" abre opções do baralho (novas por dia, prioridade, Mapa, Curadoria); "Exportar" por baralho; "Mapear campos", "Desativar", "Apagar" | "Gerenciar" (só Anki) abre a tela de baralhos do Anki que já existia, onde se desativa e apaga; "Exportar" só em "Tudo" | Fatias 4 e 7 |
| Baralhos | "Ativar mais 20" na Trilha | Só nos baralhos do Anki | A Trilha não tem ativação em lote |
| Baralhos | "318 cartões · 4 sessões, a Trilha e 1 baralho do Anki" | "318 cartões" | O resumo não cruza idioma com origem |
| Baralhos | Baralho de idioma sempre | Só com dois idiomas ou mais | Com um idioma só, ele repetiria o "Tudo" |
| Palavras | Filtros por estado, baralho, sessão, idioma e etiqueta; "Selecionar" e a faixa de ações em massa; colunas "Origem" e "Volta" | O catálogo que já existia (busca, nível, origem, cinco ordenações), com as colunas dele | "Sem perder função" nesta fatia; o navegador novo é a fatia 6 |
| Palavras | Só o catálogo | As quatro abas do Vocabulário ("Minhas palavras", "Visão geral", "Inteligência lexical", "Desempenho & fluência") continuam, numa segunda fileira | O protótipo não mostra as três de análise; tirá-las apagaria telas que o dono usa. **A decidir** (a proposta manda para Estatísticas): fatia 6 |
| Palavras | — | O convite "Prontas para revisar" e os botões "Trazer do Anki" e "Exportar" do cabeçalho do Vocabulário saíram | Moram agora na aba Hoje e na aba Trazer e levar |
| Trazer | "lido neste aparelho · nada foi gravado ainda"; "Trazer as 480 e ativar 20"; "Cancelar" | "N notas lidas e guardadas no baralho… Nenhuma virou cartão ainda."; "Ativar N"; "Deixar para depois" | No app a leitura JÁ grava as notas (`POST /api/import/anki`); o que se decide depois é quantas ativar. Ler sem gravar é a fatia 7 |
| Trazer | Um seletor de destino por campo | O campo e o destino lidos, sem seletor | Mapear campos (`motor-anki-mapeador`) é a fatia 7 |
| Trazer | "12 etiquetas", "312 arquivos" de mídia | "As etiquetas", "Áudio e imagens", sem número | A rota não devolve essas contagens |
| Trazer | "Colar uma lista" e "Escolher um CSV" | Não existe (a área do Anki ocupa a linha) | Não há função de colar; o arquivo .txt/.csv/.tsv entra pela mesma área de soltar. Fatia 7 |
| Trazer | "O caminho mais curto: nasceu da legenda" (demonstração) e "Minhas anotações" | Não existe | É demonstração; as anotações da Leitura não viram cartão. Fatia 9 |
| Levar | "O que levar": Tudo, Um baralho, A seleção | Só "Tudo" (um selo com o total) | A exportação é do caderno inteiro (o diálogo ainda oferece "só as de revisar"). Fatia 4 |
| Levar | "Planilha: palavra, tradução, frase, sessão, estado e próxima revisão"; "Relatório… para imprimir" | "Palavra, tradução, frase e nível."; relatório em texto | São as colunas e o formato que `ExportarVocabulario` gera |
| Memória | Cinco números, com "Tempo: 4 min por dia · 7,2 s por cartão" | Quatro números | A revisão não mede tempo |
| Memória | "Sequência… 2 congelamentos"; legenda e célula de congelamento no calendário; "Congelamentos usados" | A sequência é a ofensiva do perfil (dias de prática) com o recorde; sem congelamentos | O mapa por dia não é exposto. Fatia 8 |
| Memória | "…e subindo. Não precisa mexer em nada" | "N pontos abaixo da meta nos 30 dias. A agenda já encurta os intervalos…" | A tendência não é calculada; a frase afirma só o que o FSRS faz |
| Memória | "Com o teto de 100 revisões por dia, nenhum desses dias passa…" | Não aparece | Não há teto por dia |
| Memória | "Ajustes da memória"; "Ver as 6 difíceis" | "Opções da revisão"; sem o botão das difíceis | Como no cabeçalho; o catálogo não filtra por estado |
| Memória | Jovens e maduras sem definição | "Jovem é o cartão em revisão com menos de 21 dias de estabilidade" | A divisão é derivada da estabilidade do FSRS (a régua de 21 dias do Anki), e a tela diz |
| Revisão | A rodada nova de `cartoes2.js` (fala original, lacuna, dois botões, rever o erro na sessão, gestos, combo, fim com "virar jogo") | A rodada que já existia, com o voltar para Cartões | Sem redesenho nesta fatia. Fatia 3 |
| Navegação | "Praticar" com contagens ("Cartões 26", "Jogos 18") | As duas abas, sem contagem | A tela Jogar não tem o número do dia sem um pedido a mais. Fatia 9 |
| Navegação | No "Mais": "Tutor" e o chip do idioma da interface | Não existem | São do "Mapa das portas". Fatia 9 |
| Navegação, celular | Variante A tira o Intérprete da barra e põe "Legenda \| Conversa" no Capturar | Não: a barra é Início, Praticar, Capturar, Intérprete, Mais | Decisão do dono: o Intérprete não sai da barra |
| Início | "18 a rever, 3 aprendendo e 5 novas. Uns 6 min."; "A próxima revisão abre amanhã com 8."; "40 hoje, 240 esperando" | "As que estão para sair da memória hoje."; "Nada vence agora."; o total que vence | O ladrilho usa o perfil que o App já carregou (nenhum pedido a mais), e ele não traz a divisão nem a próxima data |
| Início | O chip de Seeds abre a Temporada | Não mudou | "Mapa das portas". Fatia 9 |
| Outras telas | As portas plantadas na Biblioteca, na Sessão, no Intérprete e na Ajuda; "Importar" único; "Exportar" único; tecla "?"; a busca ampliada | Não mudaram | "Mapa das portas". Fatia 9 |

**O que saiu das telas antigas com esta fatia:**

- **Trilho**: Estatísticas e Personalizar saíram do trilho (estão no "Mais"); o item Vocabulário deixou de existir
  (é a aba Palavras de Cartões).
- **Início**: o ladrilho "Revisar N palavras", que tomava o lugar do "Conversar" quando havia palavra vencendo, deu
  lugar ao ladrilho fixo dos Cartões; o Início passou a ter quatro caminhos.
- **Sessão (Análise)**: a revisão deixou de ser montada dentro da sessão (`modoRevisao`). Quem pede "revisar as
  palavras desta sessão" abre `/cartoes/estudar/<id>`.
- **Vocabulário**: a tela própria (`/vocabulario`) deixou de existir; o cabeçalho dela e o convite da revisão não
  aparecem no modo embutido.

**Comportamento que mudou de propósito** (era defeito): "Revisar agora" sem sessão escolhida revisava só as
palavras da gravação mais recente, e sem gravação nenhuma abria "Nenhuma sessão ainda". Agora revisa o baralho
inteiro, com ou sem gravação.
