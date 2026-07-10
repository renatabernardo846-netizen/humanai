/**
 * HumanAI — Motor de Inteligência Artificial
 * Prioridade: Groq (gratuito) → OpenAI → Google Gemini → IA Local
 */

const NodeCache = require('node-cache');

// Cache de contexto de conversas (30 minutos)
const conversaCache = new NodeCache({ stdTTL: 1800 });

class MotorIA {
  constructor() {
    this.clienteGroq = null;
    this.clienteOpenAI = null;
    this.clienteGemini = null;
    this.modoAtivo = 'local';
    this.inicializar();
  }

  inicializar() {
    // Tentar Groq primeiro (gratuito!)
    try {
      if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.startsWith('gsk_')) {
        const Groq = require('groq-sdk');
        this.clienteGroq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        this.modoAtivo = 'groq';
        console.log('✅ Motor IA: Groq (Llama) ativado — 100% gratuito!');
        return;
      }
    } catch (e) {
      console.error('⚠️  Groq não disponível:', e.message);
    }

    // Tentar OpenAI
    try {
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
        const OpenAI = require('openai');
        this.clienteOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.modoAtivo = 'openai';
        console.log('✅ Motor IA: OpenAI (ChatGPT) ativado');
        return;
      }
    } catch (e) {
      console.error('⚠️  OpenAI não disponível:', e.message);
    }

    // Tentar Gemini como alternativa
    try {
      const chave = process.env.GEMINI_API_KEY;
      if (chave && chave.startsWith('AIza')) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(chave);
        this.clienteGemini = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          generationConfig: { temperature: 0.85, maxOutputTokens: 350 }
        });
        this.modoAtivo = 'gemini';
        console.log('✅ Motor IA: Google Gemini ativado');
        return;
      }
    } catch (e) {
      console.error('⚠️  Gemini não disponível:', e.message);
    }

    console.log('⚠️  Motor IA: Usando respostas locais inteligentes');
  }

  /**
   * Gera resposta para uma mensagem do cliente
   */
  async responder(mensagem, telefone, empresa, canal = 'whatsapp') {
    try {
      const chaveCache = `${empresa.id}_${telefone}`;
      const historico = conversaCache.get(chaveCache) || [];

      let resposta;

      if (this.modoAtivo === 'groq' && this.clienteGroq) {
        resposta = await this.responderComGroq(mensagem, historico, empresa);
      } else if (this.modoAtivo === 'openai' && this.clienteOpenAI) {
        resposta = await this.responderComOpenAI(mensagem, historico, empresa, canal);
      } else if (this.modoAtivo === 'gemini' && this.clienteGemini) {
        resposta = await this.responderComGemini(mensagem, historico, empresa, canal);
      } else {
        resposta = this.responderLocalmente(mensagem, empresa);
      }

      // Salvar histórico (máximo 10 trocas)
      historico.push({ cliente: mensagem, ia: resposta, hora: new Date().toISOString() });
      if (historico.length > 10) historico.shift();
      conversaCache.set(chaveCache, historico);

      return resposta;

    } catch (erro) {
      console.error('❌ Erro ao gerar resposta:', erro.message);
      // Fallback para IA local em caso de erro
      return this.responderLocalmente(mensagem, empresa);
    }
  }

  /**
   * Resposta via Groq (Llama — gratuito!)
   */
  async responderComGroq(mensagem, historico, empresa) {
    const mensagens = [
      { role: 'system', content: this.montarPromptSistema(empresa) }
    ];

    for (const h of historico.slice(-6)) {
      mensagens.push({ role: 'user', content: h.cliente });
      mensagens.push({ role: 'assistant', content: h.ia });
    }

    mensagens.push({ role: 'user', content: mensagem });

    const resposta = await this.clienteGroq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: mensagens,
      max_tokens: 300,
      temperature: 0.8
    });

    return resposta.choices[0].message.content.trim()
      .replace(/\b(sou uma? (IA|inteligência artificial|chatbot|robô|bot))/gi,
        `sou ${empresa.nomeIA || 'Ana'}`);
  }

  /**
   * Monta o prompt do sistema para a IA
   */
  montarPromptSistema(empresa) {
    return `Você é ${empresa.nomeIA || 'Ana'}, assistente virtual da empresa "${empresa.nome}".

PERFIL DA EMPRESA:
- Segmento: ${empresa.segmento || 'Serviços'}
- Descrição: ${empresa.descricao || 'Empresa dedicada à qualidade no atendimento'}
- Horário: ${empresa.horario || 'Segunda a sexta, das 9h às 18h'}
- Localização: ${empresa.cidade || 'Brasil'}

${empresa.faq && empresa.faq.length > 0 ? `PERGUNTAS FREQUENTES:
${empresa.faq.map(f => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n')}` : ''}

${empresa.instrucoes ? `INSTRUÇÕES ESPECIAIS:\n${empresa.instrucoes}` : ''}

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em ${empresa.idioma === 'en' ? 'Inglês Nativo (English)' : 'Português Brasileiro'}
2. Tom de voz: ${empresa.tom || 'amigável, caloroso e próximo'}
3. Use emojis de forma natural (1-2 por mensagem, nunca exagere)
4. NUNCA diga que você é uma IA ou chatbot — você é ${empresa.nomeIA || 'Ana'}, assistente da empresa
5. Seja CONCISO: máximo 3-4 linhas por resposta
6. Se o cliente estiver frustrado, demonstre empatia genuína
7. Se não souber algo específico, ofereça-se para verificar`.trim();
  }

  /**
   * Resposta via OpenAI (ChatGPT)
   */
  async responderComOpenAI(mensagem, historico, empresa, canal) {
    const mensagens = [
      { role: 'system', content: this.montarPromptSistema(empresa) }
    ];

    // Adicionar histórico da conversa
    for (const h of historico.slice(-6)) {
      mensagens.push({ role: 'user', content: h.cliente });
      mensagens.push({ role: 'assistant', content: h.ia });
    }

    // Mensagem atual do cliente
    mensagens.push({ role: 'user', content: mensagem });

    const resposta = await this.clienteOpenAI.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: mensagens,
      max_tokens: 300,
      temperature: 0.8
    });

    return resposta.choices[0].message.content.trim()
      .replace(/\b(sou uma? (IA|inteligência artificial|chatbot|robô|bot))/gi,
        `sou ${empresa.nomeIA || 'Ana'}`);
  }

  /**
   * Resposta via Google Gemini
   */
  async responderComGemini(mensagem, historico, empresa) {
    const historicoFormatado = historico.slice(-4)
      .map(h => `Cliente: ${h.cliente}\n${empresa.nomeIA || 'Ana'}: ${h.ia}`)
      .join('\n\n');

    const prompt = `${this.montarPromptSistema(empresa)}

${historicoFormatado ? `HISTÓRICO:\n${historicoFormatado}\n` : ''}
MENSAGEM DO CLIENTE: "${mensagem}"

Responda como ${empresa.nomeIA || 'Ana'}:`;

    const resultado = await this.clienteGemini.generateContent(prompt);
    return resultado.response.text().trim();
  }

  /**
   * Resposta local inteligente (sem API — sempre funciona)
   */
  responderLocalmente(mensagem, empresa) {
    const texto = mensagem.toLowerCase().trim();
    const nome = empresa.nomeIA || 'Ana';
    const nomeEmpresa = empresa.nome || 'nossa empresa';

    // Saudações
    if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hello|tudo|hi\b)/.test(texto)) {
      const ops = [
        `Oi! Que bom ter você aqui! 😊 Sou ${nome} e estou feliz em te atender. Como posso ajudar?`,
        `Olá! Seja bem-vindo(a) à ${nomeEmpresa}! 💜 Sou ${nome}. O que posso fazer por você hoje?`,
        `Oi, oi! 🌟 Tudo bem? Sou ${nome}. Como posso te ajudar hoje?`
      ];
      return ops[Math.floor(Math.random() * ops.length)];
    }

    // Verificar FAQ da empresa
    if (empresa.faq?.length > 0) {
      for (const item of empresa.faq) {
        const palavras = item.pergunta.toLowerCase().split(' ').filter(p => p.length > 3);
        if (palavras.some(p => texto.includes(p))) return item.resposta;
      }
    }

    // Horário
    if (/hor[áa]rio|funciona|abre|fecha|expediente|quando/.test(texto)) {
      return empresa.horario
        ? `Nosso horário de atendimento é: ${empresa.horario} 📅 Posso te ajudar com mais alguma coisa?`
        : `Atendemos de segunda a sexta, das 9h às 18h 📅 Precisa agendar?`;
    }

    // Preço
    if (/pre[çc]o|valor|quanto|custo|tabela/.test(texto)) {
      return `Ótima pergunta! 😊 Me diga exatamente o que você precisa que te passo o valor com prazer. Qual serviço te interessa?`;
    }

    // Agendamento
    if (/agendar|marcar|reservar|dispon[íi]vel/.test(texto)) {
      return `Claro, vou te ajudar com o agendamento! 🗓️ Me informe o serviço desejado e as datas que funcionam pra você.`;
    }

    // Localização
    if (/onde|endere[çc]o|localiza|como chegar/.test(texto)) {
      return empresa.cidade
        ? `Estamos em ${empresa.cidade}! 📍 Me manda seu número que te envio a localização no mapa.`
        : `📍 Me manda seu número que te envio nossa localização!`;
    }

    // Obrigado
    if (/obrigad|valeu|grat/.test(texto)) {
      const ops = [
        `De nada! 😊 É sempre um prazer atender. Mais alguma dúvida?`,
        `Imagina, é um prazer! 💜 Estou aqui sempre que precisar!`,
        `Que bom poder ajudar! 🌟 Pode chamar quando quiser!`
      ];
      return ops[Math.floor(Math.random() * ops.length)];
    }

    // Reclamação
    if (/problema|reclamar|insatisfeito|ruim|p[ée]ssimo/.test(texto)) {
      return `Sinto muito pelo inconveniente 🙏 Sua satisfação é muito importante pra nós. Pode me contar mais para que eu resolva da melhor forma?`;
    }

    // Padrão
    const ops = [
      `Entendi! 😊 Para te dar a melhor resposta, pode me dar mais detalhes?`,
      `Boa pergunta! 💬 Me conta um pouquinho mais para eu te ajudar direitinho.`,
      `Claro, fico feliz em ajudar! 🌟 Pode me dar mais informações?`
    ];
    return ops[Math.floor(Math.random() * ops.length)];
  }

  respostaFallback(empresa) {
    return `Oi! 😊 Recebi sua mensagem e já vou verificar. Um momento!`;
  }
}

module.exports = new MotorIA();
