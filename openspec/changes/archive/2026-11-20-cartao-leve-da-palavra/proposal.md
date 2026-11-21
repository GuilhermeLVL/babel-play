## Por quê

No leitor de livros (`/leitor`), tocar numa palavra abre o `VocabularyPanel` em modo folha: um diálogo modal no
centro, com fundo borrado, que toma a tela, interrompe a leitura e despeja tudo de uma vez (tradução, fonética,
procedência, dicionário em inglês, Wiktionary, Forvo, exemplo). Ainda erra o sentido: em "Call me Ishmael." o
verbete consultado é o da página "Call" (nome próprio, "A surname"), porque a palavra é consultada com a
maiúscula do começo da frase. O dono pediu um cartão que não atrapalhe a leitura e traga ações rápidas e
contextualizadas.

## O que muda

- O leitor troca a folha modal por um **cartão leve da palavra** (`CartaoDaPalavra`), não modal, ancorado perto
  da palavra (acima ou abaixo) no computador e numa mini-folha baixa (≤ 40% da altura) no celular (≤ 600 px).
- A visão inicial mostra só o essencial: palavra + fonética (se houver) + Ouvir; a melhor tradução no contexto;
  ações rápidas (Ouvir, Traduzir a frase, Sentido, Salvar, Mais). "Mais" expande no próprio cartão o conteúdo
  completo de hoje, com as fontes e licenças numa seção "Fontes" recolhida.
- Nova função pura `src/core/leitura/sentidoNoContexto.ts`: decide a forma de consulta (minúscula no começo da
  frase) e ordena os sentidos do verbete pelo contexto (classe gramatical vizinha; nome próprio só quando a
  palavra está capitalizada no meio da frase).
- Nova função pura `src/core/leitura/posicaoDoCartao.ts`: calcula onde o cartão fica sem cobrir a palavra.
- Imagem: uma miniatura vinda da busca que o app já tem (`lib/imagens/imagensDaPalavra`), só fora do perfil
  protegido (menor ou idade não declarada), sem bloquear o cartão.
- O `VocabularyPanel` continua igual para as outras telas (Análise, transcrição, Leitura antiga).

## Fora do escopo

- Nenhuma chamada nova a provedor pago ou a IA. "Sentido" usa o verbete; a explicação por IA só aparece se a
  flag `ia_de_estudo` estiver ligada, pelo componente que já existe (`ExplicacaoDaFrase`) e com os limites dele.
- Mudar o `VocabularyPanel`, o dicionário (`lib/dictionary.ts`) ou a escada de tradução de palavra solta.

## Impacto

- Código: `src/components/views/leitor/` (cartão novo e `LeitorDoLivro.tsx`), `src/core/leitura/` (duas funções
  puras), `src/styles/leitor.css`, catálogos `public/i18n/*.json`.
- Testes: `tests/leitor-sentido-no-contexto.test.ts`, `tests/leitor-posicao-do-cartao.test.ts`,
  `tests/leitor-cartao-da-palavra.test.tsx`; os e2e do leitor seguem com o `data-testid="folha-da-palavra"`.
