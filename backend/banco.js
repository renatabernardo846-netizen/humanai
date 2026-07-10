/**
 * HumanAI — Banco de Dados em memória + arquivo JSON
 * Armazena empresas, conversas e configurações
 * (Em produção, substituir por MongoDB ou PostgreSQL)
 */

const fs = require('fs');
const path = require('path');

const ARQUIVO_DADOS = path.join(__dirname, 'dados.json');

// Estrutura padrão
const dadosPadrao = {
  empresas: [
    {
      id: 'empresa_demo_1',
      nome: 'Studio Bella Estética',
      nomeIA: 'Ana',
      segmento: 'Estética',
      descricao: 'Studio de estética especializado em unhas em gel, design de sobrancelhas, maquiagem e cabelos. Atendemos com carinho e profissionalismo.',
      horario: 'Segunda a sábado, das 9h às 19h',
      cidade: 'São Paulo - SP',
      idioma: 'pt-BR',
      tom: 'amigável, caloroso e próximo',
      ativa: true,
      whatsappNumero: '5511999999999',
      instagramPaginaId: '',
      facebookPaginaId: '',
      mensagemForaHorario: 'Oi! 😊 No momento estamos fechados, mas sua mensagem é muito importante! Assim que abrirmos, responderei com toda atenção. Atendemos de segunda a sábado, das 9h às 19h 🌟',
      instrucoes: 'Sempre ofereça uma consulta gratuita para novos clientes. Mencione que temos avaliações 5 estrelas.',
      faq: [
        { pergunta: 'Qual o horário de atendimento?', resposta: 'Atendemos de segunda a sábado, das 9h às 19h 📅' },
        { pergunta: 'Como faço para agendar?', resposta: 'É super simples! Me informe o serviço desejado e a data de preferência 😊' },
        { pergunta: 'Quais formas de pagamento aceitam?', resposta: 'Aceitamos Pix, cartão de crédito e débito 💳' },
        { pergunta: 'Qual o valor do serviço?', resposta: 'Os valores variam! Me diga o serviço que quer e passo o valor exato 😊' }
      ],
      diasAtendimento: ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
      horaAbertura: '09:00',
      horaFechamento: '19:00',
      criadoEm: new Date().toISOString()
    }
  ],
  conversas: [],
  estatisticas: {
    totalMensagens: 0,
    totalConversas: 0,
    mensagensHoje: 0,
    ultimaAtualizacao: new Date().toISOString()
  }
};

class Banco {
  constructor() {
    this.dados = this.carregarDados();
  }

  carregarDados() {
    try {
      if (fs.existsSync(ARQUIVO_DADOS)) {
        const conteudo = fs.readFileSync(ARQUIVO_DADOS, 'utf-8');
        return JSON.parse(conteudo);
      }
    } catch (e) {
      console.log('ℹ️  Criando banco de dados novo...');
    }
    this.salvarDados(dadosPadrao);
    return dadosPadrao;
  }

  salvarDados(dados = this.dados) {
    try {
      fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dados, null, 2), 'utf-8');
    } catch (e) {
      console.error('❌ Erro ao salvar dados:', e.message);
    }
  }

  // ── EMPRESAS ────────────────────────────────────

  listarEmpresas() {
    return this.dados.empresas || [];
  }

  buscarEmpresa(id) {
    return this.dados.empresas.find(e => e.id === id) || null;
  }

  buscarEmpresaPorWhatsApp(numero) {
    return this.dados.empresas.find(e =>
      e.ativa && e.whatsappNumero && e.whatsappNumero.replace(/\D/g, '') === numero.replace(/\D/g, '')
    ) || null;
  }

  buscarEmpresaPorInstagram(paginaId) {
    return this.dados.empresas.find(e =>
      e.ativa && e.instagramPaginaId === paginaId
    ) || null;
  }

  criarEmpresa(dados) {
    const novaEmpresa = {
      id: `empresa_${Date.now()}`,
      ...dados,
      ativa: true,
      criadoEm: new Date().toISOString()
    };
    this.dados.empresas.push(novaEmpresa);
    this.salvarDados();
    return novaEmpresa;
  }

  atualizarEmpresa(id, dados) {
    const idx = this.dados.empresas.findIndex(e => e.id === id);
    if (idx === -1) return null;
    this.dados.empresas[idx] = { ...this.dados.empresas[idx], ...dados };
    this.salvarDados();
    return this.dados.empresas[idx];
  }

  // ── CONVERSAS ───────────────────────────────────

  async registrarMensagem(dados) {
    const conversa = {
      id: `msg_${Date.now()}`,
      ...dados,
      hora: dados.hora || new Date()
    };
    this.dados.conversas.unshift(conversa);

    // Manter máximo de 1000 mensagens no arquivo
    if (this.dados.conversas.length > 1000) {
      this.dados.conversas = this.dados.conversas.slice(0, 1000);
    }

    // Atualizar estatísticas
    this.dados.estatisticas.totalMensagens++;
    this.dados.estatisticas.ultimaAtualizacao = new Date().toISOString();
    const hoje = new Date().toDateString();
    const ultimaData = new Date(this.dados.estatisticas.ultimaAtualizacao).toDateString();
    if (hoje !== ultimaData) this.dados.estatisticas.mensagensHoje = 0;
    this.dados.estatisticas.mensagensHoje++;

    this.salvarDados();
    return conversa;
  }

  listarConversas(empresaId, limite = 50) {
    return this.dados.conversas
      .filter(c => !empresaId || c.empresaId === empresaId)
      .slice(0, limite);
  }

  obterEstatisticas(empresaId) {
    const mensagens = empresaId
      ? this.dados.conversas.filter(c => c.empresaId === empresaId)
      : this.dados.conversas;

    const hoje = new Date().toDateString();
    const mensagensHoje = mensagens.filter(m => new Date(m.hora).toDateString() === hoje);

    return {
      totalMensagens: mensagens.length,
      mensagensHoje: mensagensHoje.length,
      canais: {
        whatsapp: mensagens.filter(m => m.canal === 'whatsapp').length,
        instagram: mensagens.filter(m => m.canal === 'instagram').length,
        facebook: mensagens.filter(m => m.canal === 'facebook').length
      }
    };
  }

  // ── VERIFICAÇÃO DE HORÁRIO ──────────────────────

  verificarHorario(empresa) {
    if (!empresa.diasAtendimento || !empresa.horaAbertura) return true;

    const agora = new Date();
    const diaSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][agora.getDay()];

    if (!empresa.diasAtendimento.includes(diaSemana)) return false;

    const [hA, mA] = empresa.horaAbertura.split(':').map(Number);
    const [hF, mF] = empresa.horaFechamento.split(':').map(Number);
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const minutosAbertura = hA * 60 + mA;
    const minutosFechamento = hF * 60 + mF;

    return minutosAgora >= minutosAbertura && minutosAgora <= minutosFechamento;
  }
}

module.exports = new Banco();
