/**
 * O CSS da camada de polimento, NA ORDEM do protótipo (`montar.mjs:63-74`): quando duas regras
 * colidem vale a última, e é assim que `efeitos.css` corrige `polimento.css` (o recuo da tela de trás,
 * a mola da pílula). Um módulo só, para a ordem não depender de qual pedaço chega primeiro.
 */
import '../../styles/polimento/polimento-app.css';
import '../../styles/polimento/polimento.css';
import '../../styles/polimento/efeitos.css';
