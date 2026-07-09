/**
 * HumanAI — Servidor Principal
 * Express.js · Webhooks WhatsApp + Instagram · API REST
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const whatsapp = require('./whatsapp');
const instagram = require('./instagram');
const motorIA = require('./ia');
const banco = require('./banco');

const app = express();
const PORTA = process.env.PORT || 3000;

// ── SEGURANÇA ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false // desativado para permitir o frontend
}));

// Limite de requisições (proteção anti-spam)
const limitador = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100,
  message: { erro: 'Muitas requisições. Tente novamente em 1 minuto.' }
});
app.use('/api/', limitador);

// ── CORS (permite o frontend acessar o backend) ────────
app.use(cors({
  origin: '*', // Em produção: defina o domínio do seu frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// ── PARSE DO CORPO ─────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── SERVIR FRONTEND ESTÁTICO ───────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ══════════════════════════════════════════════════════
//   ROTAS — WHATSAPP WEBHOOK
// ══════════════════════════════════════════════════════
app.get('/webhook/whatsapp', whatsapp.verificarWebhook);
app.post('/webhook/whatsapp', whatsapp.processarMensagem);

// ══════════════════════════════════════════════════════
//   ROTAS — INSTAGRAM WEBHOOK
// ══════════════════════════════════════════════════════
app.get('/webhook/instagram', instagram.verificarWebhook);
app.post('/webhook/instagram', instagram.processarMensagem);

// ══════════════════════════════════════════════════════
//   API REST — EMPRESAS
// ══════════════════════════════════════════════════════

// Listar todas as empresas
app.get('/api/empresas', (req, res) => {
  const empresas = banco.listarEmpresas();
  res.json({ sucesso: true, dados: empresas });
});

// Buscar empresa por ID
app.get('/api/empresas/:id', (req, res) => {
  const empresa = banco.buscarEmpresa(req.params.id);
  if (!empresa) return res.status(404).json({ sucesso: false, erro: 'Empresa não encontrada' });
  res.json({ sucesso: true, dados: empresa });
});

// Criar nova empresa
app.post('/api/empresas', (req, res) => {
  try {
    const empresa = banco.criarEmpresa(req.body);
    res.status(201).json({ sucesso: true, dados: empresa, mensagem: 'Empresa cadastrada com sucesso!' });
  } catch (erro) {
    res.status(400).json({ sucesso: false, erro: erro.message });
  }
});

// Atualizar empresa
app.put('/api/empresas/:id', (req, res) => {
  const empresa = banco.atualizarEmpresa(req.params.id, req.body);
  if (!empresa) return res.status(404).json({ sucesso: false, erro: 'Empresa não encontrada' });
  res.json({ sucesso: true, dados: empresa, mensagem: 'Empresa atualizada!' });
});

// Ativar/pausar IA da empresa
app.post('/api/empresas/:id/toggle', (req, res) => {
  const empresa = banco.buscarEmpresa(req.params.id);
  if (!empresa) return res.status(404).json({ sucesso: false, erro: 'Empresa não encontrada' });

  const atualizada = banco.atualizarEmpresa(req.params.id, { ativa: !empresa.ativa });
  res.json({
    sucesso: true,
    dados: atualizada,
    mensagem: atualizada.ativa ? '✅ IA ativada!' : '⏸ IA pausada!'
  });
});

// ══════════════════════════════════════════════════════
//   API REST — CONVERSAS
// ══════════════════════════════════════════════════════

// Listar conversas (todas ou por empresa)
app.get('/api/conversas', (req, res) => {
  const { empresaId, limite } = req.query;
  const conversas = banco.listarConversas(empresaId, parseInt(limite) || 50);
  res.json({ sucesso: true, dados: conversas });
});

// ══════════════════════════════════════════════════════
//   API REST — ESTATÍSTICAS
// ══════════════════════════════════════════════════════

app.get('/api/estatisticas', (req, res) => {
  const { empresaId } = req.query;
  const stats = banco.obterEstatisticas(empresaId);
  res.json({ sucesso: true, dados: stats });
});

// ══════════════════════════════════════════════════════
//   API REST — TESTAR IA (Simulador)
// ══════════════════════════════════════════════════════

app.post('/api/testar-ia', async (req, res) => {
  try {
    const { mensagem, empresaId, clienteId = 'teste_usuario' } = req.body;

    if (!mensagem) {
      return res.status(400).json({ sucesso: false, erro: 'Informe a mensagem' });
    }

    // Usar empresa específica ou empresa demo
    let empresa = empresaId ? banco.buscarEmpresa(empresaId) : banco.listarEmpresas()[0];
    if (!empresa) {
      empresa = {
        id: 'demo',
        nome: 'Empresa Demo',
        nomeIA: 'Ana',
        segmento: 'Serviços',
        descricao: 'Empresa de demonstração HumanAI',
        horario: 'Segunda a sexta, das 9h às 18h',
        tom: 'amigável',
        faq: []
      };
    }

    const inicio = Date.now();
    const resposta = await motorIA.responder(mensagem, clienteId, empresa, 'api');
    const tempo = Date.now() - inicio;

    res.json({
      sucesso: true,
      dados: {
        resposta,
        empresa: empresa.nome,
        ia: empresa.nomeIA,
        tempoMs: tempo,
        modoIA: motorIA.modelo ? 'gemini' : 'local'
      }
    });

  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ══════════════════════════════════════════════════════
//   ROTA DE SAÚDE (health check)
// ══════════════════════════════════════════════════════
app.get('/api/saude', (req, res) => {
  res.json({
    sucesso: true,
    status: '✅ HumanAI online',
    versao: '1.0.0',
    ia: motorIA.modelo ? 'Google Gemini ativo' : 'Modo local ativo',
    empresas: banco.listarEmpresas().length,
    hora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  });
});

// ── FALLBACK — servir index.html ───────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── INICIAR SERVIDOR ───────────────────────────────────
app.listen(PORTA, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       🤖 HumanAI — Servidor           ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log(`║  🌐 Rodando em: http://localhost:${PORTA}   ║`);
  console.log(`║  🤖 IA: ${motorIA.modelo ? 'Google Gemini ✅' : 'Modo local  ⚠️ '}         ║`);
  console.log(`║  📊 Empresas: ${banco.listarEmpresas().length} cadastrada(s)           ║`);
  console.log('╠═══════════════════════════════════════╣');
  console.log('║  Webhooks disponíveis:                ║');
  console.log('║  POST /webhook/whatsapp               ║');
  console.log('║  POST /webhook/instagram              ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
