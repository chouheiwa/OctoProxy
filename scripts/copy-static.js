/**
 * 复制前端构建产物到 static 目录
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'web', 'dist');
const targetDir = path.join(projectRoot, 'static');

/**
 * 递归复制目录
 */
function copyDir(src, dest) {
    // 创建目标目录
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 清空目录
 */
function cleanDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
}

// 执行复制
console.log('[copy-static] Copying frontend build to static directory...');
console.log(`  Source: ${sourceDir}`);
console.log(`  Target: ${targetDir}`);

if (!fs.existsSync(sourceDir)) {
    console.error('[copy-static] Error: Source directory does not exist!');
    console.error('  Please run "cd web && npm run build" first.');
    process.exit(1);
}

// 清空并复制
cleanDir(targetDir);
copyDir(sourceDir, targetDir);

console.log('[copy-static] Done!');
