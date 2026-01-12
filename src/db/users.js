import { getDatabase, hashPassword, verifyPassword } from './index.js';

/**
 * 获取所有用户
 * @returns {Array}
 */
export function getAllUsers() {
    const db = getDatabase();
    return db.prepare(`
        SELECT id, username, role, is_active, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
    `).all();
}

/**
 * 获取用户（通过 ID）
 * @param {number} id
 * @returns {Object|null}
 */
export function getUserById(id) {
    const db = getDatabase();
    return db.prepare(`
        SELECT id, username, role, is_active, created_at, updated_at
        FROM users WHERE id = ?
    `).get(id);
}

/**
 * 获取用户（通过用户名）
 * @param {string} username
 * @returns {Object|null}
 */
export function getUserByUsername(username) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/**
 * 创建用户
 * @param {Object} data
 * @returns {Object}
 */
export function createUser(data) {
    const db = getDatabase();
    const passwordHash = hashPassword(data.password);

    const result = db.prepare(`
        INSERT INTO users (username, password_hash, role, is_active)
        VALUES (?, ?, ?, ?)
    `).run(
        data.username,
        passwordHash,
        data.role || 'user',
        data.isActive !== false ? 1 : 0
    );

    return getUserById(result.lastInsertRowid);
}

/**
 * 更新用户
 * @param {number} id
 * @param {Object} data
 * @returns {Object|null}
 */
export function updateUser(id, data) {
    const db = getDatabase();
    const updates = [];
    const values = [];

    if (data.username !== undefined) {
        updates.push('username = ?');
        values.push(data.username);
    }
    if (data.password !== undefined) {
        updates.push('password_hash = ?');
        values.push(hashPassword(data.password));
    }
    if (data.role !== undefined) {
        updates.push('role = ?');
        values.push(data.role);
    }
    if (data.isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
        return getUserById(id);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getUserById(id);
}

/**
 * 删除用户
 * @param {number} id
 * @returns {boolean}
 */
export function deleteUser(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
}

/**
 * 验证用户登录
 * @param {string} username
 * @param {string} password
 * @returns {Object|null}
 */
export function authenticateUser(username, password) {
    const user = getUserByUsername(username);
    if (!user || !user.is_active) {
        return null;
    }
    if (!verifyPassword(password, user.password_hash)) {
        return null;
    }
    // 返回不含密码的用户信息
    const { password_hash, ...safeUser } = user;
    return safeUser;
}

/**
 * 获取用户统计信息
 * @returns {Object}
 */
export function getUserStats() {
    const db = getDatabase();
    return db.prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
            SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as users,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
        FROM users
    `).get();
}

export default {
    getAllUsers,
    getUserById,
    getUserByUsername,
    createUser,
    updateUser,
    deleteUser,
    authenticateUser,
    getUserStats
};
