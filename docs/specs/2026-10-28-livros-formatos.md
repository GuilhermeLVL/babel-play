# Livros: formatos aceitos, "Trazer o seu" e exportação

Data: 28/10/2026. Base: `docs/pesquisa/2026-10-28-capas-e-formatos.md` (ramo `docs/pesquisa-capas-e-formatos`) e a spec `2026-10-26-livros-e-leitura.md`.

## Objetivo

Quem chega com um arquivo (livro, documento pessoal) deve conseguir lê-lo sem saber o que é EPUB: passos
visíveis, formatos aceitos à vista, mensagens gentis quando não dá, e a saída (cópia do arquivo, anotações,
backup) tão fácil quanto a entrada. Tudo no navegador; o arquivo nunca vai ao servidor.

## Decisões

1. **Formato pelo CONTEÚDO** (assinatura de bytes), nunca pela extensão. A extensão só desempata texto puro
   (`.md` = Markdown) e dá o nome ao livro.
2. **Aceitos (e só estes aparecem na tela)**
   - Livros: EPUB, MOBI/AZW3 (sem DRM), FB2 (e FB2.zip).
   - Documentos: PDF (com texto), DOCX, TXT, HTML/HTM (e MHTML), Markdown.
   - Quadrinhos: CBZ.
3. **Duas rotas de leitura.** EPUB, PDF, MOBI/AZW3, FB2 e CBZ entram no motor (foliate-js) como arquivo. TXT,
   HTML, MHTML, Markdown e DOCX viram **texto em capítulos** (a mesma rota do TXT de hoje): títulos e parágrafos
   ficam; imagens, tabelas e formatação interna não. Isso é dito na tela de ajuda ("documentos viram texto").
4. **Bibliotecas, sempre sob demanda (`import()`)**: `mammoth` (já no app; agora `convertToHtml` para manter
   títulos), `marked` (MIT) para Markdown, `chardet` (MIT) só quando o TXT não é UTF-8 nem tem BOM, `dompurify`
   (já no app) antes de extrair o texto do HTML. Nenhuma entra no pacote de entrada.
5. **Tetos.** Livros do motor: 150 MB (o de hoje). Documentos que viram texto: 30 MB e 5 milhões de caracteres
   (o do extrator atual); DOCX com teto de expansão do zip. Mensagem própria para "grande demais".
6. **Mensagens por caso**: formato não aceito (diz qual e o que fazer), proteção (DRM), PDF só imagem ("ainda não
   lemos PDF escaneado"), arquivo grande, arquivo corrompido, arquivo vazio.

## DRM: só detectar e recusar

O Frasy não ensina nem executa remoção de proteção (LDA art. 107). A tela diz "Livros com proteção (DRM) não
abrem" e aponta a ajuda existente. Detecção:

| Formato            | Como se reconhece                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EPUB               | `rights.xml`, `sinf.xml` ou cifra de conteúdo em `encryption.xml` (já existia)                                                                                                                               |
| MOBI/AZW/AZW3      | campo `encryption` do cabeçalho PalmDOC diferente de 0 (no registro 0 e no registro KF8 de um arquivo combo). Antes de importar (`src/core/livros/formatos.ts`) e de novo no `mobi.js` ao abrir (`DRMError`) |
| KFX, Topaz (AZW1)  | assinatura (`CONT`, `TPZ`): contêineres do Kindle moderno, que o Frasy não abre; recusados com a mensagem de proteção                                                                                        |
| PDF                | `PasswordException` do pdf.js                                                                                                                                                                                |
| DOC/DOCX com senha | o Word protegido vira OLE (`D0 CF 11 E0`): "formato não aceito" com a sugestão de salvar sem senha                                                                                                           |

## Fica de fora desta rodada

RTF, ODT, OCR de PDF escaneado, CBR/RAR, DJVU, .doc antigo, Pages, LIT, PDB, EPUB com DRM, KFX. Para
cada um, a tela diz o nome do formato e sugere salvar como PDF, DOCX ou EPUB. Imagens dentro de HTML/Markdown/DOCX
não são trazidas (o livro de texto não carrega imagem) e imagem remota nunca é buscada.

## Exportar

- **Baixar cópia do arquivo**: os bytes originais guardados no aparelho (para todo formato trazido, inclusive
  DOCX/HTML/Markdown/TXT).
- **Anotações**: Markdown e W3C JSON (já havia), mais **HTML** (imprimível, escapado) e **CSV** (com proteção
  contra fórmula de planilha).
- **Backup e restauração da estante**: `.zip` (fflate) com `estante.json` (`versao`, livros, posições, status,
  anotações) e os arquivos dos livros trazidos. A restauração valida versão, teto de tamanho (zip bomb) e tipos;
  não executa nada; se o livro já existe, a pessoa escolhe manter ou substituir. Livros do catálogo não entram
  (voltam do catálogo). Capas escolhidas pela pessoa entram quando existirem no armazém.
- **EPUB do catálogo**: só Standard Ebooks (CC0) ganha "Baixar EPUB", como link direto à fonte (sem copiar).
  Gutenberg e Wikisource não (tradução tem direito próprio e o prazo é de 70 anos, LDA arts. 14 e 41).

## Critérios de aceite

- Soltar um EPUB, um MOBI, um FB2, um CBZ, um PDF com texto, um DOCX, um TXT, um HTML e um Markdown abre e
  aparece em Meus livros; um MOBI com `encryption != 0` e um EPUB com DRM mostram a mensagem de proteção.
- A tela mostra 3 passos, os chips de formato (só os que funcionam) e a linha "Livros com proteção (DRM) não abrem".
- O botão "Trazer um livro seu" está no cabeçalho de Livros, em todas as abas.
- Backup seguido de restauração devolve livros, posições e anotações; arquivo de versão desconhecida é recusado.
