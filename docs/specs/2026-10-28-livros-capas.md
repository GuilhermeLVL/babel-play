# Capas dos livros (Frasy)

Data: 28/10/2026. Base: `docs/pesquisa/2026-10-28-capas-e-formatos.md` (ramo `docs/pesquisa-capas-e-formatos`), seções A e B.

## Decisões

1. **Capa de imagem só para o que está no semáforo verde:** os 70 livros da Standard Ebooks (CC0 para o arquivo todo, capa inclusive). Campo opcional `capa?: { origem: 'standard-ebooks'; url; licenca: 'CC0'; credito }` em `LivroDoCatalogo`. Sem licença verificada, sem `capa`.
2. **Fora desta rodada:** capas do Gutenberg, Wikisource/Commons, Open Library e Internet Archive; nenhum envio ao R2; nenhuma API paga; classificação etária intocada.
3. **Sem hospedagem própria agora:** a `<img>` aponta para a URL estável da fonte (`.../downloads/cover-thumbnail.jpg`, 350x525, CORS `*`). `img-src` da CSP já aceita `https:`, `data:` e `blob:`. `loading="lazy"`, `decoding="async"`, proporção 2:3 fixa (sem salto de layout), `referrerPolicy="no-referrer"`, queda silenciosa para a capa tipográfica em `onError`. Depois: `scripts/livros/capas-para-r2.mjs` copia as miniaturas para o R2 `frasy-livros` (não executado nesta rodada).
4. **Capa tipográfica** (fallback dos 258 livros sem imagem e de qualquer erro): SVG gerado no cliente, determinístico por (id, título, autor, idioma), sem imagem de terceiros, contraste AA entre texto e fundo (testado), título em até 4 linhas com redução de fonte, selo do idioma, claro e escuro.
5. **Livro trazido pela pessoa:** a capa é extraída do arquivo (EPUB: `getCover` do foliate; PDF: 1ª página em canvas), reduzida a ~300x450 e guardada como bytes no IndexedDB `frasy-capas` do aparelho, nunca no servidor. Tetos: 200 capas e 20 MB (LRU). Some junto com o livro.
6. **Trocar a capa** (Meus livros e detalhe, também para livro do catálogo): imagem do aparelho, validada pelo conteúdo (`createImageBitmap`), SVG e tipos estranhos recusados, origem até 10 MB, recorte central 2:3, WebP/JPEG. "Voltar à capa original". Aviso: use uma imagem que você tem direito de usar; ela fica só no seu aparelho. Preferência local: não altera o catálogo, não vai ao servidor.
7. **Acessibilidade e desempenho:** alt "Capa de <título>" quando a capa é a única informação; decorativa (`alt=""`) quando o título está ao lado. Imagens fora da tela são lazy.

## Critérios de aceite

- `validarCatalogo` aceita `capa` válida e descarta a malformada (origem, licença ou URL fora de `https://standardebooks.org/`).
- 70 livros SE com `capa`; os demais sem; o resto do catálogo idêntico (`--verificar` passa).
- Contraste >= 4,5 do texto sobre o fundo em todas as paletas; título nunca passa de 4 linhas.
- Imagem do usuário recusada: SVG, tipo desconhecido, > 10 MB, ilegível.
