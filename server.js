// 珍珠夢海灣 · 多人連線伺服器
// 功能: 1) 靜態托管遊戲頁面  2) WebSocket 房間制多人連線轉發
// 使用方法: npm install → node server.js → 玩家打開 http://你的網址 即可同樂
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(__dirname, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
                   '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = {};            // roomCode -> Map(clientId -> ws)
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
    if (d.t === 'probe') {                      // 客戶端偵測是否為多人伺服器
      ws.send(JSON.stringify({ t: 'pong' }));
    } else if (d.t === 'join') {                // 加入房間
      ws.room = String(d.room || 'LOBBY').slice(0, 12).toUpperCase();
      ws.pname = String(d.name || '玩家').slice(0, 12);
      if (!rooms[ws.room]) rooms[ws.room] = new Map();
      const peers = [...rooms[ws.room].entries()].map(([id, w]) => ({ id, name: w.pname }));
      ws.send(JSON.stringify({ t: 'joined', room: ws.room, id: ws.id, peers }));
      relay(ws.room, ws, { t: 'peer-join', id: ws.id, name: ws.pname });
      rooms[ws.room].set(ws.id, ws);
      console.log(`[${ws.room}] ${ws.pname} 加入 (${rooms[ws.room].size} 人)`);
    } else if (d.t === 'msg' && ws.room) {      // 房內廣播(狀態/動態/參觀...)
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
