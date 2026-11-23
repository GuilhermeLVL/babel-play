## Why

Migaku, Toucan e Readlang mostram uma tradução curta sobre as palavras novas do texto, e ela some à medida que a
palavra vira conhecida (relatório `docs/pesquisa/2026-11-ecossistema-de-aprendizado/engenharia-reversa-extensoes.md`).
No Frasy, quem lê um livro sabe a cobertura do capítulo (% conhecidas), mas só descobre o significado de uma palavra
tocando nela. A glosa na página dá o significado no fluxo da leitura, sem tirar os olhos do texto, e a progressão
("Já sei", cartão aprendendo) a faz encolher sozinha: o texto vai ficando limpo conforme a pessoa aprende.

## What Changes

- Novo ajuste do leitor, em Aparência: "Mostrar tradução das palavras novas". Desligado por padrão, salvo no aparelho
  (`leitor:glosa`), só para EPUB/texto (PDF fica fora).
- Ligado, cada palavra NOVA do capítulo visível (mesma régua da cobertura: fora funcionais, nomes próprios, conhecidas,
  "Já sei" e ignoradas) ganha uma glosa curta acima, vinda SÓ do dicionário local (`glosaLocal`): sem rede e sem custo.
  Sem glosa local, nada aparece.
- Limites contra poluição: no máximo 1 glosa a cada 4 palavras seguidas; palavra repetida só nas 2 primeiras
  ocorrências do capítulo; quando não cabe tudo, as mais frequentes do capítulo vêm primeiro.
- Progressão: ao marcar "Já sei" ou quando a palavra entra no caderno como aprendendo/dominada, a glosa dela some sem
  recarregar o capítulo (o índice de etiquetas publica o snapshot e a glosa é refeita).
- Desenho no OVERLAYER do foliate (SVG sobre o iframe), não em `<ruby>` no capítulo: o CFI, a paginação, a seleção e a
  cópia do texto não mudam, e a glosa é `aria-hidden`. Nenhuma mudança no código vendorizado do foliate.

## Capabilities

### New Capabilities

- `leitor-glosa`: a glosa das palavras novas sobre o texto do livro.

### Modified Capabilities

Nenhuma.

## Impact

- `src/core/leitura/glosaDoCapitulo.ts` (escolha, puro), `src/lib/leitor/glosaNoCapitulo.ts` (DOM e overlayer),
  `src/components/views/leitor/GlosaDoLeitor.tsx` (sem tela, montado só com o ajuste ligado), `PainelDeTipografia.tsx`
  e `LeitorDoLivro.tsx` (interruptor e gancho do capítulo carregado), catálogos `public/i18n/{en,es,ar}.json`.
- Desempenho: desligado, nada é montado nem assina o índice de etiquetas (custo zero). Ligado, a conta roda em tempo
  ocioso, por capítulo, fora da virada de página; o texto analisado tem teto de 120 mil caracteres.
- Privacidade: nada sai do aparelho; o caderno e o texto do livro não vão a servidor.
- Limitação conhecida: a glosa fica sobre a entrelinha do livro; com entrelinha muito baixa ela pode tocar a linha de
  cima (o fundo do tema contorna a letra). Idiomas sem espaço entre palavras (ja, zh, th) ficam sem glosa.
