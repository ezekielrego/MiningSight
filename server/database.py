#!/usr/bin/env python3
"""Small SQLite persistence worker for the MiningSight server bridge."""
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

DB_PATH = sys.argv[1]
OPERATION = sys.argv[2]
PAYLOAD = json.loads(sys.argv[3] or '{}')
USER_STORAGE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys = ON')
db.executescript('''
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  google_sub TEXT,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gemini_api_key_ciphertext TEXT,
  marble_api_key_ciphertext TEXT,
  gemini_model TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
  marble_model TEXT NOT NULL DEFAULT 'marble-1.1',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
''')

for column, definition in [
    ('google_sub', 'TEXT'),
    ('email', 'TEXT'),
    ('display_name', 'TEXT'),
    ('avatar_url', 'TEXT'),
]:
    try:
        db.execute(f'ALTER TABLE users ADD COLUMN {column} {definition}')
    except sqlite3.OperationalError:
        pass
db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL')

def now():
    return datetime.now(timezone.utc).isoformat()

def user_payload(row):
    return {
        'id': row['id'], 'username': row['username'], 'email': row['email'] if 'email' in row.keys() else None,
        'displayName': row['display_name'] if 'display_name' in row.keys() else row['username'],
        'avatarUrl': row['avatar_url'] if 'avatar_url' in row.keys() else None,
        'createdAt': row['created_at'],
    }

def password_digest(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 260000).hex()

def create_session(user_id):
    token = secrets.token_urlsafe(48)
    created = now()
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    db.execute('INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)', (token, user_id, expiry, created))
    return token

def auth_user(token):
    if not token:
        return None
    db.execute('DELETE FROM sessions WHERE expires_at < ?', (now(),))
    row = db.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires_at>=?', (token, now())).fetchone()
    return user_payload(row) if row else None

def require_user():
    user = auth_user(PAYLOAD.get('token'))
    if not user:
        raise ValueError('AUTH_REQUIRED')
    return user

def asset_payload(row, project_id=None):
    return {
        'id': row['id'], 'name': row['name'], 'storedName': row['stored_name'],
        'type': row['asset_type'], 'kind': row['kind'], 'size': row['size'],
        'uploadedAt': row['uploaded_at'],
        'projectId': project_id or row['project_id'],
    }

def project_payload(row):
    data = json.loads(row['data_json'] or '{}')
    data['projectId'] = row['id']
    data['projectName'] = row['project_name']
    data['updatedAt'] = row['updated_at']
    assets = db.execute('SELECT * FROM assets WHERE project_id=? ORDER BY uploaded_at ASC', (row['id'],)).fetchall()
    data['assets'] = [asset_payload(asset) for asset in assets]
    return data

try:
    if OPERATION == 'register':
        username = str(PAYLOAD.get('username', '')).strip()
        password = str(PAYLOAD.get('password', ''))
        if not re.fullmatch(r'[A-Za-z0-9_.-]{3,48}', username): raise ValueError('Username must be 3-48 characters using letters, numbers, dot, underscore, or dash.')
        if len(password) < 8: raise ValueError('Password must be at least 8 characters.')
        salt = secrets.token_bytes(16)
        user_id = 'user_' + secrets.token_hex(12)
        created = now()
        db.execute('INSERT INTO users(id,username,password_hash,password_salt,created_at) VALUES(?,?,?,?,?)', (user_id, username, password_digest(password, salt), salt.hex(), created))
        token = create_session(user_id)
        db.commit()
        row = db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
        output = {'user': user_payload(row), 'token': token}
    elif OPERATION == 'login':
        username = str(PAYLOAD.get('username', '')).strip()
        password = str(PAYLOAD.get('password', ''))
        row = db.execute('SELECT * FROM users WHERE username=? COLLATE NOCASE', (username,)).fetchone()
        if not row or password_digest(password, bytes.fromhex(row['password_salt'])) != row['password_hash']:
            raise ValueError('Invalid username or password.')
        token = create_session(row['id'])
        db.commit()
        output = {'user': user_payload(row), 'token': token}
    elif OPERATION == 'google_login':
        google_sub = str(PAYLOAD.get('googleSub', '')).strip()
        email = str(PAYLOAD.get('email', '')).strip().lower()
        display_name = str(PAYLOAD.get('displayName') or email or 'Google user').strip()[:120]
        avatar_url = str(PAYLOAD.get('avatarUrl') or '').strip()[:1000]
        if not google_sub or not email: raise ValueError('GOOGLE_PROFILE_INCOMPLETE')
        row = db.execute('SELECT * FROM users WHERE google_sub=? OR email=? COLLATE NOCASE', (google_sub, email)).fetchone()
        if row:
            db.execute('UPDATE users SET google_sub=?, email=?, display_name=?, avatar_url=? WHERE id=?', (google_sub, email, display_name, avatar_url, row['id']))
            user_id = row['id']
        else:
            user_id = 'user_' + secrets.token_hex(12)
            created = now()
            username = 'google_' + google_sub[:24]
            dummy_salt = secrets.token_bytes(16)
            db.execute('INSERT INTO users(id,username,google_sub,email,display_name,avatar_url,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?,?,?,?)', (user_id, username, google_sub, email, display_name, avatar_url, password_digest(secrets.token_urlsafe(32), dummy_salt), dummy_salt.hex(), created))
        token = create_session(user_id)
        db.commit()
        row = db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
        output = {'user': user_payload(row), 'token': token}
    elif OPERATION == 'me':
        user = auth_user(PAYLOAD.get('token'))
        if not user: raise ValueError('AUTH_REQUIRED')
        db.commit()
        output = {'user': user}
    elif OPERATION == 'logout':
        db.execute('DELETE FROM sessions WHERE token=?', (PAYLOAD.get('token'),))
        db.commit()
        output = {'ok': True}
    elif OPERATION == 'storage_usage':
        user = require_user()
        used = int(db.execute('SELECT COALESCE(SUM(size), 0) FROM assets WHERE user_id=?', (user['id'],)).fetchone()[0] or 0)
        output = {
            'storage': {
                'usedBytes': used,
                'quotaBytes': USER_STORAGE_QUOTA_BYTES,
                'remainingBytes': max(0, USER_STORAGE_QUOTA_BYTES - used),
                'usedPercent': round((used / USER_STORAGE_QUOTA_BYTES) * 100, 2),
            }
        }
    elif OPERATION == 'get_ai_settings':
        user = require_user()
        row = db.execute('SELECT * FROM user_ai_settings WHERE user_id=?', (user['id'],)).fetchone()
        output = {'settings': {
            'geminiApiKeyCiphertext': row['gemini_api_key_ciphertext'] if row else None,
            'marbleApiKeyCiphertext': row['marble_api_key_ciphertext'] if row else None,
            'geminiModel': row['gemini_model'] if row else 'gemini-3.8-flash',
            'marbleModel': row['marble_model'] if row else 'marble-1.1',
        }}
    elif OPERATION == 'save_ai_settings':
        user = require_user()
        timestamp = now()
        db.execute('''
            INSERT INTO user_ai_settings(user_id,gemini_api_key_ciphertext,marble_api_key_ciphertext,gemini_model,marble_model,updated_at)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
              gemini_api_key_ciphertext=excluded.gemini_api_key_ciphertext,
              marble_api_key_ciphertext=excluded.marble_api_key_ciphertext,
              gemini_model=excluded.gemini_model,
              marble_model=excluded.marble_model,
              updated_at=excluded.updated_at
        ''', (user['id'], PAYLOAD.get('geminiApiKeyCiphertext') or None, PAYLOAD.get('marbleApiKeyCiphertext') or None, PAYLOAD.get('geminiModel') or 'gemini-3.8-flash', PAYLOAD.get('marbleModel') or 'marble-1.1', timestamp))
        db.commit()
        output = {'saved': True}
    elif OPERATION == 'list_projects':
        user = require_user()
        rows = db.execute('SELECT * FROM projects WHERE user_id=? ORDER BY updated_at DESC', (user['id'],)).fetchall()
        output = {'projects': [{'id': row['id'], 'projectName': row['project_name'], 'updatedAt': row['updated_at'], 'assetCount': db.execute('SELECT COUNT(*) FROM assets WHERE project_id=?', (row['id'],)).fetchone()[0], 'assets': [asset_payload(asset) for asset in db.execute('SELECT * FROM assets WHERE project_id=? ORDER BY uploaded_at ASC', (row['id'],)).fetchall()]} for row in rows]}
    elif OPERATION == 'create_project':
        user = require_user()
        project_id = PAYLOAD['projectId']
        name = str(PAYLOAD.get('projectName') or 'Untitled Mining Project')[:120]
        data = PAYLOAD.get('projectData') if isinstance(PAYLOAD.get('projectData'), dict) else {}
        timestamp = now()
        db.execute('INSERT INTO projects(id,user_id,project_name,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?)', (project_id, user['id'], name, json.dumps(data), timestamp, timestamp))
        db.commit()
        output = {'project': {'id': project_id, 'projectName': name, 'updatedAt': timestamp, 'assetCount': 0, 'assets': []}}
    elif OPERATION == 'get_project':
        user = require_user()
        row = db.execute('SELECT * FROM projects WHERE id=? AND user_id=?', (PAYLOAD['projectId'], user['id'])).fetchone()
        if not row: raise ValueError('PROJECT_NOT_FOUND')
        output = {'project': project_payload(row)}
    elif OPERATION == 'save_project':
        user = require_user()
        project_id = PAYLOAD['projectId']
        row = db.execute('SELECT * FROM projects WHERE id=? AND user_id=?', (project_id, user['id'])).fetchone()
        if not row: raise ValueError('PROJECT_NOT_FOUND')
        name = str(PAYLOAD.get('projectName') or row['project_name'])[:120]
        data = PAYLOAD.get('projectData') if isinstance(PAYLOAD.get('projectData'), dict) else {}
        timestamp = now()
        db.execute('UPDATE projects SET project_name=?, data_json=?, updated_at=? WHERE id=? AND user_id=?', (name, json.dumps(data), timestamp, project_id, user['id']))
        if isinstance(data.get('assets'), list):
            for asset in data['assets']:
                if not asset.get('storedName') or not asset.get('id'): continue
                db.execute('UPDATE assets SET name=?,asset_type=?,kind=?,size=? WHERE id=? AND project_id=? AND user_id=?', (asset.get('name', asset['storedName']), asset.get('type', 'application/octet-stream'), asset.get('kind', 'other'), int(asset.get('size', 0)), asset['id'], project_id, user['id']))
        db.commit()
        output = {'project': {'id': project_id, 'projectName': name, 'updatedAt': timestamp, 'assetCount': db.execute('SELECT COUNT(*) FROM assets WHERE project_id=?', (project_id,)).fetchone()[0], 'assets': [asset_payload(asset) for asset in db.execute('SELECT * FROM assets WHERE project_id=? ORDER BY uploaded_at ASC', (project_id,)).fetchall()]}}
    elif OPERATION == 'add_asset':
        user = require_user()
        project_id = PAYLOAD['projectId']
        if not db.execute('SELECT 1 FROM projects WHERE id=? AND user_id=?', (project_id, user['id'])).fetchone(): raise ValueError('PROJECT_NOT_FOUND')
        asset_size = int(PAYLOAD.get('size', 0))
        used = int(db.execute('SELECT COALESCE(SUM(size), 0) FROM assets WHERE user_id=?', (user['id'],)).fetchone()[0] or 0)
        if asset_size < 1: raise ValueError('ASSET_EMPTY')
        if used + asset_size > USER_STORAGE_QUOTA_BYTES:
            remaining = max(0, USER_STORAGE_QUOTA_BYTES - used)
            raise ValueError(f'USER_STORAGE_QUOTA_EXCEEDED:{remaining}')
        db.execute('INSERT INTO assets(id,project_id,user_id,name,stored_name,asset_type,kind,size,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?)', (PAYLOAD['id'], project_id, user['id'], PAYLOAD['name'], PAYLOAD['storedName'], PAYLOAD.get('type', 'application/octet-stream'), PAYLOAD.get('kind', 'other'), asset_size, PAYLOAD.get('uploadedAt') or now()))
        db.commit()
        row = db.execute('SELECT * FROM assets WHERE id=?', (PAYLOAD['id'],)).fetchone()
        output = {'asset': asset_payload(row)}
    elif OPERATION == 'get_asset':
        user = require_user()
        row = db.execute('SELECT assets.* FROM assets WHERE assets.project_id=? AND assets.stored_name=? AND assets.user_id=?', (PAYLOAD['projectId'], PAYLOAD['storedName'], user['id'])).fetchone()
        if not row: raise ValueError('ASSET_NOT_FOUND')
        output = {'asset': asset_payload(row)}
    else:
        raise ValueError('UNKNOWN_DATABASE_OPERATION')
    print(json.dumps({'ok': True, **output}))
except sqlite3.IntegrityError:
    print(json.dumps({'ok': False, 'error': 'USERNAME_ALREADY_EXISTS'}))
    sys.exit(1)
except Exception as error:
    print(json.dumps({'ok': False, 'error': str(error)}))
    sys.exit(1)
finally:
    db.close()
