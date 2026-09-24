import { Download, FileText, Shield } from 'lucide-react';
import { Fragment } from 'react';

import { CRIADOR } from '../../../lib/criador';
import { toast } from '../../Toast';
import { Dialogo } from '../../ui';

/**
 * POLÍTICA DE PRIVACIDADE E TERMOS DE USO em diálogo — `dialogoLegal()` do protótipo aprovado:
 * o resumo em seções, "Baixar PDF" e "Fechar".
 *
 * O TEXTO É O DO PROTÓTIPO (decisão do dono para a tela Sobre), com uma troca: o contato aponta
 * para o endereço que a política oficial publica (`/privacidade.html`), e não para um endereço
 * que ainda não existe. O documento que vale juridicamente continua sendo a página completa — é ela
 * que "Baixar PDF" abre para imprimir/salvar.
 *
 * UMA POLÍTICA SÓ (Fase 3 do lançamento): até 24/09 este resumo, `/termos.html` e a política de
 * privacidade diziam três coisas diferentes (idade mínima, reembolso, cancelamento). O resumo agora
 * só RESUME `/termos.html` v4 e `/privacidade.html` — se um mudar, o outro muda no mesmo commit.
 */

export type Documento = 'privacidade' | 'termos';

const LEGAL: Record<Documento, { titulo: string; versao: string; pagina: string; secoes: Array<[string, string]> }> = {
  privacidade: {
    titulo: 'Política de privacidade',
    versao: 'Versão 3 · 24/09/2026 · para revisão jurídica',
    pagina: '/privacidade.html',
    secoes: [
      [
        'O que fica no seu computador',
        'Áudio, transcrição, tradução e vocabulário, no modo local. Nada disso vai para um servidor.',
      ],
      [
        'O que vai para o servidor',
        'Com conta: e-mail, data de nascimento, plano e pagamento, e as sessões que você salva. Sem analytics e sem publicidade.',
      ],
      [
        'Crianças e adolescentes',
        'Menores de 18 ficam no perfil protegido. Abaixo de 16, os dados só vão para a nuvem depois que um responsável vincula a conta; abaixo de 12, com o consentimento específico dele, registrado (LGPD, art. 14).',
      ],
      ['Seus direitos', 'Ver, corrigir, baixar e apagar os seus dados em Ajustes → Privacidade (LGPD, art. 18).'],
      ['Contato', `${CRIADOR.contatoDePrivacidade}. Resposta em até 15 dias.`],
    ],
  },
  termos: {
    titulo: 'Termos de uso',
    versao: 'Versão 4 · 24/09/2026 · para revisão jurídica',
    pagina: '/termos.html',
    secoes: [
      [
        'Quem pode usar',
        'Todas as idades. Menores de 18 ficam no perfil protegido e não compram; abaixo de 16, a conta é vinculada a um responsável, que paga por eles.',
      ],
      [
        'Preço',
        'Só mensal. O preço do mês pago não muda; reajuste só na renovação, com aviso de 30 dias e a opção de cancelar antes.',
      ],
      [
        'Cancelamento',
        'Em Planos → Sua assinatura, quando quiser. A renovação para e o plano vale até o fim do período já pago.',
      ],
      [
        'Arrependimento',
        'Nos 7 dias depois do primeiro pagamento, cancelar devolve o valor inteiro, na hora e sem pedir a ninguém (CDC, art. 49).',
      ],
      ['Se o serviço acabar ou piorar', 'Reembolso proporcional aos dias restantes do período pago.'],
      ['O conteúdo que você captura', 'É seu. O app não publica nem usa para treinar modelos.'],
      ['Uso justo', 'Não use o app para gravar pessoas sem que elas saibam.'],
    ],
  },
};

export default function DialogoLegal({ doc, aoFechar }: { doc: Documento; aoFechar: () => void }) {
  const d = LEGAL[doc];

  /** Abre o documento completo e chama a impressão do navegador ("Salvar como PDF"). */
  const baixarPdf = () => {
    const w = window.open(d.pagina, '_blank');
    if (!w) {
      toast.warn('O navegador bloqueou a janela. Libere pop-ups para baixar o PDF.');
      return;
    }
    w.addEventListener('load', () => w.print(), { once: true });
  };

  return (
    <Dialogo icone={doc === 'privacidade' ? Shield : FileText} titulo={d.titulo} sub={d.versao} aoFechar={aoFechar}>
      <div className="dlg-corpo rola-dlg texto-legal" tabIndex={0} role="region" aria-label="Texto">
        {d.secoes.map(([h, p]) => (
          <Fragment key={h}>
            <h3>{h}</h3>
            <p>{p}</p>
          </Fragment>
        ))}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={baixarPdf}>
          <Download aria-hidden /> Baixar PDF
        </button>
        <button type="button" className="btn btn-solid" onClick={(e) => e.currentTarget.closest('dialog')?.close()}>
          Fechar
        </button>
      </div>
    </Dialogo>
  );
}
