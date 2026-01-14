#!/usr/bin/env node

/**
 * 图标生成脚本
 * 从 assets/icon-original.png 生成所有平台所需的图标
 *
 * 支持环境：
 * - macOS: 使用 sips + iconutil (系统自带)
 * - Linux (GitHub Actions): 使用 ImageMagick + png2icns
 * - Windows: 使用 ImageMagick
 *
 * GitHub Actions 依赖安装：
 *   Ubuntu: sudo apt-get install -y imagemagick icnsutils
 *   macOS: 系统自带，无需安装
 *   Windows: choco install imagemagick
 *
 * 使用方法：
 *   node scripts/generate-icons.js
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const assetsDir = path.join(rootDir, "assets");

const SOURCE_ICON = path.join(assetsDir, "icon-original.png");
const platform = os.platform();

// 检查源文件是否存在
if (!fs.existsSync(SOURCE_ICON)) {
  console.error(`错误: 源图标文件不存在: ${SOURCE_ICON}`);
  console.error("请先将原始图标放置到 assets/icon-original.png");
  process.exit(1);
}

console.log(`🎨 开始生成图标... (平台: ${platform})\n`);

/**
 * 执行命令并打印输出
 */
function run(cmd, description) {
  console.log(`  ${description}...`);
  try {
    execSync(cmd, { stdio: "pipe", shell: true });
    return true;
  } catch (error) {
    console.error(`    ❌ 失败: ${error.message}`);
    return false;
  }
}

/**
 * 检查命令是否可用
 */
function commandExists(cmd) {
  try {
    const checkCmd = platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * 使用可用工具调整图片大小
 */
function resizeImage(source, output, size) {
  if (hasSips) {
    return run(
      `sips -z ${size} ${size} "${source}" --out "${output}"`,
      `生成 ${path.basename(output)}`,
    );
  } else if (hasMagick) {
    return run(
      `magick "${source}" -resize ${size}x${size} "${output}"`,
      `生成 ${path.basename(output)}`,
    );
  } else if (hasConvert) {
    return run(
      `convert "${source}" -resize ${size}x${size} "${output}"`,
      `生成 ${path.basename(output)}`,
    );
  }
  return false;
}

// 检查可用工具
const hasSips = commandExists("sips");
const hasIconutil = commandExists("iconutil");
const hasMagick = commandExists("magick");
const hasConvert = commandExists("convert"); // ImageMagick legacy command
const hasPng2icns = commandExists("png2icns"); // Linux icnsutils

console.log("🔍 检测可用工具:");
console.log(`  - sips: ${hasSips ? "✅" : "❌"}`);
console.log(`  - iconutil: ${hasIconutil ? "✅" : "❌"}`);
console.log(`  - magick: ${hasMagick ? "✅" : "❌"}`);
console.log(`  - convert: ${hasConvert ? "✅" : "❌"}`);
console.log(`  - png2icns: ${hasPng2icns ? "✅" : "❌"}`);
console.log();

if (!hasSips && !hasMagick && !hasConvert) {
  console.error("❌ 错误: 没有可用的图像处理工具");
  console.error("请安装 ImageMagick:");
  console.error("  - macOS: brew install imagemagick");
  console.error("  - Ubuntu: sudo apt-get install imagemagick");
  console.error("  - Windows: choco install imagemagick");
  process.exit(1);
}

// 1. 生成主图标 (512x512)
console.log("📦 生成主图标 (512x512)...");
const mainIcon = path.join(assetsDir, "icon.png");
resizeImage(SOURCE_ICON, mainIcon, 512);

// 2. 生成托盘图标 (22x22)
console.log("\n🔔 生成托盘图标 (22x22)...");
const trayIcon = path.join(assetsDir, "tray-icon.png");
resizeImage(SOURCE_ICON, trayIcon, 22);

// 2.1 生成 macOS Template 托盘图标 (18x18, 单色)
console.log("\n🍎 生成 macOS Template 托盘图标...");
const trayTemplateIcon = path.join(assetsDir, "tray-iconTemplate.png");
const trayTemplateIcon2x = path.join(assetsDir, "tray-iconTemplate@2x.png");

// macOS Template 图标需要是黑色图形 + 透明背景
// 将彩色图标转换为：保留形状作为黑色，背景透明
if (hasMagick) {
  run(
    `magick "${SOURCE_ICON}" -resize 18x18 -alpha extract -negate -background none -alpha shape "${trayTemplateIcon}"`,
    "生成 tray-iconTemplate.png (18x18)"
  );
  run(
    `magick "${SOURCE_ICON}" -resize 36x36 -alpha extract -negate -background none -alpha shape "${trayTemplateIcon2x}"`,
    "生成 tray-iconTemplate@2x.png (36x36)"
  );
} else if (hasConvert) {
  run(
    `convert "${SOURCE_ICON}" -resize 18x18 -alpha extract -negate -background none -alpha shape "${trayTemplateIcon}"`,
    "生成 tray-iconTemplate.png (18x18)"
  );
  run(
    `convert "${SOURCE_ICON}" -resize 36x36 -alpha extract -negate -background none -alpha shape "${trayTemplateIcon2x}"`,
    "生成 tray-iconTemplate@2x.png (36x36)"
  );
} else if (hasSips) {
  // sips 不支持单色转换，只生成普通尺寸
  console.log("  ⚠️  sips 不支持单色转换，跳过 Template 图标生成");
  console.log("     建议安装 ImageMagick: brew install imagemagick");
}

// 3. 生成 Linux 多尺寸图标
console.log("\n🐧 生成 Linux 图标...");
const iconsDir = path.join(assetsDir, "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const linuxSizes = [16, 32, 48, 64, 128, 256, 512];
for (const size of linuxSizes) {
  const outputPath = path.join(iconsDir, `${size}x${size}.png`);
  resizeImage(SOURCE_ICON, outputPath, size);
}

// 4. 生成 macOS .icns 文件
console.log("\n🍎 生成 macOS 图标 (.icns)...");
const icnsPath = path.join(assetsDir, "icon.icns");

if (hasSips && hasIconutil) {
  // macOS 原生方式
  const iconsetDir = path.join(assetsDir, "icon.iconset");

  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true });
  }
  fs.mkdirSync(iconsetDir);

  const macSizes = [
    { name: "icon_16x16.png", size: 16 },
    { name: "icon_16x16@2x.png", size: 32 },
    { name: "icon_32x32.png", size: 32 },
    { name: "icon_32x32@2x.png", size: 64 },
    { name: "icon_128x128.png", size: 128 },
    { name: "icon_128x128@2x.png", size: 256 },
    { name: "icon_256x256.png", size: 256 },
    { name: "icon_256x256@2x.png", size: 512 },
    { name: "icon_512x512.png", size: 512 },
    { name: "icon_512x512@2x.png", size: 1024 },
  ];

  for (const { name, size } of macSizes) {
    const outputPath = path.join(iconsetDir, name);
    if (hasSips) {
      run(
        `sips -z ${size} ${size} "${SOURCE_ICON}" --out "${outputPath}"`,
        `生成 ${name}`,
      );
    }
  }

  run(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, "生成 icon.icns");
  fs.rmSync(iconsetDir, { recursive: true });
  console.log("  清理临时文件...");
} else if (hasPng2icns) {
  // Linux 使用 png2icns (icnsutils)
  // png2icns 需要特定尺寸的 PNG 文件
  const tempDir = path.join(assetsDir, "temp-icns");
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  // png2icns 支持的尺寸: 16, 32, 48, 128, 256, 512, 1024
  const icnsSizes = [16, 32, 48, 128, 256, 512];
  const pngFiles = [];

  for (const size of icnsSizes) {
    const pngPath = path.join(tempDir, `icon_${size}.png`);
    resizeImage(SOURCE_ICON, pngPath, size);
    pngFiles.push(pngPath);
  }

  run(
    `png2icns "${icnsPath}" ${pngFiles.map((f) => `"${f}"`).join(" ")}`,
    "生成 icon.icns",
  );

  fs.rmSync(tempDir, { recursive: true });
  console.log("  清理临时文件...");
} else {
  console.log("  ⏭️  跳过 (需要 iconutil 或 png2icns)");
  console.log("     Ubuntu 安装: sudo apt-get install icnsutils");
}

// 5. 生成 Windows .ico 文件
console.log("\n🪟 生成 Windows 图标 (.ico)...");
const icoPath = path.join(assetsDir, "icon.ico");

if (hasMagick) {
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const resizeArgs = icoSizes
    .map((s) => `\\( "${SOURCE_ICON}" -resize ${s}x${s} \\)`)
    .join(" ");

  run(`magick ${resizeArgs} "${icoPath}"`, "生成 icon.ico");
} else if (hasConvert) {
  // 使用 convert 命令 (ImageMagick legacy)
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const tempDir = path.join(assetsDir, "temp-ico");

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  const pngFiles = [];
  for (const size of icoSizes) {
    const pngPath = path.join(tempDir, `icon_${size}.png`);
    run(
      `convert "${SOURCE_ICON}" -resize ${size}x${size} "${pngPath}"`,
      `生成 ${size}x${size}`,
    );
    pngFiles.push(pngPath);
  }

  run(
    `convert ${pngFiles.map((f) => `"${f}"`).join(" ")} "${icoPath}"`,
    "生成 icon.ico",
  );

  fs.rmSync(tempDir, { recursive: true });
  console.log("  清理临时文件...");
} else {
  console.log("  ⏭️  跳过 (需要 ImageMagick)");
}

// 完成
console.log("\n✅ 图标生成完成！\n");
console.log("生成的文件：");
console.log("  - assets/icon.png (512x512, Electron 主图标)");
console.log("  - assets/tray-icon.png (22x22, 系统托盘)");
if (fs.existsSync(trayTemplateIcon)) {
  console.log("  - assets/tray-iconTemplate.png (18x18, macOS 菜单栏)");
  console.log("  - assets/tray-iconTemplate@2x.png (36x36, macOS Retina)");
}
if (fs.existsSync(icnsPath)) {
  console.log("  - assets/icon.icns (macOS)");
}
if (fs.existsSync(icoPath)) {
  console.log("  - assets/icon.ico (Windows)");
}
console.log("  - assets/icons/*.png (Linux 多尺寸)");
