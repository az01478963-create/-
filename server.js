// 珍珠夢海灣 · 多人連線伺服器(容錯版: public/ 或根目錄都能找到 index.html)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

function resolveFile(p) {
  const clean = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  const candidates = [
    path.join(__dirname, 'public', clean),   // 標準位置: public/index.html
    path.join(__dirname, clean),             // 容錯: 放在根目錄也行
  ];
  if (clean === '/index.html') candidates.push(path.join(__dirname, 'pearl_game.html'));
  for (const fp of candidates) { if (fs.existsSync(fp) && fs.statSync(fp).isFile()) return fp; }
  return null;
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = resolveFile(p);
  if (!fp) { res.writeHead(404); res.end('Not Found'); return; }
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
                 '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
  res.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

const wss = new WebSocketServer({ server });
const rooms = {};
let nextId = 0;

function relay(roomCode, except, obj) {
  const room = rooms[roomCode];
  if (!room) return;
  const s = JSON.stringify(obj);
  room.forEach((ws) => { if (ws !== except && ws.readyState === 1) ws.send(s); });
}

wss.on('connection', (ws) => {
  ws.id = ++nextId; ws.room = null; ws.pname = '?';
  ws.on('message', (m) => {
    let d; try { d = JSON.parse(m); } catch (e) { return; }
    if (d.t === 'probe') {
      ws.send(JSON.stringify({ t: 'pong' }));
    } else if (d.t === 'join') {
      ws.room = String(d.room || 'LOBBY').slice(0, 12).toUpperCase();
      ws.pname = String(d.name || '玩家').slice(0, 12);
      if (!rooms[ws.room]) rooms[ws.room] = new Map();
      const peers = [...rooms[ws.room].entries()].map(([id, w]) => ({ id, name: w.pname }));
      ws.send(JSON.stringify({ t: 'joined', room: ws.room, id: ws.id, peers }));
      relay(ws.room, ws, { t: 'peer-join', id: ws.id, name: ws.pname });
      rooms[ws.room].set(ws.id, ws);
      console.log(`[${ws.room}] ${ws.pname} 加入 (${rooms[ws.room].size} 人)`);
    } else if (d.t === 'msg' && ws.room) {
      relay(ws.room, ws, { t: 'msg', from: ws.id, fromName: ws.pname, data: d.data });
    }
  });
  ws.on('close', () => {
    if (ws.room && rooms[ws.room]) {
      rooms[ws.room].delete(ws.id);
      relay(ws.room, null, { t: 'peer-leave', id: ws.id, name: ws.pname });
      if (rooms[ws.room].size === 0) delete rooms[ws.room];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🐚 珍珠夢海灣伺服器已啟動: http://localhost:${PORT}`));
