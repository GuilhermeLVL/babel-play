/**
 * O CSS da camada de polimento, NA ORDEM do protótipo (`montar.mjs:63-74`): quando duas regras
 * colidem vale a última, e é assim que `efeitos.css` corrige `polimento.css` (o recuo da tela de trás,
 * a mola da pílula). Um módulo só, para a ordem não depender de qual pedaço chega primeiro.
 */
import '../../styles/polimento/polimento-app.css';
import '../../styles/polimento/polimento.css';
import '../../styles/polimento/efeitos.css';
import '../../styles/polimento/celular.css';
import '../../styles/polimento/telas.css';
import '../../styles/polimento/telas2.css';
import '../../styles/polimento/telas3.css';
import '../../styles/polimento/paineis.css';
import '../../styles/polimento/minis.css';
import '../../styles/polimento/jogos.css';
import '../../styles/polimento/jogos3.css';
import '../../styles/polimento/jogos4.css';
import '../../styles/polimento/agua.css';
/* O protótipo dos quatro planos (`anuncios-no-gratis-src/montar.mjs:77-78`): só o que a tela Planos usa. */
import '../../styles/polimento/anuncios.css';
import '../../styles/polimento/planos4.css';
/* O protótipo das telas enxutas (`telas-enxutas-src/montar.mjs`): Capturar e Jogar com menos coisas à vista. */
import '../../styles/polimento/enxuto.css';
/* O protótipo dos cartões enxutos (cartoes-enxuto-src/montar.mjs): a tela Cartões (Hoje em faixa, Palavras,
   a Memória de dentro, as folhas) e a barra de cinco com o Praticar. */
import '../../styles/polimento/cartoes.css';
/* O protótipo dos cartões enxutos (cartoes-enxuto-src/montar.mjs): a revisão enxuta, a cena, minha voz e as práticas. */
import '../../styles/polimento/cartoes4.css';
/* O seletor de conteúdo (cartoes-enxuto-src/montar.mjs: `fontes.css` e `seletor.css`, nesta ordem, depois
   dos cartões): a ficha no cabeçalho, o catálogo e a Biblioteca. */
import '../../styles/polimento/fontes.css';
import '../../styles/polimento/seletor.css';
/* DO APP, por último: o mesmo desenho por um caminho mais barato (o pulso do contador em camada composta,
   as miniaturas fora da vista paradas). Cada regra diz qual das de cima ela substitui e por quê. */
import '../../styles/polimentoDesempenho.css';
