# Livros & Leitura no Frasy: brainstorm por personas e juízes (L0)

Data: 2026-10-26 · Autor: Guilherme (com Claude) · Fase: L0 do plano "Livros & Leitura" · Spec resultante:
[`docs/specs/2026-10-26-livros-e-leitura.md`](../specs/2026-10-26-livros-e-leitura.md)

**Resumo.** 6 personas geraram 9 rodadas de ideias (Claude e Gemini), que viraram um catálogo de 62 funções.
Três juízes de perfis diferentes avaliaram cada função numa rubrica binária, e dois deles compararam as 13
finalistas em pares, nas duas ordens. O que sai: **o MVP é um leitor bom antes de ser um leitor esperto.**
No topo, estável nas duas ordens e com 91% de concordância entre os juízes, ficaram o leitor (foliate-js),
o toque na palavra que vira cartão, o "continuar de onde parei", a narração por frase com destaque e a
tipografia acessível. A IA de leitura entra como pago e com cache: explicar o trecho e resumir o capítulo com
citações. Três desejos do dono ficaram no fim do ranking e precisam de decisão (seção 6): o audiolivro em MP3,
o "pergunte ao livro" e as notas de áudio.

## 1. Método

**Sem créditos de API.** Todas as rodadas usaram as assinaturas do dono, pelas CLIs em modo de impressão,
numa pasta de rascunho fora do repositório e sem ferramentas: `claude -p --safe-mode --tools ""
--no-session-persistence` (Sonnet nas personas e Opus nos juízes) e `agy -p --model gemini-4-argon-medium`.
Nenhum dado de usuário foi enviado, só o brief do produto. Nada que o Gemini gerou entra no produto: ele foi
usado só como avaliador nesta pesquisa. No máximo 3 chamadas rodaram ao mesmo tempo.

| Etapa                          | Claude (`claude -p`)                                                     | Gemini (`agy -p`)                        | Total             |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------- | ----------------- |
| Teste das CLIs                 | 1                                                                        | 1                                        | 2                 |
| Ideação por persona            | 5 (p1, p2, p3, p4; p5+p6 numa chamada só)                                | 4 (p5, p6; p1+p2 e p3+p4 de conferência) | 9                 |
| Rubrica binária (3 lotes)      | juiz A: 6 (2 cortadas por filtro, refeitas em 2 meias-lotes) · juiz B: 3 | juiz C: 3                                | 12                |
| Comparação em pares (2 ordens) | juiz B: 2                                                                | juiz C: 2                                | 4                 |
| **Total**                      | **17**                                                                   | **10**                                   | **27** (25 úteis) |

1. **Brief** de uma página ([`eval/livros-v1/brief.md`](eval/livros-v1/brief.md)): o que é o Frasy, o que a
   Leitura faz hoje e o que falta, a lei, as fontes e o software livre escolhidos, e os desejos do dono.
2. **Personas** (p1 estudante de inglês de 15 anos · p2 adulto que lê no trabalho · p3 vestibulando do ENEM ·
   p4 leitor de clássicos em português, 58 anos · p5 universitária que estuda com o próprio PDF · p6 pessoa com
   dislexia e baixa visão). Cada uma foi gerada pelas duas famílias de modelo, em chamadas independentes. A
   saída tem dores, jobs-to-be-done, 10 a 15 funções e 5 antipadrões. Brutos em
   [`eval/livros-v1/personas/`](eval/livros-v1/personas/).
3. **Consolidação:** juntei as 9 saídas e tirei as duplicadas. Resultaram **62 funções** com id, em 8 grupos:
   catálogo (CAT), leitor (LEI), narração e audiolivro (NAR), IA, notas e exportação (NOT), jogos e integração
   (INT), acessibilidade (ACE) e terreno para estudo (EST). O catálogo está em
   [`eval/livros-v1/ideias.json`](eval/livros-v1/ideias.json) e cada função guarda as personas de origem.
4. **Juízes.** Cada juiz recebeu o brief e o catálogo inteiro e avaliou um lote de cerca de 21 funções,
   escrevendo o raciocínio **antes** do veredito:

   - **A**, Claude, líder de produto pragmático (custo e simplicidade);
   - **B**, Claude, cientista da aprendizagem e especialista em acessibilidade;
   - **C**, Gemini, pesquisador de UX cético.

   A rubrica é binária, com 6 critérios que valem nota: valor real, uso frequente, viável no navegador
   agora, custo baixo por uso, risco baixo (menores e lei) e simples de usar. Um 7º critério, diferencial
   pago, é só informativo. A nota de um juiz vai de 0 a 6, e a nota final é a média dos três.

5. **Pares.** A rubrica empatou 13 funções na nota máxima (6,0), então elas foram para os pares: 78 pares, cada
   um julgado na ordem A/B e na ordem B/A, pelos juízes B (Claude) e C (Gemini). **Só conta o veredito que se
   mantém nas duas ordens.** O ranking final ordena por vitórias estáveis. Os scripts de placar estão em
   [`eval/livros-v1/metodo/`](eval/livros-v1/metodo/).

**Incidente.** O lote 1 do juiz A foi cortado duas vezes por um filtro automático da CLI, sempre no meio do
lote, por volta de CAT08 a CAT10. A saída cortada está guardada como `tentativa1/2-interrompida`. Pela regra
das 2 tentativas, mudei a abordagem em vez de insistir: dividi o lote em duas metades (CAT e LEI) e as duas
passaram.

**Limites.** Os juízes e as personas são modelos, não pessoas: servem para achar furos e ordenar opções, e não
substituem teste com usuário. Os juízes também erraram em pontos objetivos, como confundir "retenção zero" com
"não guardar nada" (seção 6).

## 2. Dores principais das personas

As dores que mais se repetiram, entre as 9 saídas e as 6 personas:

1. **Perder o que fez** (6/6): posição, grifos e notas presos no navegador ou num aparelho só, e somem ao
   limpar dados. Foi o antipadrão número 1, citado em todas as personas.
2. **Travar no texto** (6/6): vocabulário de época (Machado, Alencar, inglês e espanhol antigos), jargão
   técnico, frases longas. Sair para o dicionário quebra o fio.
3. **Não saber o que é do meu nível nem por onde começar** (p1, p3, p6): o catálogo de domínio público parece
   "livro gigante de 1850 de capa cinza".
4. **Edições ruins ou de legalidade duvidosa** (p3, p4, p5): PDF escaneado, site com anúncio, cabeçalho do
   Gutenberg, tradução duvidosa. Isso mina a confiança no catálogo inteiro.
5. **Leitor ruim no aparelho** (p1, p2, p3, p6): letra minúscula, rolagem infinita, celular médio que engasga,
   PDF de duas colunas embaralhado.
6. **IA que inventa** (p2, p3, p5): resumo sem citar o trecho. "Se eu errar na prova por causa do app, não
   volto."
7. **Voz robótica e sem destaque** (p2, p4, p5, p6): não dá para acompanhar o texto e a voz cansa em leituras
   longas.
8. **Anotar dá trabalho e não sai do app** (p2, p4, p5): refazer à mão no Notion ou no Anki, sem conseguir
   imprimir o "caderno do livro".
9. **Acessibilidade** (p6, p4): só dá para aumentar a fonte, sem mexer em espaçamento e contraste; texto
   justificado; preferências que voltam ao padrão a cada livro; jogos com cronômetro e sem tolerância a erro de
   ortografia.
10. **Paywall no básico e cota no escuro** (p1, p2, p3, p5): bloquear o toque na palavra, os grifos ou a
    exportação; cota que acaba sem aviso.

## 3. Ranking

### 3.1 Top 10 (pares estáveis nas duas ordens, juízes B e C)

As 13 finalistas empataram em 6,0 na rubrica. Os pares as separaram. Cada uma disputou 12 pares por juiz.
"Consenso" conta as vitórias em que os dois juízes, cada um estável nas duas ordens, escolheram a mesma função.

| #   | Id    | Função                                  | Vitórias estáveis B | Vitórias estáveis C | Consenso | Plano  |
| --- | ----- | --------------------------------------- | ------------------- | ------------------- | -------- | ------ |
| 1   | LEI01 | Leitor profissional (foliate-js)        | 12                  | 12                  | 12       | grátis |
| 2   | LEI08 | Toque na palavra: sentido e cartão      | 11                  | 10                  | 10       | grátis |
| 3   | LEI02 | Continuar de onde parei (CFI)           | 9                   | 11                  | 9        | grátis |
| 4   | INT01 | Palavras do livro viram cartões (FSRS)  | 10                  | 9                   | 9        | grátis |
| 5   | NAR01 | Narração por frase com destaque         | 6                   | 8                   | 6        | grátis |
| 6   | ACE01 | Kit tipográfico de acessibilidade       | 7                   | 4                   | 4        | grátis |
| 7   | NAR03 | Ouvir e ler sem perder o lugar          | 4                   | 7                   | 4        | grátis |
| 8   | ACE07 | Teclado, leitor de tela e alvos grandes | 5                   | 4                   | 4        | grátis |
| 9   | IA01  | Explicar esta frase/trecho              | 3                   | 6                   | 3        | pago   |
| 10  | ACE04 | Perfil de leitura salvo                 | 4                   | 2                   | 2        | grátis |
| 11  | ACE06 | Jogos sem pressão                       | 1                   | 0                   | 0        | grátis |
| 12  | IA04  | Resumo do capítulo com citações         | 1                   | 0                   | 0        | pago   |
| 13  | IA10  | Custo antes de gerar                    | 0                   | 0                   | 0        | pago   |

Em IA04 e IA10, ficar no fim dos pares não quer dizer "não fazer". Quer dizer "não antes do leitor". IA10 é
uma regra de interface que toda ação paga precisa ter, não uma função a priorizar.

### 3.2 Estabilidade e concordância

- **Estabilidade de ordem nos pares:** 94% dos vereditos se mantiveram ao trocar A↔B, nos dois juízes. O viés
  de posição foi desprezível: B escolheu "A" em 52% das vezes e C em 51%.
- **Concordância entre juízes nos pares:** 69 pares ficaram estáveis nos dois juízes, e em **91%** deles B
  (Claude) e C (Gemini) escolheram a mesma função.
- **Concordância na rubrica** entre os 3 juízes, em 62 funções. Kappa de Fleiss, com a concordância por par
  entre parênteses (AB / AC / BC):

| Critério           | Unanimidade | Kappa | AB   | AC   | BC   |
| ------------------ | ----------- | ----- | ---- | ---- | ---- |
| valor              | 69%         | 0,53  | 0,84 | 0,77 | 0,77 |
| frequência         | 82%         | 0,76  | 0,90 | 0,89 | 0,85 |
| viável             | 82%         | 0,43  | 0,89 | 0,87 | 0,89 |
| custo baixo        | 95%         | 0,75  | 0,98 | 0,95 | 0,97 |
| risco baixo        | 90%         | 0,63  | 0,98 | 0,90 | 0,92 |
| simples            | 77%         | 0,31  | 0,89 | 0,85 | 0,81 |
| (diferencial pago) | 85%         | 0,69  | 0,95 | 0,89 | 0,87 |

A correlação de Spearman entre as notas totais foi de 0,76 (A×B), 0,70 (A×C) e 0,61 (B×C). Os dois Claude
concordam mais entre si. O Gemini cético foi o mais duro em "valor" e "simples", e é aí que a concordância
cai: kappa de 0,31 em "simples". Esses dois critérios são os mais subjetivos.

### 3.3 Rubrica completa (média dos 3 juízes, 0 a 6)

Na coluna "Pago" está quantos juízes viram ali um motivo para pagar.

| Nota | Funções (id: nota A/B/C · pago)                                                                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6,0  | ACE01, ACE04, ACE06, ACE07, IA01 (pago 3), IA04 (pago 3), IA10, INT01, LEI01, LEI02, LEI08, NAR01, NAR03                                                                                                                                                  |
| 5,67 | ACE02 temas suaves · CAT10 trazer o seu · IA02 simplificar (pago 3) · IA08 quiz do capítulo (pago 3) · IA11 respostas curtas e ouvíveis · INT02 jogo de 1 minuto · LEI05 PDF com texto selecionável · NOT01 grifos com nota                               |
| 5,33 | CAT11 biblioteca pessoal · INT03 fonte "Livro" nos jogos · LEI03 sumário e busca · LEI06 ler sem internet                                                                                                                                                 |
| 5,0  | CAT01 categorias · CAT03 vitrine por idade · CAT04 para o seu nível · CAT08 busca e filtros · IA09 cartões sugeridos pela IA (C deu 3) · NAR04 voz natural (pago 3) · NOT03 Markdown/JSON                                                                 |
| 4,67 | ACE03 régua de leitura · CAT09 por que este livro não está · EST01 pontos do ENEM (pago 3) · IA06 quem é quem · LEI04 sincronizar (pago 3) · LEI10 meta diária · NOT06 backup e aviso                                                                     |
| 4,33 | CAT06 prateleira ENEM · CAT07 ranking de populares · NOT04 Anki                                                                                                                                                                                           |
| 4,0  | CAT02 selo de domínio público · CAT05 "você conhece X%" · EST03 modelo de conteúdo de estudo · IA03 analogia · INT04 etiquetas no leitor · INT05 exercícios sem IA · LEI09 glossário de época · NAR02 bilíngue/leitura inteligente · NOT05 caderno em PDF |
| 3,67 | NAR06 LibriVox junto do texto                                                                                                                                                                                                                             |
| 3,33 | ACE05 sílabas · CAT12 "vale a pena ler?" · LEI07 bilíngue lado a lado · NOT07 baixar o texto do livro                                                                                                                                                     |
| 3,0  | IA05 pergunte ao livro · IA07 destaques automáticos · NOT02 nota de áudio                                                                                                                                                                                 |
| 2,67 | EST02 ponte literatura-história · NAR07 pronúncia de nomes                                                                                                                                                                                                |
| 1,0  | **NAR05 exportar audiolivro (MP3 por capítulo em ZIP)**                                                                                                                                                                                                   |

CAT02, CAT03 e EST03 têm nota média, mas são obrigatórios: são proteção legal e arquitetura, e os juízes só
deram nota baixa porque "o usuário não usa". Os três juízes disseram isso com essas palavras.

## 4. MVP por fase (L1 a L5)

O critério foi: nota ≥ 5 na rubrica, ou obrigação legal ou de arquitetura, e esforço compatível com a fase. O
que ficou abaixo vai para "depois" (seção 7).

| Fase                         | MVP (entra)                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Depois, na mesma fase                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **L1 Catálogo**              | Filtro legal automático com selo discreto (CAT02, obrigatório) · vitrine por idade (CAT03, obrigatório) · categorias (CAT01) · nível estimado e "Comece por aqui" (CAT04) · busca e filtros (CAT08) · trazer o seu: EPUB, PDF, link (CAT10) · biblioteca pessoal (CAT11) · "por que este livro não está" (CAT09) · ranking por popularidade **só com os downloads da fonte, no build** (CAT07)                                                                          | Prateleira ENEM como coleção curada (CAT06) · "você conhece X%" (CAT05)                                                                                                        |
| **L2 Leitor**                | foliate-js com paginação/rolagem, temas e atalhos (LEI01) · continuar de onde parei (LEI02) · sumário e busca (LEI03) · PDF.js com aviso de PDF escaneado ou de duas colunas (LEI05) · toque na palavra → cartão (LEI08 + INT01) · kit tipográfico, temas suaves, perfil salvo, teclado e leitor de tela (ACE01, ACE02, ACE04, ACE07) · grifos com nota (NOT01) · sincronização (LEI04) · exportar Markdown/JSON (NOT03) · aviso de onde está guardado e backup (NOT06) | Ler sem internet (LEI06) · régua de leitura (ACE03) · Anki CSV (NOT04) · caderno em PDF (NOT05)                                                                                |
| **L3 Narração e audiolivro** | Narração por frase com destaque, voz e velocidade (NAR01) · ouvir e ler sem perder o lugar (NAR03) · bilíngue/leitura inteligente reaproveitada, com rótulos claros (NAR02) · voz natural da nuvem no pago, com cota (NAR04)                                                                                                                                                                                                                                            | **Exportar MP3 por capítulo em ZIP (NAR05)**, só pago, só livro PD, com custo antes de gerar (seção 6) · LibriVox como player por capítulo, sem sincronia (NAR06)              |
| **L4 IA de leitura (pago)**  | Explicar o trecho, com opção "com analogia" (IA01 + IA03) · resumo do capítulo com citações clicáveis (IA04) · simplificar para o meu nível, lado a lado com o original (IA02) · quiz do capítulo (IA08) · custo antes de gerar (IA10) · respostas curtas e ouvíveis (IA11) · cache por livro/capítulo/tarefa/nível/idioma                                                                                                                                              | Quem é quem sem spoiler (IA06) · glossário de época (LEI09) · pergunte ao livro (IA05, seção 6)                                                                                |
| **L5 Integração e terreno**  | Fonte "Livro" nos jogos e na revisão (INT03) · jogo de 1 minuto no fim do capítulo, opcional (INT02) · modo de jogo sem pressão (ACE06) · modelo genérico de "conteúdo de estudo" (EST03, só o modelo)                                                                                                                                                                                                                                                                  | Exercícios sem IA com frases do capítulo (INT05) · etiquetas da palavra **no cartão**, não pintadas no texto (INT04) · pontos do ENEM com revisão humana (EST01, próxima fase) |

A ordem segue o ranking: o leitor (L2) é o centro de tudo e pode andar em paralelo com o catálogo (L1), como
o plano já previa. L3 e L4 dependem do leitor.

## 5. Grátis e pago

- **Grátis, sem limite:** catálogo, trazer o seu, leitor, toque na palavra, cartões, grifos e notas,
  **sincronização**, todas as exportações das anotações, acessibilidade inteira, narração com a voz do
  aparelho, jogos. Isso segue os planos v4, em que a sincronização já é grátis, e o antipadrão mais citado:
  todas as 6 personas disseram que desistiriam se grifos ou exportação ficassem atrás de paywall, e p6 disse o
  mesmo sobre a acessibilidade. Os juízes marcaram a sincronização (LEI04) como diferencial pago 3/3. **Não
  aceito isso:** prender as notas da pessoa vende contra a confiança.
- **Pago (Plus, Família, Pro), com cota em `src/core/planos.ts`:** voz natural (reaproveita
  `vozCaracteresMes`/`vozCaracteresDia`), explicar o trecho (reaproveita `explicacoesMes`), e resumo,
  simplificação e quiz do capítulo (cota nova de "IA de leitura"; quando a resposta já está no cache, não
  desconta). Também é pago o MP3 do audiolivro, que desconta da cota de voz.
- **Amostra no Grátis:** a mesma regra de hoje (explicações por dia). Nos livros PD, o resumo de capítulo que já
  está no cache compartilhado pode ser mostrado no Grátis sem custo marginal. Fica como pergunta ao dono, porque
  isso muda o motivo de upgrade.
- Diferencial pago por unanimidade dos juízes (3/3): IA01, IA02, IA04, IA08, NAR04 e EST01. Bate com a linha
  dos planos v4: o pago vende estudo com IA, não o básico.

## 6. Riscos para menores e pontos em que os juízes discordam do plano

| Tema                                  | O que os juízes disseram                                                                                                                                                                                                                                      | Decisão proposta                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo para menores (CAT03)         | Obrigatório. Livros de domínio público têm temas adultos e preconceitos de época sem aviso.                                                                                                                                                                   | Classificação manual por livro. Um livro sem classificação não aparece para quem é menor. Para adultos, a vitrine não é filtrada (p5 pediu isso).                                                                                                                                                                                                                                                                       |
| Nota de áudio (NOT02), 3/3 risco      | Gravar a voz de um menor é dado pessoal, e o uso é raro (rever um áudio é ruim).                                                                                                                                                                              | Fora do MVP. Se entrar: só adulto, só no aparelho, nunca sobe para o servidor.                                                                                                                                                                                                                                                                                                                                          |
| Sincronizar grifos (LEI04), 3/3 risco | Viram conflito com a "retenção zero".                                                                                                                                                                                                                         | **Erro de leitura dos juízes:** a retenção zero vale para os provedores de IA. O Frasy já guarda dados de estudo de menores, como deck e sessões, com exclusão em cascata. Os grifos seguem as mesmas regras (`TABELAS_DO_TITULAR`). Nos livros que a pessoa trouxe, a citação guardada é curta (até 500 caracteres), para o servidor não virar cópia da obra.                                                          |
| Audiolivro em MP3 (NAR05), nota 1,0   | 3/3 risco e o último do ranking: a voz do aparelho (`speechSynthesis`) **não pode ser gravada no navegador**, então tudo vira voz da nuvem; o custo é alto; gerar áudio de um livro protegido importado é reprodução da obra; o ZIP é desajeitado no celular. | Desejo do dono, mantido, mas no fim da L3, com estas regras: só pago, **só livro do catálogo PD** (nunca livro importado), custo mostrado antes, teto por mês e cache do áudio por (livro, capítulo, voz). O "grátis com a voz do aparelho" do plano não é possível com `speechSynthesis`: só um TTS local (Kokoro/Piper) poderia fazer isso, e ele ainda depende do teste de pt-BR e da licença. **Pergunta ao dono.** |
| Pergunte ao livro (IA05), nota 3,0    | Busca lexical falha entre línguas (pergunta em português, livro em inglês) e em pergunta conceitual. Caixa de chat aberta tem pouco uso.                                                                                                                      | Depois da L4. Antes, medir a busca lexical com a pergunta traduzida para o idioma do livro.                                                                                                                                                                                                                                                                                                                             |
| Simplificar livro importado (IA02)    | Juiz A: reescrever o capítulo inteiro de uma obra protegida é obra derivada, e não há cache compartilhado.                                                                                                                                                    | Capítulo inteiro só em livro PD. Em livro importado, só o trecho selecionado, para uso pessoal.                                                                                                                                                                                                                                                                                                                         |
| Pontos do ENEM (EST01)                | Risco de alucinar o que "a prova cobra" para menores.                                                                                                                                                                                                         | Próxima fase, com revisão humana do conteúdo em cache antes de publicar.                                                                                                                                                                                                                                                                                                                                                |
| Baixar o texto PD (NOT07)             | Um erro no filtro vira distribuição ativa de obra protegida; e há a marca do Gutenberg.                                                                                                                                                                       | Fora do MVP. O filtro legal tem teste e a cópia curada fica sem cabeçalho.                                                                                                                                                                                                                                                                                                                                              |
| Trazer o seu (CAT10)                  | Juiz C: um menor pode importar conteúdo impróprio ou pirateado.                                                                                                                                                                                               | O arquivo fica no aparelho e não é redistribuído. É o mesmo modelo da importação de hoje. O link da web passa pelo `/api/import/web`, que já existe (anti-SSRF).                                                                                                                                                                                                                                                        |
| Analogias de cultura pop para jovens  | Juízes B e C: exige saber a idade e cuidar do que é gerado.                                                                                                                                                                                                   | A instrução de menor (já existe na IA de estudo) vale para toda tarefa da L4.                                                                                                                                                                                                                                                                                                                                           |

## 7. Fora do escopo (desta rodada)

- **Fora de vez:** bilíngue lado a lado do livro inteiro (LEI07). Os 3 juízes viram tradução cara, colunas que
  quebram no celular e dependência da tradução; o modo intercalado sob demanda, que já existe, basta. Também
  ficam fora os destaques automáticos da IA no texto (IA07: poluem e tiram o grifo ativo; o "destacar o
  importante" do dono vira os pontos-chave do resumo, com citação), a pronúncia de nomes (NAR07), a sílaba com
  áudio (ACE05, sem bom divisor silábico em 16 idiomas no navegador), o "vale a pena ler?" (CAT12), a ponte
  literatura-história (EST02, próxima fase) e o CBZ/quadrinhos.
- **Depois do MVP:** pergunte ao livro (IA05), LibriVox sincronizado (NAR06), "você conhece X%" (CAT05),
  etiquetas pintadas no texto (INT04), cartões sugeridos pela IA (IA09, desligado por padrão se entrar: juiz C
  lembrou que cartão que a pessoa não escolheu retém pouco), nota de áudio (NOT02), M4B, TTS neural local.
- **Fora pela lei ou pela fonte:** MEC/Brasiliana (sem API), Internet Archive fora dos itens abertos, qualquer
  obra só "PD nos EUA", e qualquer autor ou tradutor sem ano de morte.

## 8. Antipadrões a evitar (os mais citados pelas personas)

1. **Perder grifos, notas ou posição** sem aviso nem backup (6/6 personas).
2. **Paywall no básico**: tocar na palavra, grifar, exportar, acessibilidade, abrir os livros cobrados (5/6).
3. **IA que inventa sem citar o trecho** (p2, p3, p5; nas duas famílias).
4. **Leitor pesado ou que perde a posição** no celular médio, e PDF de duas colunas embaralhado (5/6).
5. **Catálogo que parece pirata**: cabeçalho do Gutenberg, tradução duvidosa, erros de digitalização (p3, p4,
   p5).
6. **Cota no escuro**: acabar sem aviso, ou não saber quanto uma ação custa antes de clicar (p2, p5).
7. **Gamificação no meio da leitura**: pop-ups, pontos, IA "piscando" sem ser chamada (p2, p4, p5). Jogo só
   no fim do capítulo, e opcional.
8. **Cadastro e dados antes da primeira página**, e oferta agressiva para menor (p1, p3).
9. **Acessibilidade que volta ao padrão** a cada livro, texto justificado, ícones sem rótulo (p4, p6).
10. **Jogos com cronômetro** e punição por ortografia (p6).

## 9. Fontes (da pesquisa de 26/10, no plano)

- Lei 9.610/1998 (arts. 14 e 41): https://www.planalto.gov.br/ccivil_03/leis/l9610.htm
- Standard Ebooks (CC0, EPUB, CORS `*`): https://standardebooks.org/ · https://standardebooks.org/about/uncopyright-and-public-domain
- Wikisource, API MediaWiki (`origin=*`): https://pt.wikisource.org/w/api.php · https://www.mediawiki.org/wiki/API:Cross-site_requests
- Internet Archive, API de busca e itens: https://archive.org/developers/
- Project Gutenberg, acesso de robôs e espelhos: https://www.gutenberg.org/policy/robot_access.html · licença e marca: https://www.gutenberg.org/policy/license.html
- Gutendex (metadados: `death_year`, `translators`, `download_count`): https://gutendex.com/
- LibriVox (API): https://librivox.org/api/info
- foliate-js (MIT): https://github.com/johnfactotum/foliate-js · PDF.js (Apache-2.0): https://github.com/mozilla/pdf.js
- KOReader (AGPL) e Calibre (GPL), só como referência: https://github.com/koreader/koreader · https://github.com/kovidgoyal/calibre
- W3C Web Annotation Data Model (TextQuoteSelector): https://www.w3.org/TR/annotation-model/ · EPUB CFI: https://idpf.org/epub/linking/cfi/
- `Intl.Segmenter`: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
- MiniSearch (busca lexical no navegador): https://github.com/lucaong/minisearch
- TTS local: Kokoro (https://huggingface.co/hexgrad/Kokoro-82M) · Piper (https://github.com/rhasspy/piper)

## Arquivos desta rodada

- [`eval/livros-v1/brief.md`](eval/livros-v1/brief.md): o brief enviado a todas as chamadas.
- [`eval/livros-v1/personas/`](eval/livros-v1/personas/): as 9 saídas brutas. O sufixo diz a família, e
  `p1p2`/`p3p4`/`p5p6` são as chamadas de conferência com duas personas.
- [`eval/livros-v1/ideias.json`](eval/livros-v1/ideias.json): as 62 funções consolidadas.
- [`eval/livros-v1/juizes/`](eval/livros-v1/juizes/): rubrica por juiz e lote, pares por juiz e ordem (com o
  mapa de cada par), `placar-rubrica.json` e `placar-pares.json`.
- [`eval/livros-v1/metodo/`](eval/livros-v1/metodo/): os modelos de prompt, os perfis, a rubrica, os lotes e
  os scripts. Rodaram na pasta de rascunho, com caminhos relativos `out/…`.
