# macOS 代码签名和公证配置指南

本文档说明如何为 OctoProxy 配置 Apple 代码签名和公证，确保应用可以在其他 Mac 上正常运行，不会被 Gatekeeper 阻止。

## 前提条件

- ✅ Apple Developer Program 账户（已付费）
- ✅ 能够访问 Apple Developer 网站
- ✅ macOS 系统（用于导出证书）

## 第一步：创建证书

### 1.1 在 Apple Developer 网站创建证书

1. 访问 [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
2. 点击 **+** 按钮创建新证书
3. 选择 **Developer ID Application** （用于分发到 Mac App Store 之外）
4. 按照向导完成证书创建
5. 下载生成的 `.cer` 文件

### 1.2 安装证书到钥匙串

1. 双击下载的 `.cer` 文件
2. 证书会自动导入到"钥匙串访问"（Keychain Access）
3. 在"钥匙串访问"中，确保证书显示在 **登录 → 我的证书** 下
4. 证书名称应该类似：`Developer ID Application: Your Name (TEAM_ID)`

### 1.3 导出证书为 .p12 格式

1. 打开"钥匙串访问"应用
2. 在左侧选择 **登录 → 我的证书**
3. 找到你的 `Developer ID Application` 证书
4. 右键点击证书 → **导出 "Developer ID Application: ..."**
5. 选择文件格式：**个人信息交换 (.p12)**
6. 保存到桌面，文件名如 `apple-cert.p12`
7. 设置密码（**重要：记住这个密码**）
8. 输入系统密码完成导出

## 第二步：获取所需信息

### 2.1 获取 CSC_LINK（证书 base64 编码）

在终端执行以下命令：

```bash
base64 -i ~/Desktop/apple-cert.p12 | pbcopy
```

这会将证书的 base64 编码复制到剪贴板。

### 2.2 获取 APPLE_TEAM_ID

1. 访问 https://developer.apple.com/account
2. 在页面顶部或侧边栏点击 **Membership**
3. 找到 **Team ID**（10 位字符，如 `AB12CD34EF`）
4. 复制保存

### 2.3 获取 APPLE_APP_SPECIFIC_PASSWORD（应用专用密码）

1. 访问 https://appleid.apple.com/account/manage
2. 登录你的 Apple ID
3. 在"安全"部分，找到 **应用专用密码**
4. 点击 **生成密码**
5. 输入标签名（如 "OctoProxy GitHub Actions"）
6. 复制生成的密码（**重要：立即保存，密码只显示一次**）

## 第三步：配置 GitHub Secrets

1. 访问你的 GitHub 仓库
2. 进入 **Settings → Secrets and variables → Actions**
3. 点击 **New repository secret** 添加以下 secrets：

| Secret 名称 | 值 | 说明 |
|------------|-----|------|
| `CSC_LINK` | 第 2.1 步复制的 base64 字符串 | 证书文件 |
| `CSC_KEY_PASSWORD` | 导出 .p12 时设置的密码 | 证书密码 |
| `APPLE_ID` | 你的 Apple ID 邮箱 | 用于公证 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 第 2.3 步生成的密码 | 应用专用密码 |
| `APPLE_TEAM_ID` | 第 2.2 步获取的 Team ID | 团队 ID |

### 添加 Secret 的步骤：

1. 点击 **New repository secret**
2. 输入 **Name**（如 `CSC_LINK`）
3. 粘贴 **Value**
4. 点击 **Add secret**
5. 重复以上步骤添加所有 5 个 secrets

## 第四步：验证配置

配置完成后，当你推送新的 tag 时：

```bash
git tag v1.1.1
git push origin v1.1.1
```

GitHub Actions 会自动：
1. ✅ 使用证书签名应用
2. ✅ 上传到 Apple 进行公证
3. ✅ 等待公证完成
4. ✅ 将公证凭证附加到应用
5. ✅ 创建 DMG 和 ZIP 文件
6. ✅ 上传到 GitHub Release

## 常见问题

### Q: 公证需要多长时间？
A: 通常 2-10 分钟，繁忙时可能更长。GitHub Actions 会自动等待完成。

### Q: 如果公证失败怎么办？
A: 检查 GitHub Actions 日志，常见原因：
- Apple ID 或密码错误
- Team ID 不匹配
- 应用不符合公证要求（通常是权限问题）

### Q: 如何在本地测试签名？
A: 设置环境变量后执行构建：

```bash
export CSC_LINK="$(base64 -i ~/Desktop/apple-cert.p12)"
export CSC_KEY_PASSWORD="your-password"
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="AB12CD34EF"

npm run electron:build:mac
```

### Q: 用户下载后还是提示"无法验证开发者"？
A: 可能原因：
1. 公证未完成就下载了（等待 Actions 完成）
2. 用户使用的是旧版本（没有签名的版本）
3. 证书已过期（Developer ID 证书有效期 5 年）

### Q: 证书过期后怎么办？
A: 重新创建证书，按照本文档步骤更新 GitHub Secrets。

## 安全提示

⚠️ **重要安全建议**：

1. **永远不要**将 `.p12` 文件或密码提交到 Git 仓库
2. **永远不要**在代码中硬编码任何 Secret
3. `.p12` 文件导出完成后，建议存储在安全的密码管理器中
4. 定期检查 GitHub Secrets 的访问权限
5. 如果证书泄露，立即在 Apple Developer 网站撤销证书

## 参考资源

- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [electron-notarize](https://github.com/electron/notarize)

## 验证签名

用户下载 DMG 后，可以验证签名：

```bash
# 验证代码签名
codesign -vvv --deep --strict /Applications/OctoProxy.app

# 验证公证
spctl -a -vvv -t install /Applications/OctoProxy.app

# 查看签名信息
codesign -dvv /Applications/OctoProxy.app
```

成功的输出应该包含：
- `Developer ID Application: Your Name (TEAM_ID)`
- `Notarized: Accepted`
- `source=Notarized Developer ID`
