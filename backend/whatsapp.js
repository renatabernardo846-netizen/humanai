/**
 * HumanAI — Integração WhatsApp Business Cloud API
 * Recebe e envia mensagens automaticamente via Meta
 */

const axios = require('axios');
const motorIA = require('./ia');
const banco = require('./banco');

const WHATSAPP_API = 'https://graph.facebook.com/v19.0';

/**
 * Verificação do webhook (exigida pela Meta)
 */
function verificarWebhook(req, res) {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const desafio = req.query['hub.challenge'];

  if (modo === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verificado!');
    return res.status(200).send(desafio);
  }

  console.error('❌ Falha na verificação do webhook WhatsApp');
  return res.sendStatus(403);
}

/**
 * Processar mensagem recebida do WhatsApp
 */
async function processarMensagem(req, res) {
  try {
    // Responder 200 imediatamente (Meta exige)
    res.sendStatus(200);

    const corpo = req.body;

    // Verificar se é uma mensagem válida
    if (!corpo?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) return;

    const mensagemDados = corpo.entry[0].changes[0].value.messages[0];
    const metaDados = corpo.entry[0].changes[0].value;

    // Só processar mensagens de texto
    if (mensagemDados.type !== 'text') {
      await enviarMensagem(
        mensagemDados.from,
        'Recebi sua mensagem! 😊 No momento só consigo processar texto. Pode escrever sua dúvida?'
      );
      return;
    }

    const textoCliente = mensagemDados.text.body;
    const telefoneCliente = mensagemDados.from;
    const numeroEmpresa = metaDados.metadata.display_phone_number;

    console.log(`📱 WhatsApp | De: ${telefoneCliente} | Mensagem: "${textoCliente}"`);

    // Buscar empresa pelo número de WhatsApp
    const empresa = await banco.buscarEmpresaPorWhatsApp(numeroEmpresa);

    if (!empresa || !empresa.ativa) {
      console.log('⚠️  Empresa não encontrada ou inativa para o número:', numeroEmpresa);
      return;
    }

    // Verificar horário de atendimento
    const emHorario = banco.verificarHorario(empresa);
    if (!emHorario && empresa.mensagemForaHorario) {
      await enviarMensagem(telefoneCliente, empresa.mensagemForaHorario);
      return;
    }

    // Marcar mensagem como lida
    await marcarComoLida(mensagemDados.id);

    // Mostrar "digitando..." por 1-2 segundos (mais humano)
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

    // Gerar resposta com IA
    const resposta = await motorIA.responder(textoCliente, telefoneCliente, empresa, 'whatsapp');

    // Enviar resposta
    await enviarMensagem(telefoneCliente, resposta);

    // Registrar conversa no banco
    await banco.registrarMensagem({
      empresaId: empresa.id,
      canal: 'whatsapp',
      clienteId: telefoneCliente,
      mensagemCliente: textoCliente,
      respostaIA: resposta,
      hora: new Date()
    });

    console.log(`✅ WhatsApp | Respondido: "${resposta.substring(0, 60)}..."`);

  } catch (erro) {
    console.error('❌ Erro no processamento WhatsApp:', erro.message);
  }
}

/**
 * Enviar mensagem de texto pelo WhatsApp
 */
async function enviarMensagem(para, texto) {
  const url = `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: para,
    type: 'text',
    text: { body: texto }
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Marcar mensagem como lida (✓✓ azul)
 */
async function marcarComoLida(mensagemId) {
  try {
    const url = `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    await axios.post(url, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: mensagemId
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    // Não bloquear por erro de "lida"
  }
}

module.exports = { verificarWebhook, processarMensagem };
