/**
 * O CSS da camada de polimento, NA ORDEM do protótipo (`montar.mjs:63-74`): quando duas regras
 * colidem vale a última, e é assim que `efeitos.css` corrige `polimento.css` (o recuo da tela de trás,
 * a mola da pílula). Um módulo só, para a ordem não depender de qual pedaço chega primeiro.
 */
import '../../styles/polimento/polimento-app.css';
import '../../styles/polimento/polimento.css';
import '../../styles/polimento/efeitos.css';
import '../../styles/polimento/telas.css';
import '../../styles/polimento/telas2.css';
import '../../styles/polimento/telas3.css';
import '../../styles/polimento/minis.css';
import '../../styles/polimento/jogos.css';
import '../../styles/polimento/jogos3.css';
import '../../styles/polimento/jogos4.css';
