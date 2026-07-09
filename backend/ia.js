/**
 * HumanAI — Motor de Inteligência Artificial
 * Integração com Google Gemini (gratuito)
 * Gera respostas humanizadas para cada empresa
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const NodeCache = require('node-cache');

// Cache de contexto de conversas (30 minutos por conversa)
const conversaCache = new NodeCache({ stdTTL: 1800 });

class MotorIA {
  constructor() {
    this.gemini = null;
    this.modelo = null;
    this.inicializar();
  }

  inicializar() {
    try {
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'sua_chave_gemini_aqui') {
        this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.modelo = this.gemini.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 350,
            topP: 0.9,
          }
        });
        console.log('✅ Motor IA: Google Gemini ativado');
      } else {
        console.log('⚠️  Motor IA: Usando respostas locais (sem chave Gemini)');
      }
    } catch (erro) {
      console.error('❌ Erro ao inicializar Gemini:', erro.message);
    }
  }

  /**
   * Gera resposta para uma mensagem do cliente
   * @param {string} mensagem - Mensagem do cliente
   * @param {string} telefone - ID do cliente (para manter contexto)
   * @param {Object} empresa - Dados da empresa configurada
   * @param {string} canal - 'whatsapp' | 'instagram' | 'facebook'
   */
  async responder(mensagem, telefone, empresa, canal = 'whatsapp') {
    try {
      // Buscar histórico da conversa
      const chaveCache = `${empresa.id}_${telefone}`;
      const historico = conversaCache.get(chaveCache) || [];

      let resposta;

      if (this.modelo) {
        resposta = await this.responderComGemini(mensagem, historico, empresa, canal);
      } else {
        resposta = this.responderLocalmente(mensagem, empresa);
      }

      // Salvar no histórico (máximo 10 mensagens)
      historico.push({ cliente: mensagem, ia: resposta, hora: new Date().toISOString() });
      if (historico.length > 10) historico.shift();
      conversaCache.set(chaveCache, historico);

      return resposta;

    } catch (erro) {
      console.error('❌ Erro ao gerar resposta:', erro.message);
      return this.respostaFallback(empresa);
    }
  }

  /**
   * Resposta via Google Gemini (IA real)
   */
  async responderComGemini(mensagem, historico, empresa, canal) {
    // Montar contexto da empresa
    const contextoEmpresa = `
Você é ${empresa.nomeIA || 'Ana'}, assistente virtual da empresa "${empresa.nome}".

PERFIL DA EMPRESA:
- Segmento: ${empresa.segmento || 'Comércio'}
- Descrição: ${empresa.descricao || 'Empresa de qualidade a serviço dos clientes'}
- Horário: ${empresa.horario || 'Segunda a sexta, das 9h às 18h'}
- Localização: ${empresa.cidade || 'Brasil'}
- Canal atual: ${canal}

${empresa.faq && empresa.faq.length > 0 ? `
PERGUNTAS FREQUENTES (use para responder com precisão):
${empresa.faq.map(f => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n')}
` : ''}

${empresa.instrucoes ? `INSTRUÇÕES ESPECIAIS:\n${empresa.instrucoes}` : ''}

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em Português Brasileiro
2. Tom de voz: ${empresa.tom || 'amigável, caloroso e próximo'}
3. Use emojis de forma natural (1-2 por mensagem, nunca exagere)
4. NUNCA revele que você é uma IA ou chatbot — você é ${empresa.nomeIA || 'Ana'}
5. Seja CONCISO: máximo 3-4 linhas por resposta
6. Se o cliente estiver frustrado, demonstre empatia genuína
7. Para agendamentos ou valores específicos, confirme o que puder e ofereça ajuda
8. Se não souber algo, diga que vai verificar e pergunte o contato ou aguarde
`.trim();

    // Montar histórico formatado
    const historicoFormatado = historico.slice(-6).map(h =>
      `Cliente: ${h.cliente}\n${empresa.nomeIA || 'Ana'}: ${h.ia}`
    ).join('\n\n');

    const promptCompleto = `${contextoEmpresa}

${historicoFormatado ? `HISTÓRICO RECENTE DA CONVERSA:\n${historicoFormatado}\n` : ''}
NOVA MENSAGEM DO CLIENTE: "${mensagem}"

Responda como ${empresa.nomeIA || 'Ana'}:`;

    const resultado = await this.modelo.generateContent(promptCompleto);
    const resposta = resultado.response.text().trim();

    // Remover qualquer menção a "IA" ou "chatbot" se escapar
    return resposta
      .replace(/\b(sou uma? (IA|inteligência artificial|chatbot|robô|bot))/gi, `sou ${empresa.nomeIA || 'Ana'}`)
      .replace(/\b(como (IA|chatbot|robô|bot))/gi, 'como assistente');
  }

  /**
   * Resposta local (sem API — fallback inteligente)
   */
  responderLocalmente(mensagem, empresa) {
    const texto = mensagem.toLowerCase().trim();
    const nome = empresa.nomeIA || 'Ana';
    const nomeEmpresa = empresa.nome || 'nossa empresa';

    // Saudações
    if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hello|tudo|oi,|oi!)/.test(texto)) {
      const respostas = [
        `Oi! Que bom ter você aqui! 😊 Sou ${nome} e estou feliz em te atender. Como posso ajudar?`,
        `Olá! Seja bem-vindo(a) à ${nomeEmpresa}! 💜 Sou ${nome}. O que posso fazer por você hoje?`,
        `Oi, oi! 🌟 Tudo bem? Sou ${nome} da ${nomeEmpresa}. Como posso te ajudar?`
      ];
      return respostas[Math.floor(Math.random() * respostas.length)];
    }

    // Verificar FAQ da empresa
    if (empresa.faq && empresa.faq.length > 0) {
      for (const item of empresa.faq) {
        const palavras = item.pergunta.toLowerCase().split(' ').filter(p => p.length > 3);
        if (palavras.some(p => texto.includes(p))) {
          return item.resposta;
        }
      }
    }

    // Horário
    if (/hor[áa]rio|funciona|abre|fecha|expediente|atend/.test(texto)) {
      return empresa.horario
        ? `Nosso horário de atendimento é: ${empresa.horario} 📅 Posso te ajudar com mais alguma coisa?`
        : `Nosso atendimento é de segunda a sexta, das 9h às 18h 📅 Quer agendar?`;
    }

    // Preço/valor
    if (/pre[çc]o|valor|quanto|custo|tabela|plano/.test(texto)) {
      return `Ótima pergunta sobre valores! 😊 Me diga exatamente o que você precisa que te passo as informações com prazer. Qual serviço te interessa?`;
    }

    // Agendamento
    if (/agendar|marcar|reservar|hor[áa]rio|dispon[íi]vel/.test(texto)) {
      return `Claro, vou te ajudar com o agendamento! 🗓️ Me informe o serviço desejado e as datas que funcionam pra você.`;
    }

    // Localização
    if (/onde|endere[çc]o|localiza|fica|como chegar/.test(texto)) {
      return empresa.cidade
        ? `Estamos em ${empresa.cidade}! 📍 Me manda seu número que te envio o pin da nossa localização no mapa.`
        : `📍 Me manda seu número que te envio nossa localização pelo mapa!`;
    }

    // Obrigado
    if (/obrigad|valeu|thanks|grat/.test(texto)) {
      const respostas = [
        `De nada! 😊 É sempre um prazer atender. Mais alguma dúvida?`,
        `Imagina, é um prazer! 💜 Estou aqui sempre que precisar!`,
        `Que bom poder ajudar! 🌟 Se precisar de mais alguma coisa, é só chamar!`
      ];
      return respostas[Math.floor(Math.random() * respostas.length)];
    }

    // Reclamação / insatisfação
    if (/problema|reclamar|insatisfeito|ruim|p[ée]ssimo|n[ãa]o gostei/.test(texto)) {
      return `Sinto muito pelo inconveniente 🙏 Sua satisfação é muito importante para nós. Pode me contar mais detalhes para que eu possa resolver da melhor forma?`;
    }

    // WhatsApp/telefone
    if (/whatsapp|telefone|ligar|n[úu]mero/.test(texto)) {
      return `Você já está falando comigo diretamente por aqui! 😄 Se preferir, me passa seu contato que a gente continua a conversa. O que você precisa?`;
    }

    // Resposta padrão inteligente
    const padrao = [
      `Entendi! 😊 Para te dar a melhor resposta, pode me dar mais detalhes sobre o que precisa?`,
      `Boa pergunta! 💬 Me conta um pouquinho mais para eu te ajudar da melhor forma possível.`,
      `Claro, fico feliz em ajudar! 🌟 Pode me dar mais informações sobre o que você está buscando?`
    ];
    return padrao[Math.floor(Math.random() * padrao.length)];
  }

  /**
   * Resposta de fallback em caso de erro
   */
  respostaFallback(empresa) {
    const nome = empresa.nomeIA || 'Ana';
    return `Oi! 😊 Sou ${nome} e recebi sua mensagem. No momento estou verificando as informações e já volto com a resposta. Um momento!`;
  }
}

module.exports = new MotorIA();
