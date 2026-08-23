# MIAOQI 插件市场（plugin-market）

这是 **MIAOQI 轻量漫画阅读器** 自有的插件市场仓库（参考
[deretame/Breeze-plugin-list](https://github.com/deretame/Breeze-plugin-list) 的
结构与协议）。把本目录发布为一个 GitHub 仓库后，用户即可在 App 的
“设置 → 插件源 → 插件市场”中填入该仓库的 `plugins_data.json` 地址来浏览、
安装漫画源插件。

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `plugins_data.json` | **市场列表**（核心，App 只读取这个文件） |
| `plugins/*.cjs` | **第一方插件的 bundle 源码**（通过 `bundleUrl` 直接下载安装） |
| `README.md` | 本说明 |

> `deretame/Breeze-plugin-list` 仓库还包含 `get-list.js` 等自动收集脚本；
> 对小规模市场，直接手动维护 `plugins_data.json` 就够了。

---

## 市场列表格式

```json
{
  "plugins": [
    {
      "repo": "owner/repo-name",
      "manifest": {
        "name": "插件显示名",
        "uuid": "插件的唯一 uuid",
        "iconUrl": "图标地址（可选）",
        "creator": { "name": "作者", "describe": "作者简介（可选）" },
        "describe": "插件描述",
        "version": "展示版本（可选，实际以 Release tag 为准）",
        "home": "项目主页（可选）",
        "updateUrl": "GitHub releases/latest 地址（可选，用于检查更新）",
        "bundleUrl": "bundle 直链（可选）——仓库内文件时填 raw 地址，App 直接下载，无需 Release",
        "npmName": "包名（保留字段，可选）"
      }
    }
  ]
}
```

**关键约定**：
- `repo` 对应一个 **GitHub 仓库**，且该仓库的 **Releases** 里上传了
  `.cjs` 或 `.js` 结尾的 bundle 资产——App 安装时自动寻找该资产下载。
- **第一方插件**（本仓库 `plugins/` 下的 bundle）在 manifest 里填
  `bundleUrl`（如 `https://raw.githubusercontent.com/Naohuah/MIAOQI-plugin-list/main/plugins/dm5.cjs`），
  App 会跳过 Release 解析直接下载该文件安装。
- `manifest.uuid` 应与插件内部 `getInfo()` 返回的 uuid 一致（App 用它识别
  “已安装”状态、按源管理书架数据）。

---

## 如何添加一个插件

1. 第三方插件：作者把 bundle 发布到 GitHub 仓库的 Release（tag 如 `1.0.0`，
   asset 含 `xxx.bundle.cjs`），在本文件加一条 `repo` + `manifest`。
2. 第一方插件：把 bundle 放到本仓库 `plugins/` 目录（如 `plugins/dm5.cjs`），
   在 manifest 里填 `bundleUrl` 指向该文件的 raw 地址。
3. 提交并推送，市场即刻生效（App 端点击刷新即可看到）。

## 如何发布你的市场

1. 新建 GitHub 仓库（如 `your-name/MIAOQI-plugin-list`）。
2. 上传本目录内容（至少 `plugins_data.json`）。
3. 在 App 的“插件市场”输入框填入：
   `https://raw.githubusercontent.com/your-name/MIAOQI-plugin-list/main/plugins_data.json`
4. 点“加载”即可浏览安装。

> 也可把默认市场 URL 直接指向你的仓库（在 App 设置里首次填入后会自动记住）。

---

## 选择 Breeze 插件

本App 的市场 URL 可以是**任意兼容的 Breeze 插件列表**。官方的 Breeze 索引收录了
17 个现成插件（禁漫天堂 / 哔咔漫画 / 拷贝漫画 / 漫画柜 / 如漫画 / 绅士漫画 /
蛙漫 / e-hentai / nhentai / Toomics / WEBTOON 等），在 App 的「插件市场」输入框填入：

```
https://raw.githubusercontent.com/deretame/Breeze-plugin-list/main/plugins_data.json
```

点「加载」即可浏览安装（这些插件需要在 App 端正确初始化宿主桥，详见
`PLUGIN_MARKET_README.md`）。注意：其中成人向网站（e-hentai、nhentai 等）请按需选用。

---

## 插件开发（Breeze 协议）

插件是打包成单个 `.cjs` 的 JavaScript，需实现：
`getInfo` / `searchComic` / `getComicDetail` / `getChapter` / `fetchImageBytes`。
详见项目根目录 `PLUGIN_MARKET_README.md`。
