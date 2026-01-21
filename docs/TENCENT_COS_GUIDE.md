# 腾讯云 COS 对象存储接入指南

> **摘要**：本文档记录了将项目文件存储从 Supabase 迁移至腾讯云 COS (Cloud Object Storage) 的完整配置流程。适用于后续重新配置或新项目接入参考。

## 1. 基础设施准备 (腾讯云控制台)

### 1.1 创建存储桶 (Bucket)
1. 进入 **对象存储 COS** 控制台 -> **存储桶列表** -> 点击 **创建存储桶**。
2. **基本信息**：
   - **名称**：起个好记的名字（如 `jzone-music`）。
   - **地域**：选择离用户最近的（如 `ap-chengdu`, `ap-guangzhou`）。
   - **访问权限**：推荐选择 **公有读私有写**（读取速度快）或 **私有读写**（更安全，必须签名访问）。
3. **高级配置**：
   - 全部保持默认即可（不需要开启版本控制、日志等）。
   - **标签**：个人项目留空。

### 1.2 配置跨域访问 (CORS) 🌟关键步骤
前端直接上传文件必须配置此项，否则浏览器会拦截请求。
1. 进入存储桶详情页 -> **安全管理** -> **跨域访问 CORS**。
2. 点击 **添加规则**：
   - **来源 Origin**：填 `*`（允许所有域名，开发最方便）。
   - **操作 Methods**：勾选 `PUT`（上传）、`GET`（下载）、`POST`、`HEAD`。
   - **Allow-Headers**：填 `*`。
   - **Expose-Headers**：保持默认（或确保包含 `ETag`）。
   - **超时 Max-Age**：填 `3600`（缓存预检请求 1 小时）。

### 1.3 获取访问密钥 (API Keys)
1. 点击控制台右上角头像 -> **访问管理** -> **访问密钥** -> **API 密钥管理**。
2. 创建或查看密钥，记录下：
   - **SecretId** (账号 ID)
   - **SecretKey** (账号密码 - **严禁泄露**)

---

## 2. 项目代码集成

### 2.1 安装依赖
```bash
npm install cos-js-sdk-v5
```

### 2.2 环境变量配置
在项目根目录 `.env` 文件中配置连接信息：

```env
VITE_COS_SECRET_ID=AKIDxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COS_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COS_BUCKET=jzone-music-13xxxxxxxxx
VITE_COS_REGION=ap-chengdu
```

### 2.3 核心代码封装 (`cosClient.ts`)
创建一个单例客户端，用于统一管理 COS 操作。

```typescript
import COS from 'cos-js-sdk-v5';

// 初始化实例
const cos = new COS({
  SecretId: import.meta.env.VITE_COS_SECRET_ID,
  SecretKey: import.meta.env.VITE_COS_SECRET_KEY,
});

export const cosClient = {
  // 上传文件
  uploadFile: async (file, path) => {
    return cos.putObject({
      Bucket: import.meta.env.VITE_COS_BUCKET,
      Region: import.meta.env.VITE_COS_REGION,
      Key: path,
      Body: file,
    });
  },
  
  // 获取带签名的访问链接（防盗链/私有读模式必须）
  getSignedUrl: async (path) => {
    return cos.getObjectUrl({
      Bucket: import.meta.env.VITE_COS_BUCKET,
      Region: import.meta.env.VITE_COS_REGION,
      Key: path,
      Sign: true, 
    });
  }
};
```

### 2.4 业务逻辑适配 (`supabaseApi.ts`)
在原有的 Supabase 逻辑中通过 `if (cosClient.isEnabled)` 插入拦截逻辑，优先使用 COS 进行上传和播放 URL 生成。

---

## 3. 安全最佳实践 (生产环境必读) 🛡️

当前方案为了开发便利，将 **永久密钥 (SecretKey)** 配置在了前端。
**风险**：用户可通过浏览器调试工具获取 Key，从而完全控制存储桶。

### 🚀 进阶：如何升级为安全模式？
在正式上线前，建议搭建 **STS (Security Token Service)** 服务：

1. **后端 (Edge Function/Node.js)**：
   - 使用长期密钥初始化 SDK。
   - 提供一个接口 `/api/get-cos-sts`。
   - 接口调用 `sts.getCredential` 生成**临时密钥**（有效期如 15 分钟），仅授予特定路径（如 `user_123/*`）的权限。

2. **前端**：
   - 不再持有 SecretKey。
   - 初始化 COS 时传入 `getAuthorization` 回调函数。
   - 在回调中请求后端的 `/api/get-cos-sts` 获取临时凭证。

这样即使凭证泄露，攻击者也只能在短时间内操作特定文件夹，极大降低风险。
