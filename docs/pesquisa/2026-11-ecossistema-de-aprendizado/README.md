# Ecossistema de aprendizado: mercado, métodos de poliglotas e o que o Frasy faz a seguir (21/11/2026)

Pesquisa feita para responder: quais apps e métodos atacam frentes diferentes do aprendizado de idioma, o que eles
têm que o Frasy não tem, e o que vale construir primeiro. Relatórios completos, com fontes, nesta pasta:

- [`concorrentes.md`](concorrentes.md): 18 apps/famílias (LingQ, Language Reactor, Migaku, Readlang, Lingopie, Anki/FSRS,
  Clozemaster, Duolingo, Busuu/Babbel/Memrise/Lingvist, Speak/Praktika, Pimsleur/Glossika, Dreaming, Refold/Yomitan,
  Toucan, Kwiziq, infantis, italki/Tandem/HelloTalk, LanguageTool/Langua), matriz recurso × app e padrões de UX.
- [`metodos-e-video.md`](metodos-e-video.md): o vídeo de Steve Kaufmann sobre leitura e escuta
  (<https://www.youtube.com/watch?v=dD-7_D-8q7I>) e os métodos de Kaufmann, Lampariello, Wyner, Lewis, Richards,
  Refold, Krashen, Dreaming, Arguelles, Nation, Glossika, Pimsleur, FSRS.
- [`rea-lingq.md`](rea-lingq.md): uso do REA (`morluto/rea`, MIT) para análise estática do JS público do LingQ, e o
  modelo de vocabulário do LingQ reconstituído por documentação pública. O app logado não foi analisado nem burlado;
  a API (`/api/`) está fora do `robots.txt` e não foi tocada.

Grau de confiança: preços e recursos de concorrentes vêm em boa parte de resenhas e blogs; trate a matriz como
hipótese e confirme na página oficial antes de usar em decisão comercial.

## O que o vídeo ensina (Kaufmann)

- Ler e ouvir usam as mesmas áreas do cérebro; quem lê subvocaliza, então precisa saber a pronúncia.
- **A1–A2:** frase a frase, ouvir → ler → ouvir → ler. Logo depois, tentar ler antes de ouvir (ouvir primeiro deixa a
  vocalização "preguiçosa").
- **B1+:** ouvir primeiro; a curiosidade puxa a transcrição. Em níveis altos, não repetir: ler e ouvir coisas diferentes.
- Intensivo (consultar tudo) no começo; extensivo só depois de um vocabulário mínimo. Variar formatos mantém o interesse.

## Onde o Frasy já está à frente

Transcrição e tradução **ao vivo** do áudio que a pessoa já assiste, rodando no aparelho; importação ampla
(legendas, PDF, DOCX, EPUB, web, `.apkg`) feita no navegador; leitor de livros por nível; FSRS-5; jogos culturais;
modo para menores com retenção zero. Nenhum concorrente pesquisado junta tudo isso.

## Lacunas priorizadas

| #   | Lacuna                                                                                                                              | Referência            | Decisão                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Marcar palavra como **conhecida** ou **ignorada** sem criar cartão; atalhos `k`/`x`; **contador de palavras conhecidas** com marcos | LingQ, Migaku         | Fazer (`vocab-conhecidas-e-ignoradas`)                                                                                                                                          |
| 2   | **Cobertura (% conhecidas)** em qualquer sessão, legenda e livro, em todos os idiomas, com a faixa de Nation (95–98%)               | LingQ, Migaku, Nation | Fazer depois do 1                                                                                                                                                               |
| 3   | **Retradução** (Lampariello) e **ditado de frase** corrigidos no aparelho                                                           | Lampariello, LingQ    | Fazer (`exercicios-de-frase`)                                                                                                                                                   |
| 4   | **Escuta guiada por nível**: ouvir antes de ler, frase a frase, para A1–A2                                                          | Kaufmann              | Fazer                                                                                                                                                                           |
| 5   | Horas de input com roadmap                                                                                                          | Dreaming              | **Não como meta nem prêmio.** O Decreto 12.880/2026, art. 9º, veda incentivo por tempo (ver `src/core/missoes.ts`). Os marcos do Frasy são por resultado (palavras conhecidas). |
| 6   | Status graduado 1–4 com promoção automática                                                                                         | LingQ                 | Backlog: hoje o estado vem do FSRS do cartão; mapear estabilidade → status é o próximo passo                                                                                    |
| 7   | Cartão com áudio do trecho e captura de tela                                                                                        | Migaku                | Backlog (custo de armazenamento e retenção zero)                                                                                                                                |
| 8   | Diário com correção que vira cartão                                                                                                 | Wyner, LanguageTool   | Backlog (usa IA paga; depende da decisão de recursos de IA)                                                                                                                     |
| 9   | Pares mínimos e cartão sem L1 (imagem)                                                                                              | Wyner                 | Backlog                                                                                                                                                                         |
| 10  | Tags de usuário e filtro por data de revisão na lista de vocabulário                                                                | LingQ                 | Backlog                                                                                                                                                                         |
| 11  | Tandem com humanos                                                                                                                  | HelloTalk, Tandem     | **Não** para menores (ECA Digital/LGPD); só prática com IA moderada                                                                                                             |

## Padrões de UX a seguir

- Palavra colorida por status no leitor e na legenda, com cartão de dicionário ao lado e atalhos de teclado.
- Contador de palavras em destaque com o próximo marco.
- Sessões curtas de revisão; botões de status em vez de notas abstratas.
- Anti-padrões a evitar: trial com cobrança automática sem aviso, preço escondido, contador de conhecidas
  inconsistente (o do LingQ não conta palavras marcadas sem LingQ — o do Frasy soma as duas, sem duplicar).
