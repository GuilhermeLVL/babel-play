# Ciência do aprendizado e dados para o Babel Play

Data: 10/10/2026. Pesquisa na web e em artigos. Não li o código do app (outro agente faz isso); onde digo "o app deveria", é proposta, não descrição do que existe.

## Como ler este relatório

Cada fonte traz uma marca de quanto eu de fato vi:

- **[P]** página ou artigo aberto por ferramenta de leitura nesta pesquisa (a ferramenta devolve um extrato da página; não é leitura humana linha a linha).
- **[R]** só resumo (abstract) ou trecho devolvido pela busca; números vêm de fonte secundária e podem estar imprecisos.
- **[M]** conhecimento de memória, não reconferido hoje. Use como pista, não como citação.

E o tamanho da evidência: **meta-análise**, **vários estudos**, **um estudo**, **documentação oficial**, **dado de produto** (empresa falando de si) ou **opinião de praticante**.

Duas ferramentas falharam: a busca do Firecrawl (sem chave) e a leitura de PDF (falta o `pdftoppm`). Por isso três artigos importantes ficaram só no resumo: Schmitt, Jiang e Grabe (2011), Settles e Meeder (2016) e Pelánek (2016). O texto da LGPD no Planalto também não abriu (erro de conexão); o art. 14 está citado de memória.

---

## 1. Como se mede vocabulário e compreensão

### 1.1 O que a pesquisa diz

**Cobertura lexical (quantas palavras do texto a pessoa conhece).**

- Laufer (1989) propôs 95%; Hu e Nation (2000) propuseram 98%. Schmitt, Jiang e Grabe (2011, *Modern Language Journal* 95(1), 26–43) testaram 661 pessoas de 8 países e acharam relação **quase linear** entre % de palavras conhecidas e compreensão, **sem degrau**: não existe um ponto em que a compreensão "liga". Eles sugerem 98% como meta razoável para texto acadêmico. Um estudo grande. **[R]** https://experts.nau.edu/en/publications/the-percentage-of-words-known-in-a-text-and-reading-comprehension/ (PDF em https://www.lextutor.ca/cover/papers/schmitt_etal_2011.pdf, não consegui ler). Não consegui confirmar a nota de compreensão em cada faixa; não cito esses números.
- Nation (2006, *Canadian Modern Language Review* 63(1), 59–81): assumindo 98%, seriam precisas 8.000–9.000 famílias de palavras para texto escrito e 6.000–7.000 para fala. Um estudo de corpus. **[R]** https://www.wgtn.ac.nz/__data/assets/pdf_file/0018/1626120/2006-How-large-a-vocab.pdf
- Escuta: van Zeeland e Schmitt (2013, *Applied Linguistics* 34(4), 457–479) concluem que 95% pode bastar para ouvir narrativas, o que cai para algo como 2.000–3.000 famílias. Um estudo; uma revisão lembra que só dois estudos mediram isso direto para escuta (Bonk 2000 e este), então a generalização é fraca. **[R]** https://nottingham-repository.worktribe.com/output/748305
- TV: Webb e Rodgers (2009, *Language Learning* 59, 335–366), corpus de 88 programas: 3.000 famílias mais nomes próprios dão 95,45% de cobertura; 98% pede cerca de 7.000. Programa infantil chega a 95% com 2.000. Um estudo de corpus. **[R]** https://www.frontiersin.org/articles/10.3389/fpsyg.2022.831684/full (tabela-resumo secundária).

**Testes de tamanho de vocabulário.**

- Vocabulary Size Test (Nation e Beglar 2007): múltipla escolha, 10 itens por faixa de 1.000. Críticas: Gyllstad, Vilkaitė e Schmitt (2015) mostraram que o resultado difere de uma entrevista de critério e que 10 itens por faixa são poucos; uma crítica calcula que chute puro daria em média 35 acertos na forma de 14 mil, isto é, "3.500 palavras" sem saber nada. Stewart (2014) e McLean, Kramer e Stewart (2015, n=3.373) tratam do mesmo problema. Vários estudos. **[R]** https://eprints.nottingham.ac.uk/32284 e https://teval.jalt.org/sites/default/files/26_01_01_Holster_Lake_vocab_size_0.pdf
- LexTALE (Lemhöfer e Broersma 2012): teste sim/não com palavras e pseudopalavras, rápido. Uma replicação parcial (Puig-Mayenco e colegas 2023, 288 + 266 aprendizes) achou correlação só baixa a moderada com proficiência geral. Serve como estimativa grosseira de vocabulário, não como nota de nível. Dois estudos. **[R]** https://www.jbe-platform.com/content/journals/10.1075/lab.22048.pui. O formato "60 itens, 40 palavras e 20 pseudopalavras" é **[M]**.
- Teste sim/não (Meara e Buxton 1987): a pessoa marca o que conhece; pseudopalavras medem o exagero. **[M]**
- Quizlet, estudo de 2024 citado numa busca: item de múltipla escolha superestimou o conhecimento em cerca de 20% frente a preencher lacuna. Um estudo, visto só em trecho. **[R]**

**Receptivo × produtivo e profundidade.**

- Laufer e Goldstein (2004): quatro degraus de força, do mais difícil ao mais fácil: lembrar a forma (ativo), lembrar o significado (passivo), reconhecer a forma, reconhecer o significado. A ordem não dependeu da frequência da palavra. Um estudo, bem citado. **[R]**
- O vocabulário produtivo é sempre menor que o receptivo, mas a razão varia muito com o teste: Webb (2008, 83 universitários japoneses) achou diferença pequena com correção tolerante; Fan (2000) cerca de 75%; Milton (2009) fala em 50% a 80%. Vários estudos, sem número único. **[R]** https://cambridge.org/core/journals/studies-in-second-language-acquisition/article/receptive-and-productive-vocabulary-sizes-of-l2-learners/603A8FD24DBAA2874163DD36D8BAACA3

**Unidade de contagem (família, lema, "flema").** McLean (2018, n=279) mostra que aprendizes iniciantes e intermediários muitas vezes não entendem formas derivadas de uma palavra-base que conhecem; contar por família infla o que a pessoa sabe e subestima a dificuldade do texto. Há críticas (poucos avançados na amostra, itens derivados raros). Um estudo com debate. **[R]** https://ir.lib.hiroshima-u.ac.jp/00053521

**CEFR.** Tabela atribuída a Milton e Alexiou (teste X_Lex, que vai só até as 5.000 mais frequentes): A1 abaixo de 1.500; A2 1.500–2.500; B1 2.500–3.250; B2 3.250–3.750; C1 3.750–4.500; C2 4.500–5.000. Outras fontes dão números diferentes (por exemplo 975 em vez de 1.500 para A1). Poucos estudos, um só teste, faixas que se sobrepõem. **[R]** https://wgtn.ac.nz/lals/resources/paul-nations-resources/vocabulary-lists/vocabulary-cefr-and-word-family-size/vocabulary-and-the-cefr-docx

**Tempo de resposta como sinal de automatização.** Segalowitz e Segalowitz (1993) propõem o coeficiente de variação (desvio-padrão ÷ média do tempo): se cai, houve automatização, não só aceleração. Harrington (2006) viu o CV cair com a proficiência num teste sim/não. Mas Hulstijn, van Gelderen e Schoonen (2009) **não acharam evidência convincente** em dois estudos e dizem que ganho de conhecimento e ganho de velocidade não se separam bem nessas tarefas. Evidência mista. **[R]** https://www.cambridge.org/core/journals/applied-psycholinguistics/article/automatization-in-second-language-acquisition-what-does-the-coefficient-of-variation-tell-us/554D00B8D979BD1CFF17774087D14326

**Prever o que cada pessoa conhece sem testar tudo.** Ehara e colegas (COLING 2012; versão de 2018 no *Journal of Information Processing*) tratam isso como previsão: modelo de Rasch com dificuldade da palavra, e defendem dificuldade específica por aprendiz, porque interesses pessoais fogem da frequência geral. Não vi os números de acerto. **[R]** https://aclanthology.org/C12-1049. Dado de produto: slides antigos da Lingvist (2017) relatam acerto de cerca de 0,74 no teste de nivelamento que prevê palavra a palavra. **[R]** https://www.slideshare.net/slideshow/lingvist-statistical-methods-in-language-learning/72735203

### 1.2 O que o app consegue estimar só com o comportamento

| O que estimar | Dá para estimar? | Erro esperado |
|---|---|---|
| Chance de lembrar agora uma palavra **já revisada** | Sim, com FSRS | No benchmark público, erro de calibração (RMSE por faixas) de ~0,06–0,07 com parâmetros ajustados e ~0,09 com os de fábrica (seção 2). É erro médio sobre muitos cartões; para uma palavra isolada a previsão é só uma probabilidade. |
| "Palavras conhecidas" entre as que o app acompanha | Sim: soma das probabilidades | Bom para o total; depende de o usuário não apertar "difícil" quando esqueceu. |
| Palavras que o usuário sabe **mas nunca revisou** | Só com modelo por frequência, calibrado com uma amostra | Grande. O único número que achei é ~0,74 de acerto (Lingvist, dado de produto antigo). Tratar como faixa larga. |
| "Você entende X% deste vídeo" | Dá para estimar **cobertura** (palavras conhecidas ÷ palavras do vídeo), não compreensão | Cobertura e compreensão andam juntas quase em linha reta, mas compreensão depende também de velocidade da fala, sotaque, gramática, assunto. Dizer "conhece", não "entende". |
| Receptivo × produtivo | Sim, se o app registrar o formato de cada resposta | Só vale para o que foi testado em cada formato. |
| Automatização | Tendência do tempo de resposta em acertos | Sinal fraco e ruidoso (digitação, celular, distração). Usar tendência de semanas, nunca nota. |
| Nível CEFR | Não com honestidade | As faixas publicadas se sobrepõem e vêm de um só tipo de teste. Não mostrar. |
| Compreensão auditiva | Parcial: acerto em exercícios com áudio | Não generaliza para fala real sem medir com fala real. |

### 1.3 Como dizer "palavras conhecidas" e "quanto deste vídeo" com honestidade

1. Contar por **lema** (flexões juntas), não por família. Derivadas contam separado até aparecerem.
2. "Conhecidas" = soma da chance de lembrar hoje, mostrada arredondada e com faixa ("cerca de 1.200 a 1.350").
3. Separar três baldes: **acompanhadas** (têm revisão), **marcadas como já sabidas** (o usuário disse; sem prova) e **estimadas pela frequência** (nunca vistas no app). Nunca somar as três num número só sem dizer.
4. No vídeo: "Você conhece cerca de 9 em cada 10 palavras deste vídeo", com a faixa embaixo e a tradução prática: abaixo de 90% é difícil; 90–95% dá para acompanhar com esforço; 95–98% é confortável para ouvir; acima de 98% é leitura fluida. Essas faixas vêm dos estudos acima e são orientação, não fronteira.
5. Tirar da conta nomes próprios, números e interjeições (Webb e Rodgers contam nomes próprios como conhecidos).
6. Corrigir chute em múltipla escolha antes de contar acerto como "sabe" (seção 9).

---

## 2. Modelos de memória e de conhecimento

### 2.1 FSRS

Fonte: wiki oficial do projeto **[P]** https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm e https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS; manual do Anki **[P]** https://docs.ankiweb.net/deck-options.html; benchmark **[P]** https://github.com/open-spaced-repetition/srs-benchmark. Tudo isso é documentação e benchmark do próprio projeto (dado público, mas não revisão independente).

- Três variáveis por cartão: **R** (chance de lembrar agora), **S** (estabilidade: dias para R cair de 100% a 90%) e **D** (dificuldade, de 1 a 10).
- Curva de esquecimento no FSRS-6: `R(t,S) = (1 + fator·t/S)^(−w20)`, com `fator = 0,9^(−1/w20) − 1`, de modo que R(S,S) = 90%. O expoente w20 é treinável. No FSRS-4.5 era fixo: `R = (1 + (19/81)·t/S)^(−0,5)`.
- Intervalo para uma meta de retenção r (FSRS-4.5): `I = S·(81/19)·(r^(−2) − 1)`. Com isso, calculei eu mesmo: r=0,97 dá 0,27·S; 0,95 dá 0,46·S; 0,90 dá 1,00·S; 0,85 dá 1,64·S; 0,80 dá 2,40·S. Ou seja, ir de 90% para 95% mais que dobra a frequência das revisões de cada cartão. (Conta minha sobre a fórmula publicada; a carga total real depende também de como a estabilidade cresce.)
- Após acerto, S é multiplicado por um fator que cresce quando D é baixa, quando S é pequena e quando R estava baixa (revisar quase esquecendo rende mais). Após erro, S cai para um valor novo que depende de D, S e R. D sobe com "errei" e desce com "fácil", com retorno à média.
- FSRS-6 tem **21 parâmetros** e usa também as revisões do mesmo dia, com fórmula própria (`S' = S·e^(w17·(G−3+w18))·S^(−w19)`).
- **Otimização por usuário**: o manual do Anki não dá mínimo fixo; avisa que com "menos de algumas centenas" de revisões o ajuste pode ser ruim, e que otimizar **uma vez por mês basta**. Versões antigas exigiam 1.000 revisões; um fórum cita pesquisa propondo mínimo bem menor (não confirmei). Sem dados, usam-se os parâmetros de fábrica, treinados em cerca de 10 mil usuários.
- **Quanto ganha**: no benchmark (9.999 coleções, ~350 milhões de revisões, sem as do mesmo dia): FSRS-6 ajustado tem log loss 0,346 e RMSE 0,065; FSRS-7 ajustado 0,337 e 0,059; FSRS-7 **de fábrica** 0,362 e 0,091; half-life regression 0,469 e 0,128. Ou seja: o FSRS de fábrica já prevê melhor que o HLR, e ajustar por usuário corta o erro de calibração em cerca de um terço. A página que li não traz a linha do SM-2; um post de fórum cita "FSRS-5 vence SM-2 treinável em 97,4% dos casos" (opinião de praticante citando o benchmark, não conferi). A wiki diz 20–30% menos revisões que o SM-2 para a mesma retenção, **em simulação**.
- **Meta de retenção**: padrão 90%; faixa razoável 70% a 97%; acima de 97% a carga "pode ser esmagadora". A ferramenta do Anki que calculava a "retenção mínima recomendada" foi **removida** na versão 25.07 e trocada por um simulador de carga.
- **O que estraga o FSRS**: apertar "difícil" quando na verdade esqueceu ("difícil" é nota de aprovação). O manual diz que é o único hábito a que o algoritmo não se adapta. Para um app que decide pelo usuário, isso é argumento forte para **dois botões** (lembrei / não lembrei) ou nota automática.
- Contestação: a SuperMemo afirma que log loss e AUC não servem para comparar algoritmos e que o dela é melhor. Fonte interessada. **[R]** https://supermemo.com/en/blog/supermemo-is-better-than-fsrs-by-far
- Limite importante: o benchmark mede **previsão de acerto**, não aprendizado final nem motivação. Não achei ensaio controlado mostrando que usuários de FSRS aprendem mais que os de SM-2.

### 2.2 Os outros

- **SM-2** (Wozniak, anos 1980): intervalo × "facilidade" por cartão, regras fixas, sem prever probabilidade. **[M]**
- **Leitner**: caixas com intervalos fixos; acerto sobe, erro volta. **[M]**
- **Half-life regression** (Settles e Meeder 2016, ACL): `p = 2^(−Δ/h)`, meia-vida h como função de contagens de acertos e erros e da palavra. O resumo relata mais de 45% de redução de erro frente a baselines e melhora de engajamento em produção. Um estudo com dados do Duolingo. Não consegui abrir o PDF para conferir o número de engajamento. **[R]** https://aclanthology.org/P16-1174/. No benchmark de hoje perde para o FSRS.
- **MEMORIZE** (Tabibian e colegas 2019, PNAS 116(10), 3988–3993): trata o agendamento como controle ótimo; a taxa ideal de revisão é proporcional à chance de já ter esquecido. Avaliado como "experimento natural" em dados do Duolingo de duas semanas, não como ensaio com usuários. Um estudo. **[R]** https://pmc.ncbi.nlm.nih.gov/articles/PMC6410796
- **BKT** (Corbett e Anderson 1995) **[M]**; **DKT** (Piech e colegas 2015) **[M]**; **PFA** (Pavlik, Cen e Koedinger 2009: regressão logística sobre contagem de acertos e erros por habilidade) **[M]**.
- Profundo × simples: Khajah, Lindsey e Mozer (2016, melhor artigo da EDM) mostram que um BKT estendido (esquecimento, habilidade do aluno) empata com o DKT; o DKT tinha ~250 mil parâmetros contra ~200. Gervet, Koedinger, Schneider e Mitchell (2020, JEDM 12(3)), em nove bases: regressão logística com boas variáveis vence em bases médias ou com muitas respostas por aluno; DKT vence em bases muito grandes; BKT fica atrás. Vários estudos. **[R]** https://arxiv.org/abs/1604.02416 e https://jedm.educationaldatamining.org/index.php/JEDM/article/view/451
- **Elo para aluno e item**: Pelánek (2016, *Computers & Education*) revisa variantes e conclui que é simples, robusto e eficaz. **[R]** https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf. Em produto: Math Garden (Klinkenberg, Straatemeier e van der Maas 2011) usa Elo com regra de pontuação que mistura acerto e tempo, e mira **75% de acerto**; a justificativa dada para não mirar 50% (o ideal para medir) é que errar metade num sistema de prática é "inaceitável". **[R]** https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6480732/. Duolingo Birdbrain (IEEE Spectrum **[P]** https://spectrum.ieee.org/duolingo): regressão logística inspirada em teoria de resposta ao item, um passo de gradiente por exercício, "generalização do Elo"; a versão 2 usa LSTM. Dizem que testes A/B "aumentaram engajamento e aprendizado", sem números. Dado de produto.

### 2.3 O que cabe em SQLite ou no navegador

| Modelo | Estado guardado | Custo por resposta | Cabe? |
|---|---|---|---|
| FSRS (agendar) | 2 números por cartão + data | algumas contas | Sim, em qualquer lugar |
| FSRS (otimizar 21 parâmetros) | histórico (cartão, dia, nota) | descida de gradiente sobre o histórico; roda uma vez por mês | Sim, em segundo plano. Existem implementações em Rust/WebAssembly e TypeScript do projeto **[M]**; conferir antes de adotar |
| Elo aluno × item | 1 número por aluno, 1 por item ou por formato | uma soma | Sim |
| PFA / regressão logística | contagens por item | uma soma e uma sigmoide | Sim |
| BKT | 4 parâmetros por habilidade | barato, mas treinar exige EM | Sim, porém ganha pouco sobre o resto |
| DKT / LSTM | modelo neural | caro e precisa de muitos dados | Não vale para app pequeno |

---

## 3. Dificuldade adaptativa

- **Regra dos 85%** (Wilson, Shenhav, Straccia e Cohen 2019, *Nature Communications*) **[P]** https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/. O resultado é **matemático**: para classificação binária aprendida por descida de gradiente, com ruído gaussiano, a taxa de erro que maximiza a velocidade de aprendizado é 15,87%. Com ruído de Laplace dá ~82% de acerto; com Cauchy, ~75%. Testado em perceptron, rede de duas camadas (MNIST) e um modelo de aprendizado perceptual de macacos. **Nenhum experimento com pessoas.** Os autores dizem que tarefas com várias categorias não estão cobertas e que um aprendiz com memória perfeita não tem ponto ótimo. Não é evidência sobre lembrar vocabulário; quem cita "85%" para flashcards está extrapolando.
- **Dificuldade desejável** (Bjork e Bjork): esforço na recuperação melhora retenção de longo prazo mesmo piorando o desempenho na hora. **[M]**. O FSRS embute isso: o ganho de estabilidade é maior quando R estava mais baixa.
- **Zona de desenvolvimento proximal** (Vygotsky) e **fluxo** (Csikszentmihalyi): molduras teóricas, não números. **[M]**
- **O "U invertido" não apareceu em jogo educativo**: Lomas, Patel, Forlizzi e Koedinger, dois experimentos com 10 mil e 70 mil jogadores num jogo de matemática: em quase todos os casos **mais fácil = mais engajamento e mais tempo de jogo**; e as condições mais engajantes foram as de **aprendizado mais lento**. Um estudo (dois experimentos grandes). **[R]** https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf (o ano 2013 não foi confirmado pela busca). É o achado mais útil desta seção: engajamento e aprendizado puxam para lados opostos; o alvo de acerto é uma escolha de produto.
- **Taxa de acerto e ansiedade**: Jansen e colegas (2013, *Learning and Individual Differences* 24, 190–197), 207 crianças, seis semanas, três taxas de acerto predefinidas. Só vi o resumo; não confirmei os valores das taxas nem o resultado. **[R]** https://dare.uva.nl/id/789fc422-4935-49ca-bcba-803239522951
- **Adaptar ajuda?** Uma meta-análise citada na busca (Liu e colegas 2020, *Educational Technology Research and Development*, 12 estudos) achou efeito geral nulo de jogo adaptativo contra não adaptativo (g = 0,11, não significativo); positivo em aprendizado (g = 0,39), incerto em engajamento, **negativo em desempenho no jogo** (g = −0,27), com sinal de viés de publicação. Meta-análise pequena, vista só em trecho; não confirmei o link. **[R]**
- **Bandits**: Clement, Roy, Oudeyer e Lopes (2015, JEDM; arXiv 1310.3174), algoritmo ZPDES: escolhe a atividade em que o aluno está **progredindo mais** (não a de maior acerto). Estudo com 400 crianças de 7–8 anos: aprendizado comparável à sequência de um professor experiente, com ganho maior para turmas heterogêneas. Um RCT posterior (arXiv 2402.01669, 265 crianças) relata melhora de aprendizado e de experiência. Dois estudos do mesmo grupo, em matemática infantil. **[R]** https://arxiv.org/abs/1310.3174
- **Glicko**: Elo com incerteza explícita por jogador; útil quando há longos períodos sem jogar. **[M]**

**O que dá errado** (misto de evidência e prática):

- Frustração quando o alvo é baixo demais; tédio e aprendizado lento quando é alto demais (Lomas; IEEE Spectrum).
- Platô: o Elo com K decrescente para de acompanhar quem melhora rápido; um artigo de 2026 (Vermeiren e colegas, UMUAI) aponta isso. **[R]**
- Trapaça: o usuário aprende que errar de propósito deixa o jogo fácil. Proteção: baixar dificuldade devagar e subir depressa; nunca dar recompensa maior em nível fácil.
- Contaminação do modelo de memória: erro por pressão de tempo num jogo de ação não é esquecimento.
- Ajuste percebido como injusto: se o jogador nota que o jogo "segura" ou "ajuda", perde a graça. Opinião de praticante (Hunicke 2005, **[M]**).

---

## 4. Ordem e composição de uma sessão

- **Intercalar × blocos**: Brunmair e Richter (2019, *Psychological Bulletin*; 59 estudos, 238 efeitos): efeito médio a favor de intercalar (g = 0,42), forte para pinturas (0,67), pequeno para matemática (0,34), e **a favor de blocos para palavras (g = −0,39)**. Meta-análise; não vi quantos estudos de palavras nem o intervalo de confiança. **[R]** https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf. Conclusão prática: intercalar categorias de vocabulário **não** tem base; o que importa é o espaçamento.
- **Espaçamento**: Kim e Webb (2022, *Language Learning* 72(1), 269–319), meta-análise em segunda língua: efeito médio a grande; espaçamento igual e expansivo equivalentes. **[R]** https://ir.lib.uwo.ca/etd/8600/ (tese que originou o artigo: 98 efeitos, 48 experimentos, N=3.411). Nakata diz, em revisão própria, que nenhum estudo de vocabulário de L2 achou vantagem do expansivo dentro da sessão.
- **Tamanho do bloco**: Nakata e Webb (2016, SSLA): estudar em grupos de 4, 10 ou 20 palavras dá no mesmo **se o espaçamento for igual**; o espaçamento pesa mais que o tamanho do grupo. Um estudo, dois experimentos. **[R]** https://resolve-he.cambridge.org/core/journals/studies-in-second-language-acquisition/article/does-studying-vocabulary-in-smaller-sets-increase-learning/E17B75ABAE1300734AF014C363D59FBC
- **Repetição no mesmo dia**: o manual do Anki diz que repetir um cartão várias vezes no mesmo dia "não contribui de forma significativa para a memória de longo prazo" e recomenda poucos passos curtos (10 ou 30 minutos). Documentação oficial. **[P]**
- **Efeito de teste**: Rowland (2014): g = 0,50 (159 efeitos, 61 estudos), maior com recordação do que com reconhecimento. Adesope, Trevisan e Sundararajan (2017, 272 efeitos): g ≈ 0,61, e múltipla escolha **pelo menos tão boa** quanto resposta curta. As duas meta-análises discordam sobre o formato (uma exclui pesquisa aplicada, a outra inclui). **[R]** https://journals.sagepub.com/doi/10.3102/0034654316689306
- **Reconhecimento × recordação em vocabulário**: Nakata (2016, IRAL 54(3); 64 universitários, 60 pares suaíli–inglês): recordação é melhor para aprender a **escrever** a palavra; reconhecimento é igual ou melhor quando a grafia não é exigida; e desempenho alto durante o treino não prevê o pós-teste. Um estudo. **[R]** https://www.degruyterbrill.com/document/doi/10.1515/iral-2015-0022/html
- **Palavras parecidas juntas**: Tinkham (1993, 1997) e Waring (1997) acharam prejuízo ao ensinar conjuntos semânticos juntos; Erten e Tekin (2008) também; Ishii (2015) não achou diferença; Nakata e Suzuki (2019, n=133) revisam e chamam a evidência de **mista**, e sugerem que o espaçamento alivia a interferência. Vários estudos, resultado dividido; não está claro se o problema é semelhança de sentido ou de forma. **[R]** https://www.cambridge.org/core/product/F58BA8D70385603B9C42E408BFCB8A10
- **Terminar bem**: Finn (2010, JEP:LMC 36(6), 1548–1553), dois experimentos: as pessoas **preferiram repetir** uma sessão difícil que terminava com um trecho mais moderado, mesmo sendo mais longa e mesmo com nota pior. É efeito sobre a **vontade de voltar**, não sobre aprender mais. Um estudo. **[R]** https://pmc.ncbi.nlm.nih.gov/articles/PMC2970645
- **Tamanho de sessão e fadiga**: não achei estudo que dê um número. Tudo o que se diz ("15 minutos", "20 cartões") é opinião de praticante.
- **Aquecimento e "sanduíche" (fácil–difícil–fácil)**: não achei evidência direta além do efeito de final de Finn. É aposta de desenho.
- **Proporção de itens novos**: não achei pesquisa com número. Na prática do Anki, a carga futura de revisões cresce com cada item novo e o simulador serve para escolher o limite. Opinião de praticante e documentação.
- **Resultado de jogo alimentando a memória**: não achei estudo que meça isso. É aposta; ver proposta na seção 9.

---

## 5. Prioridade do que aprender

- **Frequência geral** continua sendo o melhor preditor barato de utilidade: as contas de cobertura da seção 1 são todas por faixa de frequência. Vários estudos de corpus.
- **Frequência no conteúdo do próprio usuário**: Ehara e colegas defendem dificuldade por aprendiz porque interesses fogem da frequência geral. Para o Babel Play, que parte do conteúdo do usuário, o critério natural é **quantas ocorrências a palavra destrava nos conteúdos que a pessoa ainda vai consumir**. Não achei ensaio comparando os dois critérios; é aposta com boa lógica.
- **Lemas e famílias**: priorizar por lema; não assumir derivadas (McLean 2018).
- **Colocações**: não pesquisei a fundo nesta rodada; fica como lacuna.
- **Como os apps fazem** (dado de produto e relatos de usuários; pouca documentação oficial):
  - **LingQ**: cada palavra tem estado 1 (nova) a 4 (aprendida) ou "conhecida"; a contagem de conhecidas soma estado 4 e conhecidas. Relato de terceiros indica que **cada forma conjugada conta separada**, o que infla o número. **[R]** https://lingq-support.groovehq.com/help/understanding-lingq-statistics
  - **Migaku**: compara as palavras do conteúdo com as conhecidas e mostra uma "nota de compreensão" por conteúdo. A fórmula não é publicada. **[R]** https://migaku.com/starter-guide
  - **jpdb**: baralhos por obra (anime, livro), ordenados por frequência dentro do baralho; mostra cobertura. Só achei relatos de fórum. **[R]**
  - **Lingvist**: lista por frequência de corpus com ajuste manual; teste de nivelamento que prevê palavra a palavra. Uma resenha diz que o nivelamento coloca a pessoa abaixo do nível real. **[R]**
  - **Duolingo**: currículo fixo por unidade; o Birdbrain escolhe exercícios dentro da lição pela chance de acerto. **[P]**

---

## 6. Devolver métricas ao usuário

- **Sequência (streak)**: um working paper de 2026 da Northwestern diz que há **pouca evidência causal** sobre sequências, apesar do uso amplo; propõe como mecanismos a aversão à perda e a sequência virar objetivo em si. A Khan Academy teria aposentado a sua por receio de efeito na motivação. Os ganhos de retenção do Duolingo são dado de produto, em fontes secundárias. Não achei estudo controlado mostrando que sequência causa ansiedade nem que não causa. **[R]** https://www.ipr.northwestern.edu/documents/working-papers/2026/wp-26-05.pdf
- **Mostrar o modelo ao aluno** (open learner models; Bull e Kay): objetivo é apoiar reflexão e autorregulação; a forma mais usada e preferida é a **barra de habilidade**. Mostrar **incerteza** é raro; Al-Shanfari, Demmans Epp e Baber (2017) acharam que quem viu o modelo foi melhor no pós-teste e que mostrar lado a lado "o que o sistema acha" e "o que você acha" aumentou confiança e uso. Poucos estudos, um grupo. **[R]** https://research.birmingham.ac.uk/en/publications/evaluating-the-effect-of-uncertainty-visualisation-in-open-learne
- **O que usuários do Anki pedem e o que confunde** (fóruns, 2021–2024; opinião de praticante): (a) previsão de carga que conte a partir de hoje e inclua o atraso; (b) reconciliar retenção prevista com a real (um usuário mediu 94% contra 98,2% previstos e perdeu a confiança); (c) saber quais cartões entram em cada gráfico; (d) controles de carga: achatar picos, programar folga. O que confunde: gráfico de "facilidade", "inferno da facilidade", nomes dos botões, diferença entre retenção desejada e real. **[R]** https://forums.ankiweb.net/t/comparing-anecdotal-actual-retention-to-fsrs-average-predicted-retention/43240
- **Viés de número otimista**: três fontes independentes de inflação que apareceram nesta pesquisa: múltipla escolha com chute (VST, Quizlet ~20%), contar formas flexionadas como palavras (LingQ), contar por família (McLean). Um app que soma os três mostra um número que o usuário descobre ser falso na primeira conversa real.

---

## 7. Engenharia de dados com SQLite

Fonte: documentação oficial do SQLite, lida nesta pesquisa **[P]**: https://www.sqlite.org/whentouse.html, /wal.html, /withoutrowid.html, /stricttables.html, /gencol.html, /pragma.html.

**Limites práticos.** "Qualquer site com menos de 100 mil acessos por dia deve funcionar bem"; número conservador, já demonstrado com 10 vezes isso. **Um escritor por vez**; escritas devem durar milissegundos. Trocar por cliente-servidor quando houver muitos escritores simultâneos, dados separados da aplicação por rede, ou conteúdo rumo a terabytes. WAL não funciona em sistema de arquivos de rede.

**WAL e checkpoints.** Checkpoint automático a cada 1.000 páginas (~4 MB). O WAL **cresce sem limite** em três casos: checkpoint automático desligado; sempre há um leitor aberto (leitura longa segura o checkpoint); transação de escrita enorme. Cuidados: nenhuma transação de leitura longa (relatórios e exportações em conexão separada e curta); `PRAGMA journal_size_limit` para o arquivo encolher; `wal_checkpoint(TRUNCATE)` na janela de manutenção. `synchronous=NORMAL` em WAL é o equilíbrio recomendado: consistente, mas a última transação pode se perder em queda de energia. Tamanho de página não muda depois de entrar em WAL.

**Esquema.**
- `STRICT` (desde 3.37.0, 2021): tipos obrigatórios e conferidos; `integrity_check` passa a validar tipo. Versões antigas não abrem o banco.
- `WITHOUT ROWID` (desde 3.8.2): bom para chave primária composta ou não inteira e **linha pequena** (regra: menos de 1/20 da página, cerca de 200 bytes em página de 4 KiB); no exemplo oficial, metade do espaço e quase o dobro da velocidade. Não usar com chave inteira simples. Candidatos óbvios: `(usuario, lema)` do estado de memória; agregados diários `(usuario, dia)`; dicionário `(idioma, forma) → lema`.
- Colunas geradas (desde 3.31.0): `VIRTUAL` não ocupa espaço e pode ser adicionada com `ALTER TABLE`; `STORED` ocupa e não pode. As duas aceitam índice. Uso: derivar `dia` de um carimbo de tempo sem guardar duas vezes.
- Índice cobrindo a fila: `(usuario, vencimento)` incluindo as colunas que a consulta lê, para a fila sair só do índice. Índice parcial (`WHERE estado = 'revisao'`) reduz tamanho. (Recurso padrão do SQLite; **[M]** quanto aos detalhes.)
- `foreign_keys` vem **desligado** por padrão; ligar em toda conexão.
- `PRAGMA optimize` ao fechar conexões curtas, ou a cada hora/dia em conexão longa, e depois de mudar esquema.

**Espaço.** `auto_vacuum` só pode ser ligado com banco novo ou após `VACUUM`. O modo completo **pode piorar a fragmentação**; o incremental exige chamar `incremental_vacuum`. Página padrão de 4.096 bytes é a recomendada. Para um app pequeno: `auto_vacuum=INCREMENTAL` desde a criação e `VACUUM` raro, em manutenção.

**Dicionário deduplicado.** Uma tabela `lema(id, idioma, lema, classe, posto_de_frequencia)` e uma `forma(idioma, forma) → lema_id`. As palavras do usuário guardam só o `lema_id` inteiro. A frase de origem fica numa tabela de frases, com referência, para a mesma frase servir a várias palavras.

**Histórico e agregados.**
- Evento bruto por resposta (seção 8), mantido por uma janela (sugestão: 180 dias).
- Agregado diário `(usuario, dia)`: revisões, acertos, novos, minutos, soma de R prevista, soma de acertos (para calibração), por formato.
- Histórico compacto permanente `(usuario, lema, dia, nota)`: é o que o otimizador do FSRS precisa; uns poucos bytes por linha.
- Depois da janela, apagar o bruto.

**Dados brutos pesados.** Áudio é o maior custo e o maior risco de privacidade: apagar depois de transcrever, salvo pedido explícito do usuário. Da transcrição, guardar só as frases que originaram palavras salvas; o resto pode ir embora com o conteúdo.

**Listas de frequência e lematizadores abertos.**

| Recurso | O que é | Licença | Tamanho | Observação |
|---|---|---|---|---|
| wordfreq (Robyn Speer) **[P]** https://github.com/rspeer/wordfreq | frequências em ~44 idiomas, várias fontes (Wikipedia, legendas, notícias, livros, web, Twitter, Reddit) | código Apache; dados CC BY-SA 4.0, com termos próprios para Google Books, OpenSubtitles e SUBTLEX | não informado na página | **Encerrado**: retrato do uso até ~2021, sem novas atualizações. Chinês via jieba; japonês e coreano via MeCab. |
| FrequencyWords (Hermit Dave) **[R]** https://github.com/hermitdave/FrequencyWords | listas por idioma a partir do OpenSubtitles 2016 e 2018 | código MIT; conteúdo CC BY-SA 4.0 | não conferido | Legendas: bom para fala e vídeo. Conta **formas**, não lemas. Há quem use só as 30 mil primeiras por idioma. |
| simplemma **[P]** https://github.com/adbar/simplemma | lematizador por dicionário, 54 idiomas, Python puro | código MIT; dados com licenças próprias (lista de Měchura em ODbL, Wiktionary/Kaikki, UniMorph, outras) | ~19 MB instalado; RAM ~175 MB, ou ~50 MB em modo econômico | Acerto de 0,91–0,97 em 34 idiomas (alemão 0,97; inglês 0,96); 0,85–0,90 em línguas de morfologia rica. **Não desambigua** pelo contexto. |
| Intl.Segmenter **[R]** https://web.dev/blog/intl-segmenter | segmentação de palavras nativa do navegador | parte da plataforma | zero | Disponível em todos os grandes navegadores desde o Firefox 125 (2024). Não achei avaliação da qualidade para chinês; **testar antes de confiar**. |

CC BY-SA e ODbL exigem atribuição e compartilhamento pela mesma licença do **dado derivado**; vale conferir com cuidado antes de embutir numa edição paga. Não sou advogado.

**Chinês, japonês, coreano e árabe.**
- Chinês e japonês não têm espaço entre palavras: sem segmentador não existe "palavra". No servidor: jieba (chinês) e MeCab com dicionário (japonês). No navegador: `Intl.Segmenter` como base; dicionários de analisadores japoneses em JavaScript são grandes (dezenas de MB, **[M]**), o que pesa na edição só de navegador.
- Japonês: a mesma palavra aparece em kanji, kana e misturas; a chave do dicionário precisa ser lema + leitura.
- Coreano: aglutinante; partículas grudam na palavra. Precisa de analisador morfológico (mecab-ko no wordfreq); separar por espaço conta cada combinação como palavra nova.
- Árabe: artigos, preposições e pronomes grudam; vogais curtas não são escritas; a mesma grafia cobre várias palavras. Não verifiquei nesta pesquisa qual lematizador leve cobre árabe bem; **lacuna**.
- Para esses quatro idiomas, a estimativa de "palavras conhecidas" e de cobertura herda o erro do segmentador. Mostrar faixa mais larga ou esconder o número até validar.

**DataOps do tamanho de uma pessoa.**
1. Migrações numeradas, só para frente, cada uma testada contra uma **cópia do banco real** antes de ir ao ar; backup antes (`VACUUM INTO` ou a API de backup, **[M]**).
2. Depois de cada migração: `PRAGMA quick_check` (O(N)) e `foreign_key_check`; `integrity_check` (mais lento) semanal.
3. Checagens de qualidade num teste noturno, com alarme: nenhuma estabilidade ≤ 0; nenhum vencimento antes da última revisão; R previsto entre 0 e 1; nenhum lema órfão; agregado do dia = contagem dos eventos do dia; nenhum tempo de resposta negativo ou acima de um teto.
4. Orçamentos escritos: bytes por usuário ativo por mês, tamanho do WAL, tempo da consulta da fila (p95). Passou do orçamento, o teste falha.
5. Restauração de backup ensaiada de verdade, não só o backup.

---

## 8. Privacidade e menores (LGPD)

Não é parecer jurídico. As memórias do projeto registram que o público pode incluir menores de 12 anos; isto precisa de advogado.

- **LGPD, art. 14** (**[M]**; o site do Planalto não abriu): tratamento de dados de crianças e adolescentes deve ser feito no **melhor interesse** deles; para crianças, consentimento específico e em destaque de um dos pais ou responsável; o controlador **não pode condicionar** a participação em jogos e aplicações ao fornecimento de mais dados do que o estritamente necessário; as informações devem ser dadas de forma simples e clara, adequada ao entendimento da criança.
- **Enunciado CD/ANPD nº 1/2023** (22/05/2023): o tratamento de dados de crianças e adolescentes pode se apoiar nas hipóteses dos arts. 7º e 11, não só no consentimento, **desde que o melhor interesse prevaleça e isso esteja avaliado e documentado**. **[R]** https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/direito-digital/nova-regra-de-tratamento-de-dados-de-criancas-e-adolescentes
- **ECA Digital (Lei 15.211/2025)**: em vigor desde **17/03/2026**. Proíbe criar perfil comportamental de crianças e adolescentes **para publicidade**; autodeclaração de idade não basta; multas de até 10% do faturamento, limitadas a R$ 50 milhões por infração. Padrões técnicos de verificação de idade e supervisão parental ainda dependiam da ANPD nas fontes mais recentes que achei. Fontes secundárias (escritórios e imprensa), com divergência em números de decreto; conferir o texto oficial. **[R]** https://www.mayerbrown.com/pt/insights/publications/2026/04/enforcement-of-brazils-eca-digital-introduces-new-obligations-for-companies
- **Art. 20 da LGPD** (**[M]**): direito de pedir revisão de decisões tomadas só por tratamento automatizado que afetem interesses do titular, incluídas as de perfil. Um seletor de dificuldade é perfil em sentido técnico; o risco é baixo enquanto só decide exercício, mas pede transparência.

**O que isso muda no modelo do aluno.**

1. Tempo de resposta e padrão de erro são dado pessoal comportamental. Finalidade única: ajustar o estudo. **Nunca** usar para publicidade ou segmentação comercial (o que cruza com o protótipo de anúncios no plano grátis: o anúncio não pode depender desses sinais, e para menores de 18 a vedação é legal).
2. Não inferir nem rotular condição de saúde ou de aprendizagem (dislexia, déficit de atenção) a partir de tempo e erro: isso viraria dado sensível.
3. Minimizar: guardar o tempo em faixas ou em milissegundos só na janela curta; agregados depois. Na edição de navegador, manter tudo no aparelho.
4. Prazo de guarda escrito para cada tabela, e apagamento real ao excluir a conta.
5. Explicar em linguagem simples, na própria tela: "o app usa seus acertos e seu tempo para escolher o que mostrar".
6. Dar ao usuário (ou responsável) um jeito de ver, exportar e apagar o histórico, e de desligar o uso do tempo de resposta sem perder o app.
7. Registrar por escrito a avaliação de melhor interesse (o Enunciado pede diligência e documentação).

---

## 9. Proposta: modelo do aluno enxuto

Princípio: um modelo de memória (FSRS) para "vai lembrar?", um Elo simples para "consegue fazer este exercício?", e um modelo de frequência para "o que sabe sem nunca ter visto aqui?". Nada de rede neural.

### 9.1 Sinais por palavra (uma linha por usuário × lema)

| Campo | Para quê | Bytes aprox. |
|---|---|---|
| lema_id, usuario_id | chave | 8 |
| estabilidade S, dificuldade D | FSRS | 8 (dois reais de 4 bytes bastam em precisão; o SQLite grava 8 cada) |
| ultima_revisao, vencimento (dia) | fila | 6–8 |
| estado (nova, aprendendo, revisão, reaprendendo, suspensa, "já sei") | fila | 1 |
| repeticoes, lapsos | sanguessugas | 2 |
| formato mais difícil já acertado (reconhecer significado / reconhecer forma / lembrar significado / lembrar forma / ouvir / falar) | receptivo × produtivo | 1 |
| mediana móvel do log do tempo em acertos | fluência | 2–4 |
| encontros no conteúdo do usuário | prioridade | 2 |
| origem (frase_id da primeira ocorrência) | contexto | 4 |

Ordem de grandeza: **40 a 60 bytes por palavra**, mais índice. Dez mil palavras por usuário ficam abaixo de 1 MB. (Estimativa minha; medir com `sqlite3_analyzer`.)

### 9.2 Sinais por resposta (evento, janela de 180 dias)

usuario, lema, instante, superfície (revisão ou qual jogo), formato, número de alternativas (0 se digitado ou falado), acertou, nota (2 botões: lembrei / não lembrei; "fácil" inferido pelo tempo, opcional), tempo em ms, **R previsto no momento**, dias desde a última revisão, se usou dica, se havia pressão de tempo.

Cerca de **30 a 50 bytes por evento**. Cem respostas por dia dão ~36 mil linhas por ano, da ordem de 1 a 2 MB por usuário ativo por ano antes da compactação (estimativa minha). Guardar o R previsto é o que permite medir calibração depois sem recalcular nada; é exatamente o que usuários do Anki pedem no fórum.

### 9.3 Estimativas derivadas

| Estimativa | Fórmula ou algoritmo | Custo |
|---|---|---|
| Chance de lembrar agora, por palavra | curva do FSRS: `R = (1 + f·t/S)^(−w20)` | uma conta por palavra, na hora de mostrar |
| Palavras em memória | Σ R sobre as palavras acompanhadas | uma passada; guardar no agregado diário |
| Faixa de incerteza do total | variância de soma de Bernoullis, Σ R(1−R), alargada pelo erro de calibração medido do usuário | uma passada |
| Calibração do usuário | por faixas de R previsto (0,5–0,6 … 0,9–1,0): acerto real − previsto | sobre o agregado; mensal |
| Parâmetros FSRS por usuário | otimizador oficial, a partir de algumas centenas de revisões, no máximo mensal; antes disso, de fábrica | segundo plano |
| Habilidade θ por formato e dificuldade b por item | Elo: `P = 1/k + (1 − 1/k)·σ(θ − b)` com k alternativas (k→∞ para digitado); `θ += K·(acerto − P)`, `b −= K·(acerto − P)`; K decrescente com o número de respostas | uma soma por resposta |
| Conhecimento de palavras nunca vistas | logística no posto de frequência: `P(sabe) = σ(a − c·ln(posto))`, com a e c ajustados nas respostas do usuário e num teste sim/não inicial com pseudopalavras | ajuste de 2 parâmetros; trivial |
| Cobertura de um conteúdo | Σ sobre ocorrências de P(sabe o lema) ÷ total de ocorrências contáveis | uma passada no conteúdo, na importação |
| Ganho marginal de uma palavra | ocorrências do lema nos conteúdos na fila × (1 − P(sabe)) | sai da mesma passada |
| Fluência | mediana do tempo em acertos, por formato, janela de 4 semanas contra as 4 anteriores | sobre o agregado |
| Pares confundidos | contagem de (alvo, alternativa errada escolhida) | uma linha por par, só os que se repetem |

A fórmula do Elo com chute e o K decrescente seguem a linha de Pelánek (2016), cujo texto completo não li; os valores de K são para calibrar com dados do próprio app.

### 9.4 Jogo alimenta a memória? Com que peso

Não achei estudo que responda. Proposta, toda ela **aposta**, com a lógica por trás:

1. **Acerto por recordação** (digitou ou falou, sem alternativas, sem dica): conta como revisão com nota "lembrei". O FSRS já dá ganho pequeno quando a revisão é adiantada (R alto), então não infla.
2. **Acerto por reconhecimento** (múltipla escolha, parear): **não mexe em S**. Atualiza só o Elo e a evidência de "sabe": `P(sabe | acertou) = p ÷ (p + (1 − p)/k)`. Base: múltipla escolha superestima (VST, Quizlet) e reconhecimento é o degrau mais fácil (Laufer e Goldstein).
3. **Erro por reconhecimento sem pressão de tempo**: sinal forte (falhou no degrau fácil). Antecipa o vencimento para a próxima sessão em vez de registrar lapso direto; se errar de novo na revisão, aí é lapso.
4. **Erro com pressão de tempo ou em jogo de reflexo**: não toca na memória; só no Elo do jogo.
5. **Uma palavra, um efeito por dia** na memória, venha de onde vier (o manual do Anki diz que repetição no mesmo dia pouco acrescenta).
6. Medir antes de confiar: como o R previsto fica gravado, dá para comparar a calibração das palavras que passaram por jogos com as que não passaram. Se os jogos estiverem inflando, a calibração mostra.

---

## 10. Proposta: seletor de itens e dificuldade adaptativa

### 10.1 Revisão

| Decisão | Proposta | Base |
|---|---|---|
| Meta de retenção | 90% fixa por padrão, sem tela de configuração | Padrão do FSRS/Anki; **documentação**, não ensaio |
| Quando a carga estoura | baixar a meta até 85% e segurar itens novos, em vez de acumular atraso | Fórmula do FSRS (intervalo 1,64× maior a 85%); **aposta** quanto ao efeito na motivação |
| Nunca | meta acima de 95% automática | Manual do Anki: carga sobe muito |
| Botões | dois (lembrei / não lembrei) | Manual do Anki: "difícil" mal usado é o que quebra o FSRS; **documentação** |
| Ordem dentro da sessão | vencidos por menor R primeiro; mesma palavra nunca duas vezes seguidas; pares confundidos separados por pelo menos alguns itens | Espaçamento (meta-análise); interferência (evidência **mista**) |
| Itens novos por dia | o maior número que mantém a previsão de minutos por dia dos próximos 30 dias dentro do orçamento observado do usuário (mediana dos minutos reais nas últimas 2 semanas) | Simulador do Anki como prática; **aposta** |
| Quais itens novos | maior ganho marginal de cobertura no conteúdo que o usuário vai consumir; desempate por frequência geral | Lógica de cobertura (vários estudos de corpus); o critério em si é **aposta** |
| Sanguessugas | muitos lapsos: trocar o formato ou a frase de origem, não repetir igual | Opinião de praticante |

### 10.2 Minijogos

| Decisão | Proposta | Base |
|---|---|---|
| Alvo de acerto | **80% a 90%** na rodada, por Elo: escolher itens com `b ≈ θ − ln(p/(1−p))` (para 85%, θ − 1,73) | Math Garden usa 75% com crianças (dado de produto com pesquisa); Lomas mostra que mais fácil engaja mais e ensina menos; Wilson **não** se aplica a pessoas. O número é **aposta** informada |
| Não mirar 50% | — | Math Garden: errar metade é inaceitável na prática |
| Composição | 2–3 itens fáceis de abertura (R alto), miolo no alvo, **último item fácil** | Final: Finn 2010 (**um estudo**, efeito na vontade de voltar). Abertura: **aposta** |
| Mistura | cerca de 70% palavras em revisão, 20% frágeis (R baixo ou lapsos recentes), 10% novas já apresentadas | **Aposta**; sem número na literatura |
| Formato por palavra | subir a escada de Laufer e Goldstein: reconhecer significado → reconhecer forma → lembrar significado → lembrar forma; sobe após acerto, desce após erro | Hierarquia: **um estudo** bem citado; usar como progressão é **aposta** |
| Subir e descer dificuldade | subir rápido, descer devagar; mudança nunca visível como "modo fácil" | Anti-trapaça; opinião de praticante |
| Qual jogo sugerir | começar por rodízio; com dados, bandit simples (Thompson) com recompensa = **progresso** (queda do erro previsto nas palavras jogadas), não acerto bruto nem tempo de tela | ZPDES: **dois estudos**, matemática infantil; transferir para vocabulário é **aposta** |
| Fim da sessão | por tempo curto (5–10 min) ou quando o acerto cai e o tempo de resposta sobe por vários itens seguidos; sempre fechar com acerto | Sem estudo com número; **aposta** |

### 10.3 Como saber se funcionou

Três números do agregado diário, sem pedir nada ao usuário: calibração (previsto − real), retenção real nas revisões e retorno no dia seguinte. Mudar uma coisa por vez e comparar antes e depois; com poucos usuários, não dá para teste A/B de verdade, então declarar isso.

---

## 11. Métricas de progresso que valem mostrar

| # | Métrica | Definição exata | Base | Como dizer |
|---|---|---|---|---|
| 1 | Palavras na memória | Σ R(hoje) dos lemas acompanhados, com faixa | FSRS (benchmark público) | "Cerca de 1.240 palavras na memória hoje (entre 1.180 e 1.300)" |
| 2 | Palavras firmes | lemas com S ≥ 30 dias | S é definida pelo FSRS; o corte de 30 dias é **convenção** | "860 palavras que você lembraria daqui a um mês" |
| 3 | Retenção real | acertos ÷ revisões, só a primeira resposta do dia de itens com intervalo ≥ 1 dia, últimos 30 dias; esconder se houver menos de ~50 revisões | É a medida que o FSRS tenta acertar; pedido recorrente no Anki | "Você lembrou 88 de cada 100. A meta é 90." |
| 4 | Cobertura de um conteúdo | ocorrências com lema provavelmente conhecido ÷ ocorrências contáveis, com faixa | Cobertura × compreensão quase linear (Schmitt e colegas 2011); 95% para ouvir, 98% para ler | "Você conhece cerca de 93% das palavras deste vídeo. Dá para acompanhar com algum esforço." Nunca "entende 93%". |
| 5 | Palavras que mais destravam | os N lemas desconhecidos com mais ocorrências nos conteúdos na fila, e o salto de cobertura | Conta de cobertura | "Estas 15 palavras levam este vídeo de 93% para 96%." |
| 6 | Carga prevista | revisões e minutos por dia nos próximos 7 e 30 dias, a partir de hoje, incluindo atraso | Simulação com o próprio FSRS; maior pedido dos usuários do Anki | "Esta semana: uns 8 minutos por dia." |
| 7 | Reconhece × usa | % das palavras firmes já acertadas em formato de recordação | Receptivo > produtivo em todos os estudos; razão varia | "Você reconhece 860 palavras e já mostrou que sabe usar 410." |
| 8 | Rapidez | mediana do tempo em acertos, por formato, 4 semanas contra as 4 anteriores | Tempo como sinal de automatização: evidência **mista** | Só tendência, só quando melhora de forma clara: "Você está respondendo mais rápido que no mês passado." |
| 9 | Regularidade | dias com estudo nas últimas 4 semanas | Espaçamento (meta-análise); sequência tem pouca evidência causal | "Você estudou em 19 dos últimos 28 dias." Não zera, não pune. |
| 10 | Palavras recuperadas | lemas que tiveram lapso e voltaram a S ≥ 7 dias | Reaprender é parte normal da curva do FSRS | "Você recuperou 12 palavras que tinha esquecido." |
| 11 | Faixas de frequência | % estimado das 1.000, 2.000 e 3.000 mais frequentes do idioma | Contas de cobertura por faixa (Nation; Webb e Rodgers) | "Das 2.000 palavras mais comuns, você conhece cerca de 1.300." Sem rótulo CEFR. |
| 12 | Acerto da previsão do app | diferença entre previsto e real nos últimos 30 dias | Calibração do benchmark | Em "detalhes": "O app previu 90% e você acertou 88%." |

Sugestão de "sutil": na tela principal só 1, 6 e 9; as demais aparecem **no contexto** (4 e 5 na tela do conteúdo; 10 no fim de uma sessão; 7, 8, 11 e 12 em "ver mais"). Toda estimativa com "cerca de" e faixa; nenhuma com casa decimal.

---

## 12. O que NÃO fazer

1. **Não vender "85% é o ideal científico".** O resultado é sobre algoritmos de gradiente em classificação binária, sem teste em pessoas.
2. **Não dizer "você entende X%".** O app mede palavras conhecidas, não compreensão.
3. **Não mostrar nível CEFR** a partir de contagem de palavras.
4. **Não contar acerto de múltipla escolha como "sabe"** sem corrigir o chute; não deixar reconhecimento aumentar a estabilidade da memória.
5. **Não contar formas flexionadas nem famílias inteiras** como palavras conhecidas.
6. **Não deixar erro por reflexo ou relógio virar lapso de memória.**
7. **Não oferecer o botão "difícil"** sem garantir que não será usado para "esqueci".
8. **Não subir a meta de retenção acima de 95%** nem deixar o usuário cair nisso sem ver a carga.
9. **Não otimizar parâmetros com poucas revisões** nem toda semana; mensal basta.
10. **Não usar rede neural** (DKT/LSTM) para rastrear conhecimento num app pequeno: modelos simples empatam e são explicáveis.
11. **Não maximizar tempo de tela ou acerto como recompensa do seletor**: o mais engajante foi o que menos ensinou (Lomas).
12. **Não intercalar categorias "porque a ciência manda"**: para palavras a meta-análise aponta o contrário; cuide do espaçamento.
13. **Não punir quebra de sequência** nem usar perda como alavanca principal, ainda mais com menores.
14. **Não usar tempo de resposta e erros para anúncio**, nem para inferir condição de saúde ou de aprendizagem.
15. **Não guardar áudio bruto por padrão** nem evento bruto para sempre.
16. **Não manter transação de leitura longa** no SQLite em WAL, nem ligar `auto_vacuum=FULL` achando que desfragmenta.
17. **Não mostrar número sem faixa** quando ele vem de modelo; e não mostrar número nenhum para chinês, japonês, coreano e árabe antes de validar o segmentador.

---

## 13. Incertezas

- **Três artigos centrais só no resumo** (Schmitt e colegas 2011; Settles e Meeder 2016; Pelánek 2016). Os números por faixa de cobertura e a fórmula exata do K do Elo precisam de leitura do texto.
- **Jansen e colegas 2013**: não confirmei taxas nem resultado. Seria a melhor evidência humana sobre alvo de acerto; vale ler.
- **Liu e colegas 2020** (meta-análise de jogos adaptativos): visto só em trecho de busca, link não confirmado.
- **Lomas e colegas**: ano e veículo não confirmados pela busca.
- **Nenhum estudo achado** sobre: resultado de minijogo alimentando repetição espaçada; tamanho ideal de sessão; proporção ideal de itens novos; aquecimento. As propostas nesses pontos são apostas declaradas.
- **FSRS**: os números são do benchmark do próprio projeto e medem previsão, não aprendizado. Não achei ensaio controlado independente.
- **Sequências**: evidência causal fraca nos dois sentidos.
- **Produtos** (LingQ, Migaku, jpdb, Lingvist): quase tudo vem de páginas de ajuda, marketing e fóruns; as fórmulas não são públicas.
- **Licenças** das listas de frequência e dos dados de lematização (CC BY-SA, ODbL): impacto numa edição paga não avaliado.
- **Árabe e coreano**: não verifiquei ferramentas leves; a qualidade do `Intl.Segmenter` em chinês não foi avaliada em nenhuma fonte que achei.
- **LGPD**: art. 14 e art. 20 citados de memória; ECA Digital por fontes secundárias com divergências; regulamentação da ANPD em andamento. Conferir textos oficiais e consultar advogado.
- **Estimativas de bytes** são contas minhas de ordem de grandeza; medir no banco real.
- **Não li o código**: parte do que proponho pode já existir ou conflitar com o que existe.

---

## Fontes consultadas

Lidas por ferramenta **[P]**:
- Wilson, Shenhav, Straccia, Cohen (2019). The Eighty Five Percent Rule for optimal learning. *Nature Communications*. https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579/
- FSRS, wiki: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm e https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS
- SRS Benchmark: https://github.com/open-spaced-repetition/srs-benchmark
- Manual do Anki, opções de baralho: https://docs.ankiweb.net/deck-options.html
- Duolingo, Birdbrain: https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain/ e https://spectrum.ieee.org/duolingo
- SQLite: https://www.sqlite.org/whentouse.html, https://www.sqlite.org/wal.html, https://www.sqlite.org/withoutrowid.html, https://www.sqlite.org/stricttables.html, https://www.sqlite.org/gencol.html, https://www.sqlite.org/pragma.html
- wordfreq: https://github.com/rspeer/wordfreq; simplemma: https://github.com/adbar/simplemma

Só resumo ou trecho **[R]**: todas as demais citadas no texto, com o link ao lado de cada uma.
