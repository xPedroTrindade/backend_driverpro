// =============================================================================
// services/mailer.ts — Envio de e-mails (STUB)
// -----------------------------------------------------------------------------
// O SMTP ainda NÃO está implementado (pendente/hardcoded). Por enquanto este
// stub apenas registra no console — não envia e-mail de verdade.
//
// >>> PARA ATIVAR DEPOIS: instalar `nodemailer` e usar as variáveis SMTP_* do
//     .env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM). <<<
// =============================================================================

interface MailInput {
    to: string;
    subject: string;
    text: string;
}

export async function sendMail({ to, subject, text }: MailInput): Promise<void> {
    // TODO(SMTP): substituir por envio real via nodemailer.
    console.log(`[MAIL:STUB] para=${to} | assunto="${subject}" | corpo="${text}"`);
}
