const qrcode = require('qrcode-terminal');
const qrcodePng = require('qrcode');
const path = require('path');
const http = require('http');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const { getPersonNames } = require('./supabase');
const { think } = require('./brain');

const OWNER_PERSON_INDEX = Number(process.env.OWNER_PERSON_INDEX ?? 0);
const HTTP_PORT = Number(process.env.WHATSAPP_BOT_PORT ?? 8787);
const logger = pino({ level: 'silent' });

// Estado exposto pro app CasalFin conferir status/QR pela própria interface.
const bridgeState = { connected: false, qrDataUrl: null };

function startBridgeServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    // Chrome Private Network Access: sites públicos (https) precisam dessa
    // permissão explícita pra poder falar com localhost/loopback.
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ connected: bridgeState.connected }));
      return;
    }
    if (req.url === '/qr') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ connected: bridgeState.connected, qr: bridgeState.qrDataUrl }));
      return;
    }
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pairingPageHtml());
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(HTTP_PORT, () => {
    console.log(`Bridge HTTP em http://localhost:${HTTP_PORT} (status/QR pro CasalFin consultar)`);
  });
}

function pairingPageHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CasalFin · Conectar WhatsApp</title>
<style>
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f7f0f4;color:#1a0012;margin:0;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:16px;min-height:100vh;box-sizing:border-box}
  h1{font-size:1.1rem;color:#880e4f;margin:0}
  #status{font-weight:700;padding:8px 16px;border-radius:20px;font-size:13px}
  #status.on{background:#e8f5e9;color:#2e7d32}
  #status.off{background:#fce4ec;color:#b08090}
  #qrWrap{background:#fff;padding:16px;border-radius:16px;box-shadow:0 2px 12px rgba(160,40,90,.15)}
  img{width:260px;max-width:80vw;display:block}
  p{font-size:12px;color:#7b3a5c;text-align:center;max-width:280px}
</style>
</head>
<body>
  <h1>💕 CasalFin — Conectar WhatsApp</h1>
  <div id="status" class="off">Verificando...</div>
  <div id="qrWrap" style="display:none"><img id="qrImg"></div>
  <p>WhatsApp → Aparelhos conectados → Conectar um aparelho, e aponte a câmera pro QR acima.</p>
  <script>
    async function tick(){
      try{
        const r = await fetch('/qr');
        const d = await r.json();
        const st = document.getElementById('status');
        const wrap = document.getElementById('qrWrap');
        if(d.connected){
          st.textContent = '✅ Conectado';
          st.className = 'on';
          wrap.style.display = 'none';
        }else{
          st.textContent = '⚪ Não conectado';
          st.className = 'off';
          if(d.qr){
            document.getElementById('qrImg').src = d.qr;
            wrap.style.display = '';
          }
        }
      }catch(e){}
    }
    tick();
    setInterval(tick, 3000);
  </script>
</body>
</html>`;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({ auth: state, logger });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\nEscaneie o QR code no WhatsApp (Aparelhos conectados > Conectar um aparelho):\n');
      qrcode.generate(qr, { small: true });
      bridgeState.connected = false;
      qrcodePng.toDataURL(qr, { width: 500 }).then((dataUrl) => {
        bridgeState.qrDataUrl = dataUrl;
      }).catch(() => {});
      const qrPath = path.join(__dirname, 'qr.png');
      qrcodePng.toFile(qrPath, qr, { width: 500 }).then(() => {
        console.log('QR também salvo em:', qrPath);
      }).catch(() => {});
    }
    if (connection === 'close') {
      bridgeState.connected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão encerrada.', shouldReconnect ? 'Reconectando...' : 'Sessão deslogada, apague a pasta auth_info e escaneie o QR de novo.');
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      bridgeState.connected = true;
      bridgeState.qrDataUrl = null;
      console.log('✅ CasalFin bot conectado ao WhatsApp — escutando "Mensagens para você mesmo".');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (!msg.message || !msg.key.fromMe) continue;
        // O chat "Mensagens para você mesmo" pode aparecer com o JID do
        // número de telefone (@s.whatsapp.net) ou com o LID (@lid) — o
        // WhatsApp usa os dois formatos dependendo da versão/conta.
        const selfJids = [sock.user.id, sock.user.lid]
          .filter(Boolean)
          .map(jidNormalizedUser);
        const fromJid = jidNormalizedUser(msg.key.remoteJid);
        if (!selfJids.includes(fromJid)) continue;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text.trim()) continue;

        await handleExpenseMessage(sock, msg.key.remoteJid, text);
      } catch (err) {
        console.error('Erro ao processar mensagem:', err);
      }
    }
  });
}

async function handleExpenseMessage(sock, jid, text) {
  const personNames = await getPersonNames();
  try {
    const reply = await think(text, personNames, OWNER_PERSON_INDEX);
    await sock.sendMessage(jid, { text: reply });
  } catch (err) {
    console.error('Erro no brain:', err);
    await sock.sendMessage(jid, {
      text: '⚠️ Deu erro aqui do meu lado processando sua mensagem. Tenta de novo?',
    });
  }
}

startBridgeServer();
startBot();
