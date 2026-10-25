# Frasy como assistente ao vivo na legenda flutuante: pesquisa e LLM-as-judge

Versão de 25/10/2026 (Fase A do plano "legenda flutuante inteligente"). Esta fase decide o escopo da aba **Assistente** da
janela flutuante (Fase C).
**Convenção:** _[medido]_ veio de chamada real nossa; _[fonte]_ tem URL no fim; _[estimativa]_ é conta com tokens supostos
× preço da cascata (`ops/ia-provedores.openrouter.json`); _[hipótese]_ é inferência ainda não testada.

**Resumo em cinco linhas**

1. O MVP recomendado tem 5 ideias. Todas são baratas e cabem no **Plus**: destacar expressões idiomáticas, marcar palavras
   acima do nível, explicar termo técnico ou sigla, "Como respondo?" com 3 sugestões e correção gentil da minha fala.
   Juntas custam ~US$ 0,08 por pessoa por mês no uso cheio de 20 h _[estimativa]_. Em tokens são ~450 mil, uns 22% da cota
   `tokensMes` do Plus.
2. Os dois juízes reprovaram, e devem ficar fora: emoção do falante, dossiê do interlocutor, filtro de toxicidade e tudo
   que depende de busca na web. A busca do OpenRouter **não é coberta pelo ZDR** dele.
3. Resumo, tarefas, ata e auditoria de reunião têm valor, mas tratam fala de terceiros. Os juízes marcaram essas ideias
   como **só para adultos**, e elas são as mais caras do catálogo (US$ 0,11–0,13/mês). Ficam para depois do MVP, atrás
   de cota própria e de um aviso de consentimento.
4. O juiz é ruidoso. Na rubrica, a concordância entre os dois juízes é **moderada (κ = 0,43)**. No pareado, só **58%** dos
   julgamentos sobrevivem à troca de ordem. O Mistral prefere a posição A em 69 de 90 respostas. Por isso o ranking vale
   para separar grupos, não para ordenar vizinhos.
5. O gasto foi de **US$ 0,116**, com teto de US$ 1,00 no livro-caixa (`gasto.json`). Foram 84 rubricas e 180
   julgamentos pareados, mais 8 chamadas do teste de fumaça.

## 1. Pesquisa: concorrentes e referências

| Produto                                            | O que faz ao vivo                                                                                                                                       | Preço                                            | O que tiramos dele                                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language Reactor                                   | Legenda dupla em Netflix/YouTube, dicionário ao passar o mouse, salvar palavra, exportar para Anki. Só desktop, como extensão.                          | Pro ~US$ 5/mês _[fonte, blog de concorrente]_    | O "assistente" do aprendiz é **glosa na legenda**, e não chat. É exatamente o que os juízes puseram no topo.                                                                                                                                |
| Trancy                                             | Legenda dupla em vários players, consulta de palavra e análise gramatical com IA, apps móveis.                                                          | ~US$ 3,5–6/mês _[fonte, blog do próprio Trancy]_ | O preço de referência do aprendiz é de **US$ 3–6/mês**. A IA entra como "explicar esta frase".                                                                                                                                              |
| Otter.ai                                           | Transcrição ao vivo, chat sobre a reunião, resumo.                                                                                                      | Grátis 300 min/mês; Pro ~US$ 8–17/mês _[fonte]_  | O chat sobre a transcrição é um recurso padrão de quem faz notas de reunião. Não é diferencial nosso.                                                                                                                                       |
| Fathom                                             | Gravação e transcrição ilimitadas no grátis; resumo e itens de ação.                                                                                    | Equipe ~US$ 15–24/usuário _[fonte]_              | Resumo e tarefas já são commodity e grátis. Competir nisso não sustenta o pago.                                                                                                                                                             |
| Granola                                            | Notas de reunião **sem robô na chamada** (capta o áudio do computador).                                                                                 | Business ~US$ 14/usuário _[fonte]_               | É o mesmo modelo de captura do Frasy. O mercado aceita "sem robô", mas o público é adulto.                                                                                                                                                  |
| Copilot no Teams / AI Companion no Zoom            | Perguntas digitadas durante a reunião ("o que fulano disse sobre X?"), recapitulação para quem chegou tarde, notas em tempo real com indicador visível. | Incluso nas licenças corporativas                | "O que eu perdi?" e "pergunte à reunião" já vêm de graça dentro da ferramenta da empresa. O que sobra para nós é **o idioma**: tradução, glosa e "como respondo no idioma".                                                                 |
| Cluely, Interview Coder e outros copilotos ocultos | Ouvem e olham a tela e sugerem respostas numa janela que os outros participantes não veem. São vendidos como "indetectáveis" para entrevistas e vendas. | —                                                | **É um aviso, não um modelo.** A reação pública foi forte ("cheat on everything"), e houve suspensão universitária. O "Como respondo?" do Frasy precisa ser apresentado como ajuda de idioma, sem prometer ocultação e sem modo entrevista. |

**Conclusão da pesquisa:** os assistentes de reunião (Otter, Fathom, Granola, Copilot, Zoom) disputam resumo e tarefas, e
cobram US$ 8–24 por usuário. Os de idioma (Language Reactor, Trancy) cobram US$ 3–6 e ganham com glosa na legenda. A faixa
de preço do Frasy (R$ 14,90–34,90 ≈ US$ 2,7–6,2) fica junto da faixa dos apps de idioma. O assistente que cabe nela é o do
**idioma dentro do conteúdo**, e não um segundo Otter.

### Limites da Document Picture-in-Picture (Chrome/Edge)

- **Suporte:** Chrome e Edge 116+. O Firefox 151 aparece na página do Chrome. O **Safari não tem** _[fonte]_.
- **Gesto do usuário:** `requestWindow()` rejeita sem ativação transitória. **`resizeTo`/`resizeBy` também exigem gesto**
  (desde o Chrome 121), e `focus()` também _[fonte]_. Daqui sai uma regra: trocar o formato da janela
  (faixa ↔ legenda ↔ conversa) só pode redimensionar dentro do clique de quem trocou. Uma troca automática não muda o
  tamanho.
- **Tamanho:** a especificação não fixa números ("clamp or ignore" o que for grande ou pequeno demais). O Chromium limita a
  janela a **80% da largura e da altura da tela** (antes eram 50%) _[fonte]_. Com `preferInitialWindowPlacement` (Chrome
  130+), a janela abre no tamanho padrão em vez do último usado _[fonte]_.
- **Posição:** o site não escolhe onde a janela abre. A janela não navega e fecha junto com a aba que a abriu _[fonte]_.
- **Transparência:** nem a especificação nem a documentação do Chrome oferecem fundo transparente. O único jeito é um
  fundo sólido ou escurecido dentro da janela _[fonte: ausência na spec e no guia]_.
- `disallowReturnToOpener` (Chrome 124+) esconde o botão "voltar para a aba" _[fonte]_.

### PiP de vídeo no Safari (o caso do dono)

- O caminho `canvas.captureStream()` → `<video>.srcObject` → `requestPictureInPicture()` funciona no Chrome desde o 71 e
  aparece nos testes de plataforma do Firefox _[fonte]_. O Safari tem `captureStream` desde o 11 _[fonte]_.
- Relatos de terceiros sobre o Safari: o canvas precisa ter desenhado quadros antes do `captureStream()`. O Safari pode só
  anunciar suporte a PiP depois que o vídeo começou a tocar, e a saída é `webkitSetPresentationMode('picture-in-picture')`
  _[fonte secundária, ~1,5 ano]_. **Testar no Safari do dono antes de prometer.**
- **Ações do MediaSession na janela PiP:**
  - **Chrome:** play/pause e faixa anterior/próxima aparecem na janela PiP de vídeo desde o 74. O `skipad` mostra um botão
    "Pular anúncio" desde o 73. Microfone, câmera e desligar aparecem desde o 92, só no desktop. Slide anterior/próximo
    aparece desde o 111 _[fonte]_.
  - **Safari:** não achei documentação oficial de quais ações aparecem na janela PiP. O web.dev marca o Safari como sem
    suporte às ações de slide _[fonte]_. _[hipótese]_ Só play/pause é garantido. "Próxima = salvar a última frase"
    depende de teste.
- **Consequência para o assistente:** no Safari a janela é **só leitura**. Qualquer ideia que peça toque, digitação ou
  passar o mouse dentro da janela (hover da glosa, "Como respondo?", digitar a pergunta) não funciona lá. Os juízes
  levantaram isso sozinhos (§6).

## 2. Catálogo de ideias e custo por uso

São 42 ideias em 7 contextos: jogo, vídeo/série, reunião, aula/podcast, conversa presencial, consultoria e geral. Duas
delas são **controles negativos** de propósito (emoção do falante e dossiê do interlocutor), para ver se o juiz as
reprova. Cada ideia traz uma descrição de uma linha, o gatilho (automático ou sob demanda), os dados que usa e o modelo
previsto. O catálogo completo, com os tokens supostos, está em
[`eval/assistente-ao-vivo-v1/ideias.json`](eval/assistente-ao-vivo-v1/ideias.json).

**Como o custo foi estimado** _[estimativa]_:

- Custo por uso = tokens de entrada × preço de entrada + tokens de saída × preço de saída. Os preços são os da cascata
  barata: Gemma 4 26B US$ 0,0675/0,225, gpt-oss-120b US$ 0,15/0,60 e DeepSeek v4.1 Flash US$ 0,15/0,65 por 1M tokens.
  Busca na web soma US$ 0,007 (Exa "auto" via OpenRouter) _[fonte]_.
- **Uso cheio** = 20 h/mês de sessão com o assistente ligado, × usos por hora. Ideias "local" (regra, lista ou modelo no
  aparelho) custam US$ 0 de nuvem.
- O raciocínio "low" do gpt-oss e o cache de prompt **não** entram na conta. O primeiro pode dobrar a saída; o segundo
  reduz a entrada. Mesmo com o custo multiplicado por 3, nenhuma ideia do top 5 passa de US$ 0,13/mês.

Os custos estão na tabela do §3. A faixa vai de US$ 0 (ideias locais) a US$ 0,30/mês (referências com busca automática).
As caras são as que usam **busca na web** (US$ 0,0075 por uso, quase todo o valor é a busca) ou **janela de 5 min
automática** (resumo rolante, tarefas, conceitos, a ~US$ 0,0005 × 12/h).

## 3. LLM-as-judge: método e resultado

**Método.** O script é [`scripts/eval-ia/ideias-assistente.mjs`](../../scripts/eval-ia/ideias-assistente.mjs) e reaproveita
o harness `scripts/eval-ia/`:

- **Pedido:** `montarCorpo` + `chamar`, com ZDR, `data_collection: deny`, Google ignorado e preço-teto ZDR.
- **Leitura e ordens:** `objetoJson`, `lerPareado` e `combinarOrdens`.
- **Concordância:** kappa de Cohen.
- **Teto:** o `LivroCaixa`, que reserva o pior caso antes de cada chamada e tem teto de **US$ 1,00**.
- **Juízes:** `mistralai/mistral-medium-3.1` e `deepseek/deepseek-v4.1-flash@none` (sem raciocínio, sem o provedor que o
  ignora), com temperatura 0.
- **Contexto dado aos juízes:** público de 12+ anos, ECA Digital e LGPD, sem perfilamento, ZDR, busca sem ZDR, limites da
  Document PiP e do PiP do Safari, preços e margem dos planos, e a régua de custo (até ~US$ 0,30/mês cabe).
- **Rubrica binária**, com raciocínio de até 30 palavras **antes** de cada veredito. São 7 critérios:
  - **V** = valor real;
  - **F** = uso frequente;
  - **Vi** = viável no navegador hoje;
  - **C** = custo cabe na margem;
  - **P** = risco baixo de privacidade e para menores;
  - **D** = diferencial pago;
  - **N** = não atrapalha o jogo ou o vídeo.
- **Campos extras:** "só para adultos?" e "principal problema de UX na janela".
- **Pareado:** todos os pares entre os 10 primeiros (45 pares), nas **duas ordens**, com os dois juízes. Só conta o
  veredito que sobrevive à troca. O ranking é de Copeland: +1 por vitória estável, −1 por derrota estável, e um par
  instável vale empate.

**Resultado.** As 84 rubricas foram válidas (42 por juiz). Na tabela, a coluna "Critérios divididos/reprovados" marca
com ½ o critério em que os juízes discordaram e com ✗ o que os dois reprovaram.

| # | Ideia | Contexto | Gatilho | Mistral | DeepSeek | Média | Critérios divididos/reprovados | US$/uso | US$/mês (20 h) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Destacar expressões idiomáticas (`video-expressoes`) | video | auto | 7/7 | 7/7 | 7,0 | — | 0,00003 | 0,012 |
| 2 | Palavras acima do meu nível em destaque (`video-nivel`) | video | auto | 7/7 | 7/7 | 7,0 | — | 0,00000 | 0,000 |
| 3 | Pauta com tópicos cobertos e faltando (`consultoria-pauta`) | consultoria | auto | 7/7 | 6/7 | 6,5 | F½ | 0,00015 | 0,037 |
| 4 | Correção gentil da minha fala (`presencial-correcao`) | presencial | auto | 7/7 | 6/7 | 6,5 | N½ | 0,00011 | 0,042 |
| 5 | "Como respondo?" com 3 sugestões (`reuniao-como-respondo`) | reuniao | sob demanda | 6/7 | 7/7 | 6,5 | F½ | 0,00026 | 0,020 |
| 6 | Termo técnico ou sigla explicado na hora (`reuniao-termo-tecnico`) | reuniao | auto | 7/7 | 6/7 | 6,5 | F½ | 0,00004 | 0,007 |
| 7 | Conceitos-chave da aula (`aula-conceitos`) | aula | auto | 5/7 | 7/7 | 6,0 | F½ N½ | 0,00049 | 0,119 |
| 8 | Rascunho do e-mail de follow-up (`consultoria-followup`) | consultoria | sob demanda | 6/7 | 6/7 | 6,0 | F½ P½ | 0,00069 | 0,014 |
| 9 | Glossário da sessão (`consultoria-glossario`) | consultoria | auto | 7/7 | 5/7 | 6,0 | P½ D½ | 0,00022 | 0,004 |
| 10 | Vocabulário do episódio no meu nível (`podcast-vocab`) | aula | auto | 7/7 | 5/7 | 6,0 | P½ D½ | 0,00029 | 0,006 |
| 11 | Intérprete com resposta sugerida (`presencial-sugestao`) | presencial | sob demanda | 7/7 | 5/7 | 6,0 | P½ N½ | 0,00015 | 0,018 |
| 12 | Polir minha frase antes de falar (`reuniao-polir-minha-fala`) | reuniao | sob demanda | 6/7 | 6/7 | 6,0 | F½ N½ | 0,00011 | 0,008 |
| 13 | Frase do episódio (`video-frase-episodio`) | video | auto | 6/7 | 6/7 | 6,0 | F½ P½ | 0,00108 | 0,022 |
| 14 | Sumário com marcas de tempo (`aula-topicos`) | aula | auto | 7/7 | 4/7 | 5,5 | V½ F½ D½ | 0,00019 | 0,046 |
| 15 | Glossário de callouts da partida (`jogo-callouts`) | jogo | auto | 6/7 | 5/7 | 5,5 | V½ F½ D½ | 0,00019 | 0,004 |
| 16 | "Como respondo?" no chat de voz do jogo (`jogo-como-respondo`) | jogo | sob demanda | 6/7 | 5/7 | 5,5 | F½ P½ N½ | 0,00018 | 0,014 |
| 17 | Auditoria da conversa (`reuniao-auditoria`) | reuniao | sob demanda | 5/7 | 6/7 | 5,5 | F✗ P½ | 0,00162 | 0,032 |
| 18 | Tarefas, prazos e responsáveis (`reuniao-tarefas`) | reuniao | auto | 6/7 | 5/7 | 5,5 | F½ P✗ | 0,00047 | 0,112 |
| 19 | Explicar a piada ou referência da cena (`video-piada`) | video | sob demanda | 4/7 | 7/7 | 5,5 | V½ F½ D½ | 0,00017 | 0,010 |
| 20 | "Quem é esse?" — personagens da sessão (`video-quem-e`) | video | sob demanda | 6/7 | 5/7 | 5,5 | F✗ P½ | 0,00075 | 0,015 |
| 21 | Perguntar ao conteúdo (`aula-pergunta`) | aula | sob demanda | 5/7 | 5/7 | 5,0 | F✗ D½ N½ | 0,00087 | 0,052 |
| 22 | Mini-quiz do que foi dito (`aula-quiz`) | aula | sob demanda | 4/7 | 6/7 | 5,0 | V½ F½ D✗ | 0,00114 | 0,023 |
| 23 | Dica de gíria de jogo na hora (`jogo-giria`) | jogo | auto | 6/7 | 4/7 | 5,0 | V½ F✗ D½ | 0,00003 | 0,008 |
| 24 | Alerta de falso cognato (`presencial-falso-cognato`) | presencial | auto | 5/7 | 5/7 | 5,0 | F✗ D✗ | 0,00000 | 0,000 |
| 25 | Ata final exportável (`reuniao-ata`) | reuniao | auto | 6/7 | 4/7 | 5,0 | F½ P✗ D½ | 0,00186 | 0,037 |
| 26 | Aviso quando falam comigo (`reuniao-mencao`) | reuniao | auto | 5/7 | 5/7 | 5,0 | F✗ D½ N½ | 0,00000 | 0,000 |
| 27 | Perguntas boas para fazer (`reuniao-perguntas`) | reuniao | sob demanda | 5/7 | 5/7 | 5,0 | F✗ P✗ | 0,00027 | 0,011 |
| 28 | "O que aconteceu?" — resumo dos últimos minutos (`video-recap`) | video | sob demanda | 6/7 | 4/7 | 5,0 | V½ F✗ D½ | 0,00032 | 0,013 |
| 29 | Faixa só com palavras-chave (`jogo-faixa-chave`) | jogo | auto | 4/7 | 5/7 | 4,5 | V✗ F½ D✗ | 0,00000 | 0,000 |
| 30 | Frases úteis para a situação (`presencial-frases-situacao`) | presencial | sob demanda | 5/7 | 4/7 | 4,5 | V½ F✗ D✗ | 0,00000 | 0,000 |
| 31 | "O que eu perdi?" (`reuniao-o-que-perdi`) | reuniao | sob demanda | 4/7 | 5/7 | 4,5 | F✗ P✗ D½ | 0,00054 | 0,011 |
| 32 | Shadowing: repetir a fala e comparar (`video-sombra`) | video | sob demanda | 5/7 | 4/7 | 4,5 | F✗ D✗ N½ | 0,00000 | 0,000 |
| 33 | Objeções do cliente e como responder (`consultoria-objecoes`) | consultoria | auto | 6/7 | 2/7 | 4,0 | V½ F½ P✗ D½ N½ | 0,00034 | 0,083 |
| 34 | "Como se diz…?" (`presencial-como-se-diz`) | presencial | sob demanda | 5/7 | 3/7 | 4,0 | V½ F✗ P½ D✗ | 0,00003 | 0,003 |
| 35 | Resumo rolante da reunião (`reuniao-resumo-rolante`) | reuniao | auto | 6/7 | 2/7 | 4,0 | V½ F½ P✗ D½ N½ | 0,00052 | 0,126 |
| 36 | Traduzir minha fala para o chat (`jogo-minha-fala`) | jogo | sob demanda | 4/7 | 3/7 | 3,5 | V✗ F✗ D✗ N½ | 0,00003 | 0,003 |
| 37 | Checagem de fato com fonte (`reuniao-checagem`) | reuniao | sob demanda | 4/7 | 3/7 | 3,5 | V½ F✗ P✗ D½ N½ | 0,00761 | 0,152 |
| 38 | Contexto histórico/cultural com pesquisa (`video-contexto-web`) | video | sob demanda | 3/7 | 3/7 | 3,0 | V✗ F✗ Vi½ P✗ D½ | 0,00754 | 0,151 |
| 39 | Referências citadas com link (`aula-referencias`) | aula | auto | 1/7 | 4/7 | 2,5 | F½ Vi½ C✗ P✗ D✗ N½ | 0,00754 | 0,301 |
| 40 | Dossiê do interlocutor (`geral-dossie`) | geral | sob demanda | 3/7 | 1/7 | 2,0 | V½ F✗ Vi✗ P✗ D½ N✗ | 0,00764 | 0,153 |
| 41 | Aviso de assédio ou toxicidade no chat de voz (`jogo-toxicidade`) | jogo | auto | 2/7 | 2/7 | 2,0 | V✗ F✗ P✗ D✗ N✗ | 0,00001 | 0,035 |
| 42 | Emoção e sentimento de quem fala (`geral-emocao`) | geral | auto | 1/7 | 1/7 | 1,0 | V✗ F✗ Vi✗ P✗ D✗ N✗ | 0,00003 | 0,032 |
**Pareado entre os 10 primeiros** (Copeland; só vitórias estáveis nas duas ordens contam):

| Ideia | Mistral (Copeland) | DeepSeek (Copeland) | Soma | Estáveis | Instáveis |
|---|---|---|---|---|---|
| `video-expressoes` | +3 | +5 | +8 | 10 | 8 |
| `video-nivel` | +1 | +7 | +8 | 12 | 6 |
| `reuniao-termo-tecnico` | +3 | +3 | +6 | 10 | 8 |
| `reuniao-como-respondo` | +0 | +4 | +4 | 8 | 10 |
| `presencial-correcao` | +0 | +2 | +2 | 10 | 8 |
| `consultoria-pauta` | +2 | -3 | -1 | 7 | 11 |
| `podcast-vocab` | -2 | +0 | -2 | 10 | 8 |
| `consultoria-glossario` | +1 | -5 | -4 | 10 | 8 |
| `aula-conceitos` | -2 | -5 | -7 | 11 | 7 |
| `consultoria-followup` | -6 | -8 | -14 | 16 | 2 |

**Estabilidade e concordância.**

- **Pareado:**
  - 52 dos 90 julgamentos (58%) foram estáveis nas duas ordens: 33/45 do DeepSeek e só 19/45 do Mistral.
  - O Mistral escolheu a posição A em **69 de 90** respostas. É um viés de posição forte, e é por isso que só o veredito
    estável conta.
  - Em 14 pares os dois juízes foram estáveis, e eles concordaram em 11 deles (79%).
- **Rubrica, κ de Cohen entre os juízes, critério a critério:**
  - **Viável:** 0,64 (substancial).
  - **Privacidade e menores:** 0,56 (moderado).
  - **Valor:** 0,29 (razoável).
  - **Diferencial:** 0,25 (razoável).
  - **Não atrapalha:** 0,15 (leve).
  - **Frequência:** 0,08 (leve).
  - **Custo:** concordância de 100%. Todas as ideias passaram, então o critério **saturou**: a régua de US$ 0,30/mês
    ficou folgada para as estimativas e não separou nada (§4).
  - **Geral:** κ = 0,43 (moderado), com 76% de acordo bruto.
- **Leitura honesta:** o juiz separa bem três grupos:
  - glosa e ajuda de idioma no topo;
  - recursos de reunião no meio;
  - perfilamento e busca na base.
    Dentro de cada grupo a ordem é ruído (frequência e "atrapalha" têm κ < 0,2). Os empates em 6,0 foram cortados para o
    pareado por ordem alfabética, então `presencial-sugestao`, `reuniao-polir-minha-fala` e `video-frase-episodio` não
    foram pareados. Isso é limitação desta rodada, e não um veredito contra elas.

## 4. Top 5 para o MVP da aba "Assistente"

A escolha cruza três sinais: nota na rubrica, Copeland estável no pareado (os cinco primeiros do pareado são exatamente os
cinco abaixo) e o encaixe na janela. `consultoria-pauta` empatou na rubrica (6,5), mas foi negativo no pareado (−1) e
depende de a pessoa colar a pauta, então fica como 6ª opção.

| #   | Ideia                                                 | Gatilho                                                  | Modelo                  | US$/uso | US$/pessoa/mês no uso cheio (20 h) | Tokens/mês   | Plano                                                            |
| --- | ----------------------------------------------------- | -------------------------------------------------------- | ----------------------- | ------- | ---------------------------------- | ------------ | ---------------------------------------------------------------- |
| 1   | **Destacar expressões idiomáticas** na legenda        | automático (lista local; LLM só no que falta, com cache) | Gemma 4 26B             | 0,00003 | 0,012                              | 124 mil      | Plus+                                                            |
| 2   | **Palavras acima do meu nível** em destaque           | automático, 100% local                                   | — (lista de frequência) | 0       | 0                                  | 0            | Plus+ (pode ir ao Grátis como isca: custo zero; decisão do dono) |
| 3   | **Termo técnico ou sigla explicado** em 1 linha       | automático (detecção local + glosa com cache)            | Gemma 4 26B             | 0,00004 | 0,007                              | 74 mil       | Plus+                                                            |
| 4   | **"Como respondo?"** com 3 sugestões + tradução       | sob demanda                                              | gpt-oss-120b (low)      | 0,00026 | 0,020                              | 88 mil       | Plus+ (com teto de uso, ex.: 40/dia)                             |
| 5   | **Correção gentil da minha fala** (opt-in, microfone) | automático depois que falo                               | gpt-oss-120b (low)      | 0,00011 | 0,042                              | 160 mil      | Plus+                                                            |
|     | **Total**                                             |                                                          |                         |         | **~0,082 (≈ R$ 0,46)**             | **~446 mil** |                                                                  |

- **Margem:** a margem do anual com a cota cheia é de R$ 2,71/mês no Plus, R$ 3,94 no Família e R$ 2,29 no Pro
  (`npm run ia:custo`). As 5 juntas consomem R$ 0,46, ou **~17% da margem do Plus e ~20% da do Pro**. Com o custo
  multiplicado por 3 (raciocínio do gpt-oss e tokens subestimados), chega a ~R$ 1,40, ainda com margem positiva. As 5
  cabem no plano pago mais barato, e não precisam de plano novo.
- **De onde sai a cota:** `tokensMes` é compartilhado com a tradução da legenda. 446 mil tokens são ~22% do Plus (2 M) e
  ~15% do Família e do Pro (3 M). A Fase C precisa decidir entre duas opções:
  - **(a)** o assistente come a cota da legenda, o que é simples mas pode faltar legenda no fim do mês;
  - **(b)** uma cota própria, como `explicacoesMes`, por exemplo "assistenteMes", ou um teto diário.
    A recomendação é **(b)**, com teto diário, seguindo o padrão da IA de estudo (`server/lib/iaDeEstudo.ts`).
- **Por que estas 5:**
  - Todas são ajuda de **idioma dentro do conteúdo**, onde os concorrentes de reunião não entram.
  - Três delas são glosa curta, que cabe numa faixa.
  - Duas são ações explícitas da pessoa.
  - Nenhuma processa terceiros além do que a legenda já mostra.
  - Todas funcionam também em contexto de diversão (série e jogo) e de trabalho.
- **Safari:** 1, 2 e 3 funcionam só leitura, com o destaque desenhado no canvas e sem hover. A glosa precisa aparecer
  inline ou na linha de baixo, e não em tooltip. 4 e 5 exigem a Document PiP (Chrome/Edge) ou o app aberto.

## 5. Risco para menores: o que fica só para adultos ou fora

| Ideia                                                              | Veredito dos juízes                                                                 | Decisão proposta                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emoção e sentimento de quem fala (`geral-emocao`)                  | os dois: só adultos, 1/7                                                            | **Fora para todos.** É inferência de emoção de terceiros (perfilamento, e com voz chega perto de biometria). Era controle negativo, e o juiz reprovou.                                                                                  |
| Dossiê do interlocutor (`geral-dossie`)                            | os dois: só adultos, 1–3/7                                                          | **Fora para todos.** Busca dado pessoal de terceiro na web, sem ZDR. Era controle negativo, e o juiz reprovou.                                                                                                                          |
| Aviso de toxicidade no chat de voz (`jogo-toxicidade`)             | os dois: só adultos, 2/7                                                            | **Fora do assistente.** A intenção protetora é boa, mas classifica cada fala de terceiros, a ~120 chamadas por hora, e interrompe o jogo. A proteção de menores cabe na moderação do próprio jogo.                                      |
| Auditoria da conversa, Tarefas e responsáveis, Objeções do cliente | os dois: só adultos                                                                 | **Só adultos**, depois do MVP, com aviso "você é responsável por avisar os participantes".                                                                                                                                              |
| Ata, Resumo rolante, Perguntas boas, "O que eu perdi?", Follow-up  | um dos juízes: só adultos. O Mistral repetiu "falas de terceiros sem consentimento" | **Só adultos.** Para perfil protegido, desligado por padrão. Na reunião, o Frasy já transcreve terceiros, mas **resumir e extrair compromissos** de pessoas identificáveis é outro tratamento (LGPD art. 6º, finalidade e minimização). |
| Intérprete com resposta sugerida, Checagem de fato                 | um dos juízes: só adultos                                                           | A resposta sugerida pode ficar para todos, com filtro de conteúdo. A checagem depende de busca (§6).                                                                                                                                    |

**Regra geral sugerida para a spec da Fase C:**

- No **perfil protegido**, só ideias que processam a frase que a própria pessoa está vendo ou falando (as do top 5).
- Nada que resuma, classifique ou procure pessoas.
- As instruções de menor já usadas no tutor valem também aqui.

## 6. O que precisa de busca na web, e se há provedor com retenção zero

- **Precisam de busca:** `reuniao-checagem`, `video-contexto-web`, `aula-referencias` e `geral-dossie`. As quatro ficaram
  entre as 5 piores (2,0–3,5).
- **O OpenRouter não cobre a busca com o ZDR.** A documentação diz: "ZDR enforcement only applies to provider routing for
  inference requests. It does not apply to plugins and tools you choose to enable, such as web search". Com ZDR imposto na
  conta, o OpenRouter só **recusa o Firecrawl**. O Exa (motor padrão para modelos sem busca nativa), o Parallel e o
  Perplexity seguem as políticas deles _[fonte]_.
- **Opções com ZDR, por contrato:**
  - O **Exa** anuncia ZDR para search/answer/research desde agosto de 2025. Os detalhes estão em material de marketing.
  - O **Brave Search API** oferece ZDR só no plano enterprise, sob pedido. Sem ZDR, guarda as consultas por até 90 dias
    _[fonte]_.
  - Nenhum dos dois é self-service. Usar qualquer um exigiria contrato e chave próprios, fora do OpenRouter.
- **Custo:** US$ 0,007 por busca é ~25–200× o custo de uma glosa. No uso cheio dá US$ 0,15–0,30/mês por ideia.
- **Veredito:** busca na web **fica fora** do MVP, e de qualquer perfil protegido. Só reabre com contrato ZDR (Exa ou
  Brave) e um caso de uso adulto que o juiz aprove.

## 7. Fora do escopo

- **Controles negativos e perfilamento:** emoção do falante, dossiê e toxicidade.
- **Busca na web**, as quatro ideias do §6.
- **Reunião como produto** (resumo rolante, ata, tarefas, auditoria, objeções). Os concorrentes dão isso de graça ou dentro
  do Teams/Zoom, os juízes deram nota média, é o mais caro do catálogo e é só para adultos. Pode voltar depois do MVP no
  Pro, com cota própria.
- **O que não precisa de assistente:**
  - `jogo-faixa-chave`, `presencial-frases-situacao`, `presencial-falso-cognato` e `reuniao-mencao` são locais e baratos,
    mas o juiz os achou pouco frequentes ou pouco diferenciais. São melhorias da legenda, não da aba Assistente.
  - `video-sombra` é bom para estudo, mas ruim na janela flutuante, porque pede para falar em voz alta durante o vídeo.
    Seu lugar é o app.
- **Qualquer modo "oculto" ou "para entrevistas"**, pela lição do Cluely.
- **Extensão de navegador** acoplada ao player (YouTube, Netflix etc.): já está registrada fora do plano.

## 8. Problemas de UX na janela flutuante apontados pelos juízes

1. **Espaço:** listas (glossário, tópicos, tarefas, ata, quem é quem) não cabem em ~440×300 sem rolagem e competem com a
   legenda. Foi a queixa mais repetida pelo DeepSeek. **Na janela vai só o que cabe em 1–2 linhas; o resto vai para o
   app.**
2. **Safari é só leitura:** hover, tooltip, toque e digitação não existem no PiP de vídeo. A glosa precisa ser inline, e
   toda ação mora no app ou na Document PiP.
3. **Atenção no momento errado:** sugestões automáticas, piscar ou atualizar a cada 5 min tiram o foco do jogo ou da
   conversa. **Automático, só se for silencioso; o que pede leitura é sob demanda.**
4. **Digitar na janelinha** (pergunta, como se diz, polir a frase) é desconfortável durante a fala.
5. **Latência:** "Como respondo?" com 3 sugestões precisa chegar em ~2–3 s, senão a conversa já passou. Vale medir o p95
   com o harness.
6. **Tamanho fixo e sem transparência:** o Mistral repetiu isso como problema genérico. A Fase B já trata com formatos e
   `ResizeObserver`, e a transparência real não existe na API.

## 9. Próximos passos sugeridos

1. Fase C: escrever a spec (`docs/specs/`) da aba Assistente com as 5 ideias, a cota própria com teto diário, o perfil
   protegido restrito ao top 5 e a copy pela skill `copy-br-etica`.
2. Medir antes de ligar. Montar um gold pequeno de expressões, siglas e "Como respondo?", e rodar o harness
   (`scripts/eval-ia/rodar.mjs`) para qualidade e p95. A Gemma vs. o DeepSeek Flash na glosa merece um A/B.
3. Testar no Safari do dono o PiP de vídeo com canvas, e quais ações do MediaSession aparecem, antes de prometer "próxima =
   salvar".

## Arquivos desta rodada

- `eval/assistente-ao-vivo-v1/ideias.json`: o catálogo com os tokens supostos.
- `eval/assistente-ao-vivo-v1/rubrica.jsonl`: 84 rubricas brutas, com raciocínio, veredito, "só adultos", problema de UX,
  custo e provedor.
- `eval/assistente-ao-vivo-v1/pareado.jsonl`: 180 julgamentos pareados brutos (as duas ordens).
- `eval/assistente-ao-vivo-v1/resumo.json`: ranking, κ por critério e Copeland.
- `eval/assistente-ao-vivo-v1/gasto.json`: o livro-caixa, com **US$ 0,116** no total.
- Para reproduzir: `npx tsx --env-file=.env scripts/eval-ia/ideias-assistente.mjs --top 10 --trabalho <dir de cache>`. Com
  o cache, refazer não paga de novo.

## Fontes

- Document PiP: [developer.chrome.com/docs/web-platform/document-picture-in-picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture);
  especificação [wicg.github.io/document-picture-in-picture](https://wicg.github.io/document-picture-in-picture/); limite de
  80% no Chromium [chromium.googlesource.com (CL 67df4c33)](https://chromium.googlesource.com/chromium/src/+/67df4c338d22f5d9f3e16d7a9e78187eba17fcbb%5E%21).
- PiP de vídeo e MediaSession: [developer.chrome.com/blog/watch-video-using-picture-in-picture](https://developer.chrome.com/blog/watch-video-using-picture-in-picture);
  [developer.chrome.com/blog/media-updates-in-chrome-73](https://developer.chrome.com/blog/media-updates-in-chrome-73);
  [web.dev/articles/media-session](https://web.dev/articles/media-session); [developer.chrome.com/blog/capture-stream](https://developer.chrome.com/blog/capture-stream);
  captureStream no Safari 11 [github.com/mdn/browser-compat-data/pull/4440](https://github.com/mdn/browser-compat-data/pull/4440);
  peculiaridades do Safari [julien-decharentenay.medium.com](https://julien-decharentenay.medium.com/supporting-ios-safari-for-a-website-using-mediapipe-ml-models-canvas-mediastreams-and-webm-e3423514f7e6).
- Concorrentes: [trancy.org: Language Reactor vs. Trancy](https://www.trancy.org/blog/language-reactor-vs-trancy-complete-comparison-guide-3609d225200581e38e12da72010b2448)
  (fonte interessada); [granola.ai: comparação de preços](https://granola.ai/blog/meeting-note-tool-pricing-granola-vs-fireflies-fathom-otter)
  (fonte interessada); [techrepublic.com: notetakers 2026](https://www.techrepublic.com/article/news-best-ai-meeting-note-takers-2026/);
  [spguides.com: Copilot em reuniões do Teams](https://www.spguides.com/copilot-in-microsoft-teams-meetings/);
  [zoom.com: AI note-taking](https://www.zoom.com/en/products/ai-assistant/features/ai-note-taking);
  [eweek.com: Cluely](https://www.eweek.com/fr/news/cluely-ai-cheating-app/); [analyticsvidhya.com: Cluely](https://www.analyticsvidhya.com/blog/2025/04/cluely-ai/).
- Busca e ZDR: [openrouter.ai/docs/guides/features/web-search](https://openrouter.ai/docs/guides/features/web-search);
  [openrouter.ai/docs/guides/privacy/zdr](https://openrouter.ai/docs/guides/privacy/zdr); [exa.ai/blog/zdr-search-engine](https://exa.ai/blog/zdr-search-engine);
  [brave.com/blog/search-api-zero-data-retention](https://brave.com/blog/search-api-zero-data-retention/); [aviso de privacidade da API do Brave](https://api-dashboard.search.brave.com/privacy-policy).
- Preços dos modelos: `GET https://openrouter.ai/api/v1/endpoints/zdr` (25/10/2026) e `ops/ia-provedores.openrouter.json`.
