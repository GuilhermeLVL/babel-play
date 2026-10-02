# A captura e o intérprete no computador, no desenho novo: projeto

Levantado em 02/10/2026, depois do pedido do dono de levar o desenho do headset ao computador. **Nada aqui
está implementado.** Hoje, no computador com o "Desenho novo" ligado, `LiveCapture.tsx` mostra a tela de
captura de sempre dentro da casca nova, com a pele de `questBase.css`. Funciona; só não é a tela limpa.

`LC` = `src/components/views/LiveCapture.tsx`. As linhas são as de 02/10/2026.

## O que fica sem a pele hoje

O escopo de `questBase.css` é `.tela, .q-palco, .quest-pronto, dialog, .toast`. Três coisas ficam de fora:

- o modal "A gravação está em andamento" (LC:4668-4712), `div` à mão;
- o guia "Faltou marcar o áudio" (LC:4329-4429), `div` à mão;
- o Foco cheio (`.foco-cheio`, LC:4433-4542).

## Função de antes → onde fica

| Antes (computador) | Onde fica no desenho novo |
| --- | --- |
| Iniciar / Parar | Botão grande / Encerrar na faixa |
| Microfone (ativo, mudo, pedindo permissão) | Linha de decisões antes de gravar, e a faixa |
| Legendas flutuantes | Faixa (e Opções, antes de gravar) |
| Par de idiomas | Linha de decisões e faixa |
| Foco cheio | "Tela cheia" na faixa e em Opções |
| Selo do modelo local | Cabeçalho e Opções |
| Ajustes da captura, Ajuda, Intérprete | Chips do cabeçalho e Opções |
| Falantes (separar vozes, renomear, marcar quem fala) | Opções → "Quem está falando" |
| Palavra → painel lateral de vocabulário | Palavra → folha da palavra |
| Menu do balão → Tradução Nuance | Folha da frase |
| Velocidade da voz | Opções |
| Aparência da legenda | Ajustes (ver decisões) |
| Altura redimensionável | Sai: o palco ocupa a tela |
| Avisos (retomada, nuvem, tradutor, captura não salva, teto, permissão, download) | Bloco de avisos acima do palco |
| Simulador de dev | Só na tela de sempre |

## As peças do Quest: o que serve

- **`LegendaAoVivoDoQuest`**: serve o histórico, a fala atual grande, "Ir para a fala atual" e a escala.
  Precisa de parâmetros: rótulo e ícone da fonte ("Som do computador"), nome do falante, "Ouvir" pela voz
  do navegador, palavra clicável (o gesto do computador), "Mostrar tradução" e um lugar para o download do
  modelo. Não conhece os ajustes de "Aparência da legenda" além da escala.
- **Faixa de controles** (`CapturaNoCelular.tsx:152-211`): serve; ganha Legendas flutuantes, Opções e Tela
  cheia.
- **Tela "pronto"** (`CapturaNoCelular.tsx:300-385`): serve a estrutura; `aparelho` ganha `'computador'`
  (os passos falam em headset). A escolha de três fontes é do Quest: no computador vira o interruptor do
  microfone e o chip da rota do som.
- **`FolhaDaFrase` e `FolhaDaPalavra`**: servem e substituem o diálogo de Nuance e o `VocabularyPanel`.
  Precisam de variante centrada (hoje têm largura total).
- **`ResumoDaSessaoNoQuest`**: serve, com texto do aparelho e a faixa da cota só com a nuvem do site.
- **`EncerrarNoQuest`**: não serve: perde título, capa e "Salvar e abrir". O computador fica com
  `EncerrarSessao`.

## Desenho ou aparelho, em `LiveCapture.tsx`

Vira decisão **por desenho**: `aoVivoNoQuest` (LC:2809-2810) e os ramos que ele escolhe (LC:2986, 3035,
3044, 3095, 3764, 3776, 3792, 4636).

Continua **por aparelho ou recurso**: a fonte do Quest e o microfone inicial (LC:654, 721-723, 2826-2831);
modo desempenho (LC:737); liberar modelos (LC:898); a rota do STT (LC:2440, 2507, 2537);
`nuvemDoQuestAtiva()` (LC:2662, 3073, 3771, 3778, 4638); `semVozDeLeitura` (LC:2813); o áudio real das
falas (LC:2818, 3171: hoje preso a `aoVivoNoQuest`, deve ir por `semVozDeLeitura`); `semFlutuante`
(LC:3043: deve ser `!recursos.janelaFlutuante`); `semPratica` (LC:3175: deve ser
`!recursos.reconhecimentoDoNavegador`); `EncerrarNoQuest` contra `EncerrarSessao` (por `tecladoFisico`).

## Passos, na ordem de menor risco

P até ~50 linhas, M de 50 a 150. Uma subchave de teste (`babel.desenhoNovo.captura`) mantém a captura de
sempre como padrão do computador até o último passo.

Sem mudança visível em nenhum aparelho:

1. (P) Separar `aoVivoNoQuest` em nomes próprios (desenho, áudio real, encerrar sem teclado); `semPratica`
   e `semFlutuante` pelos recursos.
2. (M) Parâmetros na `LegendaAoVivoDoQuest`, com os padrões do Quest.
3. (P) Parâmetros no `ResumoDaSessaoNoQuest`.
4. (P) `ModoInterprete`: atalhos por parâmetro, não por `layout === 'computador'`.
5. (P) Folha de baixo centrada no computador (só CSS).

Liga no computador, atrás da subchave:

6. (P) Intérprete no desenho novo (a tela mais isolada).
7. (P) Os dois modais à mão viram `Dialogo`.
8. (M) Tela "pronto" extraída, com textos por aparelho e a linha de decisões.
9. (M) Ao vivo: faixa com extras, legenda nova, folhas no lugar do painel lateral e do diálogo de Nuance.
10. (M) Opções e "Quem está falando".
11. (P) Encerrar e resumo.
12. (P) Tela cheia com a legenda nova; Esc.
13. (P) Tirar a subchave; fotos e testes cobrindo cada linha da tabela.

## Decisões do dono antes de implementar

1. **Aparência da legenda**: a legenda nova ignora fonte, cores, ordem e estilo. Honrar um subconjunto, ou
   dizer que vale só para as legendas flutuantes?
2. **Painel lateral de vocabulário**: some em favor da folha da palavra, ou fica como opção?
3. **iChat na captura**: o botão some como no Quest, ou sobe acima da faixa?
4. **Encerrar**: manter título e capa no computador, ou as três saídas grandes do Quest?
5. **Áudio real das falas**: hoje não no computador (há voz de leitura; o custo é memória).
