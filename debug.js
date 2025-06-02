/**
 * WriteUp Helper 调试工具
 * 用于诊断和修复插件问题
 */

class WriteUpDebugger {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
        this.isEnabled = false;
    }

    /**
     * 启用调试模式
     */
    enable() {
        this.isEnabled = true;
        this.log('调试模式已启用');
        
        // 添加调试面板
        this.createDebugPanel();
    }

    /**
     * 禁用调试模式
     */
    disable() {
        this.isEnabled = false;
        this.removeDebugPanel();
    }

    /**
     * 记录调试信息
     * @param {string} message - 消息
     * @param {string} level - 日志级别
     * @param {any} data - 附加数据
     */
    log(message, level = 'info', data = null) {
        if (!this.isEnabled) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };

        this.logs.push(logEntry);
        
        // 限制日志数量
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // 输出到控制台
        const consoleMethod = console[level] || console.log;
        consoleMethod(`[WriteUp Helper Debug] ${message}`, data || '');

        // 更新调试面板
        this.updateDebugPanel();
    }

    /**
     * 创建调试面板
     */
    createDebugPanel() {
        if (document.querySelector('#writeup-debug-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'writeup-debug-panel';
        panel.innerHTML = `
            <div class="debug-header">
                <h4>WriteUp Helper 调试</h4>
                <button id="debug-clear">清空</button>
                <button id="debug-export">导出</button>
                <button id="debug-close">关闭</button>
            </div>
            <div class="debug-content">
                <div id="debug-logs"></div>
            </div>
        `;

        // 添加样式
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            height: 300px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10003;
            font-family: monospace;
            font-size: 12px;
        `;

        // 添加内部样式
        const style = document.createElement('style');
        style.textContent = `
            #writeup-debug-panel .debug-header {
                padding: 8px 12px;
                background: #f5f5f5;
                border-bottom: 1px solid #ddd;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #writeup-debug-panel .debug-header h4 {
                margin: 0;
                font-size: 14px;
            }
            #writeup-debug-panel .debug-header button {
                padding: 4px 8px;
                margin-left: 4px;
                border: 1px solid #ccc;
                background: white;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
            }
            #writeup-debug-panel .debug-content {
                height: calc(100% - 40px);
                overflow-y: auto;
                padding: 8px;
            }
            #writeup-debug-panel .debug-log {
                margin-bottom: 4px;
                padding: 2px 4px;
                border-radius: 2px;
            }
            #writeup-debug-panel .debug-log.info { background: #e3f2fd; }
            #writeup-debug-panel .debug-log.warn { background: #fff3e0; }
            #writeup-debug-panel .debug-log.error { background: #ffebee; }
            #writeup-debug-panel .debug-timestamp {
                color: #666;
                font-size: 10px;
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(panel);

        // 绑定事件
        document.getElementById('debug-clear').onclick = () => this.clearLogs();
        document.getElementById('debug-export').onclick = () => this.exportLogs();
        document.getElementById('debug-close').onclick = () => this.disable();

        this.updateDebugPanel();
    }

    /**
     * 移除调试面板
     */
    removeDebugPanel() {
        const panel = document.querySelector('#writeup-debug-panel');
        if (panel) {
            panel.remove();
        }
    }

    /**
     * 更新调试面板
     */
    updateDebugPanel() {
        const logsContainer = document.querySelector('#debug-logs');
        if (!logsContainer) return;

        logsContainer.innerHTML = this.logs.map(log => `
            <div class="debug-log ${log.level}">
                <div class="debug-timestamp">${log.timestamp}</div>
                <div>${log.message}</div>
                ${log.data ? `<div style="color: #666;">${JSON.stringify(log.data)}</div>` : ''}
            </div>
        `).join('');

        // 滚动到底部
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    /**
     * 清空日志
     */
    clearLogs() {
        this.logs = [];
        this.updateDebugPanel();
    }

    /**
     * 导出日志
     */
    exportLogs() {
        const data = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            logs: this.logs
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `writeup-helper-debug-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 运行诊断
     */
    runDiagnostics() {
        this.log('开始运行诊断...');

        // 检查基本环境
        this.log('检查基本环境', 'info', {
            userAgent: navigator.userAgent,
            url: window.location.href,
            localStorage: typeof localStorage !== 'undefined',
            writeUpHelper: typeof window.writeUpHelper !== 'undefined'
        });

        // 检查插件状态
        if (window.writeUpHelper) {
            const helper = window.writeUpHelper;
            this.log('插件状态', 'info', {
                hasButton: !!helper.button,
                buttonVisible: helper.button && document.body.contains(helper.button),
                isDragging: helper.isDragging,
                isProcessing: helper.isProcessing,
                isOpeningObsidian: helper.isOpeningObsidian,
                config: helper.config
            });
        } else {
            this.log('插件未初始化', 'error');
        }

        // 检查DOM
        this.log('DOM状态', 'info', {
            readyState: document.readyState,
            bodyExists: !!document.body,
            buttonExists: !!document.querySelector('.writeup-helper-btn'),
            buttonCount: document.querySelectorAll('.writeup-helper-btn').length
        });

        // 检查重复创建问题
        const buttons = document.querySelectorAll('.writeup-helper-btn');
        if (buttons.length > 1) {
            this.log('发现重复按钮', 'warn', {
                buttonCount: buttons.length,
                buttons: Array.from(buttons).map(btn => ({
                    text: btn.textContent,
                    visible: btn.style.display !== 'none',
                    inDOM: document.body.contains(btn)
                }))
            });
        }

        this.log('诊断完成');
    }

    /**
     * 监控重复创建问题
     */
    monitorDuplicateCreation() {
        this.log('开始监控重复创建问题...');

        let clickCount = 0;
        let lastClickTime = 0;

        // 监听按钮点击
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('writeup-helper-btn')) {
                clickCount++;
                const now = Date.now();
                const timeDiff = now - lastClickTime;
                lastClickTime = now;

                this.log('按钮点击检测', 'info', {
                    clickCount,
                    timeDiff,
                    isProcessing: window.writeUpHelper?.isProcessing,
                    isOpeningObsidian: window.writeUpHelper?.isOpeningObsidian
                });

                // 检测快速连续点击
                if (timeDiff < 1000 && clickCount > 1) {
                    this.log('检测到快速连续点击', 'warn', {
                        clickCount,
                        timeDiff
                    });
                }
            }
        });

        // 监听Obsidian URI调用
        const originalOpen = window.open;
        window.open = function(...args) {
            if (args[0] && args[0].startsWith('obsidian://')) {
                writeUpDebugger.log('Obsidian URI调用', 'info', {
                    uri: args[0].substring(0, 100) + '...',
                    timestamp: Date.now()
                });
            }
            return originalOpen.apply(window, args);
        };

        this.log('监控已启动');
    }
}

// 创建全局调试器实例
window.writeUpDebugger = new WriteUpDebugger();

// 添加控制台命令
console.log('WriteUp Helper 调试工具已加载');
console.log('使用 writeUpDebugger.enable() 启用调试模式');
console.log('使用 writeUpDebugger.runDiagnostics() 运行诊断');
console.log('使用 writeUpDebugger.monitorDuplicateCreation() 监控重复创建问题');
