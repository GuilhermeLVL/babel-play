## 1. Escolha das palavras (puro)

- [x] 1.1 `src/core/leitura/glosaDoCapitulo.ts`: palavras do capítulo com a posição das letras, régua de "nova" (a da cobertura + ignoradas)
- [x] 1.2 `escolherGlosas`: densidade 1 a cada 4 palavras, 2 ocorrências por palavra, prioridade por frequência
- [x] 1.3 Testes do core (`tests/leitor-glosa.test.ts`)

## 2. Desenho sobre o capítulo

- [x] 2.1 `src/lib/leitor/glosaNoCapitulo.ts`: texto do DOM com mapa de nós, range da palavra, glosa local curta, desenho no overlayer (`aria-hidden`, cor do tema)
- [x] 2.2 `GlosaDoCapitulo.atualizar`/`limpar`: refaz quando o que a pessoa sabe muda, cancela chamadas antigas

## 3. Ajuste e integração

- [x] 3.1 `GlosaDoLeitor.tsx` (sem tela, só montado com o ajuste ligado; idle; snapshot do índice de etiquetas)
- [x] 3.2 Interruptor em Aparência (`PainelDeTipografia`), `leitor:glosa` no aparelho, oculto em PDF; gancho do capítulo carregado em `LeitorDoLivro`
- [x] 3.3 i18n: `public/i18n/{en,es,ar}.json` + `npm run i18n`
- [x] 3.4 Testes do ajuste e da progressão (`tests/leitor-glosa-ajuste.test.tsx`)

## 4. Verificação

- [x] 4.1 typecheck, lint, vitest de leitor/leitura/cobertura, prettier nos arquivos novos
- [ ] 4.2 Dono: conferir no navegador (Chrome e Safari) a posição da glosa com entrelinhas baixas e nos 6 temas, e a repaginação ao mudar o tamanho da letra
- [ ] 4.3 Dono: decidir se a glosa deve também usar o Wiktionary/MT sob demanda (hoje só dicionário local, por custo zero)
