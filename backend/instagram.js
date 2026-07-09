/**
 * HumanAI — Integração Instagram Graph API
 * Recebe e responde DMs do Instagram automaticamente
 */

const axios = require('axios');
const motorIA = require('./ia');
const banco = require('./banco');

const GRAPH_API = 'https://graph.facebook.com/v19.0';

/**
 * Verificação do webhook Instagram (exigida pela Meta)
 */
function verificarWebhook(req, res) {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const desafio = req.query['hub.challenge'];

  if (modo === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    console.log('✅ Instagram webhook verificado!');
    return res.status(200).send(desafio);
  }

  console.error('❌ Falha na verificação do webhook Instagram');
  return res.sendStatus(403);
}

/**
 * Processar mensagem recebida pelo Instagram
 */
async function processarMensagem(req, res) {
  try {
    res.sendStatus(200);

    const corpo = req.body;

    if (!corpo?.entry?.[0]?.messaging?.[0]) return;

    const evento = corpo.entry[0].messaging[0];
    const paginaId = corpo.entry[0].id;

    // Ignorar eco (mensagens enviadas pela própria IA)
    if (evento.message?.is_echo) return;

    // Só processar mensagens de texto
    if (!evento.message?.text) {
      await responderInstagram(
        evento.sender.id,
        paginaId,
        'Recebi sua mensagem! 😊 Pode escrever sua dúvida em texto que respondo agora!'
      );
      return;
    }

    const textoCliente = evento.message.text;
    const clienteId = evento.sender.id;

    console.log(`📸 Instagram | De: ${clienteId} | Mensagem: "${textoCliente}"`);

    // Buscar empresa pelo ID da página
    const empresa = await banco.buscarEmpresaPorInstagram(paginaId);

    if (!empresa || !empresa.ativa) {
      console.log('⚠️  Empresa não encontrada ou inativa para página:', paginaId);
      return;
    }

    // Verificar horário
    const emHorario = banco.verificarHorario(empresa);
    if (!emHorario && empresa.mensagemForaHorario) {
      await responderInstagram(clienteId, paginaId, empresa.mensagemForaHorario);
      return;
    }

    // Delay humano (1-2 segundos)
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

    // Gerar resposta com IA
    const resposta = await motorIA.responder(textoCliente, clienteId, empresa, 'instagram');

    // Enviar resposta
    await responderInstagram(clienteId, paginaId, resposta);

    // Registrar no banco
    await banco.registrarMensagem({
      empresaId: empresa.id,
      canal: 'instagram',
      clienteId,
      mensagemCliente: textoCliente,
      respostaIA: resposta,
      hora: new Date()
    });

    console.log(`✅ Instagram | Respondido: "${resposta.substring(0, 60)}..."`);

  } catch (erro) {
    console.error('❌ Erro no processamento Instagram:', erro.message);
  }
}

/**
 * Enviar mensagem pelo Instagram Messenger
 */
async function responderInstagram(destinatarioId, paginaId, texto) {
  const url = `${GRAPH_API}/${paginaId}/messages`;

  await axios.post(url, {
    recipient: { id: destinatarioId },
    message: { text: texto },
    messaging_type: 'RESPONSE'
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.INSTAGRAM_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
}

module.exports = { verificarWebhook, processarMensagem };
