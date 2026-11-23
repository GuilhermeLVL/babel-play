## Why

Antes de decorar palavras, o ouvido precisa aprender a separar os sons do idioma (Gabriel Wyner, Fluent
Forever; ver `docs/pesquisa/2026-11-ecossistema-de-aprendizado/metodos-e-video.md`). Quem não ouve a
diferença entre /ɪ/ e /iː/ (ship/sheep), /ɾ/ e /r/ (pero/perro) ou /s/ e /z/ (poisson/poison) também não
a guarda na memória, e nenhum jogo do catálogo treina isso: o "Qual foi a fala?" mistura frases parecidas,
não sons.

O exercício é barato de corrigir: o app toca UMA palavra de um par que só difere num som e a pessoa
escolhe qual ouviu. Sem IA, sem rede, sem custo.

## What Changes

- **Dados curados** em `src/data/pares-minimos/pares.json`: pares mínimos originais para en, es, fr, de,
  it e pt (pelo menos 15 por idioma, palavras comuns e adequadas a menores), cada um com o contraste
  fonético rotulado (`sons: ["ɪ", "iː"]`, mostrado como `/ɪ/ × /iː/`).
- **Core puro** `src/core/minigames/paresMinimos.ts`: `sortearRodada` (pares do idioma-alvo, sem repetir par
  nem palavra, equilibrando qual palavra toca e qual fica à esquerda, e demovendo o que caiu há pouco),
  `conferirPar` e `resumirContrastes` (os contrastes que o ouvido confundiu, juntando pares do mesmo
  contraste).
- **Minigame** `paresMinimos` no catálogo (`ParesMinimos.tsx`): "Ouvir" e "Ouvir devagar", duas opções
  grandes com as teclas 1 e 2, feedback com os dois sons (texto, ícone e forma de borda, não só cor),
  botões para ouvir as duas palavras, "Próximo par" sem contagem e resumo no fim ("Seu ouvido confunde
  /ɪ/ e /iː/").
- **Fonte**: é um jogo "do idioma" (`doIdioma` em `MINIGAMES`). Não depende do baralho nem da gravação: abre
  em toda fonte (inclusive a Trilha e um baralho vazio) quando há lista e voz para o idioma. Sem lista:
  motivo novo `sem-lista-do-idioma`; sem voz: `sem-voz` (o já existente).
- **Integração**: gate (`estadoDoJogo`) e montagem (`montarRodada`) concordam; maestria, recordes e
  recompensas como os outros jogos de frase (`writesSrs: false`, sem nota de SRS).
- **i18n** em en/es/ar.

Fora do escopo: pares para os demais idiomas (ja, zh, ko, ar, ru...), áudio humano gravado, pares em
frases, escolha da variante (sotaque) da voz.

## Impact

- Nada por tempo (Decreto 12.880, art. 9º): sem relógio, e a rapidez não rende ponto
  (`SEM_BONUS_DE_VELOCIDADE` em `grade.ts`). Maestria e XP só pelo resultado.
- Menores de idade: sem retenção, sem rede, sem custo; as palavras das listas são cotidianas.
- A voz é sintetizada e pode variar de sotaque: o jogo avisa em "Como se joga". As listas seguem a pronúncia
  padrão (inglês americano, espanhol sem distinção s/z, português do Brasil).
- Os goldens que enumeram os jogos (`saguaoDoJogar.ouro.json`, snapshot de elegibilidade) e as contagens
  20 -> 21 (maestria, efeitos, e2e da Personalizar) foram atualizados.
