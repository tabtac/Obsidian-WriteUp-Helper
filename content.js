/**
 * WriteUp Helper 主类
 * 负责管理插件的核心功能
 */
class WriteUpHelper {
    constructor() {
        this.config = {
            vault: 'note',
            basePath: '网安/练习WP',
            buttonText: '生成WriteUp',
            checkInterval: 1000,
            template: 'standard'
        };
        this.button = null;
        this.isProcessing = false;
        this.isOpeningObsidian = false; // 防止重复打开Obsidian

        // 安全获取平台配置，避免ReferenceError
        try {
            this.platformConfig = (typeof getCurrentPlatformConfig === 'function')
                ? getCurrentPlatformConfig()
                : this.getDefaultPlatformConfig();
        } catch (error) {
            console.warn('WriteUp Helper: 获取平台配置失败，使用默认配置', error);
            this.platformConfig = this.getDefaultPlatformConfig();
        }

        // 拖拽相关属性
        this.isDragging = false;
        this.hasDragged = false; // 标记是否发生了实际拖拽
        this.dragOffset = { x: 0, y: 0 };
        this.dragStartTime = 0;
        this.dragStartPosition = { x: 0, y: 0 }; // 记录拖拽开始位置
        this.dragAnimationFrame = null; // 用于限流拖拽更新
        this.buttonPosition = this.loadButtonPosition();

        // 事件监听器引用，用于清理
        this.eventListeners = new Map();
        this.eventListenerCounter = 0; // 用于生成唯一ID
        this.intervalId = null;
        this.mutationObserver = null;

        // 绑定方法到this，避免上下文丢失
        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDragMove = this.handleDragMove.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.adjustButtonPosition = this.adjustButtonPosition.bind(this);

        this.init();
    }

    /**
     * 初始化插件
     */
    init() {
        this.loadConfig();
        this.createButton();
        this.setupEventListeners();
        this.startPeriodicCheck();
    }

    /**
     * 从localStorage加载用户配置
     */
    loadConfig() {
        try {
            const savedConfig = localStorage.getItem('writeup-helper-config');
            if (savedConfig) {
                const parsedConfig = JSON.parse(savedConfig);
                // 验证配置的有效性
                if (this.validateConfig(parsedConfig)) {
                    this.config = { ...this.config, ...parsedConfig };
                } else {
                    console.warn('WriteUp Helper: 配置格式无效，使用默认配置');
                }
            }
        } catch (error) {
            console.warn('WriteUp Helper: 配置加载失败，使用默认配置', error);
        }
    }

    /**
     * 验证配置的有效性
     * @param {Object} config - 要验证的配置
     * @returns {boolean} 配置是否有效
     */
    validateConfig(config) {
        if (!config || typeof config !== 'object') {
            return false;
        }

        // 检查必需的字段
        const requiredFields = ['vault', 'basePath', 'buttonText'];
        for (const field of requiredFields) {
            if (config[field] !== undefined && typeof config[field] !== 'string') {
                return false;
            }
        }

        // 检查模板字段
        if (config.template !== undefined) {
            const validTemplates = ['standard', 'detailed', 'simple', 'custom'];
            if (!validTemplates.includes(config.template)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 获取默认平台配置（降级方案）
     * @returns {Object} 默认平台配置
     */
    getDefaultPlatformConfig() {
        return {
            name: 'Default',
            titleProcessor: (title) => {
                if (!title) return 'Unknown';

                // 基本的标题清理
                title = title.split('|')[0].trim();
                title = title.replace(/[?|:<>"*\/\\]/g, '');

                const bracketRegex = /\[([^\]]+)\]/g;
                const bracketContents = [];
                let match;

                while ((match = bracketRegex.exec(title)) !== null) {
                    bracketContents.push(match[1].trim());
                }

                const problemName = title.split(']').pop().trim();
                let formattedTitle = bracketContents.join('-');

                if (problemName && problemName !== formattedTitle) {
                    formattedTitle = formattedTitle ? `${formattedTitle}-${problemName}` : problemName;
                }

                return formattedTitle.replace(/[-\s]+/g, '-').replace(/^-+|-+$/g, '') || 'Unknown';
            }
        };
    }

    /**
     * 创建悬浮按钮
     */
    createButton() {
        // 检查document.body是否存在
        if (!document.body) {
            return false;
        }

        // 检查是否已存在按钮
        if (this.button && document.body.contains(this.button)) {
            return true;
        }

        this.button = document.createElement('button');
        this.button.className = 'writeup-helper-btn';
        this.button.textContent = this.config.buttonText;
        this.button.title = '左键点击: 生成WriteUp模板 (Ctrl+Shift+W)\n右键点击: 打开设置面板\n长按拖拽: 移动位置';

        // 设置按钮位置
        this.setButtonPosition();

        // 添加事件监听器
        this.button.addEventListener('click', (e) => this.handleButtonClick(e), { passive: false });
        this.button.addEventListener('contextmenu', (e) => this.handleRightClick(e), { passive: false });
        this.setupDragListeners();

        document.body.appendChild(this.button);
        return true;
    }

    /**
     * 加载按钮位置
     * @returns {Object} 按钮位置对象
     */
    loadButtonPosition() {
        try {
            const savedPosition = localStorage.getItem('writeup-helper-button-position');
            if (savedPosition) {
                return JSON.parse(savedPosition);
            }
        } catch (error) {
            console.warn('WriteUp Helper: 按钮位置加载失败', error);
        }

        // 默认位置
        return {
            top: 40,
            right: 20,
            left: null,
            bottom: null
        };
    }

    /**
     * 保存按钮位置
     * @param {Object} position - 位置对象
     */
    saveButtonPosition(position) {
        try {
            this.buttonPosition = position;
            localStorage.setItem('writeup-helper-button-position', JSON.stringify(position));
        } catch (error) {
            console.warn('WriteUp Helper: 按钮位置保存失败', error);
        }
    }

    /**
     * 设置按钮位置
     */
    setButtonPosition() {
        if (!this.button) return;

        const pos = this.buttonPosition;
        this.button.style.position = 'fixed';
        this.button.style.zIndex = '10000';

        // 清除所有位置样式
        this.button.style.top = '';
        this.button.style.right = '';
        this.button.style.bottom = '';
        this.button.style.left = '';

        // 设置位置
        if (pos.top !== null) this.button.style.top = pos.top + 'px';
        if (pos.right !== null) this.button.style.right = pos.right + 'px';
        if (pos.bottom !== null) this.button.style.bottom = pos.bottom + 'px';
        if (pos.left !== null) this.button.style.left = pos.left + 'px';
    }

    /**
     * 设置拖拽事件监听器
     */
    setupDragListeners() {
        if (!this.button) return;

        // 清理旧的事件监听器
        this.removeDragListeners();

        // 鼠标事件
        this.addEventListenerWithCleanup(this.button, 'mousedown', this.handleDragStart, { passive: false });
        this.addEventListenerWithCleanup(document, 'mousemove', this.handleDragMove, { passive: false });
        this.addEventListenerWithCleanup(document, 'mouseup', this.handleDragEnd, { passive: false });

        // 触摸事件（移动端支持）
        this.addEventListenerWithCleanup(this.button, 'touchstart', this.handleDragStart, { passive: false });
        this.addEventListenerWithCleanup(document, 'touchmove', this.handleDragMove, { passive: false });
        this.addEventListenerWithCleanup(document, 'touchend', this.handleDragEnd, { passive: false });

        // 防止上下文菜单干扰拖拽
        this.addEventListenerWithCleanup(this.button, 'contextmenu', (e) => {
            if (this.isDragging || this.hasDragged) {
                e.preventDefault();
            }
        });

        // 窗口大小变化时调整位置
        this.addEventListenerWithCleanup(window, 'resize', this.adjustButtonPosition);
    }

    /**
     * 添加事件监听器并记录以便清理
     * @param {EventTarget} target - 事件目标
     * @param {string} type - 事件类型
     * @param {Function} listener - 事件处理函数
     * @param {Object} options - 事件选项
     * @returns {string} 监听器的唯一ID
     */
    addEventListenerWithCleanup(target, type, listener, options = {}) {
        target.addEventListener(type, listener, options);

        // 生成唯一ID避免键冲突
        const listenerId = `listener_${++this.eventListenerCounter}`;
        const key = `${target.constructor.name}-${type}-${listenerId}`;

        this.eventListeners.set(key, { target, type, listener, options, id: listenerId });

        return listenerId;
    }

    /**
     * 移除拖拽相关的事件监听器
     */
    removeDragListeners() {
        const dragEvents = ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'contextmenu', 'resize'];

        for (const [key, listenerInfo] of this.eventListeners.entries()) {
            const eventType = key.split('-')[1];
            if (dragEvents.includes(eventType)) {
                const { target, type, listener, options } = listenerInfo;
                target.removeEventListener(type, listener, options);
                this.eventListeners.delete(key);
            }
        }
    }

    /**
     * 处理拖拽开始
     * @param {Event} e - 事件对象
     */
    handleDragStart(e) {
        // 防止在处理中时拖拽
        if (this.isProcessing) {
            e.preventDefault();
            return;
        }

        // 只响应鼠标左键或触摸事件
        if (e.type === 'mousedown' && e.button !== 0) {
            return;
        }

        // 获取鼠标/触摸位置
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        // 获取按钮位置
        const rect = this.button.getBoundingClientRect();

        // 计算偏移量
        this.dragOffset = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };

        // 记录拖拽开始位置和时间，但不立即设置为拖拽状态
        this.dragStartPosition = { x: clientX, y: clientY };
        this.dragStartTime = Date.now();
        this.hasDragged = false;

        // 注意：这里不设置 isDragging = true，等到真正移动时再设置

        // 对于触摸事件，阻止默认行为以防止滚动
        if (e.type.includes('touch')) {
            e.preventDefault();
        }
    }

    /**
     * 处理拖拽移动
     * @param {Event} e - 事件对象
     */
    handleDragMove(e) {
        // 如果没有记录拖拽开始位置，说明不是从按钮开始的拖拽
        if (!this.dragStartTime) return;

        // 获取鼠标/触摸位置
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        // 检查是否真的移动了（避免微小抖动）
        const moveDistance = Math.sqrt(
            Math.pow(clientX - this.dragStartPosition.x, 2) +
            Math.pow(clientY - this.dragStartPosition.y, 2)
        );

        // 只有移动距离超过阈值才开始拖拽
        if (moveDistance > 8 && !this.isDragging) { // 增加阈值到8px
            this.isDragging = true;
            this.hasDragged = true;

            // 添加拖拽样式
            this.button.classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.classList.add('dragging-active');
        }

        // 如果已经开始拖拽，则更新位置（使用requestAnimationFrame限流）
        if (this.isDragging) {
            // 取消之前的动画帧
            if (this.dragAnimationFrame) {
                cancelAnimationFrame(this.dragAnimationFrame);
            }

            this.dragAnimationFrame = requestAnimationFrame(() => {
                // 计算新位置
                let newX = clientX - this.dragOffset.x;
                let newY = clientY - this.dragOffset.y;

                // 边界限制
                const buttonWidth = this.button.offsetWidth;
                const buttonHeight = this.button.offsetHeight;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                newX = Math.max(0, Math.min(newX, viewportWidth - buttonWidth));
                newY = Math.max(0, Math.min(newY, viewportHeight - buttonHeight));

                // 设置位置
                this.button.style.left = newX + 'px';
                this.button.style.top = newY + 'px';
                this.button.style.right = '';
                this.button.style.bottom = '';
            });

            // 阻止默认行为和事件冒泡
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * 处理拖拽结束
     * @param {Event} e - 事件对象
     */
    handleDragEnd(e) {
        // 如果没有拖拽开始时间，说明不是有效的拖拽操作
        if (!this.dragStartTime) return;

        const wasDragged = this.hasDragged;

        // 重置拖拽状态
        this.isDragging = false;
        this.hasDragged = false;
        this.dragStartTime = 0; // 重置拖拽开始时间

        // 清理动画帧
        if (this.dragAnimationFrame) {
            cancelAnimationFrame(this.dragAnimationFrame);
            this.dragAnimationFrame = null;
        }

        // 移除拖拽样式
        this.button.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.classList.remove('dragging-active');

        if (wasDragged) {
            // 保存新位置
            const rect = this.button.getBoundingClientRect();
            const newPosition = {
                top: rect.top,
                left: rect.left,
                right: null,
                bottom: null
            };

            this.saveButtonPosition(newPosition);

            // 添加结束动画
            this.button.classList.add('drag-end');
            setTimeout(() => {
                this.button.classList.remove('drag-end');
            }, 200);

            // 阻止点击事件
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * 调整按钮位置（窗口大小变化时）
     */
    adjustButtonPosition() {
        if (!this.button) return;

        const rect = this.button.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let needsAdjustment = false;
        let newPosition = { ...this.buttonPosition };

        // 检查是否超出边界
        if (rect.right > viewportWidth) {
            newPosition.left = viewportWidth - rect.width;
            newPosition.right = null;
            needsAdjustment = true;
        }

        if (rect.bottom > viewportHeight) {
            newPosition.top = viewportHeight - rect.height;
            newPosition.bottom = null;
            needsAdjustment = true;
        }

        if (rect.left < 0) {
            newPosition.left = 0;
            newPosition.right = null;
            needsAdjustment = true;
        }

        if (rect.top < 0) {
            newPosition.top = 0;
            newPosition.bottom = null;
            needsAdjustment = true;
        }

        if (needsAdjustment) {
            this.saveButtonPosition(newPosition);
            this.setButtonPosition();
        }
    }

    /**
     * 重置按钮位置到默认位置
     */
    resetButtonPosition() {
        const defaultPosition = {
            top: 40,
            right: 20,
            left: null,
            bottom: null
        };

        this.saveButtonPosition(defaultPosition);
        this.setButtonPosition();

        // 显示重置提示
        this.showNotification('按钮位置已重置', 'info');
    }

    /**
     * 处理右键点击事件
     * @param {Event} e - 事件对象
     */
    handleRightClick(e) {
        // 防止拖拽时触发右键菜单
        if (this.isDragging || this.hasDragged) {
            e.preventDefault();
            return;
        }

        e.preventDefault();
        this.showSettingsPanel();
    }

    /**
     * 显示设置面板
     */
    showSettingsPanel() {
        // 如果面板已存在，先移除
        this.hideSettingsPanel();

        // 创建设置面板
        const panel = this.createSettingsPanel();
        document.body.appendChild(panel);

        // 添加显示动画
        setTimeout(() => panel.classList.add('show'), 10);
    }

    /**
     * 隐藏设置面板
     */
    hideSettingsPanel() {
        const existingPanel = document.querySelector('.writeup-settings-panel');
        if (existingPanel) {
            existingPanel.classList.remove('show');
            setTimeout(() => {
                if (existingPanel && existingPanel.parentNode) {
                    existingPanel.parentNode.removeChild(existingPanel);
                }
                // 清理设置面板相关的事件监听器
                this.cleanupSettingsListeners();
            }, 300);
        }
    }

    /**
     * 清理设置面板相关的事件监听器
     */
    cleanupSettingsListeners() {
        // 移除ESC键监听器
        if (this.currentEscapeListener) {
            document.removeEventListener('keydown', this.currentEscapeListener);
            this.currentEscapeListener = null;
        }
    }

    /**
     * 创建设置面板
     * @returns {HTMLElement} 设置面板元素
     */
    createSettingsPanel() {
        const panel = document.createElement('div');
        panel.className = 'writeup-settings-panel';

        panel.innerHTML = `
            <div class="settings-container">
                <div class="settings-header">
                    <h3>WriteUp Helper 设置</h3>
                    <button class="settings-close-btn" type="button">×</button>
                </div>

                <div class="settings-content">
                    <div class="settings-section">
                        <h4>基本设置</h4>
                        <div class="settings-item">
                            <label>Vault名称:</label>
                            <input type="text" id="vault-input" value="${this.config.vault}" placeholder="note">
                        </div>
                        <div class="settings-item">
                            <label>文件路径:</label>
                            <input type="text" id="path-input" value="${this.config.basePath}" placeholder="网安/练习WP">
                        </div>
                        <div class="settings-item">
                            <label>按钮文本:</label>
                            <input type="text" id="button-text-input" value="${this.config.buttonText}" placeholder="生成WriteUp">
                        </div>
                    </div>

                    <div class="settings-section">
                        <h4>模板设置</h4>
                        <div class="settings-item">
                            <label>当前模板:</label>
                            <select id="template-select">
                                <option value="standard" ${this.config.template === 'standard' ? 'selected' : ''}>标准模板</option>
                                <option value="detailed" ${this.config.template === 'detailed' ? 'selected' : ''}>详细模板</option>
                                <option value="simple" ${this.config.template === 'simple' ? 'selected' : ''}>简洁模板</option>
                                <option value="custom" ${this.config.template === 'custom' ? 'selected' : ''}>自定义模板</option>
                            </select>
                        </div>
                        <div class="settings-item template-editor">
                            <label>模板内容:</label>
                            <textarea id="template-content" placeholder="在此编辑模板内容..."></textarea>
                            <div class="template-help">
                                <small>支持的变量: {{title}}, {{url}}, {{date}}, {{time}}</small>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="settings-footer">
                    <button class="settings-btn settings-btn-secondary" id="reset-settings">重置设置</button>
                    <button class="settings-btn settings-btn-secondary" id="export-settings">导出设置</button>
                    <button class="settings-btn settings-btn-secondary" id="import-settings">导入设置</button>
                    <button class="settings-btn settings-btn-primary" id="save-settings">保存设置</button>
                </div>
            </div>
        `;

        // 绑定事件
        this.bindSettingsEvents(panel);

        return panel;
    }

    /**
     * 获取当前模板内容
     * @returns {string} 模板内容
     */
    getCurrentTemplateContent() {
        const templateName = this.config.template || 'standard';

        // 如果是自定义模板，从配置中获取
        if (templateName === 'custom' && this.config.customTemplate) {
            return this.config.customTemplate;
        }

        // 否则从默认模板获取
        const template = DEFAULT_TEMPLATES[templateName] || DEFAULT_TEMPLATES.standard;
        return template.content;
    }

    /**
     * 绑定设置面板事件
     * @param {HTMLElement} panel - 设置面板元素
     */
    bindSettingsEvents(panel) {
        // 关闭按钮
        const closeBtn = panel.querySelector('.settings-close-btn');
        closeBtn.addEventListener('click', () => this.hideSettingsPanel());

        // 点击面板外部关闭
        panel.addEventListener('click', (e) => {
            if (e.target === panel) {
                this.hideSettingsPanel();
            }
        });

        // ESC键关闭
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.hideSettingsPanel();
                // 移除自己
                document.removeEventListener('keydown', handleEscape);
            }
        };

        // 记录ESC监听器以便清理
        document.addEventListener('keydown', handleEscape);
        this.currentEscapeListener = handleEscape;

        // 模板选择变化
        const templateSelect = panel.querySelector('#template-select');
        const templateContent = panel.querySelector('#template-content');

        // 设置初始模板内容
        templateContent.value = this.getCurrentTemplateContent();

        templateSelect.addEventListener('change', (e) => {
            const selectedTemplate = e.target.value;
            if (selectedTemplate === 'custom') {
                templateContent.value = this.config.customTemplate || '';
                templateContent.disabled = false;
            } else {
                const template = DEFAULT_TEMPLATES[selectedTemplate] || DEFAULT_TEMPLATES.standard;
                templateContent.value = template.content;
                templateContent.disabled = true;
            }
        });

        // 初始化模板编辑器状态
        templateContent.disabled = templateSelect.value !== 'custom';

        // 保存设置
        const saveBtn = panel.querySelector('#save-settings');
        saveBtn.addEventListener('click', () => this.saveSettings(panel));

        // 重置设置
        const resetBtn = panel.querySelector('#reset-settings');
        resetBtn.addEventListener('click', () => this.resetSettings());

        // 导出设置
        const exportBtn = panel.querySelector('#export-settings');
        exportBtn.addEventListener('click', () => this.exportSettings());

        // 导入设置
        const importBtn = panel.querySelector('#import-settings');
        importBtn.addEventListener('click', () => this.importSettings());
    }

    /**
     * 保存设置
     * @param {HTMLElement} panel - 设置面板元素
     */
    saveSettings(panel) {
        try {
            const vault = panel.querySelector('#vault-input').value.trim();
            const basePath = panel.querySelector('#path-input').value.trim();
            const buttonText = panel.querySelector('#button-text-input').value.trim();
            const template = panel.querySelector('#template-select').value;
            const templateContent = panel.querySelector('#template-content').value;

            // 验证输入
            if (!vault) {
                this.showNotification('Vault名称不能为空', 'error');
                return;
            }

            if (!basePath) {
                this.showNotification('文件路径不能为空', 'error');
                return;
            }

            if (!buttonText) {
                this.showNotification('按钮文本不能为空', 'error');
                return;
            }

            // 保存配置
            const newConfig = {
                vault,
                basePath,
                buttonText,
                template
            };

            // 如果是自定义模板，保存模板内容
            if (template === 'custom') {
                if (!templateContent.trim()) {
                    this.showNotification('自定义模板内容不能为空', 'error');
                    return;
                }
                newConfig.customTemplate = templateContent;
            }

            this.saveConfig(newConfig);

            // 更新按钮文本
            if (this.button) {
                this.button.textContent = buttonText;
            }

            this.showNotification('设置已保存', 'success');
            this.hideSettingsPanel();

        } catch (error) {
            console.error('WriteUp Helper: 保存设置失败', error);
            this.showNotification('保存设置失败', 'error');
        }
    }

    /**
     * 重置设置
     */
    resetSettings() {
        if (confirm('确定要重置所有设置吗？这将清除所有自定义配置。')) {
            // 重置到默认配置
            const defaultConfig = {
                vault: 'note',
                basePath: '网安/练习WP',
                buttonText: '生成WriteUp',
                template: 'standard'
            };

            this.saveConfig(defaultConfig);

            // 重置按钮位置
            this.resetButtonPosition();

            // 更新按钮文本
            if (this.button) {
                this.button.textContent = defaultConfig.buttonText;
            }

            this.showNotification('设置已重置', 'success');
            this.hideSettingsPanel();
        }
    }

    /**
     * 导出设置
     */
    exportSettings() {
        try {
            const settings = {
                config: this.config,
                buttonPosition: this.buttonPosition,
                version: '2.0',
                exportTime: new Date().toISOString()
            };

            const dataStr = JSON.stringify(settings, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `writeup-helper-settings-${new Date().toISOString().split('T')[0]}.json`;
            link.click();

            this.showNotification('设置已导出', 'success');

        } catch (error) {
            console.error('WriteUp Helper: 导出设置失败', error);
            this.showNotification('导出设置失败', 'error');
        }
    }

    /**
     * 导入设置
     */
    importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const settings = JSON.parse(e.target.result);

                    // 验证设置格式
                    if (!settings.config) {
                        throw new Error('无效的设置文件格式');
                    }

                    // 导入配置
                    this.saveConfig(settings.config);

                    // 导入按钮位置
                    if (settings.buttonPosition) {
                        this.saveButtonPosition(settings.buttonPosition);
                        this.setButtonPosition();
                    }

                    // 更新按钮文本
                    if (this.button && settings.config.buttonText) {
                        this.button.textContent = settings.config.buttonText;
                    }

                    this.showNotification('设置已导入', 'success');
                    this.hideSettingsPanel();

                } catch (error) {
                    console.error('WriteUp Helper: 导入设置失败', error);
                    this.showNotification('导入设置失败：' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 快捷键支持
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'W') {
                e.preventDefault();
                this.handleButtonClick(e);
            }
            // 重置按钮位置快捷键 Ctrl+Shift+R
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                this.resetButtonPosition();
            }
            // 打开设置面板快捷键 Ctrl+Shift+S
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this.showSettingsPanel();
            }
        });

        // SPA路由变化监听
        this.setupSPAListener();

        // 页面焦点恢复监听
        this.setupFocusListener();
    }

    /**
     * 设置SPA监听器
     */
    setupSPAListener() {
        // 清理旧的观察器
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }

        let lastUrl = location.href;
        let debounceTimer = null;

        // 使用防抖减少高频调用
        this.mutationObserver = new MutationObserver(() => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            debounceTimer = setTimeout(() => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    setTimeout(() => this.createButton(), 100);
                }
            }, 200); // 200ms防抖
        });

        // 减少观察范围，只监听必要的变化
        this.mutationObserver.observe(document, {
            childList: true,
            subtree: false, // 不监听深层子树
            attributes: false, // 不监听属性变化
            characterData: false // 不监听文本变化
        });

        // 额外监听history变化（更精确的SPA检测）
        this.setupHistoryListener();
    }

    /**
     * 设置History监听器（更精确的SPA路由检测）
     */
    setupHistoryListener() {
        let lastUrl = location.href;

        const checkUrlChange = () => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                setTimeout(() => this.createButton(), 100);
            }
        };

        // 监听popstate事件
        this.addEventListenerWithCleanup(window, 'popstate', checkUrlChange);

        // 劫持pushState和replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function(...args) {
            originalPushState.apply(history, args);
            setTimeout(checkUrlChange, 0);
        };

        history.replaceState = function(...args) {
            originalReplaceState.apply(history, args);
            setTimeout(checkUrlChange, 0);
        };

        // 记录原始方法以便恢复
        this.originalHistoryMethods = {
            pushState: originalPushState,
            replaceState: originalReplaceState
        };
    }

    /**
     * 设置页面焦点监听器
     */
    setupFocusListener() {
        // 页面获得焦点时检查按钮
        this.addEventListenerWithCleanup(window, 'focus', () => {
            setTimeout(() => {
                if (!this.button || !document.body.contains(this.button)) {
                    console.log('WriteUp Helper: 页面焦点恢复，重新创建按钮');
                    this.createButton();
                }
            }, 100);
        });

        // 页面可见性变化时检查按钮
        this.addEventListenerWithCleanup(document, 'visibilitychange', () => {
            if (!document.hidden) {
                setTimeout(() => {
                    if (!this.button || !document.body.contains(this.button)) {
                        console.log('WriteUp Helper: 页面变为可见，重新创建按钮');
                        this.createButton();
                    }
                }, 100);
            }
        });
    }

    /**
     * 开始定期检查
     */
    startPeriodicCheck() {
        // 清理旧的定时器
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.intervalId = setInterval(() => {
            try {
                // 检查按钮是否存在且在DOM中
                if (!this.button || !document.body.contains(this.button)) {
                    console.log('WriteUp Helper: 按钮丢失，正在重新创建...');
                    this.createButton();
                }

                // 检查按钮是否可见
                if (this.button && this.button.style.display === 'none') {
                    this.button.style.display = '';
                }

                // 确保按钮有正确的类名
                if (this.button && !this.button.classList.contains('writeup-helper-btn')) {
                    this.button.className = 'writeup-helper-btn';
                }

            } catch (error) {
                console.warn('WriteUp Helper: 定期检查出错', error);
                // 尝试重新创建按钮
                try {
                    this.createButton();
                } catch (createError) {
                    console.error('WriteUp Helper: 重新创建按钮失败', createError);
                }
            }
        }, this.config.checkInterval);
    }

    /**
     * 停止定期检查
     */
    stopPeriodicCheck() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * 格式化标题
     * @param {string} title - 原始标题
     * @returns {string} 格式化后的标题
     */
    formatTitle(title) {
        if (!title) return 'Unknown';

        // 使用平台特定的标题处理器
        if (this.platformConfig && this.platformConfig.titleProcessor) {
            return this.platformConfig.titleProcessor(title);
        }

        // 默认处理逻辑
        title = title.split('|')[0].trim();
        title = title.replace(/[?|:<>"*\/\\]/g, '');

        const bracketRegex = /\[([^\]]+)\]/g;
        const bracketContents = [];
        let match;

        while ((match = bracketRegex.exec(title)) !== null) {
            bracketContents.push(match[1].trim());
        }

        const problemName = title.split(']').pop().trim();
        let formattedTitle = bracketContents.join('-');

        if (problemName && problemName !== formattedTitle) {
            formattedTitle = formattedTitle ? `${formattedTitle}-${problemName}` : problemName;
        }

        formattedTitle = formattedTitle.replace(/[-\s]+/g, '-').replace(/^-+|-+$/g, '');

        return formattedTitle || 'Unknown';
    }

    /**
     * 生成WriteUp模板
     * @param {string} title - 题目标题
     * @param {string} url - 题目链接
     * @returns {string} 生成的模板内容
     */
    generateTemplate(title, url) {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

        // 获取模板内容
        let content;
        const templateName = this.config.template || 'standard';

        if (templateName === 'custom' && this.config.customTemplate) {
            // 使用自定义模板
            content = this.config.customTemplate;
        } else {
            // 使用预设模板
            const template = DEFAULT_TEMPLATES[templateName] || DEFAULT_TEMPLATES.standard;
            content = template.content;
        }

        // 替换模板变量
        const variables = {
            title: title,
            url: url,
            date: dateStr,
            time: timeStr
        };

        // 执行变量替换（使用函数式替换避免$符号问题）
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            content = content.replace(regex, () => String(value || ''));
        }

        return content;
    }

    /**
     * 安全地打开Obsidian，避免页面跳转导致按钮消失
     * @param {string} obsidianUri - Obsidian URI
     */
    async openObsidianSafely(obsidianUri) {
        // 防止重复调用
        if (this.isOpeningObsidian) {
            console.log('WriteUp Helper: 正在打开Obsidian，跳过重复调用');
            return;
        }

        this.isOpeningObsidian = true;

        try {
            // 方法1：尝试使用隐藏的iframe（最兼容的方法）
            const success = await this.tryOpenWithIframe(obsidianUri);
            if (success) {
                return;
            }

            // 方法2：备用方案 - 使用临时链接
            console.log('WriteUp Helper: iframe方法失败，尝试链接方法');
            this.openObsidianWithLink(obsidianUri);

        } catch (error) {
            console.error('WriteUp Helper: 打开Obsidian失败', error);
            this.showNotification('无法打开Obsidian，请检查是否已安装', 'error');
        } finally {
            // 重置标志
            setTimeout(() => {
                this.isOpeningObsidian = false;
            }, 2000);
        }
    }

    /**
     * 尝试使用iframe打开Obsidian
     * @param {string} obsidianUri - Obsidian URI
     * @returns {Promise<boolean>} 是否成功
     */
    tryOpenWithIframe(obsidianUri) {
        return new Promise((resolve) => {
            try {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = 'none';

                // 监听加载事件
                let resolved = false;

                const cleanup = () => {
                    if (iframe.parentNode) {
                        iframe.parentNode.removeChild(iframe);
                    }
                };

                const resolveOnce = (success) => {
                    if (!resolved) {
                        resolved = true;
                        cleanup();
                        resolve(success);
                    }
                };

                // 设置超时
                const timeout = setTimeout(() => {
                    resolveOnce(true); // 假设成功，因为Obsidian URI通常不会触发load事件
                }, 1000);

                iframe.onload = () => {
                    clearTimeout(timeout);
                    resolveOnce(true);
                };

                iframe.onerror = () => {
                    clearTimeout(timeout);
                    resolveOnce(false);
                };

                // 设置URI并添加到DOM
                iframe.src = obsidianUri;
                document.body.appendChild(iframe);

            } catch (error) {
                console.warn('WriteUp Helper: iframe方法异常', error);
                resolve(false);
            }
        });
    }

    /**
     * 使用临时链接打开Obsidian（备用方案）
     * @param {string} obsidianUri - Obsidian URI
     */
    openObsidianWithLink(obsidianUri) {
        try {
            const link = document.createElement('a');
            link.href = obsidianUri;
            link.style.display = 'none';
            link.target = '_blank';
            document.body.appendChild(link);

            // 模拟点击
            link.click();

            // 移除链接
            setTimeout(() => {
                if (link.parentNode) {
                    link.parentNode.removeChild(link);
                }
            }, 100);

        } catch (error) {
            console.error('WriteUp Helper: 所有打开方法都失败了', error);
            this.showNotification('无法打开Obsidian，请检查是否已安装', 'error');
        }
    }

    /**
     * 处理长内容的降级方案
     * @param {string} vault - vault名称
     * @param {string} filePath - 文件路径
     * @param {string} template - 模板内容
     */
    async handleLongContent(vault, filePath, template) {
        try {
            // 方案1：复制到剪贴板
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(template);

                // 打开空文件
                const simpleUri = `obsidian://new?vault=${vault}&file=${encodeURIComponent(filePath)}`;
                this.openObsidianSafely(simpleUri);

                this.showNotification('内容已复制到剪贴板，请在Obsidian中粘贴', 'info');
                return;
            }

            // 方案2：显示内容让用户手动复制
            this.showContentDialog(template, filePath);

        } catch (error) {
            console.error('WriteUp Helper: 长内容处理失败', error);
            this.showNotification('内容过长，请手动创建文件', 'error');
        }
    }

    /**
     * 显示内容对话框
     * @param {string} content - 内容
     * @param {string} fileName - 文件名
     */
    showContentDialog(content, fileName) {
        const dialog = document.createElement('div');
        dialog.className = 'writeup-content-dialog';
        dialog.innerHTML = `
            <div class="content-dialog-container">
                <div class="content-dialog-header">
                    <h3>WriteUp内容 - ${fileName}</h3>
                    <button class="content-dialog-close">×</button>
                </div>
                <div class="content-dialog-body">
                    <textarea readonly>${content}</textarea>
                    <div class="content-dialog-actions">
                        <button class="content-copy-btn">复制内容</button>
                        <button class="content-close-btn">关闭</button>
                    </div>
                </div>
            </div>
        `;

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .writeup-content-dialog {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 10004;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .content-dialog-container {
                background: white;
                border-radius: 8px;
                max-width: 80%;
                max-height: 80%;
                display: flex;
                flex-direction: column;
            }
            .content-dialog-header {
                padding: 16px;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .content-dialog-body {
                padding: 16px;
                display: flex;
                flex-direction: column;
                min-height: 400px;
            }
            .content-dialog-body textarea {
                flex: 1;
                font-family: monospace;
                font-size: 12px;
                border: 1px solid #ddd;
                padding: 8px;
                resize: none;
            }
            .content-dialog-actions {
                margin-top: 16px;
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            .content-dialog-actions button {
                padding: 8px 16px;
                border: 1px solid #ddd;
                background: white;
                border-radius: 4px;
                cursor: pointer;
            }
            .content-copy-btn {
                background: #007bff !important;
                color: white !important;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(dialog);

        // 绑定事件
        const closeDialog = () => {
            dialog.remove();
            style.remove();
        };

        dialog.querySelector('.content-dialog-close').onclick = closeDialog;
        dialog.querySelector('.content-close-btn').onclick = closeDialog;
        dialog.onclick = (e) => e.target === dialog && closeDialog();

        dialog.querySelector('.content-copy-btn').onclick = async () => {
            try {
                const textarea = dialog.querySelector('textarea');
                textarea.select();

                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(content);
                } else {
                    // 降级方案：使用已废弃的execCommand
                    try {
                        document.execCommand('copy');
                    } catch (error) {
                        throw new Error('复制功能不可用');
                    }
                }

                this.showNotification('内容已复制到剪贴板', 'success');
                closeDialog();
            } catch (error) {
                this.showNotification('复制失败，请手动选择复制', 'error');
            }
        };
    }

    /**
     * 处理按钮点击事件
     * @param {Event} e - 事件对象
     */
    async handleButtonClick(e) {
        // 防止拖拽时触发点击
        if (this.isDragging || this.hasDragged) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 防止重复处理
        if (this.isProcessing || this.isOpeningObsidian) {
            console.log('WriteUp Helper: 正在处理中，跳过重复点击');
            return;
        }

        // 防止事件冒泡导致的重复触发
        e.preventDefault();
        e.stopPropagation();

        this.isProcessing = true;
        this.updateButtonState('处理中...', true);

        try {
            const pageTitle = document.title;
            const formattedTitle = this.formatTitle(pageTitle);
            const template = this.generateTemplate(formattedTitle, window.location.href);

            // 构建文件路径
            const filePath = `${this.config.basePath}/${formattedTitle}.md`;

            // 使用URI编码
            const vault = encodeURIComponent(this.config.vault);
            const path = encodeURIComponent(filePath);
            const content = encodeURIComponent(template);

            // 构建Obsidian URI
            const obsidianUri = `obsidian://new?vault=${vault}&file=${path}&content=${content}`;

            // 检查URI长度限制（大多数浏览器限制在2048字符）
            if (obsidianUri.length > 2000) {
                console.warn('WriteUp Helper: URI过长，使用降级方案');
                await this.handleLongContent(vault, filePath, template);
            } else {
                // 使用更安全的方式打开Obsidian，避免页面跳转
                await this.openObsidianSafely(obsidianUri);
            }

            // 显示成功提示
            this.showNotification('WriteUp模板已生成！', 'success');

        } catch (error) {
            console.error('WriteUp Helper: 生成失败', error);
            this.showNotification('生成失败，请重试', 'error');
        } finally {
            setTimeout(() => {
                this.updateButtonState(this.config.buttonText, false);
                this.isProcessing = false;
            }, 1000);
        }
    }

    /**
     * 更新按钮状态
     * @param {string} text - 按钮文本
     * @param {boolean} disabled - 是否禁用
     */
    updateButtonState(text, disabled) {
        if (this.button) {
            this.button.textContent = text;
            this.button.disabled = disabled;
            this.button.classList.toggle('processing', disabled);
        }
    }

    /**
     * 显示通知
     * @param {string} message - 通知消息
     * @param {string} type - 通知类型 ('success' | 'error' | 'info')
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `writeup-notification writeup-notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // 动画显示
        setTimeout(() => notification.classList.add('show'), 10);

        // 自动隐藏
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * 保存配置到localStorage
     * @param {Object} newConfig - 新配置
     */
    saveConfig(newConfig) {
        // 验证新配置
        if (!this.validateConfig(newConfig)) {
            console.warn('WriteUp Helper: 无效的配置，保存失败');
            return false;
        }

        this.config = { ...this.config, ...newConfig };
        try {
            localStorage.setItem('writeup-helper-config', JSON.stringify(this.config));
            return true;
        } catch (error) {
            console.warn('WriteUp Helper: 配置保存失败', error);
            return false;
        }
    }

    /**
     * 销毁插件实例，清理所有资源
     */
    destroy() {
        try {
            // 停止定期检查
            this.stopPeriodicCheck();

            // 停止MutationObserver
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
                this.mutationObserver = null;
            }

            // 恢复原始的history方法
            if (this.originalHistoryMethods) {
                history.pushState = this.originalHistoryMethods.pushState;
                history.replaceState = this.originalHistoryMethods.replaceState;
                this.originalHistoryMethods = null;
            }

            // 移除按钮
            if (this.button && this.button.parentNode) {
                this.button.parentNode.removeChild(this.button);
                this.button = null;
            }

            // 隐藏设置面板
            this.hideSettingsPanel();

            // 清理所有事件监听器
            for (const [, listeners] of this.eventListeners.entries()) {
                listeners.forEach(({ target, type, listener, options }) => {
                    try {
                        target.removeEventListener(type, listener, options);
                    } catch (error) {
                        console.warn('WriteUp Helper: 清理事件监听器失败', error);
                    }
                });
            }
            this.eventListeners.clear();

            // 重置状态
            this.isDragging = false;
            this.hasDragged = false;
            this.isProcessing = false;
            this.isOpeningObsidian = false;
            this.dragStartTime = 0;

            console.log('WriteUp Helper: 插件已销毁');
        } catch (error) {
            console.error('WriteUp Helper: 销毁过程中发生错误', error);
        }
    }
}

// 初始化插件
let writeUpHelper;

// 全局错误处理
function handleGlobalError(error, context = '') {
    console.error(`WriteUp Helper ${context}:`, error);
    // 可以在这里添加错误上报逻辑
}

// 页面卸载时清理资源
function cleanup() {
    if (window.writeUpHelper && typeof window.writeUpHelper.destroy === 'function') {
        window.writeUpHelper.destroy();
    }
}

// 监听页面卸载事件
window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);

// 等待DOM完全加载后再初始化
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            try {
                writeUpHelper = new WriteUpHelper();
                window.writeUpHelper = writeUpHelper; // 暴露到全局供测试使用
            } catch (error) {
                handleGlobalError(error, '初始化失败');
            }
        });
    } else {
        writeUpHelper = new WriteUpHelper();
        window.writeUpHelper = writeUpHelper; // 暴露到全局供测试使用
    }
} catch (error) {
    handleGlobalError(error, '插件加载失败');
}