# 媒体资产与费用治理

## 页面入口

登录后进入个人页设置，展开“高级设置”，打开“媒体资产治理”。直接路径为 `/media-governance`，不出现在底部导航。

## 历史资源流程

1. 使用 `npm run audit:cos-history-live -- --output <报告路径>` 生成只读扫描报告。
2. 在治理页导入报告，查看重复封面、高码率音频和预估节省。
3. 使用 `npm run preview:cos-history-migration -- --report <报告路径> --output <预览路径>` 生成迁移预览。
4. 预览文件不可执行。真正迁移前仍需人工确认每项引用、播放副本和删除候选。

## 费用接口

浏览器只直接读取低频缓存的桶存储量。腾讯云流量、请求数和账单必须由受保护的服务端聚合接口提供，配置：

```env
VITE_MEDIA_GOVERNANCE_ENDPOINT=https://example.com/media-governance/summary
```

接口返回：

```json
{
  "updatedAt": "2026-08-30T00:00:00.000Z",
  "trafficBytes": 0,
  "requestCount": 0,
  "storageBytes": 0,
  "costCny": 0,
  "trend": []
}
```

不要把腾讯云 SecretKey 放进 Vite 环境变量或浏览器代码。

## 封面清理约束

- 新封面上传并完成数据库更新后，才检查旧封面。
- 删除前通过 `get_media_cover_reference_count` 统计歌曲和专辑的全局引用。
- 引用数异常时保守保留；引用数为零才允许删除。
- 上传失败回滚时不删除内容寻址共享封面，因为它可能在上传前已存在并被其他内容复用。
