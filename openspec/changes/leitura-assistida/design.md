## Contexto

O livro roda em iframes do foliate-js (vendorizado; mudanças só com comentário `FRASY:` e registro em `foliate/PATCHES.md`). A pesquisa
indica que a seleção pode ser consertada SEM tocar o foliate: o app já recebe os eventos do documento e já tem caret + segmentador.
A hipótese do salto de coluna (ordem do texto no layout de duas colunas) NÃO foi reproduzida: a primeira tarefa da Fatia A é reproduzir
antes de corrigir. Se a hipótese cair, o desenho de A.2 continua válido (limitar ao bloco).

## Fatia 0: contrato (tipos e pontos de encaixe)

Arquivo único `src/core/leitura/leituraAssistida.ts` (puro, sem React), criado ANTES das fatias. Mudar o contrato depois exige aviso no PR
e rebase das outras fatias.

```ts
export type NivelCefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Escopo = 'palavra' | 'trecho' | 'paragrafo' | 'capitulo';

/** O trecho selecionado, igual para todas as fatias. Sempre em bordas de palavra e dentro de UM bloco (A garante). */
export interface TrechoDoLeitor {
  texto: string;
  frase: string;
  paragrafo: string; // paragrafo = texto do bloco que contém o trecho
  idioma: string;
  cfi: string;
  citacao: CitacaoDoTexto;
  rect: { x: number; y: number; w: number; h: number; coluna: number }; // viewport do app, já fora do iframe
}

/** A publica; B, C e D assinam. */
export interface BarramentoDaSelecao {
  aoSelecionar(
    f: (t: TrechoDoLeitor, origem: 'toque' | 'duplo' | 'longo' | 'alca' | 'arrasto') => void,
  ): () => void;
  aoLimpar(f: () => void): () => void;
}

/** C publica (pura, sem rede); A, B e D leem. */
export type StatusDaPalavra = 'nova' | 'aprendendo' | 'conhecida' | 'ignorada';
export interface InfoDaPalavra {
  status: StatusDaPalavra;
  forca: 0 | 1 | 2 | 3 | 4;
  frequencia: number /* 0..1 */;
}
export function statusDaPalavra(chave: string, idioma: string): InfoDaPalavra; // O(1), do índice de etiquetas em memória

/** D publica; B chama. Abre o painel novo; nunca altera o texto do livro. */
export function abrirAjustarNivel(
  t: TrechoDoLeitor,
  escopo: Escopo,
  nivelInicial?: NivelCefr,
): void;

/** B publica; D chama quando o resultado pede leitura em voz alta. */
export function lerEmVozAlta(texto: string, idioma: string): void;
```

Pontos de encaixe no `Leitor.tsx`/`LeitorDoLivro.tsx` (editados SÓ na Fatia 0, uma vez): `<CamadaDeSelecao/>` (A), `<BalaoDaTraducao/>` (B),
`<CamadaDeDestaque/>` (C), `<PainelAjustarNivel/>` (D), cada um lazy e montado só com a sua flag ligada. Até a fatia chegar, o componente é um
stub que renderiza nada. i18n: prefixos próprios por fatia (`leitor.sel.*`, `leitor.trad.*`, `leitor.vocab.*`, `leitor.nivel.*`); `npm run i18n`
roda no PR de fechamento, não nas fatias, para não conflitar nos catálogos gerados.

## Fatia A

**Player (A.1).** Estilo novo `src/styles/escutaPlayer.css`, só sob a classe da flag. Desktop: barra única de ~48 px colada ao rodapé do
painel da transcrição; a transcrição ganha `padding-bottom` igual à altura medida (ResizeObserver), então NUNCA é coberta. Controles
secundários (velocidade, modo, repetição) numa linha de ícones. Celular: mesma barra, safe-area, sem segunda fileira (velocidade vira menu).
Mesmos tokens de cor, raio e sombra do app.

**Seleção (A.2).** Em `selecao.ts` e num módulo puro novo `src/core/leitura/ajusteDeSelecao.ts`:

- `ajustarAPalavras(range, idioma)`: início recuado ao começo da palavra, fim avançado ao fim da palavra (`Intl.Segmenter`). Pontos que caem em
  espaço sem texto (margem, vão entre colunas) são DESCARTADOS (não viram início nem fim).
- `limitarAoBloco(range)`: se o arrasto cruza para outro bloco (`BLOCOS`) ou outra coluna, o fim é recortado ao fim do bloco do início.
  Estender além do bloco só com a alça, de propósito, nunca por deriva do arrasto.
- Gestos: toque = palavra; toque duplo ou longo = frase (`fraseDoRange`); triplo = parágrafo. Reaproveita `classificarGesto` (`duplo`, `longo`).
- Alças (fase 2 da A): duas alças desenhadas FORA do iframe, andam de palavra em palavra.
- Se o toque não chega ao app (Safari/WebKit, iframe sem scripts), cai no caminho que já existe; teste em WebKit é critério de aceite.

## Fatia B

`BalaoDaTraducao` (novo): ancorado em `TrechoDoLeitor.rect`; escolhe acima ou abaixo conforme o espaço e NUNCA sobrepõe o trecho; em coluna
dupla fica na mesma coluna. "Modo tradução" é um interruptor (preferência no aparelho): ligado, soltar a seleção traduz sozinho (debounce
250 ms, cancela se a seleção mudar). Reusa rota e cache de tradução atuais (`traducaoDeCapitulo`, `/api/translate`); motor local primeiro
quando carregado, nuvem só se o plano permite (`ferramentasDeIa`). Ações: traduzir a frase sob o dedo, traduzir o parágrafo, "ler em voz alta
este trecho" (TTS atual), copiar, ditado de uma frase grifada, atalhos de teclado (T traduz, V lê, C copia, A ajusta nível), exportar grifos
com traduções (estende `core/leitura/exportar.ts`). "Ajustar nível" aparece no balão só com `ia_ajustar_nivel` ligada e chama `abrirAjustarNivel`.

## Fatia C

**Intensidade (função pura `intensidadeDoDestaque(info)`).** Saída `{ tom: 'nova'|'aprendendo'|'nenhum', alfa: 0..1 }`:

- `nova` (sem cartão): UMA cor (token de etiqueta existente), alfa 0,45 + 0,25 × `frequencia` (palavra comum nova pede mais atenção que rara).
- `aprendendo`, força 1 a 3: gradiente do mesmo matiz, alfa 0,50 / 0,32 / 0,18.
- força 4, `conhecida`, `ignorada`: sem cor.
  Variáveis CSS em `etiquetas.css` (claro, escuro); além da cor, sublinhado tracejado nas novas e pontilhado nas aprendendo (daltonismo).
  Legenda/chave de 3 itens nas ferramentas; régua de densidade (% de novas no capítulo) como a do Word Wise; % de palavras conhecidas calculada
  antes de abrir o capítulo (da cobertura que já existe).

**Aplicação:** `CSS.highlights` por documento do iframe (sem mexer no DOM do livro); fallback sem destaque, nunca quebra a leitura. Uma passada
por seção, chave normalizada, orçamento 50 ms por seção.

**Cartão da palavra (1 toque):** "Não sei" (força 1), 1 a 4 (ponto de partida do cartão), "Já sei", "Ignorar", "Revisar agora". Escreve só pelas APIs
de palavras marcadas e de cartões já existentes. A força NÃO é gravada à parte: sai do FSRS, como na change `status-da-palavra-na-legenda`;
escolher 3 manualmente cria o cartão com a estabilidade inicial equivalente. C calcula a força com `forcaDoCartao` por conta própria; não depende
de `forca_na_legenda` estar ligada.

**Paginar marca como conhecida:** opção `marcarConhecidasAoPaginar`, DESLIGADA por padrão e com aviso. Só palavras NÃO clicadas, que estavam
`nova` e com `frequencia` acima de um piso; "Desfazer última página" reverte. Indisponível para perfil protegido (mexe em dado de aprendizagem
sem decisão consciente). "Página conhecida" fora disso, só por botão.

**5 cartões no fim do capítulo:** via `palavrasParaPraticar.ts`.

## Fatia D

**Núcleo novo** `server/ai/nucleo/ajustarNivel.ts` + rota `POST /api/leitura/ajustar-nivel` (`server/routes/ajustarNivel.ts`), no molde de
`explicarFrase.ts` (recusa tipada, prazo, cascata).
Pedido: `{ texto, idioma, nivelAlvo, escopo, conhecidas: string[] (até 300 formas do índice, sem dado pessoal) }`. O servidor NÃO guarda o texto.

**Estratégia** (a pesquisa mostra ~50% de acerto em uma tacada): gerar, medir com o classificador LOCAL barato (`cefrWordlist.ts`: % de palavras
acima do nível e comprimento de frase), reescrever UMA vez se estiver fora. No máximo 2 chamadas; o custo declarado é a soma. Conhecidas são
preservadas (checagem determinística; se uma sumiu, entra na reescrita; se ainda faltar, devolve com o aviso). Desconhecidas acima do alvo são
reescritas. Capítulo: só sob demanda, em blocos por parágrafo, cancelável, com estimativa e confirmação ANTES e cota própria. Original ao lado
do ajustado (duas colunas no desktop, abas no celular).

**Modelo e custo:** nível `rapida` da cascata (o mais barato que não piora a UX); sem Gemini. A resposta traz `custo: { tokensEntrada, tokensSaida, usd }`
e a UI mostra "uso deste ajuste".

**Cache:** no aparelho (IndexedDB), chave = hash(texto) + idioma + nivelAlvo + hash(conhecidas); nada no servidor. Repetir é gratuito.

**Menores:** `saidaFiltrada` com perfil protegido em toda saída; a idade restringe a nuvem como em `ferramentasDeIa` (`idade`). Se o filtro
bloquear, mostra o motivo e o original.

**Cotas:** `ajustesDeNivelMes` e `ajustesDeCapituloMes` NOVOS em `src/core/planos.ts` (único lugar), `0` no Grátis e convidado, `null` nos
ilimitados; valores dos pagos ficam para o dono decidir depois da medição (proposta: 60 e 4). Com a flag desligada nada é cobrado.

**Palavra:** `escopo='palavra'` dá definição curta ou sinônimo no nível alvo, no contexto da frase (1 chamada curta, cache por palavra+frase+nível).

**Ações de 1 toque (mesmo painel):** "Explicar a gramática" (reusa `explicarFrase`), "Resumo até aqui" (reusa `resumir`), "Dar um exemplo",
"Simplificar" (um nível abaixo), "Elevar" (um nível acima). Novas entradas em `FERRAMENTAS_DE_IA` (só D edita).

## Donos de arquivo (sem sobreposição)

- **Fatia 0:** `src/core/leitura/leituraAssistida.ts`, `Leitor.tsx`, `LeitorDoLivro.tsx`, bloco de constantes `FLAG_*` em `planos.ts` e as 5 migrações.
  Depois da Fatia 0, só a D mexe em `planos.ts` (cotas).
- **A:** `src/components/views/analise/EscutaGuiada.tsx` (e filhos do player), `src/styles/escutaPlayer.css`, `src/lib/leitor/selecao.ts`,
  `src/lib/leitor/motor.ts`, `src/core/leitura/gestoDoLeitor.ts`, `src/core/leitura/ajusteDeSelecao.ts`, `src/lib/leitor/foliate/**` + `PATCHES.md`,
  `CamadaDeSelecao.tsx`.
- **B:** `BarraDaSelecao.tsx`, `PainelDaTraducao.tsx`, `BalaoDaTraducao.tsx`, `ferramentasDeIaTextos.ts`, `src/core/leitura/exportar.ts`, `src/lib/leitor/atalhos.ts`.
- **C:** `CartaoDaPalavra.tsx`, `ganchosDaPalavra.tsx`, `GlosaDoLeitor.tsx`, `CamadaDeDestaque.tsx`, `src/core/leitura/destaqueDeVocabulario.ts`,
  `src/lib/leitor/destaqueNoDocumento.ts`, `src/styles/etiquetas.css` (só um bloco `/* leitura-assistida */`), `PainelDeTipografia.tsx` (só a legenda).
- **D:** `server/ai/nucleo/ajustarNivel.ts`, `server/routes/ajustarNivel.ts`, `src/core/leitura/ajustarNivel.ts`, `PainelAjustarNivel.tsx`,
  `src/core/leitura/ferramentasDeIa.ts`, cotas em `planos.ts`, `src/data/rotas/ajustarNivel.ts`.

Ordem: Fatia 0 primeiro (1 PR pequeno). A, B, C, D em paralelo depois; B e C usam stubs do contrato até A e D chegarem. PR de fechamento (i18n,
knip, CI espelhada), seguindo "PR pequeno, CI verde, sem empilhar".

## Riscos

- Seleção em WebKit/iframe sem scripts: eventos podem não chegar. Mitigação: teste Playwright WebKit é portão da A.
- `CSS.highlights` ausente em navegador antigo: sem destaque, nunca quebra.
- Desempenho do destaque em capítulo longo: orçamento e medição em C.
- Custo de IA do capítulo: estimativa e confirmação, cota, e custo medido antes de qualquer valor de plano.
- O modelo erra o nível: classificador local + 1 reescrita + original ao lado; nunca prometer "exatamente B1".
- Modelo do Ajustar nível (D1, 27/11/2026): `deepseek/deepseek-v4.1-flash` primeiro (fiel 100% na bancada, US$ 0,000085 por ajuste), Gemma 4 26B e Llama 3.3 70B de reserva; ordem própria pela função `ajustarNivel` do registro (`docs/auditoria/2026-11-27-ajustar-nivel-bancada.md`, seção 8).

## Métricas de sucesso (medidas antes de ligar qualquer flag)

| Fatia | Métrica                                                                     | Meta                                             |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| A     | Seleções que exigem refazer (100 gestos sintéticos + sessões do dono)       | <= 5%                                            |
| A     | Seleção que sai do bloco sem intenção                                       | 0 nos testes                                     |
| A     | Player cobrindo texto (e2e 1280x720 e 390x844)                              | 0 px de sobreposição                             |
| B     | Soltar a seleção até tradução visível (motor local)                         | p50 <= 600 ms; nuvem p50 <= 1,5 s                |
| B     | Balão sobrepondo o trecho                                                   | 0 casos nos testes de posição                    |
| C     | Pintar uma seção de 5 mil palavras                                          | <= 50 ms                                         |
| C     | Mudar a força pelo cartão                                                   | 1 toque; destaque atualizado <= 100 ms           |
| D     | Texto dentro do nível pedido (classificador local, 50 parágrafos por nível) | >= 80% em +-1 nível após a reescrita (base ~50%) |
| D     | Palavras conhecidas preservadas                                             | >= 98%                                           |
| D     | Custo por parágrafo                                                         | registrar; teto a definir pelo dono após medir   |
| D     | Saída bloqueada pelo filtro de menores que vaza                             | 0 em corpus adversarial                          |
