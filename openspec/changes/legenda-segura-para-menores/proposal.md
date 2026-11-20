## Why

Na auditoria de qualidade de 17/11/2026 (achado COMP-02, CONFIRMADO, severidade "bloqueia"), o reconhecimento local ouviu
"review the pull request together" numa aula e escreveu "reveal the porn quest together". A tradução saiu "revelar a busca
pornô juntos", e a frase apareceu na lista e no painel flutuante "Legendas". O Frasy atende menores (ECA Digital, LGPD art.
14), e quem inventou o termo sexual foi o sistema, não o áudio. O filtro que já existe (`filtro-tutor-menores`) só cobre a
saída do tutor no servidor. A legenda e a tradução da captura rodam no navegador e não passam por filtro nenhum: o grep do
revisor por `profan|obscen|palavrão` em `src/` não achou nada.

Evidências (relativas a `reports/auditoria-qualidade/`): `computador/runs/webkit-15/06-fim.png` (lista e painel flutuante),
`computador/runs/webkit-15/analise.json` (fala 13, as duas strings), registro em `achados.json` (id `COMP-02`).

## What Changes

- **Política de legenda segura no núcleo**: uma função pura recebe um texto e a política do perfil e devolve o texto com os
  termos sensíveis trocados por um marcador visível (`•••`) e a contagem do que foi ocultado. Ela troca só o termo. O resto
  da frase fica como o reconhecimento escreveu. Nada é trocado por outra palavra, para não esconder o erro do
  reconhecimento atrás de uma frase "limpa" que ninguém disse.
- **Listas de termos da legenda em pt, en e es**: só termos sem uso neutro numa aula ou num desenho (pornografia, sexual
  explícito, ofensas raciais e homofóbicas inequívocas). As palavras ambíguas ficam de fora e o motivo fica anotado. As
  listas reaproveitam a normalização (acento, leetspeak, letra espaçada, invisíveis) de
  `server/ai/moderacao/moderarSaidaDoTutor.ts`, que passa a morar no núcleo e a servir os dois lados.
- **Um ponto só de aplicação**: o setter das falas da tela (`setSpeechSegments` de `LiveCapture.tsx`) é envolvido. Toda
  escrita de `originalText`, `translatedText` e `traducaoProvisoria` passa pela política: pipeline local, Web Speech,
  tradução, parciais e intérprete. Painel flutuante (PiP), lista, exportação e "Guardar palavra" leem do mesmo estado.
- **Perfil protegido ligado de fábrica e travado**. Para o adulto declarado, uma opção em Ajustes ("Ocultar palavras
  sensíveis na legenda"), desligada de fábrica.
- **Honestidade**: o marcador tem rótulo acessível ("palavra ocultada: o reconhecimento pode ter entendido errado"). Na
  primeira ocultação da sessão, um aviso discreto diz que uma palavra foi ocultada e que o reconhecimento automático erra.
  A voz do intérprete não pronuncia o termo ocultado. A palavra ocultada não vira cartão nem entra no vocabulário da sessão.

## Capabilities

### New Capabilities

- `legenda-segura`: ocultação de termos sensíveis na legenda e na tradução ao vivo, conforme o perfil (protegido ou adulto),
  com marcador honesto e o mesmo resultado em todas as superfícies (lista, PiP, voz, exportação, cartões).

### Modified Capabilities

(nenhuma: o filtro do tutor não muda de comportamento; só a normalização muda de lugar)

## Impact

- Novos: `src/core/moderacao/normalizar.ts` (a normalização, movida do servidor), `src/core/moderacao/termosDaLegenda.ts`
  (as listas), `src/core/moderacao/legendaSegura.ts` (a função pura), `tests/legendaSegura.test.ts` e o corpus
  `tests/fixtures/legenda-segura/{positivos,negativos}.json`.
- Alterados: `server/ai/moderacao/moderarSaidaDoTutor.ts` (importa `normalizar` do núcleo, sem mudar o comportamento),
  `src/components/views/LiveCapture.tsx` (envolve o setter), `src/lib/captura/vocabularioDaSessao.ts` (ignora o marcador),
  a leitura em voz do intérprete, `src/components/views/Settings*` (a opção do adulto), `src/lib/preferencias.ts`,
  `public/i18n/*.json` e `src/data/i18n/cobertura.json`.
- Sem rede, sem custo, sem variável de ambiente, sem migração.

## Prioridade, esforço, riscos e dono

- **Prioridade**: P0. É risco de conformidade (ECA Digital) num app para menores e já foi reproduzido em produção.
- **Esforço**: médio (cerca de 2 a 3 dias: núcleo e listas em 1 dia, integração e e2e em 1 a 2 dias).
- **Riscos**:
  - Falso positivo: ocultar uma palavra legítima numa aula de biologia ou num filme. A mitigação é uma lista curta, só de
    termos sem uso neutro, e um corpus de negativos que o teste cobra.
  - Falso negativo: eufemismo, paráfrase e idioma fora de pt/en/es passam. É a rede de baixo, não o juiz.
  - Custo por fala: a regex roda a cada parcial. Há um teto medido (ver a spec).
  - Ocultar um termo que de fato estava no áudio (num filme para adultos visto por um menor) é aceitável. O marcador diz
    que algo foi ocultado, sem fingir que não havia nada.
- **Precisa do dono**:
  1. Decidir se os palavrões comuns ("merda", "fuck", "mierda") entram na categoria `palavrao` para o perfil protegido.
     Recomendação: entram só para menor de 12 (faixa `menor-12`); de 12 a 17 ficam como estão.
  2. Aprovar as listas iniciais (revisão de texto, como foi com o filtro do tutor no PR #135).
  3. Decidir se o perfil protegido pode desligar o filtro. Recomendação: não pode; só o adulto declarado.
