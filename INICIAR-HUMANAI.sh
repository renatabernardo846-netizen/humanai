#!/bin/bash
# ═══════════════════════════════════════
#   HumanAI — Iniciar Plataforma
#   Clique duas vezes para abrir sua IA!
# ═══════════════════════════════════════

echo "🤖 Iniciando HumanAI..."

# Parar servidores anteriores
pkill -f "http.server 8080" 2>/dev/null
pkill -f "node server.js" 2>/dev/null
sleep 1

# Iniciar servidor de páginas (frontend)
cd /home/renata40/.gemini/antigravity/scratch/humanai
python3 -m http.server 8080 &
echo "✅ Site rodando em http://localhost:8080"

# Iniciar servidor da IA (backend)
cd /home/renata40/.gemini/antigravity/scratch/humanai/backend
node server.js &
echo "✅ Motor de IA rodando em http://localhost:3000"

sleep 2

# Abrir o navegador
google-chrome \
  "http://localhost:8080/simulator.html" \
  "http://localhost:8080/dashboard.html" \
  2>/dev/null &

echo ""
echo "🎉 HumanAI aberto no Chrome!"
echo ""
echo "Para fechar, pressione Ctrl+C ou feche esta janela."

# Manter rodando
wait
