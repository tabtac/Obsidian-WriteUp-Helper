function createButton() {
    // 检查document.body是否存在
    if (!document.body) {
        return;
    }

    // 检查是否已存在按钮
    if (document.querySelector('.writeup-helper-btn')) {
        return;
    }
    
    const button = document.createElement('button');
    button.className = 'writeup-helper-btn';
    button.textContent = '生成WriteUp';
    button.addEventListener('click', handleButtonClick);
    document.body.appendChild(button);
}

function formatTitle(title) {
    // 移除 "| NSSCTF" 部分
    title = title.split('|')[0].trim();
    
    // 移除特殊字符
    title = title.replace(/[?|:<>]/g, '');
    
    // 处理中括号
    let formattedTitle = '';
    let bracketContents = [];
    let currentContent = '';
    let insideBracket = false;
    
    // 收集所有中括号内的内容
    for (let i = 0; i < title.length; i++) {
        if (title[i] === '[') {
            insideBracket = true;
            currentContent = '';
            continue;
        }
        if (title[i] === ']') {
            insideBracket = false;
            bracketContents.push(currentContent);
            continue;
        }
        if (insideBracket) {
            currentContent += title[i];
        }
    }
    
    // 获取最后一个中括号后的内容（题目名称）
    let problemName = title.split(']').pop().trim();
    
    // 组合所有中括号内容
    formattedTitle = bracketContents.join('-');
    
    // 如果有题目名称，添加到最后
    if (problemName) {
        formattedTitle = formattedTitle + '-' + problemName;
    }
    
    return formattedTitle.trim();
}

function generateTemplate(title, url) {
    return `## 基本信息
- 题目名称：${title}
- 题目链接：${url}
- 考点清单：
### 解题思路


### 过程和结果记录


### 总结`;
}

function handleButtonClick() {
    const pageTitle = document.title;
    const formattedTitle = formatTitle(pageTitle);
    const template = generateTemplate(formattedTitle, window.location.href);
    
    // 使用简单的URI编码方式
    const vault = encodeURIComponent('note');
    const path = encodeURIComponent(`网安/练习WP/${formattedTitle}.md`); // 添加.md后缀
    const content = encodeURIComponent(template);
    
    // 构建Obsidian URI（使用最简单的格式）
    const obsidianUri = `obsidian://new?vault=${vault}&file=${path}&content=${content}`;
    
    // 打开Obsidian
    window.location.href = obsidianUri;
}

// 等待DOM完全加载后再创建按钮
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
} else {
    createButton();
}

// 为了处理动态加载的情况，定期检查按钮是否存在
setInterval(createButton, 1000);

// 为了处理SPA（单页应用）的情况，也在URL变化时创建按钮
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        createButton();
    }
}).observe(document, {subtree: true, childList: true});