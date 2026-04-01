---
name: oss-image-hosting
description: |
  将 Markdown 中的本地图片上传到阿里云 OSS，生成短效签名 URL 并替换原始路径。
  上传的文件会在 1 天后自动过期删除（OSS 生命周期规则），因为下游平台抓取后已有副本。
  当 Markdown 内容中包含本地图片路径（如 ./images/chart.png、/Users/.../screenshot.png）
  且需要发送到外部平台时，必须先用此 skill 处理。适用场景包括：写入钉钉文档、发送邮件、
  分享报告，或任何需要把本地图片变成可公网访问链接的情况。
  触发词：本地图片上传、图片转链接、签名URL、图床、markdown图片替换、
  upload images to OSS、image hosting、signed URL。
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "python3 ${CLAUDE_SKILL_DIR}/scripts/ensure_oss_env.py"
---

# OSS Image Hosting

将 Markdown 中的本地图片上传到阿里云 OSS，生成 1 小时有效的签名 URL 并替换，使外部平台能正常抓取和显示图片。

## 工作原理

1. 解析 Markdown 中的 `![alt](path)` 和 `<img src="path">` 图片引用
2. 筛选出本地文件路径（自动跳过 http/https URL）
3. 上传到 OSS `images/ephemeral/{hash}_{filename}`（content hash 避免冲突）
4. 生成 1 小时有效的签名 URL 替换原始路径
5. 输出处理后的 Markdown 到 stdout

上传的文件配合 OSS 生命周期规则 1 天后自动删除。下游平台在抓取图片后会保存副本，无需长期保留。

## 使用方式

脚本位于 `scripts/md_upload_images.py`（相对于本 skill 目录）。

```bash
# 处理 markdown 文件，输出替换后内容到 stdout
python3 ${CLAUDE_SKILL_DIR}/scripts/md_upload_images.py --content-file report.md

# 直接传入 markdown 文本
python3 ${CLAUDE_SKILL_DIR}/scripts/md_upload_images.py --content "![图](./chart.png)"

# 一次性设置 OSS 生命周期规则（首次使用时自动执行，也可手动运行）
python3 ${CLAUDE_SKILL_DIR}/scripts/md_upload_images.py --setup-lifecycle
```

## 与其他 skill 配合

在将 Markdown 发送到外部平台前，先用此 skill 处理图片：

```bash
# 先处理图片，再写入钉钉文档
processed=$(python3 ${CLAUDE_SKILL_DIR}/scripts/md_upload_images.py --content-file report.md)
python3 doc_create_and_write.py --name "周报" --content "$processed"
```

## 注意事项

- 签名 URL 有效期 1 小时，足够下游平台抓取
- 单张图片上传失败不阻断整体流程，失败的保留原路径并在 stderr 输出警告
- 相对路径基于 `--content-file` 所在目录解析
- 环境配置（oss2 安装 + .env 创建 + lifecycle 规则）由 PreToolUse hook 全自动处理
