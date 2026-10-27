# Livros & Leitura: catálogo legal, leitor profissional, narração, IA de leitura e integração

Status: proposta (L0 concluída; L1–L5 aguardam aprovação do dono) · Data: 2026-10-26 · Autor: Guilherme (com Claude)

Pesquisa, personas e juízes que escolheram o escopo:
[`docs/pesquisa/2026-10-26-livros-e-leitura.md`](../pesquisa/2026-10-26-livros-e-leitura.md) (material bruto em
`docs/pesquisa/eval/livros-v1/`). Ids entre parênteses (LEI01, IA04…) são as funções daquele ranking.

## Problema

- A Leitura é uma aba da Análise (`src/components/views/Reading.tsx`, ~1.750 linhas) sobre sessões `kind:'document'`.
  Importa TXT/PDF/DOCX/legendas no navegador (`src/lib/import/`) e páginas web (`/api/import/web`), narra com
  `speechSynthesis` (original/tradução/bilíngue/leitura inteligente) e guarda anotações por frase **só no
  `localStorage`**. Não tem EPUB, paginação, catálogo, exportação de anotações nem IA própria.
- As personas apontam como dor nº 1, em 6 de 6, **perder grifos e posição**; depois, travar no texto e não saber o
  que é do próprio nível; depois, edição ruim ou de legalidade duvidosa.
- O dono quer: catálogo com ranking e categorias, trazer o próprio livro, leitor profissional, narração com voz e
  audiolivro exportável, IA que resume/simplifica/explica, grifos com exportação, ligação com jogos e cartões, e o
  terreno para "estudo além de idiomas" (História do Brasil/ENEM), barato, legal e fácil.
- Restrição legal: no Brasil, a obra entra em domínio público 70 anos contados de 1º de janeiro do ano seguinte à
  morte do autor (Lei 9.610, art. 41), e a tradução tem direito próprio (art. 14). "Domínio público nos EUA" não
  basta. O público inclui menores a partir de 12 anos (ECA Digital, LGPD).

## Objetivos

1. Um catálogo curado e **legal por construção** nos 16 idiomas da trilha (profundidade em en, es, pt), com
   categorias, nível estimado, ranking e vitrine adequada à idade.
2. Um leitor de EPUB/PDF bom no celular médio e no notebook, com posição, grifos e notas que **não se perdem**.
3. Toque na palavra → cartão FSRS com a frase do livro, em um toque.
4. Narração por frase com destaque, grátis com a voz do aparelho; voz natural no pago.
5. IA de leitura no pago com custo marginal perto de zero nos livros PD (cache compartilhado).
6. Livro como fonte dos jogos e da revisão; modelo de dados genérico pronto para outras matérias.
7. Nada básico atrás de paywall: leitor, grifos, sincronização, exportação e acessibilidade são grátis.

## Fora do escopo

- Obras protegidas no catálogo (autor ou tradutor morto depois de `ano − 71`, ou sem ano de morte), MEC/Brasiliana
  (sem API), itens não abertos do Internet Archive.
- Bilíngue lado a lado do livro inteiro (LEI07), destaques automáticos da IA no texto (IA07), pronúncia de nomes
  (NAR07), sílabas com áudio (ACE05), "vale a pena ler?" (CAT12), quadrinhos/CBZ.
- Nesta entrega (fica para depois do MVP): pergunte ao livro (IA05), LibriVox sincronizado com o texto (NAR06),
  nota de áudio (NOT02), cartões sugeridos pela IA (IA09), "você conhece X%" (CAT05), M4B, TTS neural local
  (Kokoro/Piper), redistribuir o texto do livro PD para download (NOT07).
- A matéria de História do Brasil/ENEM (linha do tempo, quiz estilo ENEM, causa e consequência): só o modelo de
  dados agora (EST03).
- Gemini no produto (proibido). O `agy` usado na L0 foi só avaliador de pesquisa.

## Opções

### Motor do leitor

| Opção                                         | Prós                                                                                                               | Contras                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **A. foliate-js (MIT) + PDF.js (Apache-2.0)** | EPUB/MOBI/FB2/CBZ/PDF, paginação e rolagem, CFI nativo, camada de anotações (overlay), sem dependência de servidor | Sem pacote npm estável (vendorizar uma versão fixa); API pouco documentada |
| B. epub.js                                    | Popular, CFI                                                                                                       | Manutenção parada há anos; bugs conhecidos de paginação                    |
| C. Leitor próprio sobre o HTML do capítulo    | Controle total                                                                                                     | Reinventa paginação, CFI e EPUB; esforço G+                                |
| D. KOReader/Calibre (portar)                  | Maduros                                                                                                            | GPL/AGPL: incompatível com o modelo do projeto; não roda no navegador      |

### Estratégia de fontes

| Opção                                                       | Prós                                                                  | Contras                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **A. CORS direto onde há + cópia curada no R2 onde não há** | Custo de servidor ~0; Standard Ebooks e Wikisource abrem do navegador | Exige um script de montagem e um passo de curadoria para o Gutenberg |
| B. Proxy de tudo pelo Worker                                | Uniforme                                                              | Custo de banda e CPU por leitura; vira redistribuição de tudo        |
| C. Só Standard Ebooks                                       | Qualidade máxima, CC0                                                 | Pouquíssimo em pt e nos outros idiomas                               |

### Audiolivro exportável

| Opção                                                     | Prós                                            | Contras                                                                             |
| --------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| **A. Voz da nuvem, MP3 por capítulo em ZIP, só PD, pago** | Possível hoje; cache por (livro, capítulo, voz) | Custo por caractere; última no ranking dos juízes (nota 1,0)                        |
| B. Gravar a voz do aparelho                               | Grátis                                          | **Impossível**: `speechSynthesis` não expõe o áudio para gravação                   |
| C. TTS neural local (Kokoro ~300 MB, Piper)               | Grátis por uso, offline                         | Download pesado; qualidade de pt-BR e licença dos modelos de voz ainda não testadas |

## Recomendação

**Leitor A (foliate-js + PDF.js), fontes A (CORS + cópia curada no R2) e audiolivro A**, entregues na ordem do
ranking: leitor e catálogo primeiro (L1 ∥ L2), depois narração (L3), IA (L4) e integração (L5). O que faria mudar:
(1) se o foliate-js não segurar 60 fps de virada de página no celular médio de referência (`CPU_LENTA=4`), avaliar
C para EPUB simples; (2) se o TTS local passar no teste de pt-BR e de licença, ele substitui A para o "audiolivro
grátis" que o dono pediu (a opção B não existe tecnicamente).

## Design

### 1. Filtro legal (L1, `src/core/livros/filtroLegal.ts`, função pura)

```
anoLimite = anoCorrente − 71            // 2026 → 1955
entra(livro) =
  livro.autores.length > 0
  && todos(livro.autores, a => a.anoMorte != null && a.anoMorte <= anoLimite)
  && todos(livro.tradutores, t => t.anoMorte != null && t.anoMorte <= anoLimite)   // sem tradutor = ok
  && livro.fonte ∈ {standard-ebooks, wikisource, gutenberg-curado, internet-archive-aberto}
```

- Sem `death_year` (autor ou tradutor) → **fora**. Autor anônimo/coletivo só por lista manual revisada
  (`scripts/livros/excecoes.json`, com justificativa por item).
- Marcado como tradução na fonte (`translators` no Gutendex, ou idioma da obra diferente do idioma original
  conhecido) sem tradutor identificado → **fora**.
- O ano corrente vem de quem monta o catálogo (`montar-catalogo.mjs --ano`), nunca do relógio do cliente; o
  catálogo publicado guarda `anoLimite` e o cliente recusa livro cujo `anoMorte` máximo passe dele (defesa dupla).
- Selo discreto no livro (CAT02): "Domínio público no Brasil · autor †1908 · fonte Standard Ebooks".

### 2. Catálogo (L1)

- `scripts/livros/montar-catalogo.mjs` lê Gutendex (metadados, `download_count`), Standard Ebooks (OPDS) e
  Wikisource (API com `origin=*` e User-Agent identificado), aplica o filtro, e grava `public/catalogo/livros.json`
  (só metadados) + `public/catalogo/livros-<idioma>.json` se passar de ~500 KB.
- Campos por livro: `id`, `titulo`, `autores[{nome, anoMorte}]`, `tradutores[]`, `idioma`, `categorias[]`
  (`classicos`, `aventura`, `contos`, `didaticos`, `simples`, `enem`), `classificacao` (`livre`, `12`, `14`, `16`,
  `18`, `null`), `nivel` (A1–C2), `palavras`, `minutosEstimados`, `popularidade`, `fonte`, `url`, `credito`.
- **Classificação etária** é manual (`scripts/livros/classificacao.json`, revisada por pessoa). `null` → o livro
  **não aparece** para menor; para adulto aparece tudo. Quem é menor vem do perfil que já existe; nada de pedir dado
  novo.
- **Nível estimado** = cobertura das listas CEFR de `src/data/trilha/niveis/<idioma>.json` sobre uma amostra do texto
  - fórmula de legibilidade por idioma (Flesch-Kincaid en, Fernández-Huerta es, Flesch adaptada pt; nos outros
    idiomas, só a cobertura). Calculado na montagem, não no cliente.
- **Ranking** (CAT07) = `download_count` da fonte, normalizado por idioma, **no build**. Não há telemetria nova de
  leitura por usuário.
- Busca e filtros (CAT08) no cliente, sobre o JSON. "Comece por aqui" = os 10 mais populares do nível A1–A2 do
  idioma, classificação `livre`. "Por que este livro não está?" (CAT09): busca sem resultado mostra a regra dos
  70 anos e o botão "Trazer o seu".
- **Abrir:** Standard Ebooks e Wikisource **direto do navegador** (CORS). Gutenberg **não tem CORS** e só permite
  robôs por espelho: os aprovados são baixados uma vez de um espelho, **sem o cabeçalho e o rodapé do Project
  Gutenberg e sem a marca** (a licença de marca do Gutenberg exige isso de quem redistribui o texto dentro de um serviço com cobrança,
  como o Frasy com planos pagos), creditados como "Texto de domínio público obtido do Project Gutenberg", e guardados no R2
  (`frasy-livros/<id>.epub`). Nada é baixado do Gutenberg em tempo de uso.
- **Trazer o seu** (CAT10): EPUB e PDF abertos do disco no navegador (o arquivo nunca vai ao servidor); artigo por
  link via `/api/import/web`. Fica na biblioteca pessoal (CAT11) com status e etiquetas.

### 3. Leitor (L2, `src/components/views/leitor/`)

- foliate-js vendorizado numa versão fixa em `src/lib/leitor/foliate/` (MIT, com LICENSE), carregado sob demanda
  (rota própria, fora do bundle inicial). PDF pelo PDF.js que o import já usa; aviso quando o PDF for escaneado
  (sem camada de texto) ou de duas colunas (ordem de leitura suspeita).
- Paginação ou rolagem; tipografia (fonte, tamanho, entrelinha, espaçamento de letra e palavra, largura da coluna,
  margens, **alinhamento à esquerda por padrão**); temas claro, escuro, sépia, creme, cinza escuro e alto contraste
  suave, nunca preto/branco puros (ACE01, ACE02); sumário e busca no livro (LEI03); atalhos de teclado, foco
  visível, alvos ≥ 44 px, rótulos em texto (ACE07). Preferências num **perfil de leitura** aplicado a todo livro
  (ACE04).
- Posição salva por **EPUB CFI** (PDF: página + offset) a cada virada e ao sair (LEI02).
- Toque na palavra (LEI08): abre o cartão da palavra que já existe (com etiquetas e histórico da Parte 1) e
  "salvar no deck" cria cartão com a frase do livro e `origem = {tipo:'livro', livroId, capitulo, cfi}` (INT01).
  Frase → tradução e, no pago, explicação (IA01).
- A Leitura atual (Análise → Leitura) abre sessões `document` no leitor novo quando o documento tiver origem de
  arquivo EPUB/PDF; o resto continua como está.

### 4. Modelo de anotação (L2)

Modelo W3C Web Annotation, guardado no servidor (tabela nova `anotacoes_de_leitura`, só Postgres, dentro de
`TABELAS_DO_TITULAR` para exclusão em cascata):

```
{ id, titular, livroId,                     // livroId = id do catálogo ou hash do arquivo trazido
  alvo: { cfi, citacao: { exact, prefix, suffix } },   // CFI + TextQuoteSelector
  tipo: 'grifo' | 'nota' | 'palavra',
  cor, nota, criadoEm, atualizadoEm, apagadoEm }
```

- Âncora dupla: o CFI acha rápido; se a edição mudar, a citação (`exact` + 32 caracteres de `prefix`/`suffix`)
  reancora. Sem os dois, a anotação aparece em "não localizadas", nunca some.
- `exact` limitado a 500 caracteres em livro trazido pela pessoa (o servidor não vira cópia da obra).
- Sincronização grátis, pela mesma infra de dados de estudo (ETag por versão). Sem conta, fica no aparelho, com
  aviso visível e backup por arquivo (NOT06). O que hoje está no `localStorage` migra na primeira abertura.

### 5. Exportação (L2)

- **Markdown** por capítulo (citação em bloco, nota, link `frasy://livro/<id>#<cfi>`), para Notion/Obsidian.
- **JSON** W3C Web Annotation (`@context` oficial), para portabilidade.
- **CSV do Anki** (frente: palavra ou trecho; verso: tradução/nota; campo extra: frase de contexto e fonte). Reusa
  `src/lib/anki/` quando o `.apkg` fizer sentido.
- **PDF dos grifos** ("caderno do livro"), pela impressão do navegador sobre uma página própria.
- Todas grátis e geradas no navegador.

### 6. Narração e audiolivro (L3)

- Segmentação por frase com `Intl.Segmenter` (não pelo evento `boundary`, que varia entre navegadores). O destaque
  segue a frase, e a palavra quando a voz emitir `boundary` confiável. Escolha de voz por idioma (reusa
  `src/components/voz/SeletorDeVoz.tsx` e `src/lib/tts.ts`), velocidade 0,5–2×, retomar da frase em que a leitura
  parou e vice-versa (NAR03). Os modos bilíngue e leitura inteligente atuais entram com rótulos que dizem o que
  fazem (NAR02).
- Voz natural da nuvem no pago (NAR04), descontando `vozCaracteresMes`/`vozCaracteresDia`.
- **Audiolivro** (NAR05): **só para livros do catálogo PD**, só no pago. Mostra antes os caracteres e quanto da cota
  vai gastar (IA10). Gera **um MP3 por capítulo**, com cache no R2 por `(livroId, capitulo, vozId)`, compartilhado
  entre usuários, e entrega um **ZIP** (`<titulo>/<nn>-<capitulo>.mp3` + `creditos.txt`), montado no navegador.
  Cache hit não desconta cota. Teto de capítulos por mês em `planos.ts`. Nunca para livro trazido pela pessoa.

### 7. IA de leitura (L4, pago)

- Tarefas: `explicar` (trecho, com variante "com analogia"), `resumir` (capítulo, pontos-chave com o CFI de cada
  trecho citado), `simplificar` (capítulo no PD; só o trecho selecionado em livro trazido), `quiz` (5 perguntas do
  capítulo).
- **Cache** por `(livroId, capitulo, tarefa, nivel, idiomaDaResposta, versaoDoPrompt)`. Nos livros PD é
  **compartilhado entre usuários**: a primeira pessoa paga o custo e as outras leem do cache. Nos trazidos, a chave
  usa o hash do arquivo e fica só do titular. `explicar` em trecho livre: cache por hash do trecho + nível.
- Sem embeddings. O capítulo vai inteiro se couber; se não, em partes, com o resumo das partes anteriores.
  Citações validadas: todo ponto do resumo precisa casar uma `citacao.exact` no capítulo, ou é descartado.
- Cascata barata que já existe (`server/ai/registroDeProvedores.ts`), ZDR, **sem Gemini**, instrução de menor
  sempre que o perfil for de menor. Respostas curtas, em tópicos, com botão de ouvir (IA11).
- **Cotas só em `src/core/planos.ts`:** `explicar` usa `explicacoesMes`; `resumir`/`simplificar`/`quiz` usam um campo
  novo `leituraIaMes` (cache hit não desconta); audiolivro usa `vozCaracteresMes` + `audiolivroCapitulosMes`.
  Nenhum número de cota fora de `planos.ts`.
- Harness de qualidade antes de ligar (flag `leitura_ia`, desligada de fábrica): medir com juízes sem créditos onde
  der; o que exigir o modelo de produção usa a cascata real com teto mínimo, **confirmado com o dono antes**.

### 8. Integração e conteúdo de estudo (L5)

- Fonte `livro` em `src/core/minigames/source.ts`: palavras salvas e grifadas de um livro (ou capítulo) viram
  fonte dos jogos e da revisão (INT03). Jogo de 1 minuto opcional no fim do capítulo (INT02), nunca no meio do
  texto. Modo sem pressão: sem cronômetro, múltipla escolha, tolerância a erro de ortografia (ACE06).
- **Modelo genérico de conteúdo de estudo** (EST03), em `src/core/estudo/conteudo.ts`, só tipos e funções puras:

```
ConteudoDeEstudo { id, tipo: 'livro' | 'artigo' | 'apostila' | 'materia', titulo, idioma, origem, licenca }
  → Unidade { id, ordem, titulo }            // capítulo, seção, aula
    → Trecho { id, ancora: {cfi | pagina+offset, citacao}, texto? }
      → Item { id, tipo: 'palavra' | 'grifo' | 'pergunta' | 'fato' | 'evento', dados }
```

O livro é o primeiro `tipo`. A matéria de História/ENEM entra depois como `tipo:'materia'` com itens `fato` e
`evento` (linha do tempo, causa e consequência) **sem mudar o leitor nem as anotações**.

## Critérios de aceite

**L1 Catálogo**

1. `filtroLegal` com teste: autor morto em 1955 entra em 2026; **autor morto em 1956 nunca entra**; autor sem
   `anoMorte` nunca entra; **tradução com tradutor sem ano de morte nunca entra**; tradução com tradutor morto em 1956
   nunca entra; obra sem tradutor e autor morto em 1900 entra; trocar `--ano` para 2027 libera quem morreu em 1956.
2. O script de montagem falha (código ≠ 0) se algum livro do JSON publicado violar o filtro.
3. Nenhum EPUB do Gutenberg no R2 contém o cabeçalho, o rodapé ou a licença do Project Gutenberg (teste varre os arquivos curados;
   a única menção permitida é a linha de crédito), e
   todos têm a linha de crédito.
4. Perfil de menor: livro com `classificacao` `null` ou acima da idade não aparece na vitrine, na busca nem por link
   direto (e2e).
5. Busca por autor protegido mostra a explicação dos 70 anos e o botão "Trazer o seu".
6. Abrir um livro do Standard Ebooks e um do Wikisource não passa pelo servidor do Frasy (e2e confere as
   requisições).

**L2 Leitor**

7. EPUB do catálogo abre, pagina e volta à mesma posição (CFI) depois de recarregar a aba, no Chromium e no WebKit
   (e2e).
8. Grifo criado no aparelho A aparece no B depois de sincronizar; apagar a conta apaga os grifos (teste de cascata).
9. Anotação cujo CFI quebrou é reancorada pela citação; sem casamento, aparece em "não localizadas" (teste unitário).
10. Exportar Markdown, JSON (válido no contexto W3C) e CSV do Anki gera arquivos com todos os grifos do livro.
11. Preferências de leitura (fonte, espaçamentos, tema) persistem entre livros; Lighthouse de acessibilidade ≥ 95
    no leitor; navegação completa por teclado.
12. Toque numa palavra → "salvar" cria cartão com a frase e `origem.tipo = 'livro'`.
13. O leitor fica fora do bundle inicial (`npm run build` mostra chunk separado).

**L3 Narração**

14. A narração destaca a frase lida; pausar e retomar continua da mesma frase; mudar a velocidade não perde o
    destaque.
15. Plano sem `vozNatural` nunca chama a nuvem (402 no servidor, teste de rota).
16. Audiolivro: só aparece em livro PD e no pago; mostra o custo antes; gera um ZIP com um MP3 por capítulo e
    `creditos.txt`; o segundo pedido do mesmo capítulo e da mesma voz não desconta cota (cache hit).

**L4 IA**

17. Resumo: todo ponto tem citação que casa com o texto do capítulo; ponto sem citação válida é descartado (teste com
    resposta simulada).
18. Segundo pedido de `resumir` do mesmo (livro, capítulo, nível, idioma), por **outro** usuário, não chama o provedor
    (teste de cache) e não desconta `leituraIaMes`.
19. `simplificar` de capítulo inteiro é recusado em livro trazido pela pessoa.
20. Perfil de menor sempre recebe a instrução de menor; nenhum provedor Gemini no registro (teste que já existe
    estendido).
21. `grep` de números de cota de leitura fora de `src/core/planos.ts` não acha nada (teste de matriz de planos).

**L5 Integração**

22. Jogo com fonte "Livro" usa só palavras daquele livro/capítulo.
23. `ConteudoDeEstudo` tem testes de tipo/função que constroem um livro e um conteúdo fictício `tipo:'materia'`
    com os mesmos `Trecho`/`Item`.

## Riscos e mitigação

| Risco                                                               | Mitigação                                                                                             |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Erro no filtro legal publica obra protegida                         | Função pura com teste; script falha no build; defesa dupla no cliente; exceções só por lista revisada |
| Livro PD com conteúdo impróprio para menor                          | Classificação manual; `null` some para menor                                                          |
| Metadado errado do Gutendex (ano de morte, tradutor omitido)        | Cruzar com Wikidata no script para os aprovados; amostra revisada por pessoa antes de publicar        |
| foliate-js sem pacote estável ou com bug                            | Vendorizar versão fixa, testes e2e de abrir/paginar/retomar; adaptador fino para trocar de motor      |
| Custo do audiolivro e da voz natural                                | Só PD, cache compartilhado por capítulo e voz, custo antes de gerar, teto em `planos.ts`              |
| IA que inventa no resumo                                            | Citação obrigatória e validada; harness antes de ligar a flag                                         |
| Sincronizar grifos de obra protegida trazida vira cópia no servidor | `exact` ≤ 500 caracteres; o arquivo nunca sobe                                                        |
| Leitor pesado no celular médio                                      | Carga sob demanda; medição com `CPU_LENTA=4` antes de cada merge                                      |
| Spotlight/CPU da máquina do dono                                    | Montagem do catálogo é script único, não job contínuo                                                 |

## Entrega em fases

| Fase   | Escopo (MVP)                                                                                                                                                                                                                 | Depende de  | Pronto quando   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------- |
| **L1** | Script do catálogo + filtro legal + classificação + nível + ranking por downloads; tela Livros (categorias, busca, filtros, "Comece por aqui", "por que não está", trazer o seu, biblioteca pessoal); Gutenberg curado no R2 | spec        | Critérios 1–6   |
| **L2** | Leitor foliate-js/PDF.js, tipografia e acessibilidade, posição CFI, toque na palavra → cartão, anotações W3C sincronizadas, exportações                                                                                      | spec (∥ L1) | Critérios 7–13  |
| **L3** | Narração por frase com destaque, voz e velocidade, voz natural no pago; por último, audiolivro MP3/ZIP só PD                                                                                                                 | L2          | Critérios 14–16 |
| **L4** | Explicar, resumir com citações, simplificar, quiz; cache; cotas; flag `leitura_ia` desligada até o harness                                                                                                                   | L2          | Critérios 17–21 |
| **L5** | Fonte "Livro" nos jogos e na revisão, jogo de fim de capítulo, modo sem pressão, modelo `ConteudoDeEstudo`                                                                                                                   | L2          | Critérios 22–23 |

Cada fase vai num worktree próprio, com revisão `revisor-critico`, merge na main, CI e staging manual
(`gh workflow run deploy-worker.yml -f ambiente=staging -f ref=<sha>`), e prints para o dono a cada tela nova.

## Decisões do dono (26/10/2026)

1. **Audiolivro: pago agora, grátis depois.** Ouvir lendo é grátis para todos com a voz do aparelho; baixar o MP3
   (por capítulo, ZIP) só no pago, com a voz da nuvem e cota, e só para livros PD. Depois, avaliar TTS local
   (Kokoro/Piper) em pt-BR e licença para liberar o MP3 no Grátis.
2. **Resumo já gerado aparece no Grátis.** O resumo de capítulo de livro PD que já está no cache compartilhado é
   mostrado também no Grátis (custo zero); gerar resumo novo, simplificar, quiz e explicar continuam no pago.
3. Teto do audiolivro no pago (proposta, a confirmar na L3): 30 capítulos por mês no Plus, dentro dos 150 mil
   caracteres de voz que já existem.
4. **Baixar o texto do livro (TXT e o EPUB original) só para livros PD do catálogo** (decisão de 26/10, na L2).
   Livro trazido pela pessoa e sessão da Leitura exportam só as anotações (Markdown, JSON W3C, Anki).
5. **Posição e perfil de leitura ficam por aparelho, por enquanto** (decisão de 26/10, na L2). Só as anotações
   sincronizam com a conta. **Pendência (follow-up):** sincronizar a posição (CFI + "continuar de onde parei")
   e o perfil de leitura entre aparelhos, pela mesma infra de dados de estudo.

## Notas da implementação da L2 (26/10/2026)

- `/livros/<id>/ler` (o "Ler" da L1, e "Meus livros") abre o leitor da L2 (`LeitorDoCatalogo`): o livro vai
  para a estante do aparelho (`src/lib/livros/doCatalogo.ts`) e o leitor abre nele. A leitura provisória da L1
  saiu. A estante usa um IndexedDB próprio (`frasy-leitor`); o `frasy-livros` continua sendo o de "Meus livros".
- SINCRONIZAÇÃO: o cursor é `(sincronizado_em, id)`, o relógio do SERVIDOR posto em toda escrita sob a trava do
  usuário (crescente por pessoa); `atualizado_em` (o do aparelho) só decide o conflito. A leitura vem em páginas
  de 2000 com `temMais`, e o aparelho só guarda o cursor no fim. Os lotes que sobem são cortados por bytes
  (< 90 KB); `/api/leitura` tem teto de corpo próprio (1 MB); um 413 parte o lote, e a anotação que sozinha não
  cabe fica só no aparelho, com aviso. Datas além de agora + 1 dia são recusadas (400).
- ID DO LIVRO TRAZIDO NO SERVIDOR: `arq:<HMAC-SHA256(chave, sha)>`, nunca o hash do arquivo. A chave é derivada
  no servidor, por pessoa, de `SECRET_KEY` (`GET /api/leitura/chave`). Escolhido no lugar do sal do cliente em
  `settings`: dois aparelhos que gerassem sais diferentes antes de sincronizar dividiriam as anotações do mesmo
  livro; a chave derivada é a mesma em todo aparelho e fica fora do banco. Vale também para a origem do cartão
  no deck (`livro:<id>`).
- Teto somado de citação viva em livro trazido (`arq:`, `meu-`): 20 mil caracteres, no servidor e no aparelho.
- A estante do aparelho tem teto (20 livros, 300 MB) com LRU e aviso de quais saíram; o arquivo de "Meus livros"
  fica UMA vez (a estante guarda só a referência). Remover de "Meus livros" apaga a referência e a posição.
- LINKS do livro nunca navegam o iframe: o `href` vira `data-href`; o interno vai pelo motor, o externo só abre
  pela folha da palavra ("Abrir link"), em aba nova sem opener (e2e no Chromium e no WebKit).
- O capítulo do livro é limpo pelo DOMPurify e sai como HTML montado pelo app, com a CSP (`default-src 'none'`)
  como primeiro filho do `<head>`, num iframe sem `allow-scripts` (`src/lib/leitor/foliate/PATCHES.md`).

## Notas da implementação da L3 (27/10/2026)

- "Ouvir" na barra do leitor abre a barra do narrador (frase anterior, tocar/pausar, seguinte, velocidade 0,5–2×,
  "Voz e modo", parar). Frases pelo `Intl.Segmenter` sobre o texto do capítulo carregado
  (`src/lib/leitor/frasesDoCapitulo.ts`; `\n` virtual entre blocos, frase > 600 caracteres partida no teto da
  voz natural). Máquina de estados pura em `src/core/leitura/narracao.ts`; o controlador é
  `src/lib/leitor/narrador.ts`.
- Destaque pelo overlayer do foliate (chave `frasy:narracao`, desenhado pelo app; tocar nele não abre o painel de
  anotações), com esmaecer curto que some com `prefers-reduced-motion`. "Seguir a leitura" vira a página com
  `mostrarTrecho` (patch no `paginator.js`, motivo `'anchor'`: não mexe na seleção). Fim do capítulo: o seguinte
  abre e a leitura continua; fim do livro: para.
- Começa na frase guardada (`leitor:narracao:<livroId>`, o CFI da última frase lida) se ela estiver na página;
  senão na primeira frase da página visível. Pausar e retomar repetem a frase do começo (a nuvem não pausa, e o
  Chrome perde a fala pausada por muito tempo). Velocidade, voz e modo recomeçam a frase sem perder o destaque.
- Modos da Leitura: original, tradução, bilíngue e leitura inteligente (detecção por frase, ≥ 4 palavras e
  confiança ≥ 0,6). Voz pelo `SeletorDeVoz` (a mesma preferência do app). Voz do aparelho para todos, pelo
  `nativeTts` (sem o "blip" do `speak()` a cada frase). Voz natural só com a escolha + `vozNatural` + flag
  `voz_natural`, pelo `criarVozDaNuvem` (`POST /api/ai/tts`, cota no servidor; a recusa cai na voz do aparelho,
  com aviso de cota uma vez). Convite a plano só fora do perfil protegido (`mostraConviteDaVozNatural`).
- Acessibilidade: o contador "Frase n de N" tem `aria-live="off"`; o leitor de tela ouve só a mudança de estado
  (tocando/pausada/parada), e a posição não é anunciada a cada virada enquanto narra. Media Session: tocar,
  pausar, parar, frase anterior/seguinte.
- Fora por enquanto: PDF (o `foliate-fxl` não dá índice nem overlayer; o "Ouvir" não aparece), destaque por
  palavra (`boundary`) e o audiolivro MP3 (decisão do dono).
- Gesto no texto (pedido do dono, junto da L3): só o toque limpo abre a folha da palavra
  (`src/core/leitura/gestoDoLeitor.ts`); arrastar, segurar e o toque duplo são seleção. No WebKit o gesto é
  amostrado pelo `:active` do capítulo e pela seleção.

## Notas da implementação do parceiro de leitura (L4, motor e conteúdo, 27/10/2026)

Sem tela nesta entrega (a do leitor muda noutra frente). Duas peças:

- **Ficha do livro** (grátis, estática): `public/catalogo/fichas/<id>.json` + `indice.json`, carregada sob demanda
  (`src/lib/livros/fichas.ts`). Esquema, validador e quem vê o quê em `src/core/livros/ficha.ts`: menor não vê a ficha
  do livro que a vitrine esconde dele; spoiler só a pedido; o sensível e o aviso de conteúdo só a partir do teto 16
  (abaixo, uma linha neutra); o aviso também conta o desfecho, então sem spoiler vira uma linha genérica. Gerada uma
  vez por `scripts/livros/gerar-fichas.mjs` (retomável, no máximo 3 CLIs, alarme por chamada) com as assinaturas:
  `claude -p` (Opus) ESCREVE e `agy` (Gemini) REVISA item por item; o duvidoso sai, e o spoiler/sensível que ele
  aponta passa a ser marcado. O Gemini só vota — nenhum texto dele entra (decisão: Gemini fora do produto). Feitas
  59 dos 60 mais populares de en/es/pt; 1 recusada pelo próprio gerador por não conhecer a obra (_Aves Migradoras_);
  a revisão tirou 66 de ~3.860 itens. Toda ficha leva "Gerado por IA, revisado automaticamente."
- **Parceiro** (pago e teste, flag `parceiro_de_leitura` desligada, PG 0014): `POST /api/ai/leitura/parceiro`
  (`server/ai/nucleo/parceiroDeLeitura.ts`), seis modos — explicar, analogia, pergunta, curiosidade, ideia, observar.
  Contrato completo em `src/data/rotas/parceiroDeLeitura.ts`. Cotas em `planos.ts`: `parceiroDia` (40) e
  `parceiroTokensMes` (20% da `tokensMes`). Cache compartilhado (`cache_do_parceiro`, 90 dias) só em livro PD e nunca
  na pergunta livre; a chave é o hash de tudo que vai ao prompt (não dá para envenenar). Livro trazido: só a seleção
  e até 2 trechos (1.500 caracteres), sem cache. A pergunta só é respondida com citação que casa com o trecho
  enviado; sem ela, "não está neste trecho". Sem busca na web (não há provedor de busca com retenção zero).
- **Qualidade** (`scripts/eval-ia/parceiro.mjs`, gold `tests/eval/fixtures/gold-parceiro-v1.json`: 20 casos, 6 modos,
  _Romeo and Juliet_, _Dom Casmurro_ e _La isla del tesoro_, um caso de menor). Candidato SUBSTITUTO `cli:haiku` (o
  prompt e o leitor de produção, mas não a cascata), juízes `claude -p` Opus e `agy` Gemini: 18/20 na 1ª rodada — um
  ponto com citação adulterada entre aspas simples (o leitor passou a conferir aspas simples e a usar a ficha como
  fonte; `parceiro-v2`) e um veredito ilegível do juiz; 20/20 depois. Resultado em
  `docs/auditoria/eval/parceiro-v1/`. **Pendente do dono:** a rodada com o modelo de produção
  (`--candidato openrouter:<modelo> --confirmo-gasto --teto 0.2`, estimativa < US$ 0,05 para os 20 casos) antes de
  ligar a flag.
