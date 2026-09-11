# Prompt para o Claude Design — completar o Protótipo v2 do Babel Play

Cole no Claude Design o bloco **"Versão operacional com checklist"** abaixo (é o principal). Anexe junto `AUDITORIA.md` e a pasta `prints/`. A **versão curta** serve para iterações rápidas depois que a primeira rodada estiver feita.

---

## Versão curta (para iterar)

> Você está completando o "Babel Play — Protótipo v2 (interativo)". O protótipo cobre 8 telas + onboarding e perdeu ~40 telas, sub-telas e modais que o app real tem. Use o `AUDITORIA.md` anexo como fonte única: ele lista, tela a tela, o que está `OK`, `PARCIAL`, `AUSENTE`, `DIVERGE` e `INVENTADO`, com o arquivo do código de onde cada fato veio. Mantenha os tokens, fontes e o estilo do v2. Corrija primeiro a seção 13 (divergências factuais), depois crie as telas `AUSENTE` na ordem da seção "Ordem de trabalho". Nada de "em breve", botão morto ou número inventado: cada tela nova precisa dos estados vazio, carregando e erro descritos na seção 11.

---

## Versão operacional com checklist (colar esta)

### Papel e objetivo

Você é o designer de produto do **Babel Play**, um app web local-first que captura o áudio do computador (vídeo, chamada, jogo) ou do microfone, transcreve com Whisper no navegador, traduz, e transforma tudo em vocabulário, 18 jogos e revisão espaçada (FSRS-5). Você já produziu o arquivo `Babel Play - Protótipo v2 (interativo).dc.html`. Ele acertou a linguagem visual, o onboarding e a estrutura de Capturar/Planos, mas **cobre só 8 telas de topo e nenhuma sub-tela**: a sessão com 4 abas, a revisão FSRS, o lobby facetado de jogos, os 18 jogos com mecânica, a antessala e a raspadinha da rodada, a Loja real (4 abas, duas moedas, passe de 100 casas, 14 conquistas), Ajustes (4 abas), Perfil (3 abas), Sobre, o Analista de Vocabulário, a janela de legendas sempre-no-topo, o modo sem conta, o iChat, a busca global e os estados de erro/vazio. Também afirma alguns fatos que o app contradiz.

**Objetivo desta rodada**: entregar o **Protótipo v3** = v2 corrigido + todas as telas/sub-telas/modais marcadas `AUSENTE` ou `PARCIAL` no `AUDITORIA.md`, no mesmo arquivo `.dc.html`, no mesmo estilo.

### Fonte de verdade (anexos)

1. `AUDITORIA.md` — comparação lado a lado, tela a tela, com vereditos e `arquivo:linha` do código real. **Se este prompt e a auditoria discordarem, vale a auditoria.**
2. `prints/01…12.png` — 12 capturas do app real (Hub em 2 perfis, modal de conquista, Capturar, lobby de Jogar, Vocabulário, convite de conta, RTL, Ajustes em pseudo-locale). Use-as para calibrar densidade e hierarquia, não para copiar o visual antigo.

### Mantenha (não mexer)

- Tokens: canvas `#E6E2D6`, surface `#F5F2EA`, ink `#26241F`, muted `#5E5A50`, accent `#F04E23` (soft `#FBDDD3`, ink `#b93613`), good `#3E6B44`, warn `#C98A12`, rare `#5B5EA6`, error `#C92A2A`, borda `#C6BFAC`; fontes Archivo (títulos), Inter (corpo), IBM Plex Mono (rótulos/kickers), Silkscreen (logo). São os do tema real do app.
- Onboarding em 8 passos (só acrescente o provedor "Personalizado (OpenAI-compatível)" e o painel de download com 2 barras).
- Hero escuro de Capturar, cards de Planos, raspadinha de revisão como cartão virável (vira o verso do cartão FSRS), modal de sessão com palavras clicáveis (vira a aba Transcrição da tela de sessão).
- A estrutura técnica do arquivo: `sc-if` por tela, `sc-for` para listas, `state` + `renderVals()` na classe `Component`. Uma `sc-if` por tela nova; ids de jogo iguais aos do código (`memory, wordsearch, termo, scramble, karaoke, escuta, ditado, conectores, blitz, karuta, choseong, tenis, koffer, bao, vitendawili, shiritori, cadavre, taboo`).

### Corrija (fatos errados no v2 — seção 13 da auditoria)

1. Navegação: 9 itens, nesta ordem — Início, Capturar, Jogar, Biblioteca, **Vocabulário**, Personalizar, **Sobre**, Planos, **Ajustes**. "Palavras" e "Progresso" saem. Padrão real é **barra no topo**; sidebar é uma das 4 posições (topo, baixo, esquerda, direita).
2. **Nada de "em breve"**: busca (paleta de comandos Ctrl+K), iChat (tutor flutuante/acoplável/maximizável) e ajustes de captura (gaveta) existem e devem ser desenhados.
3. Exportar sessão: **não existe `.srt`**. É um modal com 4 opções: Métricas & Desempenho (`.md`), Flashcards para Anki (`.csv`), Áudio da Sessão (webm/mp3/wav/ogg/m4a; desabilitado sem áudio), Vídeo (bloqueado por direitos).
4. Rodapé do Hub: "a partir de **R$ 9,90**/mês", não R$19.
5. Jogos: não existe "Recomendado". Cards são "prontos" ou "precisam de outro material" com **motivo** e **uma porta de saída** (trocar idioma / trocar fonte / revisar descartes / gravar). Cor do card = modalidade: palavra laranja, frase verde, frase-áudio índigo.
6. Revisão: cartão → "Mostrar Resposta" → "Como foi o seu desempenho?" → **Errei 10m · Difícil 1.2d · Bom 3.5d · Fácil 8d** (intervalo escrito em cada botão). Sem isso não é o produto.
7. Estados de palavra: `New / Learning / Review / Relearning`; a tela resume como "guardadas · novas · p/ revisar" com selo "estimativa · confiança N %" na retenção.
8. Importar: **4 fontes** (Link do YouTube — só Pro, com cadeado explicado; Documento PDF/DOCX/TXT; Link da Web; **Áudio Local** MP3/WAV/M4A).
9. Personalizar: abas reais **Meu visual · Loja · Passe · Desafios** (temas/partículas/cursores viram filtros). Catálogo real na seção 9.2 da auditoria (8 temas, 25 cursores, 19 rastros, 36 packs, 8 fontes grátis, 6 partículas, 2 aprimoramentos, 13 itens de galeria, 10 Variantes Douradas em Créditos). Duas moedas: **Seeds** (só estudando) e **Créditos** (dinheiro). 18 perfis-preset, não 6.
10. Progresso: não é tela. Se quiser manter uma agregação, marque como **proposta** e use só números reais: XP derivado (curva 100·N), etapa/nível (uma palavra só), ofensiva **sem penalidade**, retenção FSRS com confiança, CEFR **sustentado** (não escolhido pelo usuário), tempo com o idioma ativo × passivo. "Meta da semana 5 de 7" não existe; existe "Meta de Comunicação" (ppm alvo × medido) em Ajustes.
11. Planos: 10 linhas (faltam "Modelos para baixar no primeiro uso: 230-413 MB × nenhum" e "Sua própria chave de IA (BYOK) ✓✓✓"), nota "self-host: sem limites" abaixo da tabela, aba "Consumo do mês" com 3 barras.
12. Capturar: sem botões de marcador/pausa; com "Configurações de Dispositivos & IA" (gaveta), "?", Foco Cheio, Bingo, 3 cards de cenário (Assistir mídia / Conversa · chamada / Minha voz), chip de idiomas com drawer, painel Falantes. Legendas flutuantes = **janela Picture-in-Picture sempre no topo** (3 layouts: vídeo/conversa/jogo × 3 níveis: assistido/intermediário/imersão), não um card fixo.

### Adicione (telas `AUSENTE`, agrupadas; detalhe completo na seção indicada da auditoria)

**A. Casca (§1, §2)** — barra de controles completa (busca Ctrl K, ciclo de fonte A, menu de conforto com 3 toggles, claro/escuro, paleta, avatar); menu da conta (4 itens); paleta de comandos; iChat em 3 estados + histórico; toast de erro persistente + diálogo de confirmação; tela de erro; menu de contexto "praticar este trecho"; Estúdio de Layout (barra + painéis com alça); dock mobile 375 px; Login (entrar/criar/recuperar + "Continuar sem conta"); gate de conta (modal), cartão de convite (inline), modal de migração com progresso, aviso por marco; Guia rápido.

**B. Início (§3)** — 3 pilares com status real e copy × 3 perfis (o do meio leva a Revisar); faixa com nível/etapa + ofensiva + Seeds; card-herói só quando há vencidas; bloco "Relatório executivo" expandido (métricas, CEFR, comunicação corporativa); "Recomendações e Próximos Passos"; selo "processando" nas sessões; modal **Recompensa desbloqueada** (conquista / nível / baú), ver `prints/03`.

**C. Capturar (§4)** — gaveta de configurações (3 fontes de áudio do sistema + teste com veredito; mic Navegador/Whisper + dispositivo; saída; qualidade Automática/Rápida/Precisa/Nuvem; modo desempenho; aparência da legenda); painel de preparação do modelo (2 barras, 3 estados); transcrição em balões com falante, ordem original/tradução, "Ir para a fala atual", estado vazio de 3 passos; painel Falantes (auto on/off, cores, renomear, % de fala); Foco Cheio; Bingo; modal "sair no meio"; modal "Encerramento da Sessão" com busca de capa; janela PiP de legendas com os 3 layouts e o nível imersão ("espiar").

**D. Biblioteca, Sessão, Leitura (§5)** — painel de filtros + contadores; menu do card (Retomar Captura, editar, excluir, baixar transcrição); modal editar sessão; importar com 4 fontes e cadeado; **tela de sessão** com cabeçalho (voltar, selo de origem, procedência, "Alternar de Sessão", Exportar) e 4 abas: Transcrição & Vocabulário (editável + Analista à direita), Leitura & Notas (player de narração Original/Tradução/Bilíngue/Auto, velocidade 1,25×, tom, voz por idioma; desenho sobre o texto; notas com voz; player do áudio), Jogos (lobby travado na sessão), Visão Geral & Métricas (KPIs clicáveis + 3 sub-abas; WPM, pausas > 3 s, silêncio, monólogo, sobreposição, vícios; "—" sem timing); modal Exportar com 4 opções.

**E. Jogar (§6)** — lobby: painel nível/XP/ofensiva/Seeds, Partida Rápida, linha "PRATICANDO … trocar" + gaveta de **6 facetas** (idioma, de onde vêm, nível do curso, gravações, baralhos Anki, recorte), linha "SEU BARALHO", cards Mapa/"ficaram de fora", card de revisão, card "Sua próxima rodada", filtros (Todos/Clássicos/Favoritos, busca, habilidades, prévia, Organizar), grade com arte por jogo e legenda de 3 cores, grupo "Precisam de outro material", estado vazio "Faltam N palavras"; Sala de Escolha (1ª vez); **Antessala** (prévia, fases com estrelas, dificuldade Fácil/Médio/Difícil/Auto, leeches, Jogar/Trocar/Repetir/Sair); Como se joga (ficha com ajudas e preços); tour da 1ª partida; **Raspadinha** (3 estrelas, canvas raspável +XP, corrente, combo vivo, caça ao recorde, próxima recompensa; Mais uma / De novo / Ver o que escapou / Voltar / Trocar mantendo o combo 40 Seeds); Resumo da rodada (item a item; Refazer só as erradas / Subir dificuldade); resultado próprio do Blitz com envio opt-in ao ranking (apelido); Recordes com KPIs. **Os 18 jogos com a mecânica da tabela 6.3** (uma tela por jogo, no estado "meio da rodada", mais o feedback de acerto/erro; kids ou senior mudam tempo e vidas). Anote os overlays de acerto: números flutuantes, partículas, eventos raros (chuva de estrelas, patos, "Aquecendo!", "Tempestade de raios", "Fogos").

**F. Vocabulário e Revisar (§7, §8)** — 3 abas (Visão geral / Inteligência lexical / Desempenho & fluência), botão Exportar Relatório, KPIs reais com KPI expandido, 2 gráficos (evolução semanal, distribuição CEFR), catálogo paginado com nota de contagem; **Revisar** com os 4 botões; **Analista de Vocabulário** (IPA, CEFR com procedência, ouvir 0,75×/1×, tradução com motor visível, Wiktionary 3 acepções, Forvo, "Adicionar ao deck / Revisar agora / Exercitar"); Curadoria; Mapa do conteúdo; Baralhos Anki (lista + baralho); painel Trilha; Perfil → Progresso.

**G. Personalizar (§9)** — cabeçalho de temporada com Seeds e Créditos; **Meu visual** (6 slots; paletas 6 estilos × 30 matizes; fonte; partículas + intensidade; editor de pack de emojis; cursor de qualquer emoji; rastro forma × paleta; posição do menu; Estúdio; tema customizado; perfis salvos; "Voltar ao visual original"; perfil de exibição sempre grátis); **Loja** (filtros, prateleiras Em destaque / Dá para levar agora / Ainda não / Com Créditos; card trancado "Falta: Nível N ou M Seeds"); **Passe** (100 casas, 10 décadas, cofres de Seeds, fileira Premium com Variantes Douradas nas casas 10…100, "creditado" só após confirmação); **Desafios** (14 conquistas por raridade com progresso, "Só por conquista", "Como ganhar Seeds e XP", curva de nível); tela Comprar Créditos.

**H. Planos, Perfil, Sobre, Ajustes (§10)** — Planos com 2 abas e 10 linhas; Perfil (Você / Progresso / Seus dados com "Baixar os seus dados" e "Excluir a conta" + relatório do que foi apagado); Sobre (pessoa por trás, princípios, Pix/apoio, privacidade/termos); Ajustes com 4 abas: Idiomas ("Os dois idiomas" + interface só pt/en + LangAudit + "Meta de Comunicação" com ppm alvo × medido), Como o app se parece (ponteiro), Onde as contas rodam (plano + armazenamento; motores Grátis/Privado/Nuvem com matriz stt·mt·tts·llm·embed·vlm e teste; privacidade), Conta e recomeço (senha, sair, Guia, Sobre, Rever apresentação, Reconfigurar).

**I. Estados e viewports (§11, §12)** — para cada tela nova: vazio (título + causa + ação), carregando, erro; mais os específicos listados na seção 11. Mocks 375 px de Hub, Capturar (com PiP), lobby + 1 jogo + raspadinha, Revisar, Vocabulário; dock inferior de 5 itens + "mais".

### Regras de design que o código impõe

1. **Três perfis de exibição** (kids / pro / senior) mudam rótulos, densidade, alvos (48 px no senior) e dificuldade dos jogos. Mostre o Hub, o lobby e um jogo em `pro` **e** em `senior`. Use a copy real da auditoria.
2. **Direito × recompensa**: texto, som, animações, claro/escuro, perfil de exibição, idiomas, dados e "voltar ao original" nunca trancam; temas, paletas, partículas, cursores, rastros, packs e estúdio nunca são de graça e sempre dizem como se consegue.
3. **Honestidade**: sem botão morto, sem "em breve", sem número inventado. Métrica sem base = "—". Vazio explica e oferece ação.
4. **Sem conta funciona**: telas que persistem dados mostram convite (ver `prints/07`), nunca muro.
5. **URL por tela e aba** (sessão, personalizar, filtro de jogar): mostre a barra de endereço quando fizer diferença.
6. **Uma palavra por conceito**: gravação (não mídia/lição), etapa ou nível (escolha uma), Seeds × Créditos, ofensiva (chama) × combo, conquista (troféu) × recorde (medalha). Glossário na seção 15.
7. RTL e textos 40 % mais longos não podem cortar (ver `prints/08`, `11`).

### Ordem de trabalho (por valor para o produto)

1. Corrigir a seção "Corrija" no v2 existente.
2. Tela de Sessão com 4 abas + modal Exportar + Analista de Vocabulário.
3. Revisar com os 4 botões FSRS.
4. Lobby de Jogar completo (facetas, cards, bloqueio com motivo) + Antessala + Raspadinha + Resumo.
5. Os 18 jogos (um mock por jogo).
6. Personalizar real (4 abas) + modal Recompensa + Passe + Desafios.
7. Ajustes, Perfil, Sobre, Planos completos.
8. Casca: busca, iChat, menu da conta, conforto, login/sem conta, erro.
9. Capturar: gaveta, falantes, PiP, Foco Cheio, modais.
10. Estados e mobile.

### Formato de saída

- Um único `Babel Play - Protótipo v3 (interativo).dc.html`, mesma estrutura do v2, navegável (cada tela nova alcançável por clique a partir da navegação ou de uma tela existente).
- No topo do arquivo, um comentário HTML com o **changelog**: para cada item da seção "Corrija" e cada grupo A-I, o que foi feito e o que ficou de fora (com motivo).
- Dados de exemplo **plausíveis e coerentes** com a auditoria (18 jogos com os ids reais, catálogo com nomes/preços reais, 14 conquistas reais, 4 planos). Nada de "Lorem".

### Checklist de aceitação

- [ ] Navegação tem exatamente 9 itens na ordem real; "Palavras" e "Progresso" não existem como itens.
- [ ] Nenhum toast "em breve"; busca, iChat e ajustes de captura abrem telas reais.
- [ ] Tela de sessão tem 4 abas com URL `/sessao/<id>/{transcricao|leitura|jogos|metricas}` e o modal Exportar tem 4 opções sem `.srt`.
- [ ] Revisar mostra "Mostrar Resposta" e depois 4 botões com intervalo (10m / 1.2d / 3.5d / 8d).
- [ ] Lobby de Jogar tem a gaveta de 6 facetas, a legenda de 3 cores e ao menos 1 card "precisa de outro material" com motivo e porta de saída; nenhum "Recomendado".
- [ ] Existem Antessala, Raspadinha (com "Trocar mantendo o combo · 40 Seeds") e Resumo da rodada.
- [ ] Os 18 jogos têm um mock cada, com os ids do código e a mecânica da tabela 6.3.
- [ ] Personalizar tem as abas Meu visual · Loja · Passe · Desafios; o loadout tem 6 slots; Seeds e Créditos aparecem separados com legenda.
- [ ] O catálogo mostrado usa nomes, níveis e preços da seção 9.2 (ex.: cursor Invader 500 Seeds Nv.9, tema Aurora só pela conquista Constante).
- [ ] Passe tem 100 casas em 10 décadas com cofres de Seeds e fileira Premium.
- [ ] Desafios lista as 14 conquistas reais com raridade, Seeds/XP e o exclusivo quando houver.
- [ ] Ajustes tem 4 abas com os rótulos reais; Perfil tem 3; Planos tem 2 abas, 10 linhas, 3 colunas e a nota de self-host.
- [ ] Capturar tem gaveta de configurações, 3 cards de cenário, painel Falantes, painel de preparação do modelo, Foco Cheio e a janela PiP com 3 layouts.
- [ ] Analista de Vocabulário mostra IPA, CEFR, ouvir 0,75×/1×, tradução com motor, Wiktionary, Forvo e as 3 ações.
- [ ] Modal Recompensa desbloqueada existe e é usado por conquista, nível e baú.
- [ ] Hub, lobby e um jogo aparecem em `pro` e em `senior` com a copy real.
- [ ] Toda tela nova tem vazio, carregando e erro; as telas de dados têm o estado sem conta.
- [ ] Há mocks a 375 px com a dock inferior para Hub, Capturar, Jogar (lobby, 1 jogo, raspadinha), Revisar e Vocabulário.
- [ ] Rodapé do Hub diz "a partir de R$ 9,90/mês"; a tabela de planos tem as linhas de download e BYOK.
- [ ] O changelog no topo do arquivo lista o que ficou de fora e por quê.

### Suposições (diga se alguma estiver errada)

- O v3 substitui o v2 no mesmo arquivo; não é preciso manter as duas versões lado a lado.
- Português brasileiro em toda a interface; inglês só nos exemplos de conteúdo capturado.
- Viewport principal continua 1360×860; mobile é um conjunto reduzido de mocks, não o app inteiro.
