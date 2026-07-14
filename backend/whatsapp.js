const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const motorIA = require('./ia');
const banco = require('./banco');

// Map para guardar múltiplos clientes: empresaId => objeto { client, status, qrUrl }
const clientesAtivos = new Map();

function iniciarWhatsApp(empresaId) {
    // Garantir que empresaId seja inteiro
    empresaId = parseInt(empresaId);
    console.log(`🤖 Iniciando Cliente do WhatsApp Web para Empresa ${empresaId}...`);
    
    // Evitar iniciar duas vezes a mesma empresa
    if (clientesAtivos.has(empresaId) && clientesAtivos.get(empresaId).status !== 'DESCONECTADO') {
        return;
    }

    // Inicializa o estado
    const estado = {
        client: null,
        status: 'INICIANDO', // INICIANDO, AGUARDANDO_QR, CONECTADO, DESCONECTADO
        qrUrl: null
    };
    clientesAtivos.set(empresaId, estado);
    
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: `empresa_${empresaId}` }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });
    
    estado.client = client;

    // Tempo exato em que o robô desta empresa foi ligado (para a trava de segurança)
    const startupTime = Math.floor(Date.now() / 1000);

    client.on('qr', async (qr) => {
        console.log(`📱 [Empresa ${empresaId}] QR Code recebido! Gerando imagem...`);
        estado.status = 'AGUARDANDO_QR';
        try {
            estado.qrUrl = await qrcode.toDataURL(qr);
        } catch (err) {
            console.error(`[Empresa ${empresaId}] Erro ao gerar QR Code:`, err);
        }
    });

    client.on('ready', () => {
        console.log(`✅ [Empresa ${empresaId}] WhatsApp Conectado com Sucesso!`);
        estado.status = 'CONECTADO';
        estado.qrUrl = null; // Limpar QR após conectar
    });

    client.on('disconnected', (reason) => {
        console.log(`❌ [Empresa ${empresaId}] WhatsApp Desconectado:`, reason);
        estado.status = 'DESCONECTADO';
        
        // Destruir a sessão e remover do Map para permitir reconexão limpa
        client.destroy().catch(() => {});
        clientesAtivos.delete(empresaId);
    });

    client.on('message', async msg => {
        // Ignorar mensagens de grupos, status, canais/comunidades (@lid) e o próprio bot
        if (msg.from === 'status@broadcast' || msg.isGroup || msg.from.includes('@g.us') || msg.from.includes('@lid')) return;

        // TRAVA DE SEGURANÇA ANTI-SPAM (Isolada por Cliente)
        if (msg.timestamp < startupTime) {
            console.log(`[Empresa ${empresaId} | TRAVA ANTI-SPAM] Ignorando mensagem antiga de ${msg.from}`);
            return;
        }

        const textoCliente = msg.body;
        const telefoneCliente = msg.from.replace('@c.us', '');
        
        console.log(`📱 [Empresa ${empresaId}] WhatsApp | De: ${telefoneCliente} | Mensagem: "${textoCliente}"`);

        // Simular "digitando..."
        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

        try {
            let empresa = await banco.buscarEmpresa(empresaId); 
            if (!empresa) {
                console.error(`[Empresa ${empresaId}] Empresa não encontrada no banco de dados!`);
                await chat.clearState();
                return;
            }

            const resposta = await motorIA.responder(textoCliente, telefoneCliente, empresa, 'whatsapp');
            
            await chat.clearState();
            await msg.reply(resposta);

            await banco.registrarMensagem({
              empresaId: empresa.id,
              canal: 'whatsapp',
              clienteId: telefoneCliente,
              mensagemCliente: textoCliente,
              respostaIA: resposta,
              hora: new Date()
            });

            console.log(`✅ [Empresa ${empresaId}] Respondido: "${resposta.substring(0, 60)}..."`);
        } catch (error) {
            console.error(`❌ [Empresa ${empresaId}] Erro ao responder via IA:`, error);
            await chat.clearState();
        }
    });

    client.initialize();
}

function getStatus(empresaId) {
    empresaId = parseInt(empresaId);
    if (!clientesAtivos.has(empresaId)) {
        return { status: 'DESCONECTADO', qrUrl: null };
    }
    const estado = clientesAtivos.get(empresaId);
    return {
        status: estado.status,
        qrUrl: estado.qrUrl
    };
}

module.exports = { iniciarWhatsApp, getStatus };
