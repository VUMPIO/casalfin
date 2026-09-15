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

const { parseExpense } = require('./parser');
const { getPersonNames, addExpense } = require('./supabase');

const OWNER_PERSON_INDEX = Number(process.env.OWNER_PERSON_INDEX ?? 0);
const HTTP_PORT = Number(process.env.WHATSAPP_BOT_PORT ?? 8787);
const logger = pino({ level: 'silent' });

// Estado exposto pro app CasalFin conferir status/QR pela própria interface.
const bridgeState = { connected: false, qrDataUrl: null };

function startBridgeServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
    res.writeHead(404);
    res.end();
  });
  server.listen(HTTP_PORT, () => {
    console.log(`Bridge HTTP em http://localhost:${HTTP_PORT} (status/QR pro CasalFin consultar)`);
  });
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
        const selfJid = jidNormalizedUser(sock.user.id);
        const fromJid = jidNormalizedUser(msg.key.remoteJid);
        if (fromJid !== selfJid) continue;

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
  const parsed = parseExpense(text, personNames, OWNER_PERSON_INDEX);

  if (!parsed.ok) {
    await sock.sendMessage(jid, {
      text: '⚠️ Não consegui encontrar um valor nessa mensagem. Exemplo: "Ifood 45,90 nubank"',
    });
    return;
  }

  const entry = {
    nome: parsed.nome,
    data: parsed.data,
    tipo: parsed.tipo,
    cat: parsed.cat,
    valor: parsed.valor,
  };

  await addExpense(parsed.quem, entry);

  const quemNome = personNames[parsed.quem];
  await sock.sendMessage(jid, {
    text: `✅ ${parsed.catLabel} · R$ ${parsed.valor} ${parsed.tipo ? '· ' + parsed.tipo + ' ' : ''}· ${quemNome}\n"${parsed.nome}" registrado no CasalFin.`,
  });
}

startBridgeServer();
startBot();
