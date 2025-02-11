/**
 * 输入框配置接口
 * @typedef {Object} TextareaConfig
 * @property {number} maxHeight - 输入框最大高度
 */

/**
 * 图片预览配置接口
 * @property {HTMLElement} previewModal - 预览模态框元素
 * @property {HTMLElement} previewImage - 预览图片元素
 */

/**
 * 图片标签配置接口
 * @typedef {Object} ImageTagConfig
 * @property {function} onImageClick - 图片点击回调
 * @property {function} onDeleteClick - 删除按钮点击回调
 */

/**
 * 调整输入框高度
 * @param {Object} params - 参数对象
 * @param {HTMLElement} params.textarea - 输入框元素
 * @param {TextareaConfig} params.config - 输入框配置
 */
export function adjustTextareaHeight({
    textarea,
    config = { maxHeight: 200 }
}) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, config.maxHeight) + 'px';
    if (textarea.scrollHeight > config.maxHeight) {
        textarea.style.overflowY = 'auto';
    } else {
        textarea.style.overflowY = 'hidden';
    }
}

/**
 * 显示图片预览
 * @param {Object} params - 参数对象
 * @param {string} params.base64Data - 图片base64数据
 */
export function showImagePreview({
    base64Data,
    config
}) {
    config.previewImage.src = base64Data;
    config.previewModal.classList.add('visible');
}

/**
 * 隐藏图片预览
 * @param {Object} params - 参数对象
 */
export function hideImagePreview({
    config
}) {
    config.previewModal.classList.remove('visible');
    config.previewImage.src = '';
}

/**
 * 创建图片标签
 * @param {Object} params - 参数对象
 * @param {string} params.base64Data - 图片base64数据
 * @param {string} [params.fileName] - 文件名（可选）
 * @param {ImageTagConfig} params.config - 图片标签配置
 * @returns {HTMLElement} 创建的图片标签元素
 */
export function createImageTag({
    base64Data,
    fileName = '图片',
    config
}) {
    const container = document.createElement('span');
    container.className = 'image-tag';
    container.contentEditable = false;
    container.setAttribute('data-image', base64Data);
    container.title = fileName;

    const thumbnail = document.createElement('img');
    thumbnail.src = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
    thumbnail.alt = fileName;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-linecap="round"/></svg>';
    deleteBtn.title = '删除图片';

    // 点击删除按钮时删除整个标签
    deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (config.onDeleteClick) {
            config.onDeleteClick(container);
        }
    });

    container.appendChild(thumbnail);
    container.appendChild(deleteBtn);

    // 点击图片区域预览图片
    thumbnail.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (config.onImageClick) {
            config.onImageClick(base64Data);
        }
    });

    return container;
}