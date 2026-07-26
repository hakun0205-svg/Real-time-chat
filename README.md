# ✦ NebulaChat

Node.js + Express + Socket.io + NeDB によるリアルタイムチャットアプリ

## 必要環境

- Node.js v16 以上

## セットアップ & 起動

```bash
# 1. 依存パッケージをインストール
npm install

# 2. サーバーを起動
npm start
```

ブラウザで **http://localhost:9000** を開く

## 開発モード（コード変更で自動再起動）

```bash
npm run dev
```

## ディレクトリ構成

```
nebula-chat/
├── server.js        - Express + Socket.io サーバー
├── database.js      - NeDB データベースヘルパー
├── package.json
├── data/            - データ保存先（自動生成）
│   ├── users.db
│   ├── rooms.db
│   └── messages.db
└── public/
    └── index.html   - フロントエンド
```

## 環境変数（任意）

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| PORT | 9000 | ポート番号 |
| JWT_SECRET | (固定値) | JWTシークレットキー ⚠️ 本番では必ず変更 |

```bash
PORT=9000 JWT_SECRET=強力なランダム文字列 npm start
```

## API 一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/register | アカウント登録 |
| POST | /api/login | ログイン |
| GET  | /api/rooms | ルーム一覧 |
| POST | /api/rooms | ルーム作成 |
| DELETE | /api/rooms/:id | ルーム削除 |
| GET  | /api/rooms/:id/messages | メッセージ履歴 |
| PUT  | /api/me/username | ユーザー名変更 |
| PUT  | /api/me/email | メール変更 |
| PUT  | /api/me/password | パスワード変更 |
| DELETE | /api/me | アカウント削除 |

## Socket.io イベント

| 方向 | イベント | 説明 |
|------|---------|------|
| Client → Server | join_room | ルーム参加 |
| Client → Server | send_message | メッセージ送信 |
| Server → Client | new_message | 新規メッセージ受信 |
| Server → Client | online_users | オンラインユーザー一覧更新 |
| Server → Client | room_created | ルーム作成通知 |
| Server → Client | room_deleted | ルーム削除通知 |
