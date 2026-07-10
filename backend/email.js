/**
 * HumanAI — Integração de E-mail
 * Lê e-mails recebidos e responde automaticamente com IA
 * Compatível com Gmail, Outlook, Yahoo e qualquer provedor IMAP/SMTP
 */

const nodemailer = require('nodemailer');
const Imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const motorIA = require('./ia');
const banco = require('./banco');

class GerenciadorEmail {
  constructor() {
    this.conexaoImap = null;
    this.transporterSmtp = null;
    this.verificando = false;
  }

  /**
   * Inicializa a conexão com o servidor de e-mail
   */
  async inicializar(empresa) {
    if (!empresa.emailConfig) return false;

    const cfg = empresa.emailConfig;

    try {
      // Configurar envio (SMTP)
      this.transporterSmtp = nodemailer.createTransport({
        host: cfg.smtpHost || 'smtp.gmail.com',
        port: cfg.smtpPort || 587,
        secure: false,
        auth: {
          user: cfg.email,
          pass: cfg.senha
        }
      });

      console.log(`✅ E-mail configurado: ${cfg.email}`);
      return true;

    } catch (erro) {
      console.error('❌ Erro ao configurar e-mail:', erro.message);
      return false;
    }
  }

  /**
   * Verifica novos e-mails e responde automaticamente
   */
  async verificarEResponder(empresa) {
    if (!empresa.emailConfig || this.verificando) return;
    this.verificando = true;

    const cfg = empresa.emailConfig;

    try {
      const config = {
        imap: {
          user: cfg.email,
          password: cfg.senha,
          host: cfg.imapHost || 'imap.gmail.com',
          port: cfg.imapPort || 993,
          tls: true,
          tlsOptions: { rejectUnauthorized: false },
          authTimeout: 10000
        }
      };

      const conexao = await Imap.connect(config);
      await conexao.openBox('INBOX');

      // Buscar e-mails não lidos
      const naoLidos = await conexao.search(['UNSEEN'], {
        bodies: ['HEADER', 'TEXT', ''],
        markSeen: true
      });

      for (const email of naoLidos.slice(0, 10)) { // máximo 10 por vez
        try {
          const corpo = email.parts.find(p => p.which === '');
          if (!corpo) continue;

          const parsed = await simpleParser(corpo.body);
          const remetente = parsed.from?.value?.[0]?.address;
          const assunto = parsed.subject || 'Sem assunto';
          const textoCrU = parsed.text || '';

          if (!remetente || remetente === cfg.email) continue;

          console.log(`📧 E-mail de: ${remetente} | Assunto: ${assunto}`);

          // Gerar resposta com IA
          const mensagemParaIA = `[E-mail recebido]\nAssunto: ${assunto}\nMensagem: ${textoCrU.substring(0, 800)}`;
          const resposta = await motorIA.responder(mensagemParaIA, remetente, empresa, 'email');

          // Enviar resposta por e-mail
          await this.enviarEmail({
            para: remetente,
            assunto: `Re: ${assunto}`,
            texto: resposta,
            config: cfg
          });

          // Registrar no banco
          await banco.registrarMensagem({
            empresaId: empresa.id,
            canal: 'email',
            clienteId: remetente,
            mensagemCliente: textoCrU.substring(0, 500),
            respostaIA: resposta,
            hora: new Date()
          });

          console.log(`✅ E-mail respondido para: ${remetente}`);

        } catch (e) {
          console.error('❌ Erro ao processar e-mail:', e.message);
        }
      }

      await conexao.end();

    } catch (erro) {
      console.error('❌ Erro ao verificar e-mails:', erro.message);
    } finally {
      this.verificando = false;
    }
  }

  /**
   * Envia e-mail de resposta
   */
  async enviarEmail({ para, assunto, texto, config }) {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost || 'smtp.gmail.com',
      port: config.smtpPort || 587,
      secure: false,
      auth: { user: config.email, pass: config.senha }
    });

    await transporter.sendMail({
      from: `"${config.nomeRemetente || 'Atendimento'}" <${config.email}>`,
      to: para,
      subject: assunto,
      text: texto,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <p style="color: #333; line-height: 1.6; font-size: 15px;">
            ${texto.replace(/\n/g, '<br>')}
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            Atendimento automatizado por HumanAI 🤖
          </p>
        </div>
      `
    });
  }
}

module.exports = new GerenciadorEmail();
