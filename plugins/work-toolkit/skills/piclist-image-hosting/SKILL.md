---
name: piclist-image-hosting
description: |
  将 Markdown 中的本地图片通过 PicList 上传到图床（GitLab），用永久在线 URL 替换本地路径。
  依赖本地运行的 PicList App（HTTP API 127.0.0.1:36677），复用 PicList/Typora 已有的图床配置。
  当 Markdown 内容中包含本地图片路径（如 ./images/chart.png、/Users/.../screenshot.png）
  且需要发送到外部平台时，必须先用此 skill 处理。
  适用场景：写入钉钉文档、发送邮件、分享报告，或任何需要把本地图片变成可公网访问链接的情况。
  特别注意：上传 Markdown 到钉钉文档前，如果包含本地图片，必须先用此 skill 处理。
  触发词：本地图片上传、图片转链接、图床、piclist、markdown图片替换、
  upload images、image hosting、钉钉文档图片、钉钉图片。
  特点：使用 PicList 上传到 GitLab 图床，链接永久有效，无需任何 API key 配置。
---

# PicList Image Hosting

将 Markdown 中的本地图片通过 PicList 上传到图床，用永久在线 URL 替换本地路径。

## 工作原理

1. 解析 Markdown 中的 `![alt](path)` 和 `<img src="path">` 图片引用
2. 筛选出本地文件路径（自动跳过 http/https/data: URL）
3. 调用 PicList HTTP API（`127.0.0.1:36677`）上传图片
4. 用返回的永久 URL 替换原始本地路径
5. 输出处理后的 Markdown 到 stdout

## 前置条件

- PicList App 正在运行（macOS 菜单栏可见图标）
- PicList 已配置好图床（当前配置为 GitLab）

## 使用方式

脚本路径: `{baseDir}/scripts/md_upload_images.py`

无需特殊 Python 环境，仅使用标准库。

```bash
# 直接上传图片文件，返回 URL（每行一个）
python3 {baseDir}/scripts/md_upload_images.py --files image1.png image2.jpg

# 处理 markdown 文件，替换本地图片为在线 URL，输出到 stdout
python3 {baseDir}/scripts/md_upload_images.py --content-file report.md

# 直接传入 markdown 文本
python3 {baseDir}/scripts/md_upload_images.py --content "![图](./chart.png)"

# 处理后写入新文件
python3 {baseDir}/scripts/md_upload_images.py --content-file report.md > report_uploaded.md
```

## 与钉钉文档配合

在将 Markdown 上传到钉钉文档前，先用此 skill 处理图片：

```bash
# 先处理图片，再写入钉钉文档
python3 {baseDir}/scripts/md_upload_images.py --content-file report.md > /tmp/report_uploaded.md
# 然后用处理后的文件上传钉钉
```

## 注意事项

- GitLab 图床链接永久有效，不会过期
- 单张图片上传失败不阻断整体流程，失败的保留原路径并在 stderr 输出警告
- 相对路径基于 `--content-file` 所在目录解析
- 支持 `file://` URI 和 URL 编码路径
- 无需任何环境变量或 API key，完全依赖 PicList App 已有配置
- 如果 PicList App 未运行，脚本会报错提示
