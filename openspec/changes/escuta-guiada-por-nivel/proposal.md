## Why

Quem está no A1–A2 aprende melhor trabalhando FRASE A FRASE na ordem ouvir → ler → ouvir → ler, e logo depois tentando ler
antes de ouvir. No B1 em diante o caminho é ouvir primeiro e consultar a transcrição por curiosidade; nos níveis altos não
precisa repetir. A tela de sessão gravada (`Analysis.tsx` + `PlayerInterativo`) hoje mostra o texto de todas as falas o
tempo todo e deixa a pessoa sozinha com o player: não há como praticar a escuta "às cegas" e conferir depois.

## What Changes

- **Escuta guiada** na tela de análise, com três modos:
  - `livre`: o comportamento de hoje (texto sempre visível, nenhum passo);
  - `ouvir-primeiro` ("Ouvir antes de ler"): ouvir com o texto da frase oculto → ler (texto à mostra) → ouvir de novo com o
    texto → próxima frase;
  - `ler-primeiro` ("Ler antes de ouvir"): ler → ouvir → próxima frase.
- **Máquina pura** em `src/core/learning/escutaGuiada.ts` (transições, `modoSugerido(nivelCefr)`), sem React, rede ou relógio.
- **Sugestão por nível** (estimado por `fluenciaDoBaralho`): A1–A2 e sem nível → "Ouvir antes de ler"; B1 em diante → "Livre".
  É só uma indicação ("Sugerido para A2: ..."): o modo inicial continua `livre` até a pessoa escolher.
- **UI**: seletor compacto "Modo de escuta" dentro da faixa do player (`views/analise/EscutaGuiada.tsx`), o texto da frase
  em foco oculto ("Texto oculto — toque para revelar") até a etapa de ler, botão "Próximo passo" e Enter como atalho
  (só quando nada que use o Enter tem o foco).
- **Preferência por aparelho**: o modo escolhido fica em `localStorage` (`babel.analise.modoDeEscuta`), com o acesso protegido.
- **i18n**: chaves novas em `public/i18n/{en,es,ar}.json`.

## Non-Goals

- Medir ou premiar tempo, sequência ou pontos pela escuta (Decreto 12.880, art. 9º: nada recompensa tempo).
- Mudar o player, o shadowing (`SombraDaFala`) ou o loop; sessões de documento (sem áudio) não têm escuta guiada.
- Ligar o modo sozinho pelo nível: a pessoa escolhe.

## Impact

- Código: `src/core/learning/escutaGuiada.ts` (novo), `src/lib/analise/escutaGuiada.ts` (estado, preferência e teclado, novo),
  `src/components/views/analise/EscutaGuiada.tsx` (novo), ajustes mínimos em `Analysis.tsx`, `PlayerInterativo.tsx`,
  `quest/TranscricaoDoQuest.tsx` e `styles/questSessao.css`.
- Sem mudança de API, banco ou cobrança. Sem dado novo no servidor.
- Risco: o Enter global. Mitigação: só age sem foco em botão, campo ou diálogo, e com a escuta guiada ligada.
