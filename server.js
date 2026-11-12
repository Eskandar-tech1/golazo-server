const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const rooms = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Golazo 26 server OK. Rooms: ' + rooms.size);
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(''); }
  while (rooms.has(c));
  return c;
}
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.room = null; ws.role = null;

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'create') {
      if (ws.room) return;
      const code = newCode();
      rooms.set(code, { host: ws, guest: null });
      ws.room = code; ws.role = 'host';
      send(ws, { t: 'created', code });
    } else if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) return send(ws, { t: 'error', msg: 'Room not found' });
      if (r.guest) return send(ws, { t: 'error', msg: 'Room is full' });
      r.guest = ws; ws.room = code; ws.role = 'guest';
      send(ws, { t: 'joined', code });
      send(r.host, { t: 'guest-joined' });
    } else if (ws.room) {
      const r = rooms.get(ws.room); if (!r) return;
      const other = ws.role === 'host' ? r.guest : r.host;
      send(other, m);
    }
  });

  ws.on('close', () => {
    const r = ws.room && rooms.get(ws.room);
    if (!r) return;
    const other = ws.role === 'host' ? r.guest : r.host;
    send(other, { t: 'peer-left' });
    rooms.delete(ws.room);
    if (other) other.room = null;
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 25000);

server.listen(PORT, () => console.log('Golazo server listening on ' + PORT));