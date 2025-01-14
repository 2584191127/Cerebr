import { callAPI, processImageTags } from './chat.js';
import { appendMessage, updateAIMessage } from './message-handler.js';
import { adjustTextareaHeight, showImagePreview, hideImagePreview, createImageTag } from './src/utils/ui.js';
import { handleImageDrop } from './src/utils/image.js';
import { processMessageContent } from './message-utils.js';
import { setTheme } from './src/utils/theme.js';
import { renderAPICards, createCardCallbacks, selectCard } from './src/components/api-card/index.js';
import { showContextMenu, hideContextMenu, copyMessageContent } from './src/components/context-menu/index.js';
import { loadChatHistory } from './chat-history.js';

document.addEventListener('DOMContentLoaded', async () => {
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const contextMenu = document.getElementById('context-menu');
    const copyMessageButton = document.getElementById('copy-message');
    const stopUpdateButton = document.getElementById('stop-update');
    const settingsButton = document.getElementById('settings-button');
    const settingsMenu = document.getElementById('settings-menu');
    const feedbackButton = document.getElementById('feedback-button');
    const previewModal = document.querySelector('.image-preview-modal');
    const previewImage = previewModal.querySelector('img');
    let currentMessageElement = null;
    let currentController = null;  // 用于存储当前的 AbortController

    // 创建UI工具配置
    const uiConfig = {
        textarea: {
            maxHeight: 200
        },
        imagePreview: {
            previewModal,
            previewImage
        },
        imageTag: {
            onImageClick: (base64Data) => {
                showImagePreview({
                    base64Data,
                    config: uiConfig.imagePreview
                });
            },
            onDeleteClick: (container) => {
                container.remove();
                messageInput.dispatchEvent(new Event('input'));
            }
        }
    };

    // 添加反馈按钮点击事件
    feedbackButton.addEventListener('click', () => {
        const newIssueUrl = 'https://github.com/yym68686/Cerebr/issues/new';
        window.open(newIssueUrl, '_blank');
        settingsMenu.classList.remove('visible'); // 使用 classList 来正确切换菜单状态
    });

    // 添加点击事件监听器，让点击侧边栏时自动聚焦到输入框
    document.body.addEventListener('click', (e) => {
        // 如果有文本被选中，不要触发输入框聚焦
        if (window.getSelection().toString()) {
            return;
        }

        // 排除点击设置按钮、设置菜单、上下文菜单的情况
        if (!settingsButton.contains(e.target) &&
            !settingsMenu.contains(e.target) &&
            !contextMenu.contains(e.target)) {
            messageInput.focus();
        }
    });

    // 聊天历史记录变量
    let chatHistory = [];

    // 修改保存聊天历史记录的函数
    async function saveChatHistory() {
        try {
            // 在保存之前处理消息格式
            const processedHistory = chatHistory.map(msg => processMessageContent(msg, processImageTags));
            await chrome.storage.local.set({ chatHistory: processedHistory });
        } catch (error) {
            console.error('保存聊天历史记录失败:', error);
        }
    }

    async function getChatHistoryFromStorage() {
        try {
            const result = await chrome.storage.local.get('chatHistory');
            return result.chatHistory || [];
        } catch (error) {
            console.error('从存储中获取聊天历史记录失败:', error);
            return [];
        }
    }

    // 创建AI消息更新配置
    const updateAIMessageConfig = {
        onSaveHistory: (text) => {
            if (chatHistory.length > 0) {
                chatHistory[chatHistory.length - 1].content = text;
                saveChatHistory();
            }
        }
    };

    // 创建消息处理配置
    const messageHandlerConfig = {
        onSaveHistory: (message) => {
            chatHistory.push(message);
            saveChatHistory();
        },
        onShowImagePreview: showImagePreview,
        onUpdateAIMessage: (text) => {
            updateAIMessage({
                text,
                chatContainer,
                config: updateAIMessageConfig,
                messageHandlerConfig
            });
        },
        imagePreviewConfig: uiConfig.imagePreview
    };

    // 在事件监听器中使用新的函数
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        console.log('标签页切换:', activeInfo);
        chatHistory = await loadChatHistory({
            chatContainer,
            processMessageContent,
            processImageTags,
            createImageTag,
            appendMessage,
            messageHandlerConfig,
            uiConfig,
            getChatHistory: getChatHistoryFromStorage
        });
        await loadWebpageSwitch('标签页切');
    });

    // 初始加载历史记录
    chatHistory = await loadChatHistory({
        chatContainer,
        processMessageContent,
        processImageTags,
        createImageTag,
        appendMessage,
        messageHandlerConfig,
        uiConfig,
        getChatHistory: getChatHistoryFromStorage
    });

    // 网答功能
    const webpageSwitch = document.getElementById('webpage-switch');
    let pageContent = null;

    // 获取网页内容
    async function getPageContent() {
        try {
            console.log('getPageContent 发送获取网页内容请求');
            const response = await chrome.runtime.sendMessage({
                type: 'GET_PAGE_CONTENT_FROM_SIDEBAR'
            });
            return response;
        } catch (error) {
            console.error('获取网页内容失败:', error);
            return null;
        }
    }

    // 修改 loadWebpageSwitch 函数
    async function loadWebpageSwitch(call_name = 'loadWebpageSwitch') {
        console.log(`loadWebpageSwitch 从 ${call_name} 调用`);

        try {
            const domain = await getCurrentDomain();
            console.log('刷新后 网页问答 获取当前域名:', domain);
            if (!domain) return;

            const result = await chrome.storage.local.get('webpageSwitchDomains');
            const domains = result.webpageSwitchDomains || {};
            console.log('刷新后 网页问答存储中获取域名:', domains);

            // 只在开关状态不一致时才更新
            if (domains[domain] !== webpageSwitch.checked) {
                webpageSwitch.checked = !!domains[domain];

                if (webpageSwitch.checked) {
                    document.body.classList.add('loading-content');

                    try {
                        const content = await getPageContent();
                        if (content) {
                            pageContent = content;
                        } else {
                            console.error('loadWebpageSwitch 获取网页内容失败');
                        }
                    } catch (error) {
                        console.error('loadWebpageSwitch 获取网页内容失败:', error);
                    } finally {
                        document.body.classList.remove('loading-content');
                    }
                } else {
                    pageContent = null;
                }
            }
        } catch (error) {
            console.error('加载网页问答状态失败:', error);
        }
    }

    // 修改网页问答开关监听器
    webpageSwitch.addEventListener('change', async () => {
        try {
            const domain = await getCurrentDomain();
            console.log('网页问答开关状态改变后，获取当前域名:', domain);

            if (!domain) {
                console.log('无法获取域名，保持开关状态不变');
                webpageSwitch.checked = !webpageSwitch.checked; // 恢复开关状态
                return;
            }

            console.log('网页问答开关状态改变后，获取网页问答开关状态:', webpageSwitch.checked);

            if (webpageSwitch.checked) {
                document.body.classList.add('loading-content');

                try {
                    const content = await getPageContent();
                    if (content) {
                        pageContent = content;
                        await saveWebpageSwitch(domain, true);
                        console.log('修改网页问答为已开启');
                    } else {
                        console.error('获取网页内容失败。');
                    }
                } catch (error) {
                    console.error('获取网页内容失败:', error);
                } finally {
                    document.body.classList.remove('loading-content');
                }
            } else {
                pageContent = null;
                await saveWebpageSwitch(domain, false);
                console.log('修改网页问答为已关闭');
            }
        } catch (error) {
            console.error('处理网页问答开关变化失败:', error);
            webpageSwitch.checked = !webpageSwitch.checked; // 恢复开关状态
        }
    });
    // 在 DOMContentLoaded 事件处理程序中添加加载网页问答状态
    await loadWebpageSwitch();

    // 在文件开头添加函数用于获取当前域名
    async function getCurrentDomain(retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 500;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url) {
                console.log('未找到活动标签页');
                return null;
            }

            // 处理本地文件
            if (tab.url.startsWith('file://')) {
                return 'local_pdf';
            }

            const hostname = new URL(tab.url).hostname;

            // 规范化域名
            const normalizedDomain = hostname
                .replace(/^www\./, '')  // 移除www前缀
                .toLowerCase();         // 转换为小写

            console.log('规范化域名:', hostname, '->', normalizedDomain);
            return normalizedDomain;
        } catch (error) {
            console.error(`获取当前域名失败 (尝试 ${retryCount + 1}/${maxRetries}):`, error);

            if (retryCount < maxRetries) {
                console.log(`等待 ${retryDelay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return getCurrentDomain(retryCount + 1);
            }

            return null;
        }
    }

    async function sendMessage() {
        // 如果有正在更新的AI消息，停止它
        const updatingMessage = chatContainer.querySelector('.ai-message.updating');
        if (updatingMessage && currentController) {
            currentController.abort();
            currentController = null;
            updatingMessage.classList.remove('updating');
        }

        const message = messageInput.textContent.trim();
        const imageTags = messageInput.querySelectorAll('.image-tag');

        if (!message && imageTags.length === 0) return;

        try {
            // 构建消息内容
            let content;
            if (imageTags.length > 0) {
                content = [];
                if (message) {
                    content.push({
                        type: "text",
                        text: message
                    });
                }
                imageTags.forEach(tag => {
                    const base64Data = tag.getAttribute('data-image');
                    if (base64Data) {
                        content.push({
                            type: "image_url",
                            image_url: {
                                url: base64Data
                            }
                        });
                    }
                });
            } else {
                content = message;
            }

            // 构建用户消息
            const userMessage = {
                role: "user",
                content: content
            };

            // 先添加用户消息到界面和历史记录
            appendMessage({
                text: messageInput.innerHTML,
                sender: 'user',
                chatContainer,
                config: messageHandlerConfig
            });

            // 清空输入框并调整高度
            messageInput.innerHTML = '';
            adjustTextareaHeight({
                textarea: messageInput,
                config: uiConfig.textarea
            });

            // 构建消息数组
            const messages = [...chatHistory.slice(0, -1)];  // 排除刚刚添加的用户消息
            messages.push(userMessage);

            // 准备API调用参数
            const apiParams = {
                messages,
                apiConfig: apiConfigs[selectedConfigIndex],
                userLanguage: navigator.language,
                webpageInfo: webpageSwitch.checked ? pageContent : null
            };

            // 调用 API
            const { processStream, controller } = await callAPI(apiParams);
            currentController = controller;

            // 处理流式响应
            await processStream(messageHandlerConfig.onUpdateAIMessage);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('用户手动停止更新');
                return;
            }
            console.error('发送消息失败:', error);
            appendMessage({
                text: '发送失败: ' + error.message,
                sender: 'ai',
                chatContainer,
                skipHistory: true,
                config: messageHandlerConfig
            });
            // 从 chatHistory 中移除最后一条记录（用户的问题）
            chatHistory.pop();
            saveChatHistory();
        } finally {
            const lastMessage = chatContainer.querySelector('.ai-message:last-child');
            if (lastMessage) {
                lastMessage.classList.remove('updating');
            }
        }
    }

    // 监听来自 content script 的消息
    window.addEventListener('message', (event) => {
        if (event.data.type === 'DROP_IMAGE') {
            console.log('收到拖放图片数据');
            const imageData = event.data.imageData;
            if (imageData && imageData.data) {
                console.log('创建图片标签');
                // 确保base64数据格式正确
                const base64Data = imageData.data.startsWith('data:') ? imageData.data : `data:image/png;base64,${imageData.data}`;
                const imageTag = createImageTag({
                    base64Data: base64Data,
                    fileName: imageData.name
                });

                // 确保输入框有焦点
                messageInput.focus();

                // 获取或创建选区
                const selection = window.getSelection();
                let range;

                // 检查是否有现有选区
                if (selection.rangeCount > 0) {
                    range = selection.getRangeAt(0);
                } else {
                    // 创建新的选区
                    range = document.createRange();
                    // 将选区设置到输入框的末尾
                    range.selectNodeContents(messageInput);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }

                console.log('插入图片标签到输入框');
                // 插入图片标签
                range.deleteContents();
                range.insertNode(imageTag);

                // 移动光标到图片标签后面
                const newRange = document.createRange();
                newRange.setStartAfter(imageTag);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);

                // 触发输入事件以调整高度
                messageInput.dispatchEvent(new Event('input'));
                console.log('图片插入完成');
            }
        } else if (event.data.type === 'FOCUS_INPUT') {
            messageInput.focus();
            const range = document.createRange();
            range.selectNodeContents(messageInput);
            range.collapse(false);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        } else if (event.data.type === 'URL_CHANGED') {
            console.log('[收到URL变化]', event.data.url);
            if (webpageSwitch.checked) {
                console.log('[网页问答] URL变化，重新获取页面内容');
                document.body.classList.add('loading-content');

                getPageContent()
                    .then(async content => {
                        if (content) {
                            pageContent = content;
                            const domain = await getCurrentDomain();
                            if (domain) {
                                await saveWebpageSwitch(domain, true);
                            }
                        } else {
                            console.error('URL_CHANGED 无法获取网页内容');
                        }
                    })
                    .catch(async error => {
                        console.error('URL_CHANGED 获取网页内容失败:', error);
                    })
                    .finally(() => {
                        document.body.classList.remove('loading-content');
                    });
            }
        } else if (event.data.type === 'UPDATE_PLACEHOLDER') {
            console.log('收到更新placeholder消息:', event.data);
            if (messageInput) {
                messageInput.setAttribute('placeholder', event.data.placeholder);
                if (event.data.timeout) {
                    setTimeout(() => {
                        messageInput.setAttribute('placeholder', '输入消息...');
                    }, event.data.timeout);
                }
            }
        }
    });

    // 监听输入框变化
    messageInput.addEventListener('input', function() {
        adjustTextareaHeight({
            textarea: this,
            config: uiConfig.textarea
        });

        // 处理 placeholder 的显示
        if (this.textContent.trim() === '' && !this.querySelector('.image-tag')) {
            // 如果内容空且没有图片标签，清空内容以显示 placeholder
            while (this.firstChild) {
                this.removeChild(this.firstChild);
            }
        }

        // 移除不必要的 br 标签
        const brElements = this.getElementsByTagName('br');
        Array.from(brElements).forEach(br => {
            if (!br.nextSibling || (br.nextSibling.nodeType === Node.TEXT_NODE && br.nextSibling.textContent.trim() === '')) {
                br.remove();
            }
        });
    });

    // 处理换行和输入
    let isComposing = false;  // 跟踪输入法状态

    messageInput.addEventListener('compositionstart', () => {
        isComposing = true;
    });

    messageInput.addEventListener('compositionend', () => {
        isComposing = false;
    });

    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            if (isComposing) {
                // 如果正在使用输入法，不发送消息
                return;
            }
            e.preventDefault();
            const text = this.textContent.trim();
            if (text || this.querySelector('.image-tag')) {  // 检查是否有文本或图片
                sendMessage();
            }
        } else if (e.key === 'Escape') {
            // 按 ESC 键时让输入框失去焦点
            messageInput.blur();
        }
    });

    // 修改点击事件监听器
    document.addEventListener('click', (e) => {
        // 如果点击的不是设置按钮本身和设置菜单，就关闭菜单
        if (!settingsButton.contains(e.target) && !settingsMenu.contains(e.target)) {
            settingsMenu.classList.remove('visible');
        }
    });

    // 确保设置按钮的点击事件在文档点击事件之前处理
    settingsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('visible');
    });

    // 添加输入框的事件监听器
    messageInput.addEventListener('focus', () => {
        settingsMenu.classList.remove('visible');
    });

    // 主题切换
    const themeSwitch = document.getElementById('theme-switch');

    // 创建主题配置对象
    const themeConfig = {
        root: document.documentElement,
        themeSwitch,
        saveTheme: (theme) => chrome.storage.sync.set({ theme })
    };

    // 初始化主题
    async function initTheme() {
        try {
            const result = await chrome.storage.sync.get('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const isDark = result.theme === 'dark' || (!result.theme && prefersDark);
            setTheme(isDark, themeConfig);
        } catch (error) {
            console.error('初始化主题失败:', error);
            // 如果出错，使用系统主题
            setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches, themeConfig);
        }
    }

    // 监听主题切换
    themeSwitch.addEventListener('change', () => {
        setTheme(themeSwitch.checked, themeConfig);
    });

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        chrome.storage.sync.get('theme', (data) => {
            if (!data.theme) {  // 只有在用户没有手动设置主题时才跟随系统
                setTheme(e.matches, themeConfig);
            }
        });
    });

    // 初始化主题
    await initTheme();

    // 修改 saveWebpageSwitch 函数，改进存储和错误处理
    async function saveWebpageSwitch(domain, enabled) {
        console.log('开始保存网页问答开关状态:', domain, enabled);

        try {
            const result = await chrome.storage.local.get('webpageSwitchDomains');
            let domains = result.webpageSwitchDomains || {};

            // 只在状态发生变化时才更新
            if (domains[domain] !== enabled) {
                domains[domain] = enabled;
                await chrome.storage.local.set({ webpageSwitchDomains: domains });
                console.log('网页问答状态已保存:', domain, enabled);
            }
        } catch (error) {
            console.error('保存网页问答状态失败:', error, domain, enabled);
        }
    }

    // API 设置功能
    const apiSettings = document.getElementById('api-settings');
    const apiSettingsToggle = document.getElementById('api-settings-toggle');
    const backButton = document.querySelector('.back-button');
    const apiCards = document.querySelector('.api-cards');

    // 加载保存的 API 配置
    let apiConfigs = [];
    let selectedConfigIndex = 0;

    // 使用新的selectCard函数
    const handleCardSelect = (template, index) => {
        selectCard({
            template,
            index,
            onIndexChange: (newIndex) => {
                selectedConfigIndex = newIndex;
            },
            onSave: saveAPIConfigs,
            cardSelector: '.api-card',
            onSelect: () => {
                // 关闭API设置面板
                apiSettings.classList.remove('visible');
            }
        });
    };

    // 创建渲染API卡片的辅助函数
    const renderAPICardsWithCallbacks = () => {
        renderAPICards({
            apiConfigs,
            apiCardsContainer: apiCards,
            templateCard: document.querySelector('.api-card.template'),
            ...createCardCallbacks({
                selectCard: handleCardSelect,
                apiConfigs,
                selectedConfigIndex,
                saveAPIConfigs,
                renderAPICardsWithCallbacks
            }),
            selectedIndex: selectedConfigIndex
        });
    };

    // 从存储加载配置
    async function loadAPIConfigs() {
        try {
            const result = await chrome.storage.sync.get(['apiConfigs', 'selectedConfigIndex']);
            if (result.apiConfigs && result.apiConfigs.length > 0) {
                apiConfigs = result.apiConfigs;
                selectedConfigIndex = result.selectedConfigIndex || 0;
            } else {
                // 创建默认配置
                apiConfigs = [{
                    apiKey: '',
                    baseUrl: 'https://api.openai.com/v1/chat/completions',
                    modelName: 'gpt-4o'
                }];
                selectedConfigIndex = 0;
                await saveAPIConfigs();
            }
        } catch (error) {
            console.error('加载 API 配置失败:', error);
            // 如果加载失败，也创建默认配置
            apiConfigs = [{
                apiKey: '',
                baseUrl: 'https://api.openai.com/v1/chat/completions',
                modelName: 'gpt-4o'
            }];
            selectedConfigIndex = 0;
        }

        // 确保一定会渲染卡片
        renderAPICardsWithCallbacks();
    }

    // 保存配置到存储
    async function saveAPIConfigs() {
        try {
            await chrome.storage.sync.set({
                apiConfigs,
                selectedConfigIndex
            });
        } catch (error) {
            console.error('保存 API 配置失败:', error);
        }
    }

    // 等待 DOM 加载完成后再初始化
    await loadAPIConfigs();

    // 显示/隐藏 API 设置
    apiSettingsToggle.addEventListener('click', () => {
        apiSettings.classList.add('visible');
        settingsMenu.classList.remove('visible');
        // 确保每次打开设置时都重新渲染卡片
        renderAPICardsWithCallbacks();
    });

    // 返回聊天界面
    backButton.addEventListener('click', () => {
        apiSettings.classList.remove('visible');
    });

    // 清空聊天记录功能
    const clearChat = document.getElementById('clear-chat');
    clearChat.addEventListener('click', () => {
        // 如果有正在进行的请求，停止它
        if (currentController) {
            currentController.abort();
            currentController = null;
        }
        // 清空聊天容器
        chatContainer.innerHTML = '';
        // 清空聊天历史记录
        chatHistory = [];
        saveChatHistory();
        // 关闭设置菜单
        settingsMenu.classList.remove('visible');
        // 聚焦输入框并将光标移到末尾
        messageInput.focus();
        // 移动光标到末尾
        const range = document.createRange();
        range.selectNodeContents(messageInput);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    });

    // 添加点击事件监听
    chatContainer.addEventListener('click', () => {
        // 击聊天区域时让输入框失去焦点
        messageInput.blur();
    });

    // 监听输入框的焦点状态
    messageInput.addEventListener('focus', () => {
        // 输入框获得焦点，阻止事件冒泡
        messageInput.addEventListener('click', (e) => e.stopPropagation());
    });

    messageInput.addEventListener('blur', () => {
        // 输入框失去焦点时，移除点击事件监听
        messageInput.removeEventListener('click', (e) => e.stopPropagation());
    });

    // 监听 AI 消息的右键点击
    chatContainer.addEventListener('contextmenu', (e) => {
        const messageElement = e.target.closest('.ai-message');
        if (messageElement) {
            showContextMenu({
                event: e,
                messageElement,
                contextMenu,
                stopUpdateButton,
                onMessageElementSelect: (element) => {
                    currentMessageElement = element;
                }
            });
        }
    });

    // 点击复制按钮
    copyMessageButton.addEventListener('click', () => {
        copyMessageContent({
            messageElement: currentMessageElement,
            onSuccess: () => hideContextMenu({
                contextMenu,
                onMessageElementReset: () => { currentMessageElement = null; }
            }),
            onError: (err) => console.error('复制失败:', err)
        });
    });

    // 点击其他地方隐藏菜单
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu({
                contextMenu,
                onMessageElementReset: () => { currentMessageElement = null; }
            });
        }
    });

    // 滚动时隐藏菜单
    chatContainer.addEventListener('scroll', () => {
        hideContextMenu({
            contextMenu,
            onMessageElementReset: () => { currentMessageElement = null; }
        });
    });

    // 按下 Esc 键隐藏菜单
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu({
                contextMenu,
                onMessageElementReset: () => { currentMessageElement = null; }
            });
        }
    });

    // 片粘贴功能
    messageInput.addEventListener('paste', async (e) => {
        e.preventDefault(); // 阻止默认粘贴行为

        const items = Array.from(e.clipboardData.items);
        const imageItem = items.find(item => item.type.startsWith('image/'));

        if (imageItem) {
            // 处理图片粘贴
            const file = imageItem.getAsFile();
            const reader = new FileReader();

            reader.onload = async () => {
                const base64Data = reader.result;
                const imageTag = createImageTag({
                    base64Data,
                    fileName: file.name,
                    config: uiConfig.imageTag
                });

                // 在光标位置插入图片标签
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(imageTag);

                // 移动光标到图片标签后面，并确保不会插入额外的换行
                const newRange = document.createRange();
                newRange.setStartAfter(imageTag);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);

                // 移除可能存在的多余行
                const brElements = messageInput.getElementsByTagName('br');
                Array.from(brElements).forEach(br => {
                    if (br.previousSibling && br.previousSibling.classList && br.previousSibling.classList.contains('image-tag')) {
                        br.remove();
                    }
                });

                // 触发输入事件以调整高度
                messageInput.dispatchEvent(new Event('input'));
            };

            reader.readAsDataURL(file);
        } else {
            // 处理文本粘贴
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        }
    });

    // 处理图片标签的删除
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const startContainer = range.startContainer;

            // 检查是否在图片标签旁边
            if (startContainer.nodeType === Node.TEXT_NODE && startContainer.textContent === '') {
                const previousSibling = startContainer.previousSibling;
                if (previousSibling && previousSibling.classList?.contains('image-tag')) {
                    e.preventDefault();
                    previousSibling.remove();

                    // 移除可能存在的多余换行
                    const brElements = messageInput.getElementsByTagName('br');
                    Array.from(brElements).forEach(br => {
                        if (!br.nextSibling || (br.nextSibling.nodeType === Node.TEXT_NODE && br.nextSibling.textContent.trim() === '')) {
                            br.remove();
                        }
                    });

                    // 触发输入事件以调整高度
                    messageInput.dispatchEvent(new Event('input'));
                }
            }
        }
    });

    // 图片预览功能
    const closeButton = previewModal.querySelector('.image-preview-close');

    closeButton.addEventListener('click', () => {
        hideImagePreview({ config: uiConfig.imagePreview });
    });

    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            hideImagePreview({ config: uiConfig.imagePreview });
        }
    });

    // 为输入框添加拖放事件监听器
    messageInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    messageInput.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    messageInput.addEventListener('drop', (e) => {
        handleImageDrop(e, {
            messageInput,
            createImageTag,
            onSuccess: () => {
                // 可以在这里添加成功处理的回调
            },
            onError: (error) => {
                console.error('处理拖放事件失败:', error);
            }
        });
    });

    // 为聊天区域添加拖放事件监听器
    chatContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    chatContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    chatContainer.addEventListener('drop', (e) => {
        handleImageDrop(e, {
            messageInput,
            createImageTag,
            onSuccess: () => {
                // 可以在这里添加成功处理的回调
            },
            onError: (error) => {
                console.error('处理拖放事件失败:', error);
            }
        });
    });

    // 阻止聊天区域的图片默认行为
    chatContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG') {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    // 添加停止更新按钮的点击事件处理
    stopUpdateButton.addEventListener('click', () => {
        if (currentController) {
            currentController.abort();  // 中止当前请求
            currentController = null;
            hideContextMenu({
                contextMenu,
                onMessageElementReset: () => { currentMessageElement = null; }
            });
        }
    });
});