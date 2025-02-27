# Obsidian WriteUp Helper

![Extension Icon](icon48.png)  
一款为CTF选手设计的浏览器扩展，快速生成标准化的WriteUp模板并一键保存至Obsidian知识库。

## ✨ 功能特性
- **智能标题解析** - 自动提取网页标题中的题目名称，支持中括号层级识别（如`[Web][SQLi]题目名` → `Web-SQLi-题目名`）
- **模板标准化** - 预置结构化模板（基本信息/解题思路/过程记录/总结）
- **深度Obsidian集成** - 一键创建Markdown文件并跳转至Obsidian编辑
- **SPA兼容** - 适配单页应用动态加载场景，自动监听URL变化
- **定制化样式** - 悬浮按钮支持CSS动画与响应式交互

## 🛠️ 安装指南
### Chrome浏览器手动安装
1. 克隆本仓库到本地
2. 访问 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择仓库目录

### Firefox安装（需打包）
```bash
npm install -g web-ext
web-ext build
# 生成的ZIP文件可在about:debugging加载
```

## 🚀 使用说明
1. 访问NSSCTF题目页面（如`https://www.nssctf.cn/problem/1234`）
2. 点击页面右上角紫色悬浮按钮
3. 自动生成包含以下内容的Obsidian笔记：
```markdown
## 基本信息
- 题目名称：Web-SQLi-示例题目
- 题目链接：https://www.nssctf.cn/problem/1234
- 考点清单：
### 解题思路

### 过程和结果记录

### 总结
```

## ⚙️ 高级配置
### 自定义模板
1. 修改 `content.js` 中的 `generateTemplate` 函数
2. 支持动态变量：
   - `${title}`: 格式化后的标题
   - `${url}`: 当前页面URL
   - `${date}`: ISO格式日期（需自行添加）

### 样式调整
编辑 `styles.css` 可自定义：
```css
/* 示例：修改按钮颜色 */
.writeup-helper-btn {
  background-color: #10b981; /* Emerald Green */
  top: 50px; /* 调整垂直位置 */
}
```

## 🤝 开发贡献
### 项目结构
```
.
├── content.js        # 核心功能脚本
├── manifest.json     # 扩展配置文件
├── styles.css        # 按钮样式表
└── repomix.config.json # 文档生成配置
```

### 开发流程
1. 安装依赖（如需构建）
```bash
npm install
```
2. 启用实时重载：
   - Chrome: 使用[Extension Reloader](https://chrome.google.com/webstore/detail/extensions-reloader/fimgfedafeadlieiabdeeaodndnlbhid)
   - Firefox: `web-ext run`

## ⚠️ 注意事项
- 确保Obsidian已安装并配置名为"note"的库（可在代码中修改`vault`参数）
- 文件名特殊字符处理逻辑可能需要根据平台调整（如Windows文件命名限制）

## 📜 许可证
MIT License © 2025 tabtac