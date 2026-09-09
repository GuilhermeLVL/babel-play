Fabrica (`criarX(deps)`) chamada a cada render, e nao `useMemo`, que congelaria setters de um render
antigo. Onde o bloco nao era contiguo, ele FICOU — mover quebraria a ordem dos efeitos, que era a
regra dura. `aoTerminar` e o acervo ficaram por isso.
