# Polir a legenda flutuante (estado vazio, atalhos, abertura baixa)

> Feedback do dono (26/11, captura 15.png): a janela da legenda flutuante, antes da primeira fala, era um retângulo grande
> vazio com "Esperando a primeira fala". O design (cores, fontes, identidade) NÃO muda; esta change só polimenta dentro dele.

## O que já existia (não repetir)

Modos só original / só tradução / ambos, tamanho da letra, fundo (seguir tema, escuro, preto, claro), 1 a 5 falas à vista, barra de
controles que aparece ao mexer e some, pausar, ritmo de leitura, tamanho por formato guardado, aparência guardada (disco e
servidor), Document PiP com queda para PiP de vídeo e para o painel dentro da página, `aria-live` só na fala fechada.

## O que muda

1. **Estado vazio compacto e útil** (`EstadoVazio`): diz de onde ouve ("Ouvindo o som da aba / da tela / da janela / do
   computador / o microfone"), mostra um medidor do nível do som que chega e, depois de 6 s sem som algum, orienta ("Nenhum som
   chegou ainda. Dê play em algo."). Captura parada diz "A captura está parada".
2. **A janela abre baixa quando ainda não há fala** (96 px, na largura do formato) e cresce até o tamanho do formato quando a
   primeira fala chega. `resizeTo` exige gesto: tenta na hora e, se ficou baixa, o primeiro toque ou tecla na janela completa. O
   tamanho baixo NUNCA é guardado como "o tamanho da pessoa".
3. **Atalhos novos** na janela: `+`/`-` letra maior/menor, `O` alterna original / tradução / ambos, `F` troca o fundo (além de
   Espaço, setas, T, P, S, Alt+L, Alt+R que já existiam). A ajuda da barra lista todos.
4. **Painel dentro da página** (fallback e celular): usa o mesmo estado vazio e passa a anunciar ao leitor de tela só a fala
   fechada (`aria-live`), como a janela completa.

## Fora do escopo (honesto)

- Fundo translúcido: a Document PiP não tem transparência de verdade (limite do navegador); ficam claro, escuro e preto.
- Lembrar a POSIÇÃO da janela: a Document PiP não deixa a página escolher onde abrir (o navegador decide e lembra); o TAMANHO e a
  aparência já são lembrados.
