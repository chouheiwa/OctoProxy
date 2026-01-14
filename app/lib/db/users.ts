import { getDatabase, hashPassword, verifyPassword } from './index'

export interface User {
  id: number
  username: string
  password_hash?: string
  role: 'admin' | 'user'
  is_active: number
  created_at: string
  updated_at?: string
}

export interface SafeUser extends Omit<User, 'password_hash'> {}

export interface CreateUserData {
  username: string
  password: string
  role?: 'admin' | 'user'
  isActive?: boolean
}

export interface UpdateUserData {
  username?: string
  password?: string
  role?: 'admin' | 'user'
  isActive?: boolean
}

export interface UserStats {
  total: number
  admins: number
  users: number
  active: number
}

/**
 * 获取所有用户
 */
export function getAllUsers(): SafeUser[] {
  const db = getDatabase()
  return db
    .prepare(
      `
    SELECT id, username, role, is_active, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
  `
    )
    .all() as SafeUser[]
}

/**
 * 获取用户（通过 ID）
 */
export function getUserById(id: number): SafeUser | null {
  const db = getDatabase()
  return (db
    .prepare(
      `
    SELECT id, username, role, is_active, created_at, updated_at
    FROM users WHERE id = ?
  `
    )
    .get(id) as SafeUser) || null
}

/**
 * 获取用户（通过用户名）- 包含密码哈希
 */
export function getUserByUsername(username: string): User | null {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User) || null
}

/**
 * 创建用户
 */
export function createUser(data: CreateUserData): SafeUser {
  const db = getDatabase()
  const passwordHash = hashPassword(data.password)

  const result = db
    .prepare(
      `
    INSERT INTO users (username, password_hash, role, is_active)
    VALUES (?, ?, ?, ?)
  `
    )
    .run(
      data.username,
      passwordHash,
      data.role || 'user',
      data.isActive !== false ? 1 : 0
    )

  const user = getUserById(result.lastInsertRowid as number)
  if (!user) throw new Error('Failed to create user')
  return user
}

/**
 * 更新用户
 */
export function updateUser(id: number, data: UpdateUserData): SafeUser | null {
  const db = getDatabase()
  const updates: string[] = []
  const values: any[] = []

  if (data.username !== undefined) {
    updates.push('username = ?')
    values.push(data.username)
  }
  if (data.password !== undefined) {
    updates.push('password_hash = ?')
    values.push(hashPassword(data.password))
  }
  if (data.role !== undefined) {
    updates.push('role = ?')
    values.push(data.role)
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?')
    values.push(data.isActive ? 1 : 0)
  }

  if (updates.length === 0) {
    return getUserById(id)
  }

  updates.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return getUserById(id)
}

/**
 * 删除用户
 */
export function deleteUser(id: number): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return result.changes > 0
}

/**
 * 验证用户登录
 */
export function authenticateUser(username: string, password: string): SafeUser | null {
  const user = getUserByUsername(username)
  if (!user || !user.is_active) {
    return null
  }
  if (!verifyPassword(password, user.password_hash!)) {
    return null
  }
  // 返回不含密码的用户信息
  const { password_hash, ...safeUser } = user
  return safeUser as SafeUser
}

/**
 * 获取用户统计信息
 */
export function getUserStats(): UserStats {
  const db = getDatabase()
  return db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
      SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as users,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
    FROM users
  `
    )
    .get() as UserStats
}
