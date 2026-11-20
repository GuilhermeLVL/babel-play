# Brief de produto: Livros & Leitura no Frasy (L0, 26/10/2026)

## O que é o Frasy

App web (navegador, React) para aprender idioma com o que a pessoa já assiste e escuta: legenda e tradução ao vivo
do áudio (rodando no aparelho quando possível), que viram cartões de repetição espaçada (FSRS), jogos de vocabulário
e um assistente. Público inclui menores a partir de 12 anos (retenção zero de dados, ECA Digital, LGPD). Tem plano
Grátis (legenda no aparelho, jogos, cartões, leitura, biblioteca, Anki, importação, sem limite) e planos pagos
(Plus, Família, Pro) que vendem estudo com IA (explicação da frase, resumo que vira cartões, tutor, voz natural),
com cotas. O Gemini é PROIBIDO dentro do produto (termos vedam uso por menores). A trilha tem 16 idiomas, com
profundidade em inglês, espanhol e português.

## Leitura hoje

- "Leitura" é uma aba da Análise sobre sessões do tipo documento. Importa TXT/PDF/DOCX/legendas no próprio navegador;
  página web pelo servidor.
- Narração com modos original / tradução / bilíngue / "leitura inteligente", usando a voz do aparelho
  (speechSynthesis).
- Anotações por frase guardadas só no navegador (não sincronizam).
- Lacunas: sem EPUB, sem paginação, sem catálogo de livros, sem exportar anotações, sem IA própria da leitura,
  sem audiolivro exportável.

## Restrições legais

- Brasil (Lei 9.610, art. 41): domínio público 70 anos contados de 1º de janeiro do ano seguinte à morte. Em 2026,
  só autores mortos até 1955. "Domínio público nos EUA" não basta.
- Traduções têm direito próprio (art. 14): só entra obra sem tradutor ou com tradutor também morto até 1955; sem
  ano de morte conhecido → fora.
- Project Gutenberg é marca registrada: ao redistribuir, remover o cabeçalho/licença e creditar a fonte.
- Menores: classificação etária manual dos livros; nada de conteúdo impróprio na vitrine de menor.

## Fontes e software livre escolhidos

- Standard Ebooks (CC0, EPUB de ótima qualidade, abre direto no navegador), Wikisource (API aberta), Internet Archive
  (só itens abertos), Gutenberg (sem CORS: cópia curada guardada pelo Frasy, sem a marca), Gutendex (metadados: ano de
  morte, tradutores, downloads), LibriVox (audiolivros em domínio público).
- Leitor: foliate-js (MIT; EPUB/MOBI/FB2/CBZ/PDF, posição por CFI, camada de anotações) e PDF.js para PDF.
  Anotações no modelo W3C Web Annotation (CFI + trecho citado).
- IA barata: por capítulo, sem embeddings; cache compartilhado por (livro, capítulo, tarefa, nível, idioma) nos livros
  de domínio público; perguntas ao livro com busca lexical e citação do trecho.
- Audiolivro: voz do aparelho grátis; voz natural da nuvem no pago (com cota); exportar MP3 por capítulo num ZIP.

## Desejos do dono

- Catálogo com rankings e categorias: entretenimento, didáticos, clássicos, leituras simples.
- Trazer o próprio livro ou artigo (EPUB, PDF, link).
- Leitor profissional (paginação, tipografia, temas, sumário, progresso, busca).
- Narração com escolha de voz, narração inteligente e exportação de audiolivro.
- IA que resume, simplifica, faz analogias e destaca o importante.
- Grifar, exportar e notas de áudio.
- Integração com jogos, exercícios e descoberta de palavras (cartões, deck).
- Terreno para estudar além de idiomas (História do Brasil / ENEM, próxima fase).
- Barato, legal e fácil de usar.
