## Why

O cabeçalho tem dois botões (menos e mais, `ControlCluster.tsx:162-176`) em volta de um "A" que
é só indicador. O dono reportou fricção e um bug visual nesse trio, e pediu o padrão de um botão
só: clica, aumenta; no máximo, volta ao mínimo.

## What Changes

- `stepFontScale` (`App.tsx:242-247`) troca o clamp por ciclo módulo-4 (sm, md, lg, xl, sm).
- O trio vira UM botão "A" (o glifo cresce com a escala atual); `decreaseFontScale` sai da
  cadeia de props (App, StudioHeader, ControlCluster; Settings.tsx:93).
- A11y: o botão ganha `aria-label` que diz a escala atual e a ação.
