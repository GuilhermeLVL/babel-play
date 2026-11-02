## 1. Núcleo puro

- [ ] 1.1 `src/core/leitura/sentidoNoContexto.ts` (forma de consulta + ordem dos sentidos), com testes
- [ ] 1.2 `src/core/leitura/posicaoDoCartao.ts` (acima/abaixo/mini-folha), com testes

## 2. Cartão

- [ ] 2.1 `src/components/views/leitor/CartaoDaPalavra.tsx` e estilos em `src/styles/leitor.css`
- [ ] 2.2 `LeitorDoLivro.tsx`: troca o `VocabularyPanel` pelo cartão; fecha com Esc, toque fora, virada e seleção
- [ ] 2.3 Traduzir a frase com cache; Sentido (verbete + `ExplicacaoDaFrase` atrás da flag); Salvar; Mais
- [ ] 2.4 Miniatura da imagem fora do perfil protegido
- [ ] 2.5 Chaves de i18n (en/es), pseudo e cobertura

## 3. Verificação

- [ ] 3.1 Testes de componente: não modal, Esc, narração, tradução (carregando/erro/cache), Salvar, Mais, posição
- [ ] 3.2 typecheck (×3), lint, knip, testes do leitor
- [ ] 3.3 Capturas antes/depois (desktop e 390 px) com "Call me Ishmael"
