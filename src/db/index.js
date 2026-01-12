import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { getMigrationsDir } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * 获取迁移目录（支持 Electron 环境）
 * @returns {string}
 */
function getMigrationsDirectory() {
  return getMigrationsDir();
}

/**
 * 初始化数据库
 * @param {string} dbPath - 数据库文件路径
 * @returns {Database} 数据库实例
 */
export function initDatabase(dbPath) {
  // 确保数据目录存在
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // 创建数据库连接
  db = new Database(dbPath);

  // 启用 WAL 模式提高并发性能
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 运行迁移
  runMigrations();

  // 确保默认管理员存在
  ensureDefaultAdmin();

  console.log(`[Database] Initialized at ${dbPath}`);
  return db;
}

/**
 * 获取数据库实例
 * @returns {Database}
 */
export function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase first.");
  }
  return db;
}

/**
 * 运行数据库迁移
 */
function runMigrations() {
  // 创建迁移记录表
  db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            applied_at TEXT DEFAULT (datetime('now'))
        )
    `);

  // 获取已应用的迁移
  const applied = db
    .prepare("SELECT name FROM migrations")
    .all()
    .map((r) => r.name);

  // 读取并执行迁移文件
  const migrationsDir = getMigrationsDirectory();
  const migrationFiles = [
    "001_init.sql",
    "002_add_account_email.sql",
    "003_add_usage_cache.sql",
    "004_add_usage_data_cache.sql",
  ];

  for (const migrationFile of migrationFiles) {
    if (!applied.includes(migrationFile)) {
      try {
        const migrationPath = join(migrationsDir, migrationFile);
        if (!existsSync(migrationPath)) {
          console.warn(`[Database] Migration file not found: ${migrationPath}`);
          continue;
        }
        const sql = readFileSync(migrationPath, "utf8");
        db.exec(sql);
        db.prepare("INSERT INTO migrations (name) VALUES (?)").run(
          migrationFile,
        );
        console.log(`[Database] Applied migration: ${migrationFile}`);
      } catch (err) {
        console.error(
          `[Database] Failed to apply migration ${migrationFile}:`,
          err.message,
        );
      }
    }
  }
}

/**
 * 确保默认管理员账户存在
 */
function ensureDefaultAdmin() {
  const admin = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get("admin");

  if (!admin) {
    // 创建默认管理员，密码为 admin123
    const passwordHash = hashPassword("admin123");
    db.prepare(
      `
            INSERT INTO users (username, password_hash, role)
            VALUES (?, ?, 'admin')
        `,
    ).run("admin", passwordHash);
    console.log(
      "[Database] Created default admin user (username: admin, password: admin123)",
    );
  }
}

/**
 * 密码哈希
 * @param {string} password
 * @returns {string}
 */
export function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

/**
 * 验证密码
 * @param {string} password
 * @param {string} hash
 * @returns {boolean}
 */
export function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log("[Database] Connection closed");
  }
}
export default {
  initDatabase,
  getDatabase,
  closeDatabase,
  hashPassword,
  verifyPassword,
};
