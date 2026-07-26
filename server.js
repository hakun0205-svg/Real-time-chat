/**
 * server.js — NebulaChat バックエンド
 * Express + Socket.io + NeDB (nedb-promises)
 */
const express    = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const path       = require('path');
const db         = require('./database');

const PORT       = process.env.PORT || 9000;
const JWT_SECRET = process.env.JWT_SECRET || 'nebula-chat-dev-secret-change-me';

const app  = express();
const http = createServer(app);
const io   = new Server(http, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── 認証ミドルウェア ── */
function authMw(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: '認証が必要です' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'トークンが無効です。再ログインしてください' }); }
}
function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

/* roomId -> Map<socketId, {userId, username}> */
const roomOnline = new Map();

/* ══ REST API ══ */

/* 登録 */
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ error: '全ての項目を入力してください' });
    if (username.trim().length < 2) return res.status(400).json({ error: 'ユーザー名は2文字以上必要です' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'メールアドレスの形式が正しくありません' });
    if (password.length < 6) return res.status(400).json({ error: 'パスワードは6文字以上必要です' });
    if (await db.getUserByEmail(email.toLowerCase())) return res.status(400).json({ error: 'このメールアドレスは既に使用されています' });
    if (await db.getUserByUsername(username.trim())) return res.status(400).json({ error: 'このユーザー名は既に使用されています' });

    const user = await db.createUser({ username: username.trim(), email: email.toLowerCase(), passwordHash: bcrypt.hashSync(password, 10) });
    console.log('[Register]', user.username);
    res.status(201).json({ token: sign(user), user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'サーバーエラーが発生しました' }); }
});

/* ログイン */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'メールアドレスとパスワードを入力してください' });
    const user = await db.getUserByEmail(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.passwordHash))
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    const pub = { id: user._id, username: user.username, email: user.email };
    console.log('[Login]', user.username);
    res.json({ token: sign(pub), user: pub });
  } catch (e) { console.error(e); res.status(500).json({ error: 'サーバーエラーが発生しました' }); }
});

/* ルーム一覧 */
app.get('/api/rooms', authMw, async (_req, res) => {
  try { res.json(await db.getRooms()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ルーム作成 */
app.post('/api/rooms', authMw, async (req, res) => {
  try {
    const name = (req.body?.name || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return res.status(400).json({ error: 'ルーム名を入力してください' });
    if (name.length > 32) return res.status(400).json({ error: 'ルーム名は32文字以内にしてください' });
    if (await db.getRoomByName(name)) return res.status(400).json({ error: 'このルーム名は既に使用されています' });
    const room = await db.createRoom({ name, createdBy: req.user.id });
    io.emit('room_created', room);
    console.log('[Room+]', room.name);
    res.status(201).json(room);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ルーム削除 */
app.delete('/api/rooms/:id', authMw, async (req, res) => {
  try {
    const room = await db.getRoomById(req.params.id);
    if (!room) return res.status(404).json({ error: 'ルームが見つかりません' });
    if (room.created_by !== req.user.id) return res.status(403).json({ error: 'ルームの作成者のみ削除できます' });
    await db.deleteRoom(req.params.id);
    io.emit('room_deleted', { id: req.params.id });
    console.log('[Room-]', room.name);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* メッセージ履歴 */
app.get('/api/rooms/:id/messages', authMw, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    res.json(await db.getMessages(req.params.id, limit));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ユーザー名変更 */
app.put('/api/me/username', authMw, async (req, res) => {
  try {
    const username = (req.body?.username || '').trim();
    if (username.length < 2) return res.status(400).json({ error: 'ユーザー名は2文字以上必要です' });
    const ex = await db.getUserByUsername(username);
    if (ex && ex._id !== req.user.id) return res.status(400).json({ error: 'このユーザー名は既に使用されています' });
    await db.updateUsername(req.user.id, username);
    for (const [roomId, users] of roomOnline) {
      let changed = false;
      for (const info of users.values()) if (info.userId === req.user.id) { info.username = username; changed = true; }
      if (changed) io.to(roomId).emit('online_users', [...users.values()]);
    }
    const token = sign({ id: req.user.id, username, email: req.user.email });
    res.json({ token, username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* メール変更 */
app.put('/api/me/email', authMw, async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'メールアドレスの形式が正しくありません' });
    const ex = await db.getUserByEmail(email);
    if (ex && ex._id !== req.user.id) return res.status(400).json({ error: 'このメールアドレスは既に使用されています' });
    await db.updateEmail(req.user.id, email);
    const token = sign({ id: req.user.id, username: req.user.username, email });
    res.json({ token, email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* パスワード変更 */
app.put('/api/me/password', authMw, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const user = await db.getUserById(req.user.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash))
      return res.status(400).json({ error: '現在のパスワードが正しくありません' });
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ error: '新しいパスワードは6文字以上必要です' });
    await db.updatePassword(req.user.id, bcrypt.hashSync(newPassword, 10));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* アカウント削除 */
app.delete('/api/me', authMw, async (req, res) => {
  try {
    await db.deleteUser(req.user.id);
    console.log('[DeleteAccount]', req.user.username);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══ SOCKET.IO ══ */
io.use((socket, next) => {
  try { socket.user = jwt.verify(socket.handshake.auth.token, JWT_SECRET); next(); }
  catch { next(new Error('認証エラー')); }
});

function leaveAllRooms(socket) {
  for (const [roomId, users] of roomOnline) {
    if (users.has(socket.id)) {
      users.delete(socket.id);
      io.to(roomId).emit('online_users', [...users.values()]);
      socket.leave(roomId);
    }
  }
}

io.on('connection', (socket) => {
  console.log('[Socket+]', socket.user.username);

  socket.on('join_room', async (roomId) => {
    leaveAllRooms(socket);
    const room = await db.getRoomById(roomId);
    if (!room) return;
    socket.join(roomId);
    if (!roomOnline.has(roomId)) roomOnline.set(roomId, new Map());
    roomOnline.get(roomId).set(socket.id, { userId: socket.user.id, username: socket.user.username });
    io.to(roomId).emit('online_users', [...roomOnline.get(roomId).values()]);
  });

  socket.on('send_message', async ({ roomId, content }) => {
    if (!content?.trim() || !roomId) return;
    if (!await db.getRoomById(roomId)) return;
    const msg = await db.createMessage({ roomId, userId: socket.user.id, username: socket.user.username, content: content.trim() });
    io.to(roomId).emit('new_message', msg);
  });

  socket.on('disconnect', () => {
    leaveAllRooms(socket);
    console.log('[Socket-]', socket.user.username);
  });
});

http.listen(PORT, () => {
  console.log(`\n✦ NebulaChat  →  http://localhost:${PORT}\n`);
});
