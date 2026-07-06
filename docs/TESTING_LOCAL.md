# JZone 本地测试说明

## 测试账号

测试账号由项目维护者在本机会话中提供。不要把明文密码写入仓库、脚本、提交信息或截图说明。

如需运行自动化脚本，请在当前终端临时设置环境变量：

```powershell
$env:JZONE_TEST_EMAIL="测试邮箱"
$env:JZONE_TEST_PASSWORD="测试密码"
$env:JZONE_BASE_URL="http://localhost:3000"
```

## 手工烟测路径

1. 启动项目：

```bash
npm run dev
```

2. 打开：

```text
http://localhost:3000
```

3. 登录测试账号。
4. 验证首页显示“现在就听”。
5. 点击底部导航“资料库”，验证显示“资料库”。
6. 点击底部导航“上传”，验证显示“上传音乐”。
7. 点击底部导航“我的”，验证显示个人资料区域。

## 每次提交前检查

```bash
npm run check
```

通过标准：

- `tsc --noEmit` 无错误。
- `vite build` 成功。
- 构建输出不再出现 500 kB chunk 警告。

## 当前已知提示

- Browserslist 可能提示 `caniuse-lite` 数据过旧，这不是运行错误，可后续单独更新。
- 安全改造项，包括 COS 临时密钥、RLS policy 清理、后端删除代理，已列入后续阶段，不属于当前第一批优化。
