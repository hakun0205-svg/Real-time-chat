/**
 * database.js — NeDB データベースヘルパー
 * nedb-promises を使用（純粋なJS、コンパイル不要）
 * データは ./data/ ディレクトリに自動保存されます
 */
const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const users    = Datastore.create({ filename: path.join(dataDir, 'users.db'),    autoload: true });
const rooms    = Datastore.create({ filename: path.join(dataDir, 'rooms.db'),    autoload: true });
const messages = Datastore.create({ filename: path.join(dataDir, 'messages.db'), autoload: true });

/* インデックス */
users.ensureIndex({ fieldName: 'email',    unique: true });
users.ensureIndex({ fieldName: 'username', unique: true });
rooms.ensureIndex({ fieldName: 'name',     unique: true });
messages.ensureIndex({ fieldName: 'roomId' });
messages.ensureIndex({ fieldName: 'createdAt' });

/* ID 生成 */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* デフォルトルーム（初回のみ） */
async function seedRooms() {
  const count = await rooms.count({});
  if (count === 0) {
    const ts = Date.now();
    await rooms.insert([
      { _id: 'r_general', name: 'general', createdBy: 'system', createdAt: ts },
      { _id: 'r_random',  name: 'random',  createdBy: 'system', createdAt: ts + 1 },
      { _id: 'r_tech',    name: 'tech',    createdBy: 'system', createdAt: ts + 2 },
    ]);
  }
}
seedRooms();

/* ══ USER ══ */
async function getUserByEmail(email) {
  return users.findOne({ email });
}
async function getUserByUsername(username) {
  return users.findOne({ username });
}
async function getUserById(id) {
  return users.findOne({ _id: id });
}
async function createUser({ username, email, passwordHash }) {
  const doc = { _id: genId(), username, email, passwordHash, createdAt: Date.now() };
  await users.insert(doc);
  return { id: doc._id, username, email };
}
async function updateUsername(id, username) {
  return users.update({ _id: id }, { $set: { username } });
}
async function updateEmail(id, email) {
  return users.update({ _id: id }, { $set: { email } });
}
async function updatePassword(id, hash) {
  return users.update({ _id: id }, { $set: { passwordHash: hash } });
}
async function deleteUser(id) {
  return users.remove({ _id: id }, {});
}

/* ══ ROOM ══ */
async function getRooms() {
  const docs = await rooms.find({}).sort({ createdAt: 1 });
  return docs.map(r => ({ id: r._id, name: r.name, created_by: r.createdBy, created_at: r.createdAt }));
}
async function getRoomById(id) {
  const r = await rooms.findOne({ _id: id });
  return r ? { id: r._id, name: r.name, created_by: r.createdBy, created_at: r.createdAt } : null;
}
async function getRoomByName(name) {
  return rooms.findOne({ name });
}
async function createRoom({ name, createdBy }) {
  const ts = Date.now();
  const doc = { _id: genId(), name, createdBy, createdAt: ts };
  await rooms.insert(doc);
  return { id: doc._id, name, created_by: createdBy, created_at: ts };
}
async function deleteRoom(id) {
  await rooms.remove({ _id: id }, {});
  await messages.remove({ roomId: id }, { multi: true });
}

/* ══ MESSAGE ══ */
async function getMessages(roomId, limit = 200) {
  const docs = await messages.find({ roomId }).sort({ createdAt: 1 }).limit(limit);
  return docs.map(m => ({
    id: m._id, room_id: m.roomId, user_id: m.userId,
    username: m.username, content: m.content, created_at: m.createdAt,
  }));
}
async function createMessage({ roomId, userId, username, content }) {
  const ts = Date.now();
  const doc = { _id: genId(), roomId, userId, username, content, createdAt: ts };
  await messages.insert(doc);
  return { id: doc._id, room_id: roomId, user_id: userId, username, content, created_at: ts };
}

module.exports = {
  getUserByEmail, getUserByUsername, getUserById,
  createUser, updateUsername, updateEmail, updatePassword, deleteUser,
  getRooms, getRoomById, getRoomByName, createRoom, deleteRoom,
  getMessages, createMessage,
};
