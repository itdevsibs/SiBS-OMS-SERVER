import crypto from 'node:crypto';

export function encryptHrisStylePassword(password, encryption) {
  const key = Buffer.from(crypto.createHash('sha256').update(encryption.key).digest('hex'), 'utf8').subarray(0, 32);
  const iv = Buffer.from(crypto.createHash('sha256').update(encryption.iv).digest('hex').substring(0, 16), 'utf8');
  const cipher = crypto.createCipheriv(encryption.method, key, iv);
  const encrypted = cipher.update(password, 'utf8', 'base64') + cipher.final('base64');
  return Buffer.from(encrypted, 'utf8').toString('base64');
}

function toIdentity(row) {
  if (!row || !String(row.gy_user_code ?? '').trim()) return null;
  return {
    id: String(row.gy_user_id),
    sibs_id: String(row.gy_user_code).trim(),
    name: String(row.gy_full_name || '').trim(),
    username: String(row.gy_username || '').trim()
  };
}

export function createKronosAuth(pool, encryption) {
  return {
    async login(username, password) {
      const [rows] = await pool.execute(
        `SELECT gy_user_id, gy_user_code, gy_username, gy_full_name, gy_password
           FROM gy_user
          WHERE (TRIM(gy_user_code)=TRIM(?) OR TRIM(gy_username)=TRIM(?))
            AND gy_user_status=0 LIMIT 1`,
        [username, username]
      );
      const row = rows[0];
      if (!row) return null;
      const expected = encryptHrisStylePassword(password, encryption);
      const actual = Buffer.from(String(row.gy_password ?? ''), 'utf8');
      const provided = Buffer.from(expected, 'utf8');
      if (actual.length !== provided.length || !crypto.timingSafeEqual(actual, provided)) return null;
      return toIdentity(row);
    },
    async findActiveUser(id, sibsId) {
      const [rows] = await pool.execute(
        `SELECT gy_user_id, gy_user_code, gy_username, gy_full_name
           FROM gy_user
          WHERE gy_user_id=? AND TRIM(gy_user_code)=TRIM(?)
            AND gy_user_status=0 LIMIT 1`,
        [id, sibsId]
      );
      return toIdentity(rows[0]);
    }
  };
}
