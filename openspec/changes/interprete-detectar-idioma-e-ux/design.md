## Context

O automático (E7) já faz o difícil: com o microfone aberto sem lado, o Whisper mede o idioma de cada fala no áudio
e `decidirLadoDaFala` (`interpreteAutomatico.ts`) escolhe a metade usando o par `{meu, outro}`. A regra do
**terceiro idioma** (o estado `estrangeiro`) já cobre a pessoa que fala uma língua fora do par: a tradução dela vai
para o meu idioma, e a minha resposta vai para a língua dela. "Detectar" é esse mesmo caso, só que **desde a
primeira fala**: o `outro` começa vazio.

## Decisões

1. **"Detectar" usa o modo automático (decisão minha).** No toque, o lado tocado decide o idioma, e o motor do
   Android pode ser a Web Speech, que não detecta idioma. No automático, o microfone já vai ao Whisper. Por isso,
   com "Detectar", o modo fica preso no automático. O botão "Automático" fica ligado, e tocá-lo diz: "Para falar
   por toque, escolha o idioma da outra pessoa".
2. **O plano não muda (decisão minha, para o dono confirmar).** O automático é dos planos pagos
   (`interpreteAutomatico`). "Detectar" aparece no diálogo só para quem tem o automático disponível. Abrir para o
   grátis é decisão de produto e custo, não de tela.
3. **A preferência é própria do intérprete.** A flag guardada é `babel.interprete.detectarOutro`, no aparelho, ao
   lado do modo (`modoDaConversa.ts`). Ela não reaproveita o `autoDetectLang` da captura, que no cenário "mídia"
   significa "idioma do conteúdo", e ligar um não pode ligar o outro em silêncio.
4. **A regra pura com `outro` vazio** (`decidirLadoDaFala`):
   - Um idioma medido (motor; ou texto, se o motor não for o meu) diferente do meu é **a outra pessoa**, sem os
     limiares do terceiro idioma. Nesse caso, `estrangeiro` passa a ser esse idioma.
   - O meu idioma medido é o meu lado. A tradução vai para `estrangeiro`. Sem `estrangeiro`, `para` é igual a
     `de`, e o tradutor já trata "mesmo idioma" como "sem tradução" (`traducaoDaFala.ts`): nada é lido, e a
     máquina volta a ouvir.
   - Sem evidência: o meu lado. Alternar para um lado cujo idioma não se conhece não teria para onde traduzir.
5. **O idioma detectado aparece na tela.** `EstadoDoControle` ganha `detectado: string | null`, lido do estado da
   conversa a cada decisão. A metade da outra pessoa mostra "Detectando…" ou "Inglês · detectado". O estado zera
   quando a conversa recomeça (`ouvir`).
6. **Um controle no automático.** `ConversaDoPrototipo` recebe `escuta?: {ouvindo, rotulo, rotuloParaLeitor,
aoTocar}`. Quando recebe, as metades não desenham o botão grande, e o botão único vai para a faixa (celular) ou
   para a base (computador). No toque, nada muda.
7. **As ações de voz são condicionais.** `MetadeDaConversa` ganha `podeRepetir`, que vale quando a frase da metade
   é uma tradução. A tela recebe `falando` (a voz lê agora). "Parar voz" aparece só com `falando`.
8. **O layout responde à largura.** O layout de computador só usa colunas a partir de 760 px de largura
   (`@container`/`@media`). Abaixo disso, as metades empilham sem rotação. Num celular deitado continua o frente a
   frente, porque esse layout depende do aparelho, não da largura.
9. **O iChat flutuante some** enquanto `.int` está aberto (`body:has(.int)`). Já existe precedente com o trilho
   (`celular.css:226`).

## Riscos

- **Fala curta mal medida antes da detecção.** Pode acontecer, por exemplo, de o Whisper ouvir galego no lugar de
  português. Nesse caso, o detector de texto entra quando o motor não aponta o meu idioma, como já acontece hoje.
  Se ainda errar, a próxima fala clara da outra pessoa corrige o `estrangeiro`.
- **A outra pessoa fala o meu idioma.** Fica no meu lado, sem tradução. É o comportamento correto.

## Fora do escopo

Detectar no modo por toque; detectar o MEU idioma; mudar planos ou preços; refazer a conversa virtual.
