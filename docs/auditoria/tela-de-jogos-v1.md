# Auditoria da tela de jogos — v1

Documento para **decidir o redesenho**, não para elogiar o que existe. Levantado em 2026-09-01 sobre
a tela `Praticar / Jogar` rodando em `localhost:3000/jogar`.

**48 achados confirmados de 49 propostos.** Cada achado foi produzido por uma de sete lentes
independentes e depois submetido a um cético que tentou refutá-lo abrindo os arquivos citados. O
achado que caiu está registrado no fim, com o motivo — auditoria que não mostra o que errou não
merece crédito no que acertou.

## O que foi medido

Números colhidos na tela rodando, não estimados:

| Medida | Valor |
|---|---|
| Palavras de texto no lobby | 317 |
| Botões interativos | 57 |
| Jogos | 9 |
| Botões que existem só para reordenar cartas | **27 (47% do total)** |
| Palavras antes do título "Escolha um jogo" | 90 |
| Bandas de conteúdo antes da primeira carta | 10 |
| Telas cheias entre abrir "Jogar" e ver o primeiro item | 3 (2 no caso mínimo) |
| Linhas de `Play.tsx` | 2.611 |
| Idiomas que o app oferece | 32 |
| Idiomas com trilha | **1** |

## O achado que resume os outros

A tela de jogos é a **menos gamificada** de um app em formato de jogo. A tela vizinha
`Personalizar / Loja` já tem temporada nomeada, crachá de etapa, barra de nível, abas com contagem,
trilho de categorias, grade densa de miniaturas com borda por raridade, painel de detalhe e 14
conquistas com recompensa exclusiva. A tela de **jogos** tem uma pílula pequena com ETAPA/XP/dias/seeds
e nove cartas cinzas.

O vocabulário visual que falta não precisa ser inventado: **ele já existe no próprio app, ao lado,
e já foi validado.**

## Como ler os achados

`🔴 alta` — quebra uma promessa, esconde a ação principal, ou impede um idioma inteiro.
`🟡 media` — custa atenção, clareza ou alcance, sem quebrar nada.
`⚪ baixa` — melhoria real, sem urgência.

A numeração `F01…F49` é estável e é usada pelo plano e pela proposta OpenSpec para referenciar
achados sem repetir texto.

---

## Jornada — os primeiros 10 segundos

_Quanto tempo e quantas decisões entre abrir a tela e estar jogando._

### 🔴 F01 — Tres telas cheias entre abrir "Jogar" e ver o primeiro item

**Evidência.** Cadeia verificada no codigo: (1) modal de recompensa, App.tsx:879-884 + RecompensaDesbloqueada.tsx:51 (fila[0], uma por vez) — 2 medidos na sessao; (2) SalaDeEscolha aberta sozinha, Play.tsx:227 useState(!embutido), montada em Play.tsx:1910 e ate sobre o esqueleto em Play.tsx:1929; (3) lobby, 1 clique na carta ou em "Sua proxima rodada" (Play.tsx:2302); (4) AntessalaDaRodada, tela cheia inteira (AntessalaDaRodada.tsx:352-737), ligada por padrao — pularAntessala() le localStorage e devolve false quando nao existe (Play.tsx:148-151), e pedirParaJogar so pula com pularSempre (Play.tsx:659-660); (5) tour da primeira vez de cada jogo (Play.tsx:664). Minimo sem recompensa pendente: 3 cliques em 3 superficies. Caso medido: 5 cliques em 4 superficies.

**Consequência.** Quem abre a tela com 30 segundos livres gasta os 30 segundos decidindo, fechando e confirmando, e sai sem ter jogado. O custo e pago TODA entrada, nao so na primeira: a sala remonta a cada visita a aba e a antessala volta em toda rodada de quem nao achou o checkbox.

**Proposta.** Definir um caminho de zero decisao: entrar na tela ja com a fonte guardada aplicada (ela ja e persistida em Play.tsx:1136-1143) e um botao grande "Jogar agora" que vai direto do lobby para a partida, sem sala e sem antessala. A sala vira o botao "trocar" que ja existe (Play.tsx:2054) e a antessala vira o icone de lista que ja existe na carta (Play.tsx:2481-2491). Meta declarada: 1 clique do lobby ate o primeiro item.

**Risco da mudança.** Perde-se a chance de corrigir um recorte vazio ANTES de ver nove cartas cinzas, que e o problema que a sala foi criada para resolver (SalaDeEscolha.tsx:12-24). Mitiga-se mantendo a sala automatica apenas quando a escolha guardada nao rende nenhuma rodada.

### 🔴 F02 — O botao "Jogar" da Sala de Escolha nao joga

**Evidência.** SalaDeEscolha.tsx:364-367 renderiza o botao primario com <IconePlay> e o rotulo "Jogar" (ou "Bora!" em kids); ele chama confirmar() em SalaDeEscolha.tsx:146-148, que so emite aoConfirmar(escolha). Em Play.tsx:1919-1922 esse callback faz setSalaAberta(false) + aplicarEscolha(escolha), e aplicarEscolha (Play.tsx:1136-1143) apenas troca idioma, seta a fonte e grava no localStorage — nao chama pedirParaJogar nem comecar em lugar nenhum.

**Consequência.** A pessoa aperta um botao com icone de play, esperando comecar, e cai num lobby de 317 palavras e 57 botoes com nove cartas para escolher. E a quebra de promessa que mais custa nos primeiros 10 segundos: o unico affordance forte da tela entrega o oposto do que anuncia.

**Proposta.** Ou o botao passa a montar e comecar a rodada do primeiro jogo jogavel (proximaRodada ja existe, Play.tsx:1572-1576) — virando de fato "Jogar" —, ou o rotulo e o icone mudam para o que ele faz ("Usar estas palavras", sem icone de play). A primeira opcao e a que corta uma tela do funil.

**Risco da mudança.** Fazer a sala comecar a rodada tira do usuario a chance de escolher OUTRO jogo antes da primeira partida; e preciso que o lobby continue alcancavel em um clique de volta, e que o jogo escolhido automaticamente seja o da ordem declarada pela pessoa, nao uma recomendacao nova.

### 🔴 F03 — A sala pede a decisao antes de existir a informacao que a fundamenta

**Evidência.** Play.tsx:1898-1910 monta a sala FORA da cascata de carregamento e Play.tsx:1926-1935 a renderiza por cima do esqueleto, com deck === null. O proprio componente documenta que "cresce tres vezes enquanto os dados chegam" (SalaDeEscolha.tsx:151-155) e reserva altura para chips e lista que ainda nao vieram (SalaDeEscolha.tsx:193-195 e 296-299); ha ate um efeito para consertar o idioma que chega depois (SalaDeEscolha.tsx:83-98). Sao seis grupos de controle, numero declarado no proprio arquivo (SalaDeEscolha.tsx:122-126). E ela abre mesmo quando a resposta ja esta guardada: Play.tsx:227 nao consulta a fonte persistida por Play.tsx:1139.

**Consequência.** O primeiro contato com a tela e um formulario de idioma/fonte/escopo cujos numeros comecam em zero e mudam sob os olhos de quem le. Quem ainda nao sabe o que quer jogar e obrigado a responder "o que voce vai praticar" antes de ver um unico jogo; quem ja respondeu ontem responde de novo hoje.

**Proposta.** Nao abrir a sala quando existe fonte guardada valida e com material — aplicar em silencio e mostrar so o recibo "Praticando X / trocar" que ja esta em Play.tsx:2054. Abrir automaticamente apenas na primeira vez ou quando o recorte guardado nao rende rodada. Se abrir, esperar o deck para nao pedir escolha sobre contagens zeradas.

**Risco da mudança.** Aplicar em silencio pode deixar a pessoa jogando na fonte errada sem perceber (foi a queixa historica de "mistura tudo", citada em Play.tsx:2022-2025). O recibo precisa ficar visivelmente acima da grade, e nao recolhido.

### 🔴 F04 — A comemoracao cobre a decisao: fila de "Subiu de nivel" em cima da sala

**Evidência.** RecompensaDesbloqueada.tsx:83 usa z-[60] em portal no body; SalaDeEscolha.tsx:157 usa z-[45]. O modal so adia quando ha rodada EM CURSO (RecompensaDesbloqueada.tsx:37-39 e 56-63, evento babel:rodada-fechou), nunca por causa da sala. App.tsx:486-490 empurra UMA entrada por nivel subido e RecompensaDesbloqueada.tsx:51 mostra fila[0] — dois niveis viram dois modais em sequencia (2 observados). Nao ha listener de Escape nem fechamento por clique no fundo: as unicas saidas sao os tres botoes de RecompensaDesbloqueada.tsx:101 e 139-142.

**Consequência.** Nos primeiros segundos a pessoa recebe uma festa modal que ela nao pediu, precisa fecha-la duas vezes com clique preciso (Esc nao funciona), e so entao descobre que havia outra caixa embaixo perguntando o que ela vai praticar. Duas camadas bloqueantes disputando a mesma atencao logo na entrada.

**Proposta.** Dar a mesma cortesia que a rodada ja tem: o modal de recompensa espera tambem enquanto a sala estiver aberta (ou enquanto a view acabou de montar), e a fila vira UM modal com N niveis dentro em vez de N modais. Acrescentar Escape e clique no fundo para fechar.

**Risco da mudança.** Adiar a recompensa reduz o impacto da celebracao, que e justamente o unico momento em que a app comemora com forca (App.tsx:495-501). Agrupar niveis num modal so pode diluir a sensacao de "subi duas vezes".

### 🔴 F05 — A acao mais valiosa da tela esta escondida atras do interruptor de contabilidade

**Evidência.** O card "N palavras pedindo revisao" (que dispara pedirParaJogar({id:'blitz'}) em um clique) so renderiza com detalhes && vencidos > 0 — Play.tsx:2251-2254. E detalhes nasce falso: Play.tsx:237 le localStorage 'babel.play.detalhes' e cai em false. O interruptor que o revela se chama "Ver os numeros do baralho (N palavras)" (Play.tsx:2091). Na sessao medida ele estava ligado, e por isso o card de 442 palavras apareceu — junto de toda a contabilidade (Play.tsx:2101 e 2127, ambos com o mesmo gate).

**Consequência.** Por padrao, a unica coisa da tela que responde "o que eu faco agora" simplesmente nao existe. E quem a encontra so a encontra depois de pedir uma auditoria do acervo, ou seja, a acao esta arquivada como se fosse relatorio. Nos dois estados o resultado e ruim: escondida, ou entregue no meio de cinco numeros de estoque.

**Proposta.** Tirar o card de revisao vencida do gate detalhes e coloca-lo como primeira coisa abaixo do titulo, acima de tudo. Manter atras do interruptor apenas o que e de fato contagem (faixa "Seu baralho", cards Mapa/Ficaram de fora).

**Risco da mudança.** Com metricas ainda carregando o card pode nascer depois da primeira pintura e empurrar a grade — foi por isso que existe o esqueleto reservado de 78px em Play.tsx:2251-2253. Mover o card exige manter essa reserva na nova posicao.

### 🔴 F06 — A ordem inverte contabilidade e acao: o primeiro "Jogar" vem depois de tudo

**Evidência.** Ordem no DOM do lobby: titulo+subtitulo e pilula de progresso (Play.tsx:1955-2007), pilula da corrente encerrada (2013), recibo "Praticando / trocar" (2054), linha "Ver os numeros do baralho" + "Recordes e ranking" (2084 e 2093), faixa "Seu baralho" (2101), cards Mapa e Ficaram de fora (2131 e 2150), card de revisao (2254) e SO ENTAO "Sua proxima rodada" com o primeiro botao Jogar (2288-2308) e o titulo "Escolha um jogo" (2313). Sao 3 controles antes do primeiro Jogar com detalhes desligado e 6 com ele ligado, e 90 palavras medidas antes do titulo "ESCOLHA UM JOGO".

**Consequência.** A tela abre falando de estoque, saldo e historico para quem chegou querendo apertar um botao. Nos 10 primeiros segundos o olho atravessa progresso, recibo de configuracao e dois links de auditoria antes de encontrar qualquer coisa que inicie uma partida — e no celular isso e rolagem, nao so leitura.

**Proposta.** Inverter: "Sua proxima rodada" (com o botao) sobe para logo abaixo do titulo, como primeiro bloco da tela; progresso, recibo de fonte e os dois links de contabilidade descem para uma faixa unica DEPOIS da grade de jogos. O card de revisao vencida fica em segundo, quando existir.

**Risco da mudança.** O recibo "Praticando X" e o unico aviso de qual fonte esta valendo; empurrado para baixo da grade, volta o risco de jogar no idioma errado sem perceber. Precisa continuar visivel — por exemplo como uma linha dentro do proprio card "Sua proxima rodada".

### 🟡 F07 — A carta gasta seus dois primeiros controles com mobiliario, e a antessala e um segundo lobby

**Evidência.** Na carta, a fileira de organizar (mover esquerda, mover direita, fixar, mais "ver previa" quando a previa esta desligada) e renderizada ENTRE o titulo-acao (Play.tsx:2428-2438) e a descricao/estado do jogo (Play.tsx:2502) — bloco Play.tsx:2462-2501. Sao 27 dos 57 botoes da tela (47% medidos) so para reordenar. A antessala, por sua vez, e uma tela cheia com hero de progresso, 4 ladrilhos, painel "Por que estas?", um <details> de 6 marcadores sobre repeticao, lista de itens, prateleira de ate 6 fases rejogaveis e so entao Jogar/Trocar/Repetir mais um checkbox (AntessalaDaRodada.tsx:449-737).

**Consequência.** Depois de ler o nome do jogo, a proxima coisa que a pessoa encontra sao setas de arrumar a estante, e nao "o que este jogo faz" nem "da para jogar agora". Passado o clique, ela cai numa segunda tela de leitura com mais dez decisoes opcionais antes do unico botao que importa. A tela ensina a organizar e a auditar; nunca ensina a jogar rapido.

**Proposta.** Tirar mover/fixar da carta e concentrar num modo "organizar" acionado uma vez (um botao no cabecalho da grade), deixando a carta com titulo, miniatura, estado e o "?". Na antessala, subir Jogar/Trocar para logo abaixo dos 4 ladrilhos e recolher hero, fases e explicacoes abaixo do botao.

**Risco da mudança.** Esconder mover/fixar atras de um modo reduz a descoberta da personalizacao da ordem, que hoje alimenta o card "Sua proxima rodada" (Play.tsx:1572-1576, que le a ordem do usuario). Se ninguem mais reordenar, esse card passa a oferecer sempre o mesmo jogo.

---

## Trilha × conteúdo capturado

_A separação existe no dado. O que ela comunica — e o que mente — na tela._

### 🔴 F08 — Escolher "Trilha" sem escolher nível entrega ZERO — e a tela promete 2.784, depois 704, depois nada

**Evidência.** SalaDeEscolha.tsx:142 (`quantasPromete = origem === 'trilha' ? totalDaTrilha`) e :335 ("Sem escolher, a trilha joga com todos os níveis de uma vez"), com `nivel` nascendo indefinido em :73. Mas Play.tsx:1293-1294 (`jogaveis`) e :1329 (`acervoDaFonte`) fazem `if (!trilha || !fonte.nivel) return triagem.usaveis`, e `triagem` vem de source.ts:90 (`todos.filter(c => c.daTrilha && ...)`) — só os cartões da trilha JÁ GRAVADOS no banco, que só nascem de erro (Play.tsx:867-903). Em paralelo, PainelTrilha.tsx:62 (`nivelAtivo = nivel ?? sugerido`) desenha o nível sugerido como se estivesse valendo. Medido em src/data/trilha/en.json: 2.784 pares no total, 704 no A1 — o número do rodapé da sala (2.784) não é jogável em rodada nenhuma, porque a rodada é sempre de UM nível. Também: frasesTrilha (Play.tsx:1205) exige `fonte.nivel`, então a Frase embaralhada cai em estadoDosJogos.ts:186-190 e a carta escreve "a trilha tem palavras soltas, este jogo precisa de frase" (Play.tsx:2524-2527) sobre um dado que tem 2.552 frases.

**Consequência.** Quem nunca errou uma palavra da trilha (isto é, todo mundo na primeira vez) escolhe Trilha, lê "2.784 palavras prontas", aperta Jogar e cai num lobby com 9 cartas cinzas dizendo "faltam 4 · precisa de 4 · você tem 0 do inglês", enquanto o painel logo acima anuncia "704 palavras do A1 prontas para jogar". Três números incompatíveis na mesma tela, e o caminho de entrada da trilha — justamente a família que o dono quer separar e destacar — é um beco.

**Proposta.** Tornar o nível obrigatório no momento em que 'trilha' é escolhida: pré-selecionar `nivelSugerido(progressoDaTrilha(...))` no `useState` da sala (o mesmo fallback que PainelTrilha já usa em :62) e trocar a frase "joga com todos os níveis" pelo nome do nível ativo. O rodapé passa a prometer o total DO NÍVEL (704 no A1), não a soma dos seis. No core, `cartoesDaFonte` com `id:'trilha'` e sem nível deveria cair no nível sugerido em vez de devolver só o resíduo de erros.

**Risco da mudança.** Pré-selecionar tira a possibilidade (hoje inexistente na prática) de "jogar a trilha inteira"; se alguém a quiser de fato, o conserto certo é `cartoesDaTrilha` aceitar lista de níveis, não manter o vazio. Mudar o rodapé de 2.784 para 704 faz a trilha parecer menor — é o preço de o número passar a ser verdade.

### 🔴 F09 — As mesmas 9 cartas mudam de matéria em silêncio: 4 descrições e 5 fichas afirmam "sua gravação" no meio da trilha

**Evidência.** jogos.tsx declara `descricao: Record<AgeProfileType, string>` (:27) — não existe dimensão de fonte. Os textos: :75 "Uma frase real da sua gravação, fora de ordem", :86 "A fala real toca com as palavras acendendo", :97 "as alternativas são outras falas da mesma gravação". ComoSeJoga.tsx é `Record<MinigameId, ConteudoComoSeJoga>` (:64), sem fonte: :117 "Este jogo usa falas da sua gravação", :145 "outras falas da MESMA gravação, com tamanho parecido, mesmo assunto, mesmo sotaque", :170 "Leia a frase, que veio de uma gravação sua". Na trilha nada disso vale: Play.tsx:558-580 troca escuta/ditado/karaokê por PALAVRAS soltas ditas por TTS (`startMs: 0, endMs: 0`), e a Frase embaralhada usa o Tatoeba (trilha.ts:271, frasesDaTrilha), não o transcrito.

**Consequência.** A distinção que o dono quer não está ilegível — ela está INVERTIDA. A carta e a ficha de ajuda afirmam ativamente a fonte errada. Quem entra pela trilha lê "repita a fala real da sua gravação" e recebe uma palavra sintetizada; quem lê os limites do Frase embaralhada ("a frase vem do reconhecimento de voz, pode ter cortado no meio") está lendo o defeito de um corpus que não está jogando. O jogo passa a ensinar que a tela mente, que é exatamente o oposto do padrão de honestidade do resto do projeto.

**Proposta.** Não duplicar cartas: acrescentar UMA dimensão de fonte ao dado que já existe. Em `JogoUI`, `descricao` vira `Record<AgeProfileType,string>` mais um `porFonte?: Partial<Record<'trilha'|'gravacoes', Record<AgeProfileType,string>>>`; em `ConteudoComoSeJoga`, o mesmo para `avaliacao` e `limites`. A carta escolhe a variante por `fonte.id`. Continuam 9 cartas, 9 fichas — o que muda é qual frase sai. Na grade, um selo pequeno e constante na carta ("curso" / "seu material") nos 5 jogos cuja matéria muda, para a diferença virar visível antes da leitura.

**Risco da mudança.** Dobra o texto a manter nos 5 jogos de frase/áudio (mais copy para revisar e traduzir por perfil). E um selo por carta acrescenta um elemento à carta que o dono quer MENOS textual — mitigável se o selo substituir parte da linha de rodapé em vez de somar a ela.

### 🔴 F10 — Os jogos de frase ignoram a fonte escolhida: as falas vêm de uma gravação que o código escolhe sozinho, e a alavanca para trocá-la é código morto

**Evidência.** Play.tsx:1009-1012 escolhe a gravação das falas com `lista.find(x => x.audioUrl) ?? lista[0]` — sem nenhuma relação com `fonte`. `estadoDosJogos.ts:187` e :214-217 usam `e.frases` (essa gravação) para escuta/ditado/conectores/karaokê em toda fonte que não seja trilha, e Play.tsx:437 faz o mesmo no `montarRodada`. O único lugar que faria as falas seguirem a gravação escolhida é `setSessaoEscolhida` (Play.tsx:2195), dentro do bloco `escolhendoSessao` — e `setEscolhendoSessao(true)` NÃO EXISTE no arquivo (grep: só :265 no `useState(false)` e :2195 setando `false`). O bloco Play.tsx:2188-2210 é inalcançável. `aplicarEscolha` (Play.tsx:1136-1143) não toca em `sessaoEscolhida`.

**Consequência.** Escolher "Uma gravação: aula de terça" na Sala reparticiona o baralho mas deixa o Ditado, o Qual foi?, o Karaokê e o Caça-conectores tocando outra gravação. A faixa "Praticando · Sessão: aula de terça" e a antessala (Play.tsx:1666) repetem o rótulo errado, e o resultado é gravado com `origem: sessao:<id>` (Play.tsx:791) — o histórico e os recordes por fonte passam a atribuir falas de uma sessão a outra. Na fonte "Minhas palavras" e "Palavras difíceis" o vazamento é o mesmo, só que sem nome: metade da grade joga o baralho inteiro e a outra metade joga uma gravação que ninguém escolheu.

**Proposta.** Fazer `frases` ser função de `fonte`: quando `fonte.id === 'sessao'`, buscar o transcrito de `fonte.sessionId` (elimina `sessaoEscolhida` e o bloco morto); quando a fonte é 'baralho'/'dificeis', ou a tela declara qual gravação está alimentando os jogos de fala (uma linha no lugar do rótulo genérico), ou os 4 jogos de fala saem da grade dessa fonte e passam a viver na família "seu material · uma gravação". A segunda opção é a que dá a separação limpa que o dono pediu.

**Risco da mudança.** Tirar os jogos de fala de "Minhas palavras" reduz de 9 para 5 as cartas liberadas nessa fonte — parece perda de conteúdo e pode aumentar a sensação de "jogos cinza" se não vier acompanhado do caminho para a fonte que os libera. Amarrar `frases` a `fonte.sessionId` acrescenta uma busca de rede a cada troca de gravação na sala.

### 🔴 F11 — Na trilha, acertar não conta na memória — e o cabeçalho e as fichas prometem que conta

**Evidência.** Play.tsx:834 `if (!o.cardId || !def.writesSrs) continue;` e :828 `kind: o.cardId && def.writesSrs ? 'srs' : 'drill'`. Os cartões da trilha nascem com `id: ''` por contrato (trilha.ts:138-146: "SEMPRE VAZIO, e isso é a razão de ser deste tipo"), então nenhum item da trilha chega a `reviewCard`. O único caminho de volta é Play.tsx:867-903, que promove APENAS os itens errados (`o.correct || o.cardId || !o.itemRef` → descarta). Contra isso: Play.tsx:1964 "Rodadas curtas com as SUAS palavras. O que você acerta aqui conta na revisão" e :1963 "Cada acerto conta para a sua memória"; ComoSeJoga.tsx:88 ("Fechar o par de primeira vale 'bom'"), :103 ("não estraga a sua revisão"), :183 ("responder em menos de três segundos vale 'fácil'").

**Consequência.** Duas economias de aprendizado diferentes usam a mesma tela e o mesmo vocabulário. Na trilha o acerto evapora (vira `drill`, sem agendamento) e o erro é o único que cria cartão; nas gravações é o contrário do que a pessoa espera ler. Quem estuda pela trilha acha que está construindo uma agenda de revisão e não está — e, pior, o painel de progresso da trilha (PainelTrilha.tsx:51-53) conta exatamente os cartões nascidos de ERRO, então avançar na barra do A1 significa ter errado mais, não ter aprendido mais.

**Proposta.** Dizer a regra onde ela vale: na família "curso", a linha de cabeçalho passa a ser "o que você errar entra na sua revisão" (é a verdade, e é uma promessa boa), e o texto "o que você acerta conta na revisão" fica na família "seu material". A seção COMO CONTA NA SUA MEMÓRIA de ComoSeJoga ganha a variante por fonte proposta no achado anterior. Se a intenção de produto for outra — que o acerto na trilha também conte — a mudança é promover também os acertos, mas aí é decisão de produto, não de copy.

**Risco da mudança.** Assumir em voz alta que só o erro conta pode desmotivar quem joga bem a trilha. E promover acertos, se for esse o caminho, é a mudança cara que o comentário em Play.tsx:856-862 recusou de propósito (encheria "Minhas palavras" com 704 palavras do A1 e afogaria o material capturado).

### 🟡 F12 — O único sinal de "curso" existe depois de já se ter escolhido a trilha, e o nome "Etapa" já está ocupado pela economia

**Evidência.** O PainelTrilha (etapas, barra por nível, "Etapa 3 de 30") só é montado em Play.tsx:2212 sob `fonte.id === 'trilha' && trilha`. O card "Sua próxima rodada" (Play.tsx:2288-2310) mostra tamanho, fonte e duração e não menciona etapa; a etapa só reaparece na antessala, um clique adiante (Play.tsx:1690). Enquanto isso, a pílula de progresso do cabeçalho escreve `{ageProfile === 'senior' ? 'Etapa' : 'Nível'} {progress.level}` (Play.tsx:1981) a partir de `deriveProgress(metrics)` — a economia de XP, sem relação nenhuma com a etapa da trilha. No perfil sênior a mesma tela mostra "Etapa 10" (economia) e "Etapa 3 de 30" (trilha) significando coisas diferentes.

**Consequência.** A sensação de curso — degrau, posição, próximo passo — é a coisa que separa a trilha do resto, e ela está trancada atrás da decisão que deveria motivar. Quem chega no lobby não tem como saber que existe um percurso; vê uma pílula de XP que não é percurso nenhum e um botão "Praticando · Minhas palavras · trocar". E quem já está na trilha lê duas "etapas" que não conversam.

**Proposta.** Trocar a faixa-recibo "Praticando … trocar" (Play.tsx:2054-2064) por duas pistas de topo — "Curso" e "Meu material" — sempre visíveis, cada uma carregando o seu próprio sinal: na do curso, "A1 · etapa 3 de 30" com a régua de traços que o PainelTrilha já desenha; na do material, o nome da gravação e o número de palavras. A grade de 9 cartas continua uma só, abaixo. Renomear a pílula do cabeçalho para "Nível" nos três perfis, liberando a palavra "Etapa" para a trilha.

**Risco da mudança.** Duas pistas fixas ocupam espaço vertical numa tela que o dono quer mais curta, e a pista "Curso" precisa de um estado honesto para os 31 idiomas sem trilha (hoje ela simplesmente não existe). Renomear "Etapa" para "Nível" no perfil sênior desfaz uma escolha de vocabulário deliberada desse perfil.

### 🟡 F13 — Quem chega sem baralho é mandado gravar, e a tela nega que a trilha exista

**Evidência.** Play.tsx:2224 esconde o estado vazio só quando `fonte.id !== 'trilha'`, e o texto dele (Play.tsx:2234) diz "Os jogos usam as palavras que você guarda das suas gravações, nada de lista pronta" — enquanto src/data/trilha/en.json tem 2.784 pares curados (medido). A fonte inicial é `{ id: 'baralho', lang: '' }` (Play.tsx:196) e a restauração da fonte guardada está gateada em `!sessoes.length` (Play.tsx:967), então quem tem ZERO gravações nunca recupera o "Trilha A1" que escolheu ontem. Na Sala, os chips de idioma vêm de `idiomasDisponiveis(deck)` (Play.tsx:1237), então com baralho vazio a seção mostra "Ainda não há palavras no seu caderno" e nenhum chip (SalaDeEscolha.tsx:196-213); a Trilha só fica habilitada se `fonte.lang` já for inglês (trilhaDe, Play.tsx:1271-1278).

**Consequência.** O caso em que a trilha é mais valiosa — baralho vazio, nada capturado — é justamente aquele em que ela é mais difícil de alcançar: a fonte padrão é a errada, o card de boas-vindas afirma que lista pronta não existe, e a escolha não sobrevive ao F5 porque a condição de restauração é ter gravações. É o oposto da separação que o dono pediu: em vez de duas famílias visíveis, há uma família visível que nega a outra.

**Proposta.** No estado vazio, trocar o card único por duas saídas lado a lado — "Começar pelo curso (inglês A1, 704 palavras prontas)" e "Capturar uma sessão" — e reescrever a frase que afirma não haver lista pronta. Soltar a restauração da fonte do `!sessoes.length` (validar `sessionId` continua necessário, mas 'trilha' e 'baralho' não dependem de gravação). Se o baralho estiver vazio e houver trilha para algum idioma, a fonte inicial deveria ser a trilha, não 'baralho'.

**Risco da mudança.** Empurrar a trilha na entrada enfraquece o posicionamento do app ("tudo nasce do que você grava") e pode fazer o novato nunca gravar. Mudar a fonte inicial por heurística é mudança de comportamento silenciosa para quem tem baralho pequeno mas não vazio — o gatilho precisa ser "zero cartões", não "poucos".

---

## Miniaturas e identidade dos jogos

_As nove artes: o que comunicam, o que confundem._

### 🔴 F14 — As artes sao desenhadas sobre o fundo errado: as formas principais de Memoria e Termo tem preenchimento igual ao fundo

**Evidência.** A faixa da miniatura e pintada com bg-canvas nos DOIS lugares onde a arte aparece: Play.tsx:2410 (`aspect-[16/7] bg-canvas border-b border-border-subtle`) e ComoSeJoga.tsx:236 (mesma classe). Mas ArteDosJogos.tsx:40 preenche as cartas VIRADAS da Memoria com `fill='var(--canvas)'` e ArteDosJogos.tsx:84 preenche o estado 'vazia' do Termo com `var(--canvas)`. Ou seja, o preenchimento e exatamente a cor do fundo: contraste 1,00:1. Contagem no proprio codigo: em ArteMemoria (L51-52) 6 das 8 cartas sao 'fechadas'; em ArteTermo (L90-93) 7 dos 10 quadrados usam fill canvas (6 'vazia' + 1 'cursor'). Sobra so o contorno `var(--border-subtle)`, que no tema padrao babel-light e #C6BFAC (index.css:100) sobre --canvas #E6E2D6 (index.css:83) — razao de contraste calculada pela formula WCAG: ~1,42:1, contra o minimo de 3:1 de 1.4.11 para grafico nao-textual. O mesmo token e usado como PREENCHIMENTO das barras em ArteKaraoke (L124, 14 das 15 barras) e ArteEscuta (L157, 6 das 7 barras).

**Consequência.** O que a pessoa ve na carta de Memoria nao e 'uma mesa de cartas': sao 2 blocos verdes flutuando num vazio, porque as outras 6 cartas so existem como um risco a 1,42:1 que some em tela de brilho baixo, no sol, ou para qualquer olho com sensibilidade reduzida ao contraste. No Termo, 3 quadrados coloridos boiando em 7 fantasmas. Isso e literalmente a aparencia de um placeholder de carregamento — e explica a queixa do dono de que a miniatura 'lembra esqueleto de carregamento' sem que ninguem tenha errado o desenho: o desenho esta certo, o fundo e que esta errado.

**Proposta.** Duas correcoes independentes. (1) Trocar a faixa para `bg-surface` em Play.tsx:2410 e ComoSeJoga.tsx:236, e trocar os fills `var(--canvas)` de ArteDosJogos.tsx:40 e :84 por `var(--surface-hover)` — assim forma e fundo deixam de ser o mesmo token, com a regra invariante 'nenhuma forma e preenchida com o token do fundo em que ela e desenhada'. (2) Criar um token proprio da arte, `--art-line`, definido por tema com no minimo 3:1 contra a faixa (ex.: `color-mix(in srgb, var(--ink) 45%, var(--canvas))`, o padrao que index.css:752-757 ja usa), e usar ele no lugar de --border-subtle em ArteDosJogos — --border-subtle e um token de MOLDURA, calibrado para desaparecer, e aqui ele esta carregando a figura.

**Risco da mudança.** Trocar a faixa para bg-surface muda a leitura visual de TODAS as 9 cartas e do modal Como se joga de uma vez; o contraste entre a faixa e o corpo da carta (que ja e bg-surface em Play.tsx:2393) some, e a borda `border-b` passa a ser a unica separacao — pode ser necessario reforca-la. O token novo aumenta a superficie do index.css, que ja mantem 8 temas x claro/escuro.

### 🔴 F15 — Nove jogos dividem uma paleta de tres cores; nenhuma arte tem cor propria

**Evidência.** Censo completo de ArteDosJogos.tsx: --accent aparece em 7 das 9 artes (L72, L103, L124, L141, L157, L180, L197), --good em 4 (L41, L84, L161, L172), --warn em 2 (L84, L145), --error em 1 (L174). Nenhum jogo tem um token seu. Pior: wordsearch, scramble e conectores usam --accent como UNICA cor, sobre --surface e --border-subtle — e as declaracoes de scramble (L103-104) e conectores (L197-198) sao a mesma expressao caractere por caractere: `fill={ativo ? 'var(--accent)' : 'var(--surface)'} stroke={ativo ? 'var(--accent)' : 'var(--border-subtle)'} strokeWidth={1.5}`. O comentario do topo (L16-19) sustenta a regra em 'accent marca o ATIVO, good/warn continuam coloridos em todos os temas', mas isso nao se verifica: no tema vercel --accent e #000000 no claro (index.css:465) e #ffffff no escuro (index.css:505) — essas tres artes ficam 100% acromaticas; e nos temas aurora (--accent #4ADE80 / --good #34D399, index.css:551 e 554) e mochi (--accent #87c095 / --good #a7c080, index.css:592 e 595; escuro #a7c080 / #83c092, index.css:631 e 634) accent e good sao verdes da mesma familia, entao a distincao semantica 'ativo x certo' que ArteTermo (L84-85) e ArteEscuta (L161-162) dependem simplesmente nao existe.

**Consequência.** A grade de 9 jogos e nove variacoes da mesma paleta de tres cores. Cor deixa de ser um canal de reconhecimento e todo o peso cai na forma — que tambem se repete (ver achado seguinte). Um iniciante nao consegue construir memoria visual de nenhum jogo: nao ha 'o jogo azul', 'o jogo roxo'. E a tela vizinha Personalizar/Loja ja usa borda por raridade para diferenciar item de item, ou seja, o vocabulario de 'cor identifica a coisa' existe no app e a tela de jogos e a unica que abre mao dele.

**Proposta.** Derivar um matiz por jogo a partir do accent com cor relativa OKLCH, o que preserva a regra 'nenhuma cor literal' e sobrevive aos 7 temas: `--jogo-memory: oklch(from var(--accent) l c h); --jogo-wordsearch: oklch(from var(--accent) l c calc(h + 40)); ...` ate +320, e cada Arte* passa a usar `var(--jogo-<id>)` no lugar de var(--accent). Como accent pode ter croma zero (vercel), acrescentar um piso: `oklch(from var(--accent) l max(c, 0.12) calc(h + N))`, que injeta croma quando o tema e monocromatico. Alternativa mais barata e mais legivel para o usuario: 3 tokens de FAMILIA — LER (wordsearch, scramble, conectores), OUVIR (escuta, ditado, karaoke), RESPONDER (memory, termo, blitz) — porque 3 cores sao aprendiveis e 9 nao sao.

**Risco da mudança.** Cor relativa OKLCH (`oklch(from ...)`) e mais nova que o `color-mix` que index.css:752-757 ja usa; precisa de fallback. O piso de croma quebra deliberadamente a intencao monocromatica do tema vercel e do modo alto-contraste — quem escolheu vercel escolheu o preto-e-branco. E no tema custom o --accent e escolhido pelo usuario (index.css:749, gravado por appearance.ts:141), entao um accent quase-cinza continua produzindo 9 matizes fracos.

### 🔴 F16 — Seis das nove artes cabem em duas gramaticas de forma; tres delas sao o mesmo desenho

**Evidência.** Familia 'grade de retangulos': ArteMemoria (L38-47, 4x2 retangulos rx=6), ArteCacaPalavras (L63, 9x4 quadrados rx=3), ArteTermo (L83, 5x2 quadrados rx=5). Familia 'fileira de pilulas horizontais': ArteEmbaralhada (L101, rx=9 h=18), ArteConectores (L196, rx=7 h=14), ArteDitado (L172-175, rx=5 h=11) e ainda as 3 legendas de ArteEscuta (L160, rx=6 h=13). Alem de partilharem a forma, embaralhada e conectores partilham o gesto: ambas acrescentam um traco tracejado (L111 `strokeDasharray='6 5'` e L203 `strokeDasharray='4 4'`) e um unico chip em accent. E as duas artes de audio comecam com o mesmo bloco de codigo: `alturas.map` gerando `rect width={4.5} rx={2.25} fill={i===N ? accent : border-subtle}` — karaoke L122-125 (15 barras, passo 9) e escuta L155-158 (7 barras, passo 9). Uma unica arte das nove, ArteDuelo (L136-148), e construida em torno de um objeto reconhecivel como assunto PRINCIPAL. O microfone do karaoke, o segundo objeto figurativo do conjunto, e um acessorio de canto: r=13 em cx=140 (L127), ou seja, 26px num quadro de 160px — 16% da largura.

**Consequência.** E exatamente o teste que o dono pediu: um iniciante NAO distingue Caca-palavras de Termo (as duas sao grades de quadradinhos), nem Montar a frase de Palavras que ligam de Ditado (as tres sao fileiras de pilulas cinzas), nem Karaoke de Qual foi? (as duas abrem com a mesma onda). Sobram 2 ou 3 legiveis — coincide com a contagem que o dono ja fez na tela rodando. O titulo passa a fazer todo o trabalho, o que anula a tese declarada do proprio arquivo em ArteDosJogos.tsx:21 ('Cada desenho responde "o que eu faco aqui?" antes de a pessoa ler o titulo') e joga mais texto numa tela que ja tem 317 palavras.

**Proposta.** Dar a cada jogo UMA silhueta dominante, unica no conjunto e ocupando 50% ou mais do quadro de 160x70, e rebaixar os elementos repetidos a textura de fundo: lupa sobre a grade (wordsearch), par de cartas em perspectiva (memory), fileira de teclas (termo), mao movendo uma peca para o lugar (scramble), microfone grande e centralizado (karaoke, promovendo o objeto que ja existe em L127-130), fone de ouvido (escuta), lapis sobre pauta (ditado), elo de corrente (conectores), cronometro (blitz, que ja funciona). Regra de aceite verificavel: recortar so os 60px centrais de cada arte e conferir que as 9 continuam distinguiveis entre si.

**Risco da mudança.** Silhueta figurativa em 160x70 e mais dificil de manter legivel do que forma geometrica e custa mais paths por arte. E dilui a tese original do arquivo — 'a mecanica desenhada, nao um enfeite' (L5) — em iconografia generica; parte da honestidade do desenho atual (o Termo REALMENTE mostra o veredito verde/amarelo do jogo) se perde ao virar um teclado.

### 🔴 F17 — O grayscale da carta bloqueada apaga justamente a unica coisa que diferenciava as artes

**Evidência.** Play.tsx:2410 aplica `${liberado ? '' : 'grayscale'}` na faixa da arte. O comentario C9 logo acima (Play.tsx:2380-2391) removeu `opacity-60` do cartao bloqueado por causa de contraste medido em 2,26:1, mas manteve o grayscale sobre a arte e o lista como um dos sinais de bloqueio. Como --good, --warn e --error sao os UNICOS diferenciadores entre artes da mesma familia de forma (achado anterior), o filtro remove 100% do canal que restava. O proprio repositorio ja registra isso como queixa recebida: desbloqueio.ts:11 — 'Nove cartas cinza sem saida e exatamente a queixa de "os jogos ficam cinza e nao tem explicacao"'. E o estado de bloqueio e o estado de ENTRADA: o fato medido na tela rodando ('falta 1 palavra · precisa de 4 · voce tem 3 do ingles') significa que quem chega com 3 palavras ve a maioria das 9 cartas bloqueadas.

**Consequência.** A primeira impressao da tela — o momento em que a identidade visual mais importa — e uma grade de retangulos cinzas sem textura nem cor. Nao e uma percepcao vaga do dono: e o resultado somado de tres decisoes (fundo canvas, paleta unica, filtro grayscale) que convergem no mesmo pixel. E a correcao do C9, feita para o texto continuar legivel, nao alcancou a arte.

**Proposta.** Trocar `grayscale` por `saturate(.55)` em Play.tsx:2410 — a arte perde forca mas mantem matiz e continua identificavel como AQUELE jogo — e transferir o peso do sinal 'bloqueado' para elementos que ja existem e nao custam identidade: o cadeado no lugar do icone (Play.tsx:2423) e a borda tracejada (Play.tsx:2393, `border-dashed`). Opcionalmente, uma hachura diagonal de 45 graus por cima da faixa, que le como 'trancado' sem apagar cor nenhuma.

**Risco da mudança.** Carta bloqueada colorida chama mais o clique, e clicar num jogo que nao abre e frustracao — o motivo pelo qual desbloqueio.ts existe. A mitigacao (cadeado + tracejado + a frase do motivo) precisa carregar sozinha o sinal que hoje o grayscale reforca, e isso so se confirma testando com alguem que nunca viu a tela.

### 🟡 F18 — Cada carta mostra DUAS metaforas diferentes do mesmo jogo, a 10px uma da outra

**Evidência.** O icone pixel (Play.tsx:2423, vindo de IconesPixel.tsx) fica imediatamente abaixo da miniatura (Play.tsx:2411), dentro da mesma carta. Em 5 dos 9 jogos os dois desenham coisas diferentes: wordsearch — a arte mostra a busca em DIAGONAL (ArteDosJogos.tsx:72-75, `line x1=16 y1=16 x2=112 y2=58`) e o icone mostra tres blocos HORIZONTAIS (IconesPixel.tsx:34-36, todos em y=7); escuta — onda + legendas (ArteDosJogos.tsx:151-166) contra um fone de ouvido (IconesPixel.tsx:70-77); ditado — pilulas e cursor numa linha (ArteDosJogos.tsx:169-183) contra um lapis (IconesPixel.tsx:80-86); conectores — pilulas e arco tracejado (ArteDosJogos.tsx:186-207) contra dois elos de corrente (IconesPixel.tsx:89-93); scramble — chips caindo numa linha, isto e, ORDENAR (ArteDosJogos.tsx:108-112) contra quatro quadrados com setas de TROCA (IconesPixel.tsx:49-57, comentado como 'letras trocando de lugar'). Sao mecanicas diferentes sendo anunciadas: ordenar nao e trocar, e procurar na diagonal nao e procurar na horizontal.

**Consequência.** Em vez de uma imagem reforcada duas vezes na mesma carta, o usuario recebe duas imagens competindo — e nenhuma vira a marca do jogo. O icone reaparece sozinho na antessala, ou seja, a pessoa que memorizou a miniatura chega la e encontra outro desenho. Isso desperdica a repeticao, que e o mecanismo mais barato de construir reconhecimento e o unico que nao custa uma palavra de texto a mais.

**Proposta.** Fazer o icone pixel ser a REDUCAO da silhueta da miniatura: mesmo assunto, menos pixels. Se a miniatura do escuta virar um fone (achado 3), o icone ja e um fone e os dois coincidem; se a do wordsearch mantiver a diagonal, o icone passa a ter a diagonal. Regra de aceite: para os 9 jogos, descrever miniatura e icone em uma palavra cada e exigir que as duas palavras sejam iguais. Um teste de snapshot nao resolve isso, mas uma tabela de 9 linhas no topo do IconesPixel.tsx documenta o pareamento e falha na revisao quando alguem diverge.

**Risco da mudança.** E a mudanca de maior volume: 9 artes e 9 icones redesenhados em conjunto. O registro 'fliperama' do pixel art (IconesPixel.tsx:6) foi desenhado para 24x24 com crispEdges e nem toda silhueta de 160x70 sobrevive a essa reducao — algumas viram borrao de 4 pixels. E ha o risco de perder o que hoje funciona: o microfone do karaoke ja e coerente entre os dois.

### 🟡 F19 — A regra 'nenhuma cor literal' ja esta furada, e o unico furo cai sobre uma cor que o usuario escolhe

**Evidência.** Busca por literal de cor (hex, rgb(, hsl(, nomes CSS) nos dois arquivos de arte retorna exatamente UMA ocorrencia: IconesPixel.tsx:23, `<rect x='4' y='6' width='5' height='3' fill='#fff' />`. Ela e desenhada por cima de `var(--accent)` (IconesPixel.tsx:22) e e o unico detalhe que faz o icone da Memoria parecer uma carta e nao um retangulo solido. No tema custom o --accent nao e um valor do design system: e a cor que o usuario escolheu, `--accent: var(--custom-accent, #F04E23)` (index.css:749 e :796), gravada por appearance.ts:141. Ou seja, um usuario que escolha um accent claro (amarelo palido, bege, branco-gelo) faz esse detalhe branco sumir. E a regra que o arquivo irmao declara como fundacional — ArteDosJogos.tsx:13, 'a regra aqui e: nenhuma cor literal' — nao esta protegida por nada automatico.

**Consequência.** Um caso pequeno, mas exemplar: e o mesmo defeito que o cabecalho do ArteDosJogos (L9-11) diz ter quebrado as particulas antes ('cinza a 6% de opacidade e invisivel por construcao em metade dos temas'), reintroduzido no arquivo ao lado. E enquanto a regra depende so de disciplina, qualquer sistema de identidade novo que voces construam por cima (achado 2) herda a mesma fragilidade: basta um `#` para furar os 7 temas de novo.

**Proposta.** Trocar o `#fff` por `var(--surface)`, ou melhor, criar `--on-accent` calculado uma vez por tema com o padrao color-mix que index.css:752-757 ja usa, para garantir contraste sobre qualquer accent inclusive o customizado. E fechar a porta com um teste barato em tests/ que le src/components/minigames/ArteDosJogos.tsx e src/components/views/play/IconesPixel.tsx e falha se encontrar `/#[0-9a-fA-F]{3,8}|rgb\(|hsl\(/` — 6 linhas de vitest que transformam a regra escrita em regra verificada.

**Risco da mudança.** `var(--surface)` sobre `var(--accent)` tambem nao garante contraste em todos os temas (em aurora, surface #0E1626 sobre accent #4ADE80 funciona; em vercel escuro, surface #121216 sobre accent #ffffff funciona; mas o tema custom continua sem garantia). Um `--on-accent` de verdade exige declaracao nos 8 blocos de tema x claro/escuro, ou uma unica formula color-mix cujo resultado ninguem inspecionou tema a tema. O teste, se escrito largo demais, passa a barrar tambem `#` legitimo em outros contextos do arquivo.

### ⚪ F20 — Nenhuma das 9 artes tem movimento proprio; a unica animacao e hover, que nao existe no celular

**Evidência.** Busca por `<animate`, `animation`, `@keyframes` e `motion` em ArteDosJogos.tsx nao retorna nada: as 9 artes sao SVG completamente estatico. O unico movimento da carta e `group-hover:scale-[1.04] transition-transform duration-300` (Play.tsx:2411), que depende de ponteiro — em toque, o estado hover nao ocorre, entao a grade inteira e imovel. O app sabe animar e sabe respeitar preferencia de movimento: index.css:356-373 anima `.auth-hero::after` e desliga a animacao num bloco a parte.

**Consequência.** Perde-se o canal de identidade mais barato que existe e o unico que nenhuma familia de forma consegue confundir: como a coisa se MEXE. Duas artes com a mesma silhueta viram jogos diferentes se uma pulsa e a outra desliza. E numa tela que o dono quer mais gamificada e menos textual, movimento e exatamente o tipo de sinal que substitui palavra — hoje sao 90 palavras antes de a pessoa chegar em 'ESCOLHA UM JOGO'.

**Proposta.** Um gesto assinatura por jogo, curto (0,8s a 1,2s), em loop so quando a carta esta visivel e liberada: a diagonal do caca-palavras se desenhando via `stroke-dasharray`/`stroke-dashoffset` (ArteDosJogos.tsx:72-75 ja tem a linha pronta para isso); os chips do scramble caindo na linha tracejada (L108-112); o cursor do ditado piscando (L180); as barras do karaoke oscilando de altura (L119); o ponteiro do relogio do blitz girando (L142-143). Tudo dentro de `@media (prefers-reduced-motion: reduce) { animation: none }`, seguindo o padrao que index.css:373 ja estabeleceu, e pausado com IntersectionObserver para nao animar 9 SVGs fora da tela ao mesmo tempo.

**Risco da mudança.** Nove animacoes simultaneas numa grade de 3 colunas custam CPU e bateria em celular modesto, que e um publico provavel deste app; sem o corte por visibilidade isso vira jank de rolagem. Movimento constante tambem compete com a leitura do texto da carta e pode piorar a tela para quem tem sensibilidade vestibular ou deficit de atencao — o guard de prefers-reduced-motion cobre quem configurou o sistema, nao quem nunca soube que a configuracao existe.

---

## Multi-idioma

_Onde o idioma único está amarrado e o que quebra ao misturar._

### 🔴 F21 — O idioma unico esta amarrado como escalar em 5 camadas — a rodada mista e impossivel antes de qualquer jogo ver os itens

**Evidência.** `FonteDeItens.lang: string` (src/core/minigames/source.ts:28) e `EscolhaDaPratica.lang: string` (source.ts:178) sao escalares. O corte real acontece em `triarCartoes` (src/core/learning/quality.ts:265-277): `if (alvo && idiomaDoCartao && idiomaDoCartao !== alvo) { outroIdioma.push(card); continue; }` — tudo que nao e do idioma alvo sai do baralho ANTES de `buildItems`. O funil do servidor repete o escalar: `PedidoDeComposicao.fonte.lang?: string` (core/minigames/composicao.ts:167), enviado como um unico parametro de query (composicao.ts:257) e replicado no fallback local (composicao.ts:200-203). A UI so deixa marcar um: `SalaDeEscolha.tsx:69` (`useState(escolhaAtual.lang)`) e `SalaDeEscolha.tsx:199` (`Segmentado valor={[lang]}`). A persistencia tambem e escalar: `patchUiSettings({ praticaLang: lang })` (Play.tsx:1125). CONTRASTE: o contrato do item JA carrega idioma por item — `MinigameItem.lang` (core/minigames/types.ts:35, 'decide a voz do TTS e o teclado') preenchido em itemSource.ts:191 (`lang: card.srcLang || ''`).

**Consequência.** O dono pede misturar idiomas numa rodada e hoje isso nao e uma feature faltando na tela: e uma impossibilidade estrutural. Quem tem 600 palavras de ingles e 300 de espanhol e obrigado a jogar duas rodadas separadas, e a Sala de Escolha (o modal que aparece a cada entrada) forca essa escolha binaria toda vez.

**Proposta.** Trocar o escalar por conjunto na fonte: `langs: string[]` em `FonteDeItens`/`EscolhaDaPratica`, `triarCartoes` aceitando `Set<string>` como alvo, e `fonte.lang` do pedido virando `langs` (CSV) no cliente e no fallback local. A camada de item nao precisa mudar — `MinigameItem.lang` ja existe e ja e preenchido. Na Sala, trocar o `Segmentado` de idioma para multi-selecao (ele ja recebe `valor` como array).

**Risco da mudança.** `mesmaFonte` (source.ts:208-213) compara `a.lang === b.lang` por igualdade de string; com array vira comparacao por identidade e o `useMemo` da triagem (Play.tsx:1153-1161) refaz o baralho inteiro a cada render — o docblock de `mesmaFonte` documenta exatamente esse custo ja medido. Precisa comparar arrays ordenados. Alem disso a rota de composicao no servidor precisa aceitar N idiomas ou o fallback local passa a ser o caminho normal.

### 🔴 F22 — Numa rodada mista o Duelo entrega a resposta pelo idioma — a regressao de um bug que o projeto ja consertou

**Evidência.** `distractorsFor` (core/minigames/itemSource.ts:230-236) tira as alternativas erradas dos PROPRIOS itens da rodada, sem olhar `item.lang`: `itens.filter(i => i.answer.toLowerCase() !== alvo).map(i => i.answer)`. O cabecalho de source.ts:17-20 descreve o defeito nesses termos: 'Num baralho misto, a pergunta em ingles vinha com distratores em portugues — ou seja, o IDIOMA denunciava a resposta certa. Com a rodada num idioma so, o distrator volta a ser distrator.' O mesmo padrao aparece no Qual foi? da trilha (Play.tsx:573-576), que monta as opcoes com `comoFala.filter((_, k) => k !== i)`.

**Consequência.** Se a mistura de idiomas for ligada sem tocar aqui, o Duelo e o Qual foi? deixam de ser exercicios: a pessoa le a pista, olha as quatro alternativas e escolhe a unica que esta em ingles. Acerta 100% sem lembrar de nada, e o FSRS grava esse acerto como memoria consolidada — o dano nao para na partida, contamina o agendamento.

**Proposta.** Filtrar candidatos por `i.lang === item.lang` primeiro, e so alargar para a rodada inteira quando houver menos de 3 irmaos do mesmo idioma. Quando nem assim der 3, e mais honesto entregar 2 alternativas do que 3 com uma delatora — o jogo ja lida com quantidade variavel (`quantidade = 3` e parametro).

**Risco da mudança.** Em baralho misto pequeno (o caso comum de quem esta comecando um segundo idioma) um idioma pode nao ter 3 irmaos, e a rodada sai com menos alternativas — mais facil, mas honesta. Distratores tambem passam a poder repetir mais entre rodadas do mesmo idioma.

### 🔴 F23 — Termo e Caca-palavras assumem o alfabeto latino e falham em silencio nos 8+ idiomas nao-latinos que o seletor oferece

**Evidência.** Caca-palavras: `normalizarPalavra` (core/minigames/wordsearch.ts:56) faz `.replace(/[^A-Z]/g, '')`. MEDIDO executando essa mesma funcao: 'сейчас'→'', '日本語'→'', 'שלום'→'', 'สวัสดี'→''. `buildGrid` (wordsearch.ts:64) entao filtra `p.texto.length >= 2`, todas caem em `naoCouberam`, e `WordSearchGame.tsx:38` calcula `jogaveis = []`; o preenchimento da grade e latino fixo (wordsearch.ts:111, `ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'`). Termo: `chaveDoTermo` (core/minigames/termo.ts:24) usa `[^\p{L}]` (Unicode), entao 'сейчас' vira 'СЕЙЧАС' — 6 letras, dentro da janela MIN_LETRAS=4/MAX_LETRAS=8 (termo.ts:122-123) — e o jogo ABRE; mas o teclado e literal latino: `const LINHAS_TECLADO = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']` (TermoGame.tsx:42). O portao nao percebe nada disso: `poolDosJogosDePalavra` (core/minigames/estadoDosJogos.ts:133-158) so olha traducao e cloze, nunca a escrita.

**Consequência.** A carta anuncia '8 nesta rodada', a pessoa clica, e o Caca-palavras abre um tabuleiro 8x8 de letras latinas aleatorias com a lista de palavras vazia — nada a achar, sem erro nem explicacao. No Termo ela ve os quadrados no tamanho certo e um teclado onde nenhuma tecla produz a letra da palavra. O app oferece 32 idiomas no seletor (src/lib/languages.ts:26-59) e pelo menos ru, uk, el, ja, ko, zh, hi, ar, he, th caem nisso.

**Proposta.** Adicionar uma pergunta de ESCRITA no portao, no mesmo lugar onde `poolDosJogosDePalavra` ja decide: um `escritaLatina(lang)` que reprova o Caca-palavras e (por ora) o Termo, com motivo declarado — o arquivo ja tem o vocabulario para isso (`MotivoBloqueio`, estadoDosJogos.ts:40, e a tela ja imprime motivos em Play.tsx:2524-2532). Depois, teclado do Termo derivado do script da rodada em vez de constante.

**Risco da mudança.** Bloquear dois dos nove jogos para varios idiomas encolhe a grade justamente para quem tem menos material — mas hoje esses jogos ja estao quebrados nesses idiomas, so que sem dizer. O `escritaLatina` precisa cobrir tambem casos parciais (turco com ı/ğ, vietnamita com diacriticos empilhados) para nao reprovar idiomas que na pratica funcionam.

### 🔴 F25 — O portao de audio pergunta se o navegador TEM voz, nunca se ha voz NAQUELE idioma — e a funcao que sabe responder existe e nunca e chamada

**Evidência.** Play.tsx:1451: `const temVoz = useMemo(() => isTtsSupported(), [])`, e `isTtsSupported()` (src/lib/tts.ts:40-42) so testa `'speechSynthesis' in window`. Esse booleano e o gate dos tres jogos de audio na trilha (Play.tsx:561 e estadoDosJogos.ts:194,201). Quando nao ha voz do idioma, `pickVoice` devolve `null` (tts.ts:81-99) e `NativeTts.speak` (tts.ts:236-247) segue em frente: define `u.lang` e enfileira com a VOZ PADRAO do sistema, sem sinalizar nada — e com `const lang = opts.lang || 'en-US'` (tts.ts:237) o idioma vazio ainda cai em ingles. A funcao que responderia a pergunta certa existe desde sempre e nao tem nenhum chamador: `voiceLangs()` (tts.ts:164) — verificado por busca em todo o src/, so a definicao e um comentario em languages.ts:21.

**Consequência.** Hoje: quem escolhe a trilha de ingles numa maquina sem voz de ingles ouve palavras inglesas lidas com fonemas portugueses e treina a pronuncia errada — pior que jogo bloqueado, porque parece funcionar. Numa rodada MISTA isso vira a regra: `speak` e chamado por item (TermoGame.tsx:365, e `falante.ouvir` em Escuta/Ditado/Karaoke), entao cada item pediria uma voz diferente e os que nao tiverem voz instalada sairiam na voz do item anterior ou na padrao, sem aviso.

**Proposta.** Trocar `temVoz: boolean` por `idiomasComVoz: Set<string>` na `EntradaDoEstado` (estadoDosJogos.ts:85) e alimentar com `voiceLangs()`; o gate passa a perguntar `idiomasComVoz.has(baseLang(lang))`. Para rodada mista, filtrar os itens de escuta/ditado/karaoke para os idiomas que tem voz, em vez de aceitar a rodada inteira. `criarFalante` ja recebe `lang` por item (lib/falante.ts:83), entao a parte de execucao ja esta pronta.

**Risco da mudança.** `getVoices()` costuma voltar vazio no primeiro acesso e so popula no evento 'voiceschanged' (tts.ts:63-73): medir uma vez com `useMemo(..., [])` como hoje daria falso negativo e bloquearia jogos que funcionam. Precisa reagir ao evento, e isso troca uma medicao estavel por um estado que muda depois da primeira pintura.

### 🔴 F27 — en.json ja e um chunk separado de 237KB, mas tres rotas o puxam e o caminho ingenuo para N idiomas multiplica isso por N

**Evidência.** MEDIDO no build versionado em dist/: `dist/assets/en-vjtESkJa.js` = 242.941 bytes crus / 95.278 bytes gzip. Buscando o nome do chunk nos demais arquivos, ele e referenciado por `Play-B8xuXbFe.js`, `Analysis-CGs4BiKs.js`, `Perfil-CftSV7GK.js` e pela tabela `__vite__mapDeps` do chunk de entrada `index-CT2dKMVd.js` — a busca por `import{...}from"./en-vjtESkJa.js"` no chunk de entrada nao retorna nada, entao ele NAO esta no caminho da primeira pintura (index.html so faz modulepreload de vendor-react). Ha DOIS importadores estaticos: Play.tsx:45 e `core/learning/cefrWordlist.ts:23`, este ultimo reexportado pelo barril `@core` (src/core/index.ts:21) — e por isso o chunk `Perfil-CftSV7GK.js`, que tem 23KB de codigo proprio, arrasta 237KB. Conteudo real do arquivo: A1 704, A2 580, B1 757, B2 565, C1 114, C2 64 = 2.784 pares (o docblock em trilha.ts:19 ainda diz '3.997 pares: A1 827, A2 807...', numero desatualizado).

**Consequência.** Hoje: abrir Perfil ou Analise baixa 93KB gzip de vocabulario curado que aquelas telas nao mostram. Com 5 idiomas escritos do mesmo jeito (`import trilhaFr from ...` ao lado do `import trilhaEn`), os 5 chunks viram dependencia ESTATICA de Play e sao buscados ao entrar em /jogar, independente do idioma selecionado: ~1,2MB crus / ~470KB gzip. Com 10, ~2,4MB / ~950KB — em 3G isso e a tela de jogos levando dezenas de segundos para ficar utilizavel.

**Proposta.** Dois cortes independentes. (1) `trilhaDe` vira import dinamico por idioma (`await import(\`../../data/trilha/${lang}.json\`)`), com um indice estatico minusculo (idioma -> niveis disponiveis + totais) para a Sala continuar mostrando as contagens sem baixar nada. (2) `cefrWordlist` para de importar o json inteiro: ele so precisa de palavra->nivel (2.784 chaves), nao das traducoes nem das 2.552 frases — um indice gerado no build fica na casa das dezenas de KB e tira o peso de Perfil e Analise de vez. Banco/servidor so se paga quando o catalogo passar de uns poucos idiomas; ate la o arquivo estatico com import dinamico e mais simples e funciona offline, que e a promessa do app.

**Risco da mudança.** O import dinamico torna `trilha` assincrono, e Play.tsx:1198 e um `useMemo` SINCRONO do qual dependem `frasesTrilha` (1204), `etapaDaTrilha` (1211), `jogaveis` (1292) e `fontesOferecidas` (1250-1260). A cadeia inteira ganha um estado de carregamento, e a Sala de Escolha, que hoje pergunta `trilhaDe(lang)` de forma sincrona a cada troca de chip (SalaDeEscolha.tsx:80), passa a precisar de estado pendente — e o proprio docblock dela alerta que responder pelo idioma errado ja produziu um bug visivel.

### 🟡 F24 — O Caca-conectores tem 6 de 34 conectores do portugues e 6 de 24 do espanhol inalcancaveis — os dois lados da comparacao normalizam diferente

**Evidência.** A tabela guarda as chaves ACENTUADAS (core/minigames/escuta.ts:212-218 para pt, 219-223 para es) mas a busca normaliza o token tirando acento: `lista.has(normalizarPalavra(t).toLowerCase())` (escuta.ts:252), com o `normalizarPalavra` de wordsearch.ts:56. MEDIDO rodando as duas funcoes sobre as listas do arquivo: pt tem 34 entradas distintas e 6 nunca casam (porém, além, aliás, contrário, então, também); es tem 24 e 6 nunca casam (además, así, aún, todavía, después, también); en tem 35 e 0 mortas. A pontuacao e F1 (escuta.ts:269-...), entao marcar corretamente 'porém' conta como FALSO POSITIVO. Somado a isso, a tokenizacao e por espaco (`fala.text.split(/\s+/)`, escuta.ts:250) — em zh/ja/th a frase inteira vira 1 token e a rodada nunca se forma.

**Consequência.** Quem pratica portugues ou espanhol joga uma versao degradada: os conectores mais caracteristicos da lista sao invisiveis para o jogo, e o jogador que os identifica corretamente PERDE nota. O ingles, unico idioma sem acento na lista, funciona 100% — a assimetria e invisivel e parece 'o jogo e mais dificil em portugues'.

**Proposta.** Normalizar os DOIS lados uma vez, na carga do modulo: construir `CONECTORES_NORM` aplicando a mesma funcao sobre cada chave da tabela, e comparar normalizado contra normalizado. E uma mudanca de ~4 linhas e nao mexe nas listas.

**Risco da mudança.** Normalizar cria colisoes que hoje nao existem (em pt, 'porque'/'porquê' viram a mesma chave — aceitavel; em es, 'aun'/'aún' sao palavras diferentes e passariam a casar as duas, gerando falsos alvos). Conectores de duas palavras ('sin embargo', 'no entanto') continuam sem casar: a tokenizacao por palavra unica e um limite separado que a normalizacao nao resolve.

### 🟡 F26 — A trilha nao e 'ingles' — e 'ingles para quem fala portugues', e a estrutura nao tem onde guardar o idioma nativo

**Evidência.** `DadoTrilha` (core/learning/trilha.ts:32-48) tem `lang`, `fonte`, `versao` e `niveis` — NAO tem `tgtLang`. MEDIDO no arquivo real (src/data/trilha/en.json, 233KB): `niveis.A1[0]` = `["about","cerca de","You'll forget about me someday.","Você vai me esquecer um dia."]` — traducao e frase traduzida em portugues, dentro do dado. `cartoesDaTrilha` (trilha.ts:222-227) grava `srcLang: lang` e nunca um `tgtLang`. A tela mantem um `idiomaNativo` separado, com padrao literal 'pt' (Play.tsx:242), e o usa para CARIMBAR os cartoes promovidos: Play.tsx:888-892 monta `{ word, back: c.translation, srcLang: c.srcLang, tgtLang: idiomaNativo }` — `back` e a traducao portuguesa do json, `tgtLang` e o idioma que a pessoa declarou.

**Consequência.** Um usuario nativo de espanhol que joga a trilha de ingles ve pistas em portugues; e quando erra uma palavra, ela e promovida ao baralho dele gravada como 'traducao para o espanhol' quando o texto e portugues. O erro fica permanente no banco. Alem disso nao ha lugar para pendurar um segundo par: adicionar frances-para-portugues e frances-para-ingles exigiria dois arquivos chamados 'fr.json'.

**Proposta.** A chave da trilha e o PAR, nao o idioma: `DadoTrilha` ganha `tgtLang`, os arquivos viram `en-pt.json`, e `trilhaDe` (Play.tsx:1271-1278) passa a resolver por par (idioma praticado + idioma nativo) em vez de por `baseLang(lang) === 'en'`. Enquanto so existir um nativo, `trilhaDe` deve RECUSAR a trilha quando `idiomaNativo !== dado.tgtLang`, com o motivo dito — a Sala ja sabe exibir motivo de bloqueio (SalaDeEscolha.tsx:262).

**Risco da mudança.** Recusar a trilha para nativos nao-portugueses tira hoje a unica fonte curada de quem nao fala portugues, e o app ja e todo em portugues, entao o publico afetado pode ser zero — vale medir antes de gastar a mudanca. A explosao N×M de arquivos e real: 5 idiomas praticados × 3 nativos = 15 arquivos de ~230KB.

---

## Gamificação e recompensa

_O laço de recompensa que já existe e não chega à tela._

### 🔴 F28 — A raspadinha — o único clímax de recompensa do app — nunca chega à tela

**Evidência.** Play.tsx:757 (`setResultado(report)`) e Play.tsx:811 (`setVerResumo(true)`) rodam no MESMO bloco síncrono de `aoTerminar` (o primeiro `await` só aparece em 835/839), então `resultado` e `verResumo` ficam verdadeiros no mesmo render. Na cascata de returns, `if (resultado && verResumo)` (Play.tsx:1746, ResumoDaRodada) vem ANTES de `if (resultado)` (Play.tsx:1786, ScratchReward). Os caminhos que zeram `verResumo` ou abrem a antessala (renderizada em Play.tsx:1634, acima de 1746) ou chamam `comecar`/`sairDaSequencia`, que fazem `setResultado(null)` (Play.tsx:665 e 706) — sobra só o caso raro `semMaterial`. Nenhum teste cobre a tela (grep por 'ScratchReward' em tests/ = 0 ocorrências).

**Consequência.** O fim de rodada entrega uma lista de erros. As 3 estrelas, o confete escalado pelo resultado, o placar da corrente, o 'combo ×N continua na próxima', a caça ao recorde ('faltam 40 pts'), o sink de seeds ('trocar mantendo o combo') e a linha 'Nível N · faltam X XP · próximo: 🎁 Nome' — tudo escrito, comentado e pronto em ScratchReward.tsx:170-350 — nunca são vistos. O laço de recompensa do jogo termina num relatório de erros.

**Proposta.** Encadear em vez de competir: `verResumo` começa false, a raspadinha aparece, e um botão 'Ver o que errei' liga o resumo; ou fundir as duas num painel só, com a raspadinha no topo e a lista de erradas abaixo. Adicionar um teste de render que afirme que ScratchReward aparece após `aoTerminar`, para a regressão não voltar.

**Risco da mudança.** Fundir aumenta o texto na tela de fim de rodada, justo o que o dono quer reduzir. Encadear põe um clique entre a rodada e a lista de erros, que hoje é a informação mais útil ali; e a raspadinha exige um gesto, o que atrasa quem só quer emendar a próxima rodada.

### 🔴 F29 — A conquista 'Colecionador' é matematicamente impossível, e 8 dos 9 jogos não têm festa de combo

**Evidência.** `todosOsEventos()` devolve 11 ids, incluindo 'perfeita' (lib/eventosDeJogo.ts:89-92). O único produtor desses ids é `eventosCondicionais` (lib/eventosDeJogo.ts:68-86), chamado em exatamente dois lugares, ambos no Duelo relâmpago: BlitzGame.tsx:194 (`{combo:0, fever:false, recorde:true}`) e BlitzGame.tsx:261 (`{combo: nova, fever}`). Nenhum passa `perfeita` — grep por 'perfeita:' em src/ não devolve nenhum call site. Como o progresso de 'colecionador' é `{atual: eventosVistos, meta: 11}` (core/learning/conquistas.ts:64-65), o contador trava em ≤10. Presos atrás disso: 100 Seeds, 120 XP e o cosmético exclusivo 'ras-arcoiris'.

**Consequência.** O contador 'eventos raros: N/11' (AntessalaDaRodada.tsx:495 e Recordes.tsx:36-37) exibe uma coleção que ninguém consegue fechar, e um item exclusivo da Loja fica trancado para sempre. Além disso, os eventos de combo 5/10/15 e de recorde só existem no Duelo relâmpago: nos outros oito jogos, 15 acertos seguidos não produzem nada além do efeito de acerto comum.

**Proposta.** Disparar `eventosCondicionais({ perfeita: true })` onde a precisão 100% já é calculada no fim de rodada, e mover a chamada de combo para o vocabulário compartilhado: `comemorar` (lib/juice.ts:76) já é o único ponto que os nove jogos usam e já sorteia os eventos raros ali (juice.ts:86-92).

**Risco da mudança.** Levar a escada de exagero para os nove jogos pode virar ruído nos de ritmo lento (Ditado, Karaokê), onde tremor de tela atrapalha a tarefa. E 'consertar' a meta mexendo em `todosOsEventos()` reescreveria o denominador de quem já está colecionando.

### 🔴 F30 — A única explicação de moeda na tela de jogos ensina uma regra que foi revogada

**Evidência.** Play.tsx:1997, no `title` da pílula de seeds: 'Saldo: N ganhas (1 por palavra capturada, 4 por revisão certa)'. A tabela real (core/learning/xp.ts:61-69) é cartao 1, revisaoCerta 2, jogoCerto 1, rodadaPerfeita 5, presenca 5, capturaPor5Min 1, sequencia7 25 — e core/learning/economia.ts:55-59 registra explicitamente que `palavraCapturada` SAIU das Seeds na economia v2. O módulo `economia.ts` existe para que 'o que o app promete seja, por construção, o que ele credita' (economia.ts:10-12); essa string não lê a tabela, é texto fixo.

**Consequência.** Na tela de JOGOS o app afirma que capturar rende moeda (não rende mais), erra o valor da revisão pelo dobro, e não menciona nenhuma das formas de ganhar Seeds jogando (1 por acerto, 5 por rodada perfeita). O jogador conclui, do texto oficial, que jogar não paga — num projeto cuja cultura é a honestidade numérica.

**Proposta.** Trocar o texto fixo por uma leitura de `REGRAS` (core/learning/economia.ts:31-41), como a tela Conquistas já faz (Conquistas.tsx:4), mostrando primeiro as linhas que ESTA tela pode mover: 'acertar um item de jogo' e 'fechar uma rodada sem errar'.

**Risco da mudança.** A tabela tem 9 linhas; despejada num tooltip vira texto denso exatamente onde o dono pediu menos texto. Cabe escolher duas ou três linhas, e escolher é decidir o que o jogador não vai ler.

### 🔴 F31 — O objetivo do dia existe e está arquivado atrás de 'Ver os números do baralho'

**Evidência.** O card 'N palavras pedindo revisão' só renderiza com `detalhes` ligado (Play.tsx:2254), e `detalhes` nasce false (Play.tsx:2237, chave `babel.play.detalhes`). O rótulo do gatilho é 'Ver os números do baralho (N palavras)' (Play.tsx:2091): o que caduca com o tempo foi arquivado junto com estatística de acervo. Do outro lado, a missão 'practice' do app aponta para a view 'study', não para jogar (lib/progress.ts:129-136), embora jogar escreva SRS de verdade (Play.tsx:834-836) e portanto derrube `dueToday`.

**Consequência.** Quem abre a tela de jogos não encontra nenhuma razão para jogar HOJE em vez de amanhã, e a única razão honesta que o app possui (palavras vencidas, medidas) está escondida sob um controle que se anuncia como auditoria. Quando a pessoa joga, o app também não conta que aquilo cumpriu a frente de prática — o crédito é atribuído a outra tela.

**Proposta.** Promover o card de vencidos para fora do `detalhes`, acima da grade, com o texto que já existe ('Um duelo relâmpago resolve'), sem contagem regressiva nem linguagem de perda. E fazer a missão 'practice' reconhecer rodadas que escrevem SRS, para jogar aparecer como caminho legítimo dela.

**Risco da mudança.** Um card sempre presente com um número grande (442 medido) pode ser lido como cobrança em vez de convite. E promover mais uma banda empurra a grade de jogos para baixo — o mesmo CLS que os `min-h` espalhados por esta tela existem para conter.

### 🟡 F32 — Da tela de jogos não sai nenhum caminho para a economia que ela alimenta

**Evidência.** As únicas navegações em Play.tsx são 'capture' (1537, 2239), 'study' (2603) e 'loja'/aba progressão (1804) — esta última dentro do ScratchReward, que não renderiza (ver primeiro achado). As palavras 'conquista', 'passe' e 'temporada' não aparecem no JSX do lobby. Enquanto isso, 6 das 14 conquistas dependem de jogar ('sem-erro', 'perfeccionista', 'duelista', 'colecionador' e, na prática, 'nivel-5'/'nivel-10' — core/learning/conquistas.ts:56-75), e o marcador do passe anda a cada 10% da barra de XP do nível (core/passe.ts:99-101).

**Consequência.** Cada rodada move o passe, as conquistas e o desbloqueio por nível, e nada disso é visível de onde se joga. O jogador só descobre o que ganhou se, por conta própria, for até a tela vizinha — que é justamente a tela que o dono aponta como muito mais gamificada.

**Proposta.** Uma linha única ao lado da pílula: 'no nível N+1 você libera 🎁 Nome', com link para /loja › Progressão. O cálculo já está pronto e testável: `proximaRecompensa` em lib/galeria/progressao.ts:33-42, exatamente o que o ScratchReward morto já usava.

**Risco da mudança.** É mais uma banda acima da grade, numa tela que já gasta 90 palavras antes do título 'Escolha um jogo'. Só se paga se substituir algo — o candidato natural é a faixa de status do baralho.

### 🟡 F33 — A melhor superfície de progressão do subsistema é opcional e pode ser desligada para sempre

**Evidência.** AntessalaDaRodada.tsx:449-497 monta um painel com nível POR JOGO e barra até o próximo (`nivelNoJogo`, core/minigames/fases.ts:98), recorde, maior combo, precisão histórica, '% do vocabulário enfrentado', 'eventos raros: N/M' e 'no nível X você libera 🎁 Nome'. Ele só existe com `gameId && recorde` (linha 449) — nunca para quem ainda não jogou aquele jogo — e desaparece de vez quando a pessoa marca 'começar direto', persistido em `babel.pular_antessala` (Play.tsx:148-152 e 659). No lobby, a carta mostra apenas o selo de recorde.

**Consequência.** O único lugar que responde 'jogar constrói o quê?' está atrás de uma tela que o próprio app oferece para pular, e está ausente exatamente para quem mais precisa dela — o jogador novo, que ainda não tem recorde em nenhum jogo.

**Proposta.** Levar o nível-por-jogo com barra para a própria carta do lobby. É o vocabulário que a tela vizinha /loja já usa (crachá de etapa + barra de nível) e que a carta de jogo não usa; a antessala fica só com a composição da rodada.

**Risco da mudança.** A carta já carrega miniatura, título, '?', duas setas, alfinete, contagem, recorde e às vezes um botão de desbloqueio. Mais um elemento derruba a legibilidade que os ajustes de C6/C9 (Play.tsx:2364-2391) conquistaram — provavelmente só cabe se os controles de reordenar saírem da carta.

### 🟡 F34 — A chama de dias seguidos não pode ser movida por jogar, e o texto afirma que pode

**Evidência.** `streakDays` é `Math.max(dias com revisão, sequência de presença)` (server/db/repositories/metrics.ts:279, com a presença vindo de `seqPresenca` em :212), e a presença é creditada no boot do app (App.tsx:424-429, `registrarPresencaHoje`). Já o `title` na tela de jogos afirma: 'Dias seguidos com revisão. Uma revisão hoje mantém a ofensiva.' (Play.tsx:1990).

**Consequência.** O número já está garantido no instante em que a tela abre: nada que o jogador faça ali o altera. É um contador que ocupa um terço do cabeçalho de progresso, promete uma condição que não é a real, e não muda comportamento nenhum — gamificação vazia no sentido estrito. (Vale preservar o que está certo: a ofensiva não pune, porque `marcosDeSequencia` conta do histórico e nunca cobra de volta — economia.ts:64-69.)

**Proposta.** Ou dizer a verdade ('você apareceu hoje · N dias seguidos'), ou trocar o slot por um número que esta tela move: rodadas de hoje, acertos de hoje, ou a distância até a próxima casa do passe. Sem penalidade por quebrar — o valor está em ver o acumulado, não em temer perdê-lo.

**Risco da mudança.** Trocar o indicador quebra a paridade com o Hub, que mostra a mesma chama saída do mesmo `deriveProgress`. Dois significados para o mesmo ícone em duas telas seria pior que um significado impreciso em uma.

### ⚪ F35 — Cada carta mostra dois 'recordes' diferentes com o mesmo rótulo

**Evidência.** O selo sobre a miniatura lê `recordesMapa` (Play.tsx:2414-2417), preenchido por `fetchRecordes()` SEM origem (Play.tsx:235) — o melhor de todas as fontes. A pílula 'recorde N' no rodapé da MESMA carta lê `recordeDoJogo` (Play.tsx:2567-2570), que vem de `recordes`, preenchido por `fetchRecordes({ origem: origemAtual })` (Play.tsx:1079 e 1083) — o melhor apenas nesta fonte. Os dois são rotulados 'recorde' e divergem sempre que a fonte em uso não é a de melhor placar.

**Consequência.** Na trilha ou numa gravação específica, a mesma carta anuncia dois alvos diferentes sem explicar a diferença. Um alvo ambíguo deixa de ser alvo, e o recorde é o único gancho de retorno que a carta oferece.

**Proposta.** Um número por carta — o da fonte em uso, que é o que a próxima rodada de fato pode bater (a decisão já está registrada em Play.tsx:349-355: bater recorde no A1 e no baralho inteiro não são a mesma proeza). O recorde geral fica no modal Recordes, que já o mostra.

**Risco da mudança.** Tirar o selo da miniatura remove o único elemento de recompensa na parte alta da carta, onde o olho passa primeiro. E o recorde por fonte muda ao trocar de fonte, o que pode parecer que o app perdeu o placar.

---

## Volume e qualidade de texto

_Onde o texto se acumula, e onde ele está no momento errado._

### 🔴 F36 — A ficha "Como se joga" tem 1.203 palavras e 28% dela é o tour escrito de novo

**Evidência.** Medi `COMO_SE_JOGA` (ComoSeJoga.tsx:64-193): 1.203 palavras de copy, ~128 por jogo, distribuidas em treina 118 / passos 340 / avaliacao 253 / limites 230 / ajudas 262. O campo `passos` (340 palavras) e exatamente o que `PASSOS_DOS_JOGOS` (passosDosJogos.ts:20-67) ja entrega DENTRO da partida: 29 passos, 377 palavras, apontando o elemento real, com regra de redacao explicita de 1 frase por passo e maximo 5 (passosDosJogos.ts:9-15). Play.tsx:664 dispara o tour na primeira rodada de cada jogo. Alem disso, `jaViuComoSeJoga` e `marcarComoVisto` (ComoSeJoga.tsx:52-58) sao exportados e NAO sao chamados por ninguem (grep em src/ devolve so as tres definicoes): o docblock que diz "QUANDO APARECE. Uma vez por jogo, antes da primeira partida" (ComoSeJoga.tsx:21-22) descreve um comportamento que nao existe mais — a ficha so abre pelo "?" da carta (Play.tsx:2443-2450).

**Consequência.** Quem clica no "?" esta perdido no meio de uma decisao e recebe um modal de 5 secoes com ~128 palavras, das quais um terco repete instrucoes que ela ja recebeu (ou vai receber) apontadas no elemento real. Ler a ficha inteira custa mais que jogar a primeira rodada, entao ela fecha sem ler — inclusive as duas secoes que so existem ali.

**Proposta.** Cortar `passos` da ficha (340 palavras, -28%) e por no lugar um botao "Rever o tour deste jogo", que rechama `TourGuiado` com `PASSOS_DOS_JOGOS`. Promover `ajudas` a primeira secao, porque o tour cobre so parte delas (no caca-palavras o tour mostra o radar e a ficha lista radar+dica+revelar; no Termo o tour mostra a varinha e a ficha lista varinha+ouvir+lampada) — essa e a informacao que nao chega por outro caminho. A ficha cai para 3 secoes e ~67 palavras por jogo. Apagar `jaViuComoSeJoga`/`marcarComoVisto` ou corrigir o docblock.

**Risco da mudança.** Quem esta escolhendo o jogo no lobby perde o "como se joga" em texto: o tour so roda dentro da partida, entao a ficha deixa de responder "vale a pena entrar?" e passa a responder so "o que isso mede". Se o botao de rever o tour nao for implementado junto, o corte vira perda liquida.

### 🔴 F37 — A carta bloqueada diz o mesmo fato tres vezes, todas em negativo, com o botao que resolve logo abaixo

**Evidência.** Play.tsx:2539-2543 monta `${falta} · precisa de ${precisa} · voce tem ${disponiveis} do ${idioma}` — "falta 1 palavra · precisa de 4 · voce tem 3 do ingles", 11 palavras onde `falta` = `precisa` − `voce tem`: um unico fato enunciado tres vezes. O proprio perfil kids ja prova que a forma curta funciona: `${falta} para abrir` (Play.tsx:2541-2542). Logo abaixo, Play.tsx:2552-2563 renderiza a porta de `comoDesbloquear`, cujo modulo declara a regra "uma acao por carta, a mais barata que resolve" (desbloqueio.ts:13) e cujo docblock ja diagnosticou este mesmo texto: "a carta bloqueada ja dizia a causa com numero honesto (...). O que ela nunca disse foi o que fazer com isso" (desbloqueio.ts:7-10). E a carta bloqueada AINDA renderiza `j.descricao[ageProfile]` (Play.tsx:2502, ~9 palavras). O mesmo padrao se repete no baralho vazio: "Faltam N palavras" + "Voce tem X e precisa de Y para a primeira rodada" (Play.tsx:2231-2236).

**Consequência.** A carta que a pessoa nao pode usar e a que carrega mais texto na grade (descricao + 11 palavras de deficit + botao), e todo esse texto fala do que ela nao tem. Numa grade de 9 jogos com poucos itens no baralho, a tela de "jogar" vira um relatorio de faltas.

**Proposta.** Uma linha, contavel e positiva: `3 de 4 palavras` (ou um anel de progresso 3/4 desenhado sobre o cadeado), mantendo a porta de `comoDesbloquear` intacta. A honestidade nao muda — os dois numeros exatos continuam la e a lacuna continua visivel —, some so a triplicacao e o verbo "faltar". Mesmo tratamento em Play.tsx:2231-2236 ("3 de 4 palavras para a primeira rodada") e no card "N ficaram de fora" (Play.tsx:2159). Em carta bloqueada, esconder `descricao`: quem nao pode jogar nao precisa da mecanica.

**Risco da mudança.** O idioma sai da linha ("do ingles"), e ele existia para explicar que a contagem e POR idioma — alguem com 300 palavras em portugues e 3 em ingles nao entende um "3 de 4" sem isso. Mitiga que a faixa "Praticando · Minhas palavras · ingles" (Play.tsx:2058-2060) fica acima da grade; se essa faixa for removida por outro achado, este risco vira defeito.

### 🔴 F38 — Os quatro fatos da rodada sao reescritos em oito lugares — e o card "Sua proxima rodada" e o cabecalho da antessala sao a mesma frase, a um clique de distancia

**Evidência.** Play.tsx:2296-2299 imprime `{tamanhoDaRodada} palavras · {rotuloDaFonte(fonte)} · {rotuloDeDuracao(estimativaDeMinutos(...))}`. Play.tsx:1666-1667 passa EXATAMENTE esses mesmos calculos para a antessala (`fonte={{ rotulo: rotuloDaFonte(...), idioma: langLabelPt(...) }}` e `duracao={rotuloDeDuracao(estimativaDeMinutos(...))}`), e AntessalaDaRodada.tsx:369-375 os reimprime na mesma ordem. Fora esses dois, o mesmo par "de onde vem / quantas sao" aparece em: SalaDeEscolha.tsx:348-356 ("N palavras prontas"), Play.tsx:2058-2060 (faixa "Praticando"), Play.tsx:2091 ("Ver os numeros do baralho (N palavras)"), Play.tsx:2102-2119 (ate 5 contagens do baralho), Play.tsx:2141-2142 (card do mapa), Play.tsx:2516-2518 ("N nesta rodada · N disponiveis", vezes 9 cartas) e AntessalaDaRodada.tsx:508-513 (os 4 ladrilhos).

**Consequência.** Entre abrir a tela e responder a primeira pergunta a pessoa atravessa tres telas (Sala -> lobby -> antessala) que repetem a mesma contabilidade em oito redacoes diferentes. O card "Sua proxima rodada" promete e a antessala repete: dois blocos consecutivos com identico conteudo fazem o segundo parecer uma tela de confirmacao burocratica, e e por isso que existe um checkbox para desligar a antessala (AntessalaDaRodada.tsx:729-737).

**Proposta.** Escolher UM dono por fato. A fonte+idioma pertence a faixa "Praticando" (Play.tsx:2054-2064) e nao precisa ser repetida na carta nem no cabecalho da antessala. O tamanho+duracao pertence a antessala (e onde a rodada de fato existe); o card "Sua proxima rodada" fica so com nome do jogo + botao, virando o botao grande de "jogar de novo" que a tela nao tem. Se a antessala herdar `fonte` e `duracao` do lobby, ela nao deve reimprimi-los: deve imprimir so o que o lobby nao sabia — o saldo (novos/vistos/vencidos) e o "por que estas".

**Risco da mudança.** A antessala e apresentada como prova de que o recorte escolhido sobreviveu ate a rodada (o docblock em AntessalaDaRodada.tsx:86-91 diz que o recorte "sumia da tela" e por isso voltou). Tirar fonte+idioma de la reabre esse buraco para quem chega na antessala por caminho que pula o lobby (o botao "Ver o que vem" da carta, Play.tsx:2481-2491, e o rejogar de fase, AntessalaDaRodada.tsx:668-706).

### 🟡 F39 — 54 strings de carta para tres perfis, mas 6 dos 9 titulos kids e senior sao o mesmo texto — e o registro de copy do projeto nao e usado aqui

**Evidência.** jogos.tsx:34-134: 9 jogos x 3 perfis x 2 campos = 54 strings, 320 palavras. Comparei kids vs senior nos 9 titulos: 2 sao byte-identicos ('Jogo da memoria', 'Caca-palavras'), 4 diferem so na forma verbal ('Escreva'/'Escrever a palavra', 'Monte'/'Montar a frase', 'Escreva'/'Escrever o que ouviu', 'Palavras que ligam'/'Palavras de ligacao') e so 3 sao de fato diferentes (karaoke, escuta, blitz). Nas descricoes, senior e sistematicamente mais longa que kids (85 vs 70 palavras). Enquanto isso o projeto JA tem registro central de copy por perfil com interpolacao `{n}`: `COPY` (39 chaves) e `t(key, profile, vars)` em profile.ts:82-388, importado por Study.tsx:15, Analysis.tsx:2, Metrics.tsx:8 e FaixaDeProgresso.tsx:3 — e por NENHUM arquivo do subsistema de jogos. O lobby resolve o mesmo problema de tres jeitos diferentes: os Records de jogos.tsx, 10 `Record<AgeProfileType,string>` locais na antessala (AntessalaDaRodada.tsx:301-350, 30 strings) e 12 ternarios `ageProfile ===` inline em Play.tsx.

**Consequência.** Cada ajuste de copy de um jogo custa 3 edicoes, e em 6 dos 9 casos duas delas produzem texto identico ou quase. Nao e sustentavel para 9 jogos e ja e o motivo pelo qual a copy das cartas envelheceu (a descricao continua igual na 40a partida). Tres mecanismos concorrentes para a mesma coisa garantem que a proxima tela de jogo invente um quarto.

**Proposta.** Reduzir `titulo` a dois eixos — `pro` (o nome tecnico: 'Soletrar (Termo)', 'Caca-conectores') e `padrao` — porque esse E o eixo real; o docblock de jogos.tsx:16-19 acerta ao defender `pro` contra os outros e erra ao defender kids contra senior. Isso derruba 27 para 18 strings de titulo. Migrar o que sobrar para `COPY`/`t()` em profile.ts, que ja tem a convencao `{n}` de que a tela precisa. E sumir com `descricao` da carta depois que a miniatura funcionar: Play.tsx:2396-2397 ja declara que o trabalho da miniatura e "mostrar a MECANICA antes de a pessoa ler o titulo" — hoje o desenho e o texto fazem o mesmo trabalho e nenhum dos dois sozinho.

**Risco da mudança.** Fundir kids e senior num `padrao` torna caro voltar atras se depois surgir uma diferenca real de tom para criancas; e trocar de perfil passa a renomear os jogos na tela (de 'Jogo da memoria' para 'Memoria: palavra e traducao'), o que confunde quem experimenta os perfis. Retirar `descricao` da carta antes de a miniatura ler como icone deixa a carta com titulo e numero apenas — pior que hoje.

### 🟡 F40 — 126 palavras de teoria do agendador na antessala, exibidas a cada rodada

**Evidência.** AntessalaDaRodada.tsx:565-578: `<details>` "Como funciona a repeticao e a dificuldade" com 6 bullets, 126 palavras medidas, citando LEECH_APOS, JANELAS_DE_RETORNO, ALVO_MIN/ALVO_MAX e JANELA_DE_RODADAS. Ele mora dentro do card "Por que estas?", que na mesma sessao ja carrega ate 6 chips (linhas 537-544), a linha `auto.motivo` (546), o diagnostico do Termo (548-553) e o bloco de leeches, cuja frase explicativa tem 20 palavras (linha 557). Acima dele ha um segundo `<details>`, "Ajustar a rodada (nivel e foco)" (386-431). O proprio docblock do teto da lista diz que "o objetivo dela e ser LIDA antes de jogar" (linhas 137-139).

**Consequência.** Entre "quero jogar" e jogar existem dois acordeoes, 4 ladrilhos, ate 6 chips e um manual de 126 palavras sobre um algoritmo. E conteudo correto no momento errado: a pergunta "por que esta palavra de novo?" nasce DEPOIS de a palavra voltar, nao antes da rodada comecar. O volume ao redor faz a linha que importa (`auto.motivo`) desaparecer no meio.

**Proposta.** Caso (b): manter o conteudo, mudar o momento. Os 6 bullets viram uma pagina unica "Como a sua memoria e contada", linkada (a) do resumo de fim de rodada, onde a pessoa acabou de ver uma palavra retornar, e (b) do rodape do lobby. Na antessala fica so o que e DESTA rodada: `auto.motivo` (ja e uma linha) e o bloco de leech quando dispara. O `<details>` vira um link de 5 palavras.

**Risco da mudança.** A regra deixa de estar no lugar onde a duvida aparece pela primeira vez para quem nunca leu, e um link e mais facil de ignorar que um acordeao no caminho. Se o resumo de fim de rodada nao ganhar o link junto, a explicacao simplesmente some do fluxo.

### 🟡 F41 — "O que este jogo nao mede" e a unica secao pintada como alerta — a honestidade do projeto esta vestida de erro

**Evidência.** ComoSeJoga.tsx:292-296: `limites` e o unico dos cinco campos renderizado em `text-warn-ink` sobre `bg-warn-soft` com `border-warn/20` e icone `AlertTriangle`; os outros quatro sao paragrafos neutros `text-ink-muted` (linhas 256, 262, 277, 288). Sao 230 palavras nesse formato, e o rotulo e uma negacao. Varios corpos sao dupla negacao: "Voce pode fechar todos os pares e ainda nao conseguir usar a palavra ao falar" (memory, linha 73) e "Acertar aqui nao garante que voce produziria a palavra numa conversa" — frase praticamente identica repetida em blitz (188) e escuta (146). O mesmo tom vaza para `avaliacao`: "Nunca vale 'facil'" (linha 72). E o botao que fecha o dialogo diz "Agora nao" (linha 310), logo abaixo da caixa amarela.

**Consequência.** A ultima coisa que a pessoa le antes de "Comecar" e uma caixa amarela dizendo o que o jogo vai falhar em provar, e o botao de saida ao lado. O projeto esta certo em dizer o limite; o problema e que a linguagem visual reservada a AVISO (a mesma do `custo` das ajudas, linha 280, que e algo acionavel) foi emprestada para honestidade metodologica, que nao e um risco a evitar.

**Proposta.** Manter o fato, trocar o enquadramento e a tinta. Renomear a secao para "O passo seguinte" e reescrever cada `limites` como ponteiro em vez de negacao — o proprio caca-palavras ja faz isso e termina com "para isso existe o Soletrar" (linha 86); memory viraria "Reconhecer e o primeiro passo; para produzir a palavra, o Soletrar". Usar o mesmo paragrafo neutro dos outros quatro campos, deixando `warn` so para o que a pessoa pode agir. Escrever uma vez a frase que blitz e escuta compartilham. Ganho estimado: as 230 palavras caem para ~130 e cada uma passa a apontar para outro jogo do app.

**Risco da mudança.** Tirar o alarme visual pode fazer o limite virar texto puladol — e o docblock de ComoSeJoga.tsx:17-19 defende exatamente o contrario ("esconder o limite faz a pessoa tirar a conclusao errada de uma nota baixa"). A defesa honesta e que o limite morde no fim da rodada, nao antes dela: se o resumo de fim de rodada nao ganhar uma linha de limite junto com a nota, a mudanca enfraquece a honestidade em vez de reposiciona-la.

### 🟡 F42 — Dez bandas de texto antes de "Escolha um jogo", e o unico card acionavel esta atras do mesmo toggle que esconde a auditoria do baralho

**Evidência.** No lobby (return em Play.tsx:1944) empilham-se, antes do titulo da grade em 2313: h1+subtitulo (1958-1965), pilula de progresso com 3 tooltips longos (1971-2002), "sequencia encerrada" (2013-2019), faixa "Praticando/trocar" (2054-2064), "Ver os numeros do baralho (N palavras)" + "Recordes e ranking" (2084-2099), faixa "Seu baralho" com ate 5 contagens (2101-2120), dois cards Mapa/"Nada ficou de fora" (2127-2184), card "N palavras pedindo revisao" (2254-2272) e "Sua proxima rodada" (2288-2310) — as 90 palavras medidas pelo dono antes do titulo da grade. Tres dessas bandas dependem de um unico flag `detalhes`, persistido em `babel.play.detalhes` e com padrao false (Play.tsx:237-238). A anomalia: o card "N palavras pedindo revisao", que e a UNICA acao urgente da tela e leva direto ao blitz (Play.tsx:2254-2256), esta na mesma condicao `detalhes &&` que as duas bandas de auditoria de acervo — some junto com elas. E o checkbox "Mostrar a previa antes de comecar" (Play.tsx:2325-2333) divide a linha com o titulo "Escolha um jogo", ou seja, uma preferencia competindo com um cabecalho de secao.

**Consequência.** Com o toggle ligado (o estado em que a tela foi medida), a pessoa le tres bandas de auditoria de acervo antes de jogar; com ele desligado, ela perde a chamada das 442 palavras vencidas — a unica linha da tela que responde "o que eu faco agora". Nos dois estados o toggle decide errado, porque agrupa uma acao com duas auditorias. E o subtitulo da tela promete "Rodadas curtas com as SUAS palavras" (1964) enquanto o corpo entrega contabilidade.

**Proposta.** Separar os tres. (a) Tirar `detalhes` da condicao do card de revisao (Play.tsx:2254): ele e acao e fica sempre visivel quando `vencidos > 0`. (b) Juntar "Seu baralho" + "Mapa do conteudo" + "ficaram de fora" num painel unico atras do botao que ja existe (Play.tsx:2084-2092), em vez de tres bandas inline — o lobby passa a ter uma forma constante. (c) Mover o checkbox da previa para dentro do card "Sua proxima rodada", que e onde ele faz efeito, liberando a linha do cabecalho da grade.

**Risco da mudança.** Recolher os numeros do baralho apaga a resposta a "por que tao pouco?", que o comentario em Play.tsx:2122-2126 foi escrito para resolver, e as linhas de bloqueio das cartas hoje se apoiam nesses numeros estarem visiveis. Mitiga que a porta de `comoDesbloquear` ja esta em cada carta bloqueada — mas se o achado sobre a linha de bloqueio for aplicado junto, e preciso garantir que o painel recolhido continue alcancavel em um clique.

---

## Acessibilidade, responsivo e estados de borda

_O que acontece com quem usa teclado, leitor de tela, celular ou rede ruim._

### 🔴 F43 — Dois diálogos modais empilhados na entrada, e o de cima não move o foco

**Evidência.** Play.tsx:227 `useState(!embutido)` — a Sala abre sozinha em toda entrada. Play.tsx:1929 e 1950 renderizam `{sala}` já no ramo de esqueleto. SalaDeEscolha.tsx:112 autofoca o botão "Jogar" (`botaoJogar.current?.focus`). SalaDeEscolha.tsx:157 `z-[45]`; RecompensaDesbloqueada.tsx:83 `z-[60]` com `role="dialog" aria-modal="true"` — e no arquivo inteiro (147 linhas, lido) NÃO existe foco inicial, listener de Escape, nem handler de clique no backdrop. App.tsx:486-490 enfileira UMA entrada por nível subido (bate com os 2 modais seguidos observados).

**Consequência.** Quem entra em Praticar com 2 níveis pendentes tem o foco do teclado preso no botão "Jogar" da Sala, invisível sob dois backdrops. Enter começa uma rodada que ninguém pediu; Esc fecha a Sala (o diálogo de baixo) e deixa o de cima na tela. Para fechar a festa, um usuário de teclado precisa tabular pela página inteira (57 botões) até chegar ao portal no fim do `document.body` — e repetir para o segundo modal. Para leitor de tela há dois `aria-modal="true"` simultâneos, comportamento indefinido.

**Proposta.** Dar ao RecompensaDesbloqueada o mesmo tratamento que a Sala já tem: foco inicial no botão primário, Escape fechando, e armadilha de foco. E suprimir a Sala enquanto `filaDeRecompensas.length > 0` (ou o inverso: segurar a fila até `salaAberta === false`), para que nunca haja dois diálogos vivos. Se o dono quiser mesmo a Sala a cada entrada, ela deveria montar só depois de a fila esvaziar.

**Risco da mudança.** Segurar a fila atrasa a entrega da recompensa; se a Sala nunca fechar (usuário sai da tela), a fila precisa de uma válvula de escape ou a recompensa some — `marcarVista` só é chamado em `fechar()`, então não se perde, mas fica represada.

### 🔴 F44 — Esc dentro da Sala fecha a Sala inteira, e o seletor de idioma vaza a armadilha de foco

**Evidência.** LangPicker.tsx:190 e 203 — a lista abre por `createPortal` com `fixed z-[70]`, ou seja, FORA de `dialogo.current`. LangPicker.tsx:110 autofoca o input de busca do portal. LangPicker.tsx:150 trata Escape com `e.preventDefault()` mas SEM `stopPropagation`. SalaDeEscolha.tsx:117 escuta Escape em `window`. SalaDeEscolha.tsx:129 monta a lista de focáveis com `dialogo.current?.querySelectorAll`, que não enxerga o portal.

**Consequência.** A pessoa abre "escolher outro idioma" (SalaDeEscolha.tsx:218), digita, se arrepende e aperta Esc: fecha a lista E o diálogo inteiro junto, jogando fora idioma, origem, escopo e nível que ela acabou de escolher — o estado da Sala é local e `aoFechar` não confirma nada. Pelo teclado é pior: com o foco no input do portal, `document.activeElement` não é nem o primeiro nem o último da lista da armadilha, então nenhum `preventDefault` acontece e o Tab escapa para a página atrás do modal, que a pessoa não consegue ver.

**Proposta.** Em LangPicker.tsx:150, `e.stopPropagation()` no ramo do Escape. Em SalaDeEscolha, trocar a armadilha caseira por uma que resolva focáveis também nos portais descendentes (ou usar `<dialog>` nativo / `inert` no resto da árvore, que resolve foco, Esc e backdrop de uma vez).

**Risco da mudança.** `stopPropagation` no LangPicker afeta todos os outros usos dele no app — pode quebrar alguma tela que hoje depende do Esc borbulhar. Migrar para `<dialog>` nativo muda o empilhamento (top layer ignora z-index) e exigiria revisar o orçamento de camadas documentado em Play.tsx.

### 🔴 F45 — Falha de rede é apresentada como "Você ainda não salvou palavras"

**Evidência.** Play.tsx:952 `if (baralho.cards) setDeck(...) else setErro(baralho.erro)` — no erro, `deck` permanece `null`. Play.tsx:1926 `if (deck === null && !erro)` não pega esse caso. Play.tsx:1562 `const tamanhoDoBaralho = deck?.length ?? 0`. Play.tsx:2224 `tamanhoDoBaralho < menorMinimo` → estado vazio. Play.tsx:2231 imprime "Você ainda não salvou palavras". A mensagem verdadeira está em Play.tsx:2580-2583, num `<p>` de `text-[12px]`, sem `role="alert"` e sem botão de tentar de novo.

**Consequência.** Quem tem 442 palavras pedindo revisão e entra com a rede caída lê que não salvou nada, vê "Você tem 0 e precisa de 4" e é empurrado para "Capturar uma sessão" — ou seja, o app acusa o usuário de não ter feito o trabalho que ele fez. O motivo real fica abaixo do card, em cinza de 12px, e leitor de tela não anuncia porque não há região viva. Não há como tentar de novo sem recarregar a página.

**Proposta.** Tratar `erro` como um terceiro estado antes do estado vazio: card próprio com `role="alert"`, o texto do erro e um botão "Tentar de novo" que refaz o `fetchDeck` (o mesmo padrão já usado em Play.tsx:1832). Só cair no "você ainda não salvou palavras" quando `deck` for um array de fato vazio.

**Risco da mudança.** Um terceiro ramo de render numa máquina de estados que já tem 16 ramos. E se o erro for parcial (settings falhou, deck veio), o card de erro pode aparecer sobre uma tela funcional — precisa distinguir qual busca falhou.

### 🟡 F47 — A grade não tem semântica de lista, repete o nome do jogo 5× por carta, e as setas de ponta são controles mortos e mudos

**Evidência.** Play.tsx:2361 — a grade é `<div>` de `<div>`, sem `<ul>/<li>`, sem `role="list"`, e o título do jogo é `<button>` (2428), não cabeçalho: o único heading da região é o `<h2>` "Escolha um jogo" (2313). Rótulos por carta: 2437 (título), 2447 "Como se joga: X", 2472 "Mover para a esquerda: X" e "Mover para a direita: X", 2497 "Fixar no topo: X". `grep -c aria-live src/components/views/Play.tsx` = 0. ordemDosJogos.ts:77 `if (i < 0 || j < 0 || j >= grupo.length) return pref` — nas pontas o move é no-op, mas as duas setas são renderizadas sempre habilitadas (2467-2476), sem `disabled` nem `aria-disabled`.

**Consequência.** Um usuário de leitor de tela ouve o nome de cada jogo 5 vezes seguidas; para percorrer os 9 jogos são ~45 paradas de tabulação, das quais 27 (o número já medido) só reorganizam a grade. Pior: ele aperta "Mover para a esquerda: Memória" na primeira carta, nada acontece e nada é dito — silêncio idêntico ao de um clique que funcionou. Ele não tem como saber se moveu, se já estava na ponta, ou se o botão está quebrado.

**Proposta.** Envolver a grade em `<ul>`/`<li>` (ou `role="list"`), agrupar cada carta com `aria-labelledby` apontando para o título para os controles secundários não precisarem repetir o nome, desabilitar a seta quando `mover` for no-op (a condição já existe em ordemDosJogos.ts:77 e pode virar um `podeMover(pref, visiveis, id, dir)` exportado), e adicionar uma região `aria-live="polite"` que anuncie "Memória: posição 3 de 9" a cada reordenação.

**Risco da mudança.** Desabilitar a seta de ponta tira o alvo de toque do fluxo e pode confundir quem já decorou a posição do botão. `aria-live` numa grade que também recebe atualizações de contagem pode virar tagarelice se a região não for restrita à reordenação.

### 🟡 F48 — No celular a arte 16:7 empilha 9 cartas, e a área de clique da carta engole a fileira de reordenar

**Evidência.** Play.tsx:2361 `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` — abaixo de 640px é UMA coluna. Play.tsx:2410 `aspect-[16/7]`. Play.tsx:1945 `p-6` no container. Aritmética direta: num telefone de 390px, conteúdo = 342px, então só a arte mede 342 × 7/16 ≈ 150px por carta, × 9 cartas. Play.tsx:2435 `after:absolute after:inset-0` faz o botão de jogar cobrir a carta inteira; dentro dessa superfície ficam 3 ou 4 alvos de 24px (`min-w-6 min-h-6`, `gap-1`) em Play.tsx:2462-2500, separados dela só por `z-10`. ordemDosJogos.ts:113 `gravarOrdem` persiste em localStorage. (A altura total por carta — arte + `p-4` + 4 linhas de texto ≈ 340-360px — é estimativa derivada das classes, não medição.)

**Consequência.** O polegar tem duas maneiras de errar e as duas doem: 3px fora de uma seta e começa uma rodada que a pessoa não pediu; 3px dentro de uma seta e a grade dela é reordenada de forma permanente, sem toast, sem desfazer, sem nada mudar de lugar visivelmente na coluna única (mover "para a esquerda" numa grade de 1 coluna nem sequer descreve o que aconteceu). E chegar ao nono jogo custa uma rolagem estimada de ~3.000px depois das bandas de cabeçalho.

**Proposta.** No celular, colapsar a fileira de organizar para dentro de um menu por carta (um único alvo "⋮"), ou escondê-la atrás de um modo "organizar" na barra da grade — os 27 botões de cromo saem do caminho do polegar de uma vez. Reduzir a arte abaixo de `sm` (ex.: `aspect-[16/5] sm:aspect-[16/7]`) ou usar layout horizontal (arte à esquerda, texto à direita) na coluna única. E trocar "esquerda/direita" por "subir/descer" quando a grade tem uma coluna.

**Risco da mudança.** Esconder a reordenação atrás de um menu adiciona um toque para quem usa muito o recurso, e um menu por carta é mais uma camada no orçamento de z-index já apertado (30/40/45/60/70/90/95/100). Mudar a proporção da arte no celular exige revisar cada desenho de ArteDosJogos.tsx, cujo viewBox é fixo em 160×70 (ArteDosJogos.tsx:24) — recortar a faixa deixa fundo sobrando nas laterais, exatamente o defeito descrito no comentário de Play.tsx:2402-2409.

### 🟡 F49 — Enquanto o baralho carrega, a tela inteira é aria-hidden — e o esqueleto não tem a forma do conteúdo

**Evidência.** Play.tsx:1926-1936: o ramo de carregamento renderiza `{sala}` mais 4 elementos, TODOS com `aria-hidden` (1930 e 1932). Não há `aria-busy`, nem texto só-para-leitor. O esqueleto é `grid sm:grid-cols-3` com 3 blocos de `h-28` (112px); o conteúdo real é `sm:grid-cols-2 lg:grid-cols-3` (2361) com 9 cartas muito mais altas, precedidas por cabeçalho, pílula de progresso, recibo da fonte, linha de números, faixa do baralho, card de revisão e card de próxima rodada.

**Consequência.** Quem usa leitor de tela navega para Praticar e encontra uma página literalmente vazia — se a Sala não montar (`fontesOferecidas.length <= 1`, Play.tsx:1910), não há um único nó acessível na tela. Não há "carregando", e quando o baralho chega nada é anunciado: a pessoa fica esperando um app que já terminou. Para quem enxerga, esta é a maior mudança de layout da tela — 3 caixas curtas viram 9 cartas altas mais 6 bandas — e é a única não mitigada num arquivo cheio de `min-h` mágicos justamente contra CLS (2004, 2044, 2252, e SalaDeEscolha.tsx:195 e 299).

**Proposta.** Pôr `aria-busy="true"` e um `<p className="sr-only">Carregando seus jogos…</p>` no ramo de carregamento, e uma região `aria-live="polite"` que anuncie "9 jogos prontos" quando o deck chegar. E fazer o esqueleto ter a forma do destino: mesmas colunas (`sm:grid-cols-2 lg:grid-cols-3`), mesma quantidade de blocos, mesma altura aproximada de carta.

**Risco da mudança.** Um esqueleto com 9 blocos altos pode parecer conteúdo real e frustrar mais quando revela cartas bloqueadas. E reservar a altura certa acopla o esqueleto às medidas da carta — se a carta mudar, o esqueleto passa a mentir de novo.

---
## O achado refutado

**F46 — "O texto que explica o bloqueio é o menos legível da carta: 3,55:1 em 11px no tema claro
padrão."**

A aritmética estava certa e o código foi lido corretamente: `Play.tsx:2508` usa `text-ink-faint` em
`text-[11px] font-bold`, e `Play.tsx:2393` põe `bg-canvas` na carta bloqueada. **Mas o par citado
nunca é pintado.** O auditor leu `--ink-faint: #7A7568` do bloco `:root` nu; o app sempre aplica um
`data-theme` antes do primeiro render (`main.tsx:12` chama `bootTheme()` de forma síncrona antes de
`createRoot().render()`), e o bloco `[data-theme="babel"]` redeclara a paleta inteira com
`--ink-faint: #696459` (`index.css:204`).

Fica registrado porque o método importa: a lente estava certa em olhar o contraste do estado
bloqueado, e errada no valor. Se a auditoria só listasse acertos, não haveria como saber o quanto
confiar nela.

---

## Nota sobre o método

Sete lentes independentes rodaram sobre o mesmo material, cada uma cega para as outras — foi assim
que o mesmo defeito apareceu descrito de dois ângulos diferentes (a carta bloqueada surge na lente de
texto e na de acessibilidade), o que aumenta a confiança em vez de inflar a contagem: achados
duplicados foram mantidos separados porque propõem consertos diferentes.

A verificação adversarial não foi cerimônia. Ela **corrigiu** achados que teriam levado a decisões
erradas — o caso mais importante: a Sala de Escolha **não** abre sempre (só quando há mais de uma
fonte, `Play.tsx:1910`), e as duas saídas que a proposta pedia **já existem na tela**. Sem isso, o
redesenho teria construído controles que já estavam prontos.
