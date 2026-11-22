## Why

Dois métodos que poliglotas usam muito ainda não existem no Frasy, e os dois servem ao que o app já tem
(frases que a pessoa encontrou, com tradução):

- **Retradução** (Luca Lampariello): ler a tradução, na língua da pessoa, de uma frase que ela já
  encontrou e reescrevê-la no idioma-alvo; depois comparar com o original. É produção, a evidência mais
  forte de domínio que o app consegue coletar por escrito.
- **Ditado de frase** (Kaufmann/LingQ): ouvir a frase inteira e digitá-la. O minigame `ditado` atual
  corrige palavra a palavra, mas só marca certa/errada, com alinhamento por janela de ±2 e uma única
  porcentagem, e ignora acento sempre. Não mostra palavra a mais, não deixa a pessoa escolher a
  tolerância e usa a gravação como fonte.

Os dois precisam de uma correção que não custe nada: no aparelho, sem IA, sem rede.

## What Changes

- **Core puro** `src/core/minigames/frasesCorrigidas.ts`: `compararFrase(alvo, resposta, lang, opcoes)`
  devolve o diff por palavra (certa, trocada, faltando, sobrando) e uma nota 0..100. Tolerância: caixa,
  pontuação e acento (acento configurável). Idiomas sem espaço (ja/zh/th) são comparados por caractere.
  Também: `frasesElegiveis` (tamanho mínimo/máximo, sem duplicata, tradução diferente do texto para a
  retradução) e `dicaDaFrase` (primeira letra de cada palavra).
- **Dois minigames** no catálogo, `retraducao` e `ditadoDeFrase`, numa tela só
  (`ExercicioDeFrase.tsx`): campo com rótulo, Enter confere, "Ouvir de novo" (ditado), "Mostrar dica",
  "Ver o original", diff com marca e texto alternativo (não só cor), botão "Próxima frase" (sem
  contagem regressiva) e tela vazia amigável.
- **Integração**: gate (`estadoDoJogo`) e montagem (`montarRodada`) concordam; maestria, recordes e
  recompensas tratam os dois como os outros jogos de frase (`writesSrs: false`).
- **i18n** em en/es/ar.

Fora do escopo: frases da Trilha (o gate mostra "trilha sem frase", como o Caça-conectores), áudio
recortado da gravação no ditado de frase (usa voz sintetizada), correção por IA.

## Impact

- Maestria e XP só por RESULTADO (nota >= 80), nunca por tempo (Decreto 12.880, art. 9º). O tempo vai
  para o relatório apenas como medida.
- Menores de idade: sem retenção, sem rede, sem custo. Perfis kids/pro/senior seguem o padrão dos rótulos.
- Os goldens que enumeram os jogos (`saguaoDoJogar.ouro.json`, snapshots de elegibilidade e de
  maestria) ganham os dois jogos; os demais hashes não mudam.
