# O desenho do headset (Meta Quest): guia para quem monta uma tela

Aprovado pelo dono em 01/10/2026. Vale só com `<html data-quest-novo="true">` (perfil `quest` e a chave
`telaNovaDoQuest`); em componente, `useQuestNovo()` de `src/lib/dispositivo/telaNovaDoQuest.ts`. Computador
e celular não mudam.

O dono cogita levar este desenho aos outros aparelhos. Por isso: a tela nova não depende de nada que só
exista no Quest além do `useQuestNovo()`, e o CSS dela usa só as peças e os tokens abaixo.

## A regra que não se negocia: nenhuma função some

A tela nova mostra **as mesmas funções** da tela de sempre. Pode reagrupar, pôr atrás de uma aba, de um
"Opções" ou de um diálogo, mas toda ação, filtro, aba, controle e estado (carregando, vazio, erro) continua
alcançável. Quem redesenha uma tela entrega a tabela **função de antes → onde ficou**.

Recurso que o aparelho não tem (teclado físico, reconhecimento de voz do navegador): a função aparece e
diz o motivo, ou muda de forma (o teclado do sistema sobe quando um campo ganha foco). Nunca um botão
que não faz nada.

## Como a tela é montada

1. O componente de sempre continua dono do estado e dos efeitos. A tela nova é um **ramo de
   apresentação** dentro dele (`if (questNovo) return <… />`), ou um componente em
   `…/quest/NomeDoQuest.tsx` que recebe por props o que o de sempre já calcula. Não duplique lógica.
2. O CSS da tela vai num arquivo próprio em `src/styles/quest<Area>.css`, importado pelo componente da
   tela (nunca por `main.tsx`: o CSS inicial tem orçamento). `quest.css` e `questBase.css` são de um
   dono só; precisa de uma peça nova de uso geral, peça.
3. Textos novos passam por `t()` / `tp()` com a frase em português como chave.
4. Ícones: `lucide-react`. Nada de emoji.

## Medidas

| O quê | Medida |
| --- | --- |
| Alvo | ≥ 56 px; o principal da tela, ≥ 60 px; 8 px ou mais entre alvos |
| Texto de corpo | 17 a 18 px; nada abaixo de 14 px; sem peso fino nem itálico |
| Título da tela | 32 px, peso 900 (`.q-cab h1`) |
| Janela padrão | 1280 × 670: a tela principal cabe sem rolar quando der |
| Janela mínima | 500 × 495: uma coluna, o trilho deita embaixo |
| Cores | só tokens do tema (`--canvas`, `--surface`, `--surface-sunken`, `--ink`, `--ink-muted`, `--border-subtle`, `--q-acento`, `--q-suave`, `--q-sobre-acento`, `--good`, `--warn`, `--error`) |
| Movimento | 120 a 180 ms, no lugar (`--q-toque`, `--q-cor`); nenhum com movimento reduzido |

Uma tela tem **uma** ação principal (`.q-tile.pri`, `.q-ctl.pri` ou `.q-botao`). O resto é secundário.
Nada abre por hover e nada desliza pela lateral: painéis e diálogos abrem no centro.

## As peças (`src/styles/quest.css`)

| Classe | Para quê |
| --- | --- |
| `.q-palco` | o miolo da tela: coluna, 20 px entre blocos, rola sozinho |
| `.q-cab` + `.q-sobre` + `h1` | cabeçalho: sobrancelha, título, e à direita chips ou ações |
| `.q-voltar` (com `.q-ctl`) | voltar, antes do título |
| `.q-chip` / `button.q-chip` | pílula de informação / de ação leve |
| `.q-abas` > `.q-aba[aria-selected]` | abas da tela |
| `.q-abas.q-seg` > `.q-aba[aria-pressed]` | escolha entre poucos (P/M/G, 7/30/90 dias) |
| `.q-grade.g2/.g3/.g4` | grade; perde colunas quando estreita |
| `.q-tile` (`.pri`, `.em-linha`, `.apagado`) + `.q-ic` + `b` + `.q-d` + `.q-tag` | cartão que é um alvo inteiro |
| `.q-cartao` (`.fundo`) | superfície que agrupa conteúdo e não é alvo |
| `.q-lista` > `.q-linha` + `.q-ic` + `b`/`small` + `.q-fim` | lista; cada linha é um alvo de 72 px |
| `.q-secao` > `header` (`h2` + `p`) | seção com título |
| `.q-ajuste` (`b` + `small` + controle) | um ajuste por linha |
| `.q-interruptor[role=switch][aria-checked]` | liga/desliga |
| `.q-campo` (`span` + `input`/`select`/`textarea` + `small`) | campo com rótulo |
| `.q-num` (`b` + `span`, `.q-delta`) | número de resumo |
| `.q-barra` > `span[style=width]` | progresso |
| `.q-tabela-caixa` > `.q-tabela` | tabela |
| `.q-aviso` | faixa de aviso com no máximo uma ação |
| `.q-vazio` (`.q-ic` + `h2` + `p` + um `.q-ctl.pri`) | estado vazio |
| `.q-esqueleto`, `.q-carregando` | espera |
| `.q-faixa` + `.q-ctl` (`.pri`, `.perigo`) + `.q-espaco` | a faixa de controles do pé da tela |
| `.q-acoes` | fileira de ações que quebra de linha |
| `.q-texto` | parágrafo de corpo |

`questBase.css` dá as medidas do headset às peças de sempre (`.tela`, `.cab`, `.cartao`, `.btn`, `.campo`,
`.abas`, `.seg`, `.check`, `.interruptor`, `.vazio`, `<dialog>`, `.toast`): o trecho de tela que você não
reescrever já fica legível e com alvo certo. Reescreva o que precisa de **outra organização**, não o que
só precisava de tamanho.

## Resposta ao apontar

É automática para `button`, `a[href]`, `[role=button|tab|switch|option]`, `select`, `input`, `textarea` e
`[data-tocavel]` (`src/lib/dispositivo/respostaAoApontar.ts`): o controle vibra ao entrar no alvo. O realce
visual das peças `.q-*` já existe. Num alvo seu, siga o mesmo padrão:

```css
.minha-peca {
  transition: transform var(--q-toque), border-color var(--q-cor), background-color var(--q-cor);
}
.minha-peca:hover { border-color: var(--q-acento); transform: scale(1.03); }
.minha-peca:active { transform: scale(0.97); }
.minha-peca:focus-visible { outline: 3px solid var(--q-acento); outline-offset: 3px; }
```

Use elemento de verdade (`<button>`), nunca `<div onClick>`. Alvo desabilitado leva `disabled` ou
`aria-disabled="true"`.

## Voz, teclado, fala

- Voz de leitura: `haVozPara(idioma)` (`src/lib/voz/haVoz.ts`) diz se há voz para o idioma do texto (a do
  aparelho, ou a do site no Quest com a nuvem ligada: inglês, espanhol, francês, chinês, japonês e
  coreano). Botão de ouvir aparece só quando ela responde `true`.
- Teclado: o Quest não tem teclado físico, mas o do sistema sobe no foco de um campo. Atalhos de teclado
  não aparecem (`data-precisa="teclado"`).
- Reconhecimento de voz do navegador: não existe no Quest (`recursosDoAparelho().reconhecimentoDoNavegador`).

## Conferir

- `rtk proxy npx tsc --noEmit -p .` sem erro.
- Teste de componente em `tests/quest<Area>.test.tsx` (molde: `tests/questCasca.test.tsx`): a tela nova
  monta, e cada função da tabela está alcançável.
- Fotos no Quest emulado: `test-results/ver-quest-telas.mjs` (1280 × 670 e 500 × 495).
