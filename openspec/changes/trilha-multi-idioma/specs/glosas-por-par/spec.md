## ADDED Requirements

### Requirement: A tradução pertence ao PAR de idiomas
O sistema SHALL resolver a tradução da trilha pelo par (idioma praticado × idioma nativo), e SHALL
NÃO usar a glosa de outro par como substituto.

#### Scenario: Par disponível
- **WHEN** existe `glosas/<praticado>-<nativo>.json` para o par vigente
- **THEN** a pista dos jogos e o verso da promoção vêm dele

#### Scenario: Par ausente
- **WHEN** não existe glossário para o par
- **THEN** a trilha é oferecida em modo monolíngue
- **AND** os jogos que dependem da pista aparecem trancados com o motivo real
- **AND** o sistema NÃO cai para outro par — cair para `en-pt` é exatamente o defeito F26

#### Scenario: Cabeçalho não bate com o nativo
- **WHEN** o `nativo` declarado no arquivo difere do idioma nativo do usuário
- **THEN** o glossário é tratado como ausente

### Requirement: A promoção não grava tradução que não é do par
O sistema SHALL promover apenas palavras cuja glosa é do par vigente.

#### Scenario: Palavra sem glosa no par existente
- **WHEN** a pessoa erra uma palavra que não tem glosa no par
- **THEN** ela continua jogável (a frase basta para os jogos de frase)
- **AND** NÃO é promovida a cartão, em vez de virar cartão com verso vazio

#### Scenario: Nível de idioma sem escala CEFR
- **WHEN** a palavra promovida vem de trilha com `escala: 'frequencia'`
- **THEN** o cartão é gravado com `cefrLevel: null`
- **AND** NUNCA com uma letra CEFR derivada de posição de frequência

#### Scenario: Dano já gravado
- **WHEN** existem cartões da trilha com `tgt_lang` diferente do idioma da tradução gravada
- **THEN** o sistema os LISTA num diagnóstico com contagem
- **AND** não os reescreve automaticamente, para não apagar edição manual legítima

### Requirement: Trilha e glossário não podem divergir em silêncio
O sistema SHALL detectar quando o glossário foi gerado para outra versão da trilha.

#### Scenario: Trilha regenerada
- **WHEN** `trilhaHash` do glossário não corresponde ao arquivo de trilha
- **THEN** a verificação falha o gate, em vez de servir glosas desalinhadas
