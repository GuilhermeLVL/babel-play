> Pedido do dono, 17/10/2026: "adicione a funcionalidade de identificar o idioma automaticamente, assim como
> nós temos no modo captura, para não depender da pessoa saber qual é o idioma da outra pessoa", e "melhorar a
> interface para que ela fique mais usual e prática, de acordo com os dispositivos, computador ou celular".
> O dono deixou as decisões comigo ("pode decidir"); as que mudam o produto estão marcadas no `design.md`.

## Why

Para abrir uma conversa, o intérprete pede o idioma da outra pessoa. Muitas vezes quem segura o aparelho não sabe
qual é (um turista, um atendente, alguém num aeroporto). A captura já oferece "Detectar automaticamente". O
intérprete não oferece, apesar de o modo automático (E7) já medir o idioma de cada fala pelo áudio. Hoje esse modo
só usa a medida para decidir de que lado veio a fala, e a pessoa ainda precisa declarar o par.

A tela também tem atritos que aparecem nas capturas de 17/10:

- No automático, as duas metades mostram um botão "Ouvir" idêntico: dois controles para uma única ação.
- "Repetir" e "Parar voz" ficam na tela antes de existir qualquer tradução.
- No celular, o botão flutuante do iChat cobre o "Parar voz" da metade de baixo.
- No computador, uma janela estreita (menos de cerca de 760 px) mantém as duas colunas, e a segunda sai da tela.
- O idioma de cada metade só troca por um chevron de 32 px ao lado do nome.

## What Changes

- **"Detectar" para a outra pessoa.** O diálogo de idiomas do intérprete passa a oferecer "Detectar
  automaticamente" no lado "A outra pessoa fala". Com ele, a conversa corre no modo automático. A primeira fala
  medida em outro idioma que não o meu revela o idioma da outra pessoa. A partir daí, a metade dela mostra
  "Inglês · detectado", a tradução é lida nesse idioma e a minha resposta vai para ele. Se ela trocar de idioma,
  a regra do terceiro idioma, que já existe, acompanha a troca.
- **Antes de detectar**, a minha fala fica só transcrita, sem tradução e sem voz, e a tela diz: "Deixe a outra
  pessoa falar primeiro: o app descobre o idioma dela".
- **Um controle no automático.** No automático, o "Ouvir/Parar" deixa de aparecer nas duas metades e vira um
  botão único, central. No celular ele fica na faixa do meio, ao alcance das duas pessoas. No computador fica
  centrado embaixo, com a dica do atalho.
- **Ações de voz no tempo certo.** "Repetir" só aparece quando a metade tem uma tradução para repetir. "Parar voz"
  só aparece enquanto a voz lê.
- **Layout por aparelho e por largura.** O layout de computador usa colunas só quando a janela é larga. Numa janela
  estreita, as metades ficam uma sobre a outra, sem virar nenhuma. O iChat flutuante some enquanto o intérprete
  está aberto. No computador, "Trocar os lados" usa a seta horizontal, e a tela mostra as teclas de atalho.
- **Idioma tocável.** O nome do idioma de cada metade vira o próprio botão de trocar o idioma, com alvo de toque de
  pelo menos 44 px.

## Capabilities

- `interprete-detectar-idioma` (nova): o idioma da outra pessoa pode ser "Detectar".
- `interprete-ux-por-aparelho` (nova): o controle único do automático, as ações de voz sob demanda, o layout
  responsivo e o fim da sobreposição.

## Impact

- `src/lib/captura/interpreteAutomatico.ts`: a regra aceita o idioma do outro desconhecido.
- `src/lib/captura/controleDoInterprete.ts`: o estado expõe o idioma detectado.
- `src/components/views/LiveCapture.tsx`: o lado do diálogo, a preferência guardada e os idiomas repassados.
- `src/components/views/captura/interprete/{PaginaDoInterprete,ModoInterprete,ConversaDoPrototipo,modoDaConversa}.tsx`.
- `src/styles/modoInterprete.css`.
- Não muda o pipeline de voz, o motor de STT, os planos nem o custo. A detecção usa o Whisper, que o automático já
  usa.
