// =====================================================
// 🛠️ 工具核心：图片压缩 & IndexedDB 本地数据库管理器
// =====================================================

/**
 * 1. 图片压缩函数
 * 作用：把大图压缩到指定宽度和质量，防止一张图几十兆读写太慢
 */
function compressImage(file, quality = 0.6, maxWidth = 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 保持比例缩放
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // 转换为 Base64 (JPEG格式，压缩率高)
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                console.log(`📉 图片压缩: 原图 ≈${(file.size / 1024).toFixed(0)}KB -> 压缩后 ≈${(compressedDataUrl.length / 1024).toFixed(0)}KB`);
                resolve(compressedDataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

/**
 * 2. IndexedDB 管理器
 * 作用：突破 5MB 限制，在浏览器本地数据库存所有的图片数据
 */
const ImageDB = {
    dbName: 'YettaImageStore',
    storeName: 'images',
    db: null,

    async init() {
        if (this.db) return;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, {keyPath: 'id'});
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e);
        });
    },

    // 图片保存 (保持不变)
    async save(file) {
        await this.init();
        const compressedData = await compressImage(file);
        const id = 'img_' + Date.now() + Math.random().toString(36).substr(2, 6);
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add({id: id, data: compressedData});
            request.onsuccess = () => resolve(id);
            request.onerror = (e) => reject(e);
        });
    },

    // 图片读取 (保持不变)
    async get(id) {
        await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result ? request.result.data : null);
            request.onerror = () => resolve(null);
        });
    },

    // ▼▼▼ 新增：保存文本内容 ▼▼▼
    async saveText(content) {
        await this.init();
        const id = 'txt_' + Date.now() + Math.random().toString(36).substr(2, 6);
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add({id: id, data: content});
            request.onsuccess = () => resolve(id);
            request.onerror = (e) => reject(e);
        });
    },

    // ▼▼▼ 新增：读取文本内容 ▼▼▼
    async getText(id) {
        await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result ? request.result.data : null);
            request.onerror = () => resolve(null);
        });
    }
};

// 立即初始化数据库
ImageDB.init();

// --- 辅助函数：给图片元素加载真实数据 ---
async function loadRealImage(imgElement) {
    const src = imgElement.getAttribute('src');
    // 检查这是不是一个占位符地址
    if (src && src.startsWith('db-image://')) {
        const imageId = src.split('db-image://')[1];
        try {
            const realData = await ImageDB.get(imageId);
            if (realData) {
                imgElement.src = realData; // 替换为真实的 Base64
                imgElement.removeAttribute('data-loading'); // 移除加载标记
            } else {
                imgElement.alt = "⚠️ 图片已丢失";
                imgElement.src = ""; // 或者设置一个裂图占位图标
            }
        } catch (e) {
            console.error("读取图片出错", e);
        }
    }
}


// ▼▼▼ 步骤3：将下面所有JS代码粘贴到 <script> 标签的最顶部 ▼▼▼
/**
 * [最终健壮版] 智能AI JSON响应解析器
 * 它可以处理纯JSON、被文字包裹的JSON和被Markdown包裹的JSON
 * @param {string} rawMessage - 从AI获取的原始字符串
 * @returns {{chatReplyText: string, statusData: object|null}}
 */
function parseAiJsonResponse(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'string') {
        return {chatReplyText: '...', statusData: null};
    }

    let text = rawMessage.trim();

    // 1. 尝试清理Markdown代码块标记
    text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    text = text.trim();

    // 2. 寻找JSON对象的边界 (从第一个 '{' 到最后一个 '}')
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
        try {
            // 3. 尝试解析提取出的JSON字符串
            const parsed = JSON.parse(jsonCandidate);
            console.log("✅ 智能提取并解析JSON成功！");

            // 4. 从解析成功的数据中提取 reply 和 status
            //    如果 reply 不存在，则将整个原始文本作为回复（以防万一）
            return {
                chatReplyText: parsed.reply || rawMessage,
                statusData: parsed.status || null
            };
        } catch (e) {
            console.warn(`⚠️ 提取JSON后解析失败: ${e.message}。将作为纯文本处理。`);
        }
    }

    // 5. 如果所有尝试都失败，则返回原始文本
    console.warn("⚠️ 未能解析出有效JSON，将作为纯文本处理。");
    return {
        chatReplyText: rawMessage,
        statusData: null
    };
}


// ================== 地址选择与持久化功能 ==================

// 1. 定义全局变量来存储用户的选择
let locationMode = 'real'; // 'real' 或 'virtual'
let virtualLocation = '';

/**
 * 打开地址选择菜单
 */
function openLocationChooser() {
    document.getElementById('locationActionSheet').classList.add('show');
}

/**
 * 关闭地址选择菜单
 */
function closeLocationChooser() {
    document.getElementById('locationActionSheet').classList.remove('show');
}

/**
 * 用户选择“获取真实地址”
 */
function selectRealLocation() {
    locationMode = 'real';
    // 调用现有的定位函数
    updateLocation();
    // 保存设置并关闭菜单
    saveLocationSettings();
    closeLocationChooser();
}

/**
 * 用户选择“填写虚拟地址”
 */
function selectVirtualLocation() {
    const currentVirtual = localStorage.getItem('virtualLocation') || '请输入虚拟地址';
    const newLocation = prompt('请输入你要显示的虚拟地址：', currentVirtual);

    // 如果用户输入了内容 (而不是取消或留空)
    if (newLocation !== null && newLocation.trim() !== '') {
        const trimmedLocation = newLocation.trim();
        locationMode = 'virtual';
        virtualLocation = trimmedLocation;

        // 立刻更新界面
        document.getElementById('locationText').textContent = trimmedLocation;

        // 保存设置
        saveLocationSettings();
    }
    // 关闭菜单
    closeLocationChooser();
}

/**
 * 将用户的选择保存到 localStorage
 */
function saveLocationSettings() {
    try {
        localStorage.setItem('locationMode', locationMode);
        localStorage.setItem('virtualLocation', virtualLocation);
        console.log(`地址设置已保存: 模式=${locationMode}, 地址=${virtualLocation}`);
    } catch (e) {
        console.error('保存地址设置失败:', e);
    }
}

/**
 * 从 localStorage 加载用户的地址设置
 * (这个函数会在页面启动时调用)
 */
function loadLocationSettings() {
    const savedMode = localStorage.getItem('locationMode');
    const savedVirtual = localStorage.getItem('virtualLocation');

    if (savedMode) {
        locationMode = savedMode;
    }
    if (savedVirtual) {
        virtualLocation = savedVirtual;
    }

    console.log(`地址设置已加载: 模式=${locationMode}, 地址=${virtualLocation}`);

    // 加载后立即应用设置
    if (locationMode === 'virtual' && virtualLocation) {
        document.getElementById('locationText').textContent = virtualLocation;
    } else {
        // 如果是真实模式，则调用 updateLocation
        updateLocation();
    }
}


// ▲▲▲ JS代码粘贴结束 ▲▲▲


// ================== 新增：用户设置相关函数 ==================

/**
 * 打开用于编辑用户信息的卡片
 * 这个函数由“我的信息”按钮的 onclick 调用
 */

let userProfile = {
    name: '我',
    avatar: '👤',
    persona: '我是一名用户，请以简洁友好的方式与我对话。',// 新增用户设定字段
    userVoiceId: '' // <<< 新增：保存用户自己的 Voice ID
};
let currentAvatarTarget = null;

/**
 * 从 localStorage 加载用户配置
 * 这个函数会在应用启动时调用
 */
function loadUserProfile() {
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
        try {
            const loadedProfile = JSON.parse(savedProfile);
            userProfile = {...userProfile, ...loadedProfile};
            // 确保 userVoiceId 有值，否则给个默认
            if (!userProfile.userVoiceId) {
                userProfile.userVoiceId = 'male-qn-qingse'; // 默认值
            }
            console.log('成功从 localStorage 加载用户个人信息。');
        } catch (e) {
            console.error('解析用户个人信息失败:', e);
        }
    }
}

// script.js 顶部

// === 内置世界书配置 ===
const GLOBAL_WORLDBOOK_ID = 'WB_BUILTIN_DEFAULT'; // 固定的ID
const DEFAULT_LORE_TITLE = "聊天风格指南";     // 标题
const DEFAULT_LORE_CONTENT = `
1.  **标点符号的运用 (Punctuation Usage)：**
    *   结尾可以不需要标点符号
    *   使用多个逗号（,,,）、省略号（...）或多个句号（。。。.）来表示停顿、无语或延续的情绪。
    *   大胆使用感叹号（!）、问号（?）和表情符号（如😊、🐰、🫠等）来增强语气。

2.  **语言风格 (Language Style)：**
    *   **口语化：** 使用生活中的常用语和网络化语言。
    *   **玩梗：** 自然地融入网络热梗（如"尊嘟假嘟"、"好好好"、"石锤了"），但要贴合话题，不要生硬。
    *   **句式：** 灵活使用流行句式（如"有没有一种可能..."、"从...调成..."）。
    *   **自然感：** 允许出现轻微的语法"错误"、缩写（如用"の"代替"的"）、以及不完整的碎片化句子（如"不知道他们都拿了多少分"）。

3.  **互动技巧 (Interaction Skills)：**
    *   **情绪表达：** 通过标点、表情和句式传递情绪，而不是直接描述。
    *   **话题跳跃：** 对话可以像真人一样偶尔切换话题，保持随意性。
    *   **互动性：** 多使用疑问句、感叹句和回应性短语（如"你呢？"、"哈哈哈哈哈"）。

`;

/**
 * [统一版] 保存所有类型的角色数据
 */
function saveAllCharacterData() {
    const modal = document.getElementById('characterCardModal');
    const contactId = modal.dataset.editingId;
    const saveTarget = modal.dataset.saveTarget || 'default';
    const worldIdToSaveTo = modal.dataset.currentWorldId;

    if (!contactId) {
        alert("保存失败：ID丢失");
        return;
    }

    // 1. 获取基础表单数据
    const contactName = document.getElementById('char-name').value.trim();
    if (!contactName) {
        alert('角色姓名不能为空！');
        return;
    }
    const contactPersona = document.getElementById('char-persona').value.trim();
    const contactAvatar = document.getElementById('avatar-preview').src;
    const contactVoiceId = document.getElementById('char-voice-id').value.trim();

    // 2. 获取详细设定数据
    const personality = document.getElementById('char-personality').value.trim();
    const occupation = document.getElementById('char-occupation').value.trim();
    const catchphrase = document.getElementById('char-catchphrase').value.trim();
    const relationship = document.getElementById('char-relationship').value.trim();
    const history = document.getElementById('char-history').value.trim();

    // 3. 获取绑定列表
    const boundWorldbooks = [];
    document.querySelectorAll('#charWorldbooksList input[type="checkbox"]:checked').forEach(cb => boundWorldbooks.push(cb.value));
    const boundMasks = [];
    document.querySelectorAll('#charMasksList input[type="checkbox"]:checked').forEach(cb => boundMasks.push(cb.value));

    // 4. 保存用户信息
    userProfile.name = document.getElementById('user-name').value.trim() || '我';
    userProfile.persona = document.getElementById('user-persona').value.trim();
    userProfile.avatar = document.getElementById('user-avatar-preview').src;
    localStorage.setItem('userProfile', JSON.stringify(userProfile));

    // 5. 构建完整联系人对象
    const contactData = {
        id: contactId,
        name: contactName,
        status: contactPersona || '这个角色很神秘，还没有设定...',
        avatar: contactAvatar,
        voiceId: contactVoiceId,
        // 扩展字段
        personality: personality,
        occupation: occupation,
        catchphrase: catchphrase,
        relationship: relationship,
        history: history,
        // 绑定
        boundWorldbooks: boundWorldbooks,
        boundMasks: boundMasks
    };

    // 6. 根据目标保存到不同列表
    if (saveTarget === 'sweetheart') {
        const idx = sweetheartContactsData.findIndex(c => c.id === contactId);
        if (idx !== -1) sweetheartContactsData[idx] = contactData;
        else sweetheartContactsData.push(contactData);
        saveSweetheartContacts();
        renderSweetheartList();

        // 关联到世界
        if (currentWorldId) {
            const world = worldsData.find(w => w.id === currentWorldId);
            if (world && !world.contacts.includes(contactId)) {
                world.contacts.push(contactId);
                saveWorldsData();
            }
        }
    } else if (saveTarget === 'library-only') {
        const idx = libraryOnlyContactsData.findIndex(c => c.id === contactId);
        if (idx !== -1) libraryOnlyContactsData[idx] = contactData;
        else libraryOnlyContactsData.push(contactData);
        localStorage.setItem('phoneLibraryOnlyContactsData', JSON.stringify(libraryOnlyContactsData));
    } else {
        // 默认为普通联系人
        const idx = contactsData.findIndex(c => c.id === contactId);
        if (idx !== -1) contactsData[idx] = contactData;
        else contactsData.push(contactData);
        localStorage.setItem('phoneContactsData', JSON.stringify(contactsData));
        renderContacts(contactsData);
    }

    // 更新界面标题
    if ((currentSweetheartChatContact && currentSweetheartChatContact.id === contactId) ||
        (currentChatContact && currentChatContact.id === contactId)) {
        const titleEl = document.getElementById('chatContactName') || document.getElementById('sweetheartChatContactName');
        if (titleEl) titleEl.textContent = contactName;
    }

    closeCharacterCardPage();
    showSuccessModal('保存成功', '角色信息已更新');
    // 如果是联系人库打开的，刷新库
    if (document.getElementById('contactLibraryPage').classList.contains('show')) {
        renderContactLibrary();
    }
}


// ========== 密友角色卡相关函数 ==========

let currentEditingSweetheartId = null;

/**
 * 关闭密友角色卡弹窗
 */
function closeSweetheartCardModal() {
    const modal = document.getElementById('sweetheartCardModal');
    modal.classList.remove('show');
    // 动画结束后彻底隐藏
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300); // 300ms 对应 CSS 过渡时间
}

/**
 * 打开头像选择器
 */
function openSweetheartAvatarPicker() {
    // 这里可以实现更复杂的选择逻辑，现在简单触发文件上传
    document.getElementById('sweetheart-avatar-input').click();
}

/**
 * 切换世界书列表的展开/收起
 */
function toggleSweetheartWorldbooks() {
    const list = document.getElementById('sweetheartWorldbooksList');
    const arrow = document.getElementById('sweetheart-wb-arrow');

    if (list.style.display === 'none') {
        renderSweetheartWorldbooksList();
        list.style.display = 'block';
        arrow.classList.add('open');
    } else {
        list.style.display = 'none';
        arrow.classList.remove('open');
    }
}

/**
 * 渲染世界书复选框列表
 */
function renderSweetheartWorldbooksList() {
    const container = document.getElementById('sweetheartWorldbooksList');

    if (worldbookData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #BCAAA4; padding: 20px; font-size: 13px;">还没有世界书哦~</div>';
        return;
    }

    container.innerHTML = '';

    worldbookData.forEach(wb => {
        const item = document.createElement('div');
        item.className = 'sweetheart-wb-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `sh-wb-${wb.id}`;
        checkbox.value = wb.id;

        const label = document.createElement('label');
        label.htmlFor = `sh-wb-${wb.id}`;
        label.textContent = wb.title;

        item.appendChild(checkbox);
        item.appendChild(label);
        container.appendChild(item);
    });
}

/**
 * [修正版] 保存密友角色卡数据，并关联到当前世界
 */
function saveSweetheartCardData() {
    // 1. 获取必填字段
    const name = document.getElementById('sweetheart-name').value.trim();
    if (!name) {
        alert('请填写姓名！💕');
        return;
    }

    const persona = document.getElementById('sweetheart-persona').value.trim();
    if (!persona) {
        alert('请填写基础设定！📝');
        return;
    }

    // 2. 获取可选字段
    const personality = document.getElementById('sweetheart-personality').value.trim();
    const occupation = document.getElementById('sweetheart-occupation').value.trim();
    const catchphrase = document.getElementById('sweetheart-catchphrase').value.trim();
    const history = document.getElementById('sweetheart-history').value.trim();
    const relationship = document.getElementById('sweetheart-relationship').value.trim();
    const voiceId = document.getElementById('sweetheart-voice-id').value.trim(); // <<< 新增：获取 Voice ID

    // 3. 获取头像
    const avatar = document.getElementById('sweetheart-avatar-preview').src;
    const finalAvatar = (avatar && !avatar.includes('data:image/gif')) ? avatar : '💖';

    // 4. 获取绑定的世界书
    const boundWorldbooks = [];
    document.querySelectorAll('.sweetheart-wb-item input[type="checkbox"]:checked').forEach(cb => {
        boundWorldbooks.push(cb.value);
    });

    // 获取绑定的面具
    const boundMasks = [];
    document.querySelectorAll('#sweetheartMasksList input[type="checkbox"]:checked').forEach(cb => {
        boundMasks.push(cb.value);
    });

    // 5. 生成ID并组装数据
    const contactId = currentEditingSweetheartId || 'SH' + Date.now();
    const contactData = {
        id: contactId,
        name,
        status: persona,
        avatar: finalAvatar,
        personality,
        occupation,
        catchphrase,
        history,
        relationship,
        voiceId, // <<< 新增：保存 Voice ID
        boundWorldbooks,
        boundMasks
    };

    // 6. 判断是新建还是编辑, 更新 sweetheartContactsData
    const existingIndex = sweetheartContactsData.findIndex(c => c.id === contactId);
    if (existingIndex !== -1) {
        sweetheartContactsData[existingIndex] = contactData;
    } else {
        sweetheartContactsData.push(contactData);
    }
    saveSweetheartContacts(); // 保存密友列表

    // ▼▼▼【核心修复】确保联系人关联到当前世界 ▼▼▼
    if (currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world) {
            // 确保不重复添加
            if (!world.contacts.includes(contactId)) {
                world.contacts.push(contactId);
                saveWorldsData(); // 保存世界数据
                console.log(`✅ 已将新联系人 "${name}" (ID: ${contactId}) 添加到世界 "${world.name}"`);
            }
        }
    }
    // ▲▲▲【修复结束】▲▲▲

    // 7. 刷新列表并关闭弹窗
    renderSweetheartList();
    closeSweetheartCardModal();
    showSuccessModal('保存成功', `${name} 已成功添加！💖`);
}


// ▼▼▼ 第3步：在这里粘贴新增的JS代码 ▼▼▼

/**
 * [新增] 切换角色卡中世界书列表的展开/收起
 */
function toggleCharacterWorldbooks() {
    const list = document.getElementById('charWorldbooksList');
    const arrow = document.getElementById('char-wb-arrow');

    if (list.style.display === 'none') {
        list.style.display = 'block';
        arrow.classList.add('open');
    } else {
        list.style.display = 'none';
        arrow.classList.remove('open');
    }
}

/**
 * [新增] 在角色卡中渲染世界书复选框列表
 * @param {Array<string>} boundIds - 当前角色已绑定的世界书ID数组
 */
function renderCharacterWorldbooksList(boundIds = []) {
    const container = document.getElementById('charWorldbooksList');
    if (!container) return;

    if (worldbookData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-size: 13px;">还没有创建世界书哦~</div>';
        return;
    }

    container.innerHTML = ''; // 清空旧内容

    worldbookData.forEach(wb => {
        const item = document.createElement('div');
        item.className = 'char-wb-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `char-wb-${wb.id}`;
        checkbox.value = wb.id;
        // 如果当前世界书ID在已绑定列表中，则默认勾选
        if (boundIds.includes(wb.id)) {
            checkbox.checked = true;
        }

        const label = document.createElement('label');
        label.htmlFor = `char-wb-${wb.id}`;
        label.textContent = wb.title;

        item.appendChild(checkbox);
        item.appendChild(label);
        container.appendChild(item);
    });
}

// ▲▲▲ JS代码粘贴结束 ▲▲▲


// 监听头像上传
document.addEventListener('DOMContentLoaded', function () {
    const avatarInput = document.getElementById('sweetheart-avatar-input');
    if (avatarInput) {
        avatarInput.addEventListener('change', function (event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    document.getElementById('sweetheart-avatar-preview').src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }
});


const predefinedWallpapers = [
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1980&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?q=80&w=1974&auto=format&fit=crop',
    'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1759876940844_qdqqd_7jj1ti.jpg',
    'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760094166464_qdqqd_n7utqx.jpg',
    'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760094369789_qdqqd_54ccoj.png',
    'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760094483657_qdqqd_fpd674.png',
    'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760094641422_qdqqd_nrkqzw.png',
    'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760094705206_qdqqd_fmzh0j.png',
    'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760094777621_qdqqd_wx4ars.png'
];

function applyWallpaper(imageUrl) {
    const screenEl = document.getElementById('screen');
    if (!imageUrl) {
        screenEl.style.backgroundImage = '';
        localStorage.removeItem('phoneWallpaper');
        console.log('壁纸已清除，恢复默认背景');
    } else {
        screenEl.style.backgroundImage = `url('${imageUrl}')`;
        localStorage.setItem('phoneWallpaper', imageUrl);
        console.log('壁纸已应用并保存');
    }
    updateWallpaperActiveState(imageUrl);
}

function renderWallpaperThumbnails() {
    const grid = document.getElementById('wallpaperGrid');
    grid.innerHTML = '';

    predefinedWallpapers.forEach(url => {
        const thumb = document.createElement('div');
        thumb.className = 'wallpaper-thumbnail';
        thumb.style.backgroundImage = `url('${url}')`;
        thumb.dataset.url = url;
        thumb.onclick = () => applyWallpaper(url);
        grid.appendChild(thumb);
    });

    const noWallpaperThumb = document.createElement('div');
    noWallpaperThumb.className = 'wallpaper-thumbnail';
    noWallpaperThumb.style.background = 'linear-gradient(135deg, #ddd, #fff)';
    noWallpaperThumb.innerHTML = '<span style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-weight:bold; color:#888; font-size:12px;">默认</span>';
    noWallpaperThumb.onclick = () => applyWallpaper('');
    grid.appendChild(noWallpaperThumb);
}

function updateWallpaperActiveState(currentUrl) {
    document.querySelectorAll('.wallpaper-thumbnail').forEach(thumb => {
        if (!thumb.dataset.url && !currentUrl) {
            thumb.classList.add('active');
        } else {
            thumb.classList.toggle('active', thumb.dataset.url === currentUrl);
        }
    });
}

function handleWallpaperUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        applyWallpaper(e.target.result);
        showWallpaperStatus('本地壁纸已应用');
    };
    reader.onerror = () => {
        showWallpaperStatus('读取文件失败', 'error');
    };
    reader.readAsDataURL(file);
}

function toggleWallpaperUrlInput() {
    const urlBox = document.getElementById('wallpaper-url-box');
    urlBox.classList.toggle('show');
}

function applyWallpaperFromUrl() {
    const urlInput = document.getElementById('wallpaper-url-input');
    const url = urlInput.value.trim();
    if (url) {
        applyWallpaper(url);
        showWallpaperStatus('URL壁纸已应用');
        urlInput.value = '';
        toggleWallpaperUrlInput();
    } else {
        showWallpaperStatus('请输入有效的URL', 'error');
    }
}

function showWallpaperStatus(message, type = 'success') {
    const statusEl = document.getElementById('wallpaper-status');
    statusEl.textContent = message;
    statusEl.className = 'status-message' + (type === 'error' ? ' error' : '');
    setTimeout(() => {
        statusEl.textContent = '';
    }, 3000);
}

// === 使用这个最终版本的 updateTime 函数 ===
function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dayStr = days[now.getDay()];

    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthStr = months[now.getMonth()];
    const dateNum = now.getDate();

    const fullDateStr = `${dayStr}, ${monthStr} ${dateNum}`;

    // 更新状态栏的时间
    document.querySelectorAll('.status-bar span:first-child').forEach(el => {
        el.textContent = timeStr;
    });

    // 更新我们最终版容器内的时间和日期
    const mainTimeEl = document.getElementById('finalMainTime');
    if (mainTimeEl) {
        mainTimeEl.textContent = timeStr;
    }

    const mainDateEl = document.getElementById('finalMainDate');
    if (mainDateEl) {
        mainDateEl.textContent = fullDateStr;
    }
}


updateTime();
setInterval(updateTime, 60000);
// script.js
// ... (您的现有代码)

let currentSimulationTimer = null; // 全局计时器，用于停止其他模拟播放
let currentPlayingSimulatedVoiceBubble = null; // 当前正在模拟播放的语音条DOM元素
let currentPlayingAudio = null; // 全局变量，跟踪当前播放的 Audio 对象
let currentMediaElement = null; // 全局变量，跟踪当前播放的 Audio 或 Element
let currentAudio = null; // 全局变量，跟踪当前播放的 Audio 对象
let currentPlayingButton = null; // 跟踪当前正在播放的按钮

// ... (您的其他全局变量和配置)

const globalConfig = {

    customIcons: {},
    savedWidgets: [],
    showAvatarsInSweetheartChat: false,
    sweetheartReplyMode: 'multi', // 默认设为多信息模式
};

// ============================================
// 🔧 [核心配置] 请在此处填入您的真实 Key
// ============================================
const MINIMAX_CONFIG = {
    API_URL: "https://api.minimaxi.com/v1/t2a_v2",
    API_KEY: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiLmvZjlrp3kvIoiLCJVc2VyTmFtZSI6Iua9mOWuneS8iiIsIkFjY291bnQiOiIiLCJTdWJqZWN0SUQiOiIxOTU2NzQwNzg2NjQ5MzA5Njc4IiwiUGhvbmUiOiIxNTkxODQ3MDYxMyIsIkdyb3VwSUQiOiIxOTU2NzQwNzg2NjQwOTIxMDcwIiwiUGFnZU5hbWUiOiIiLCJNYWlsIjoiIiwiQ3JlYXRlVGltZSI6IjIwMjUtMTEtMjUgMjA6Mzk6MjAiLCJUb2tlblR5cGUiOjEsImlzcyI6Im1pbmltYXgifQ.Qb0VkrL-Qmvl-LGpcNGwysnWqVl545InAX4udsEYkfutN6_iEdVSJruxGj0FpmTXJKPQJpuQjtVM5jSagLhhBhNaI4DNmR4pIV_9vkk0T9LxGT7Rul1BsdlR-aUyKxwDLBjH8o2MYkWFuv_dOb7aXawYMeQtNJjV6QRUA5kILVw9MQb0Bs2th_BzYlTJ-S1nbT0jAVAb_gb_ThuRfpg2wccSaft1m5Tr3n3sITLh5dpQy_NWJcvkfOSvKVCfLODJOJHwTh5JgMxHCNFWsaY-3a0fAqN9VWtVP7Spt5E1BPl3hZihDY2iixFN7d3UVZJOEzoQSPjsaNH01He4l4GZvQ",       // 🔴 请替换为您的 API Key
    GROUP_ID: "1956740786640921070",     // 🔴 请替换为您的 Group ID
    MODEL: "speech-01-turbo",                // 默认模型
    DEFAULT_VOICE_ID: "male-qn-qingse"       // 统一使用的声音 ID (听书声音)
};



function setupSweetheartReplyModeSelector() {
    const selector = document.getElementById('sweetheartReplyModeSelector');
    if (selector) {
        selector.addEventListener('click', (event) => {
            const target = event.target.closest('.segmented-option');
            if (target) {
                const newMode = target.dataset.mode;
                globalConfig.sweetheartReplyMode = newMode;
                localStorage.setItem('sweetheartReplyMode', newMode); // 持久化
                updateSweetheartReplyModeUI(newMode);
                showSuccessModal('设置成功', `已切换到${newMode === 'single' ? '单信息' : '多信息'}模式`, 1500);
                // 在这里可能需要调用一个函数来根据模式更新按钮的显示状态
                updateSweetheartChatInputAreaButtons();
            }
        });
    }
}

// script.js (添加到你的辅助函数区域，例如 closeSweetheartChat() 之后，或在任何合适的位置)

/**
 * 更新密友聊天回复模式分段选择器的UI显示
 * @param {string} mode - 当前的回复模式 ('single' 或 'multi')
 */
function updateSweetheartReplyModeUI(mode) {
    const selector = document.getElementById('sweetheartReplyModeSelector');
    if (selector) {
        selector.querySelectorAll('.segmented-option').forEach(option => {
            option.classList.toggle('active', option.dataset.mode === mode);
        });
    }
}

/**
 * [修正版] 更新密友聊天输入区按钮状态
 * 现在只负责根据输入框内容切换 class，不再手动干预 style.display
 */
function updateSweetheartChatInputAreaButtons() {
    const chatInputArea = document.querySelector('.sweetheart-chat-input-area');
    const inputEl = document.getElementById('sweetheartChatInput');

    if (!chatInputArea || !inputEl) return;

    // 纯粹根据是否有字来决定是否添加类名
    // 具体的显示/隐藏逻辑全部交给 CSS 处理
    if (inputEl.value.trim().length > 0) {
        chatInputArea.classList.add('has-text');
    } else {
        chatInputArea.classList.remove('has-text');
    }
}


// 调用：在 initializeApp() 和 `openSweetheartChat()` 的末尾调用 ``


// ========== 密友聊天头像显示控制 - 完整版 ==========

/**
 * 🆕 初始化头像开关的事件监听
 * 这个函数会在页面加载时被调用
 */
function initAvatarToggle() {
    const checkbox = document.getElementById('showAvatarsToggle');
    if (!checkbox) {
        console.warn('⚠️ 找不到头像开关元素 #showAvatarsToggle');
        return;
    }

    // 1. 设置checkbox的初始状态（根据配置）
    checkbox.checked = globalConfig.showAvatarsInSweetheartChat;

    // 2. 监听checkbox的变化事件
    checkbox.addEventListener('change', function () {
        console.log(`💖 用户${this.checked ? '开启' : '关闭'}了头像显示`);
        toggleSweetheartAvatars();
    });

    console.log('✅ 头像开关已初始化，当前状态：' + (checkbox.checked ? '开启' : '关闭'));
}

/**
 * 从localStorage加载头像显示设置
 * 这个函数在页面启动时调用
 */
function loadSweetheartAvatarSetting() {
    try {
        const saved = localStorage.getItem('showAvatarsInSweetheartChat');
        if (saved !== null) {
            globalConfig.showAvatarsInSweetheartChat = JSON.parse(saved);
            console.log('📂 已加载头像设置：' + (globalConfig.showAvatarsInSweetheartChat ? '显示' : '隐藏'));
        } else {
            console.log('📂 未找到保存的头像设置，使用默认值：隐藏');
        }
    } catch (e) {
        console.error('❌ 加载头像设置失败:', e);
        // 出错时使用默认值
        globalConfig.showAvatarsInSweetheartChat = false;
    }

    // 立即应用设置到页面
    updateSweetheartAvatarDisplay();
}

/**
 * 切换密友聊天中的头像显示
 * 这个函数会在用户点击开关时被调用
 */
function toggleSweetheartAvatars() {
    // 1. 切换配置状态
    globalConfig.showAvatarsInSweetheartChat = !globalConfig.showAvatarsInSweetheartChat;

    // 2. 保存到localStorage
    try {
        localStorage.setItem('showAvatarsInSweetheartChat', JSON.stringify(globalConfig.showAvatarsInSweetheartChat));
        console.log(`💾 头像设置已保存：${globalConfig.showAvatarsInSweetheartChat ? '显示' : '隐藏'}`);
    } catch (e) {
        console.error('❌ 保存头像设置失败:', e);
    }

    // 3. 更新UI显示
    updateSweetheartAvatarDisplay();

    // 4. 同步checkbox状态（防止状态不一致）
    const checkbox = document.getElementById('showAvatarsToggle');
    if (checkbox) {
        checkbox.checked = globalConfig.showAvatarsInSweetheartChat;
    }

    // 5. 如果当前正在密友聊天界面，立即刷新消息显示
    if (currentSweetheartChatContact) {
        console.log('🔄 正在刷新密友聊天界面...');
        openSweetheartChat(currentSweetheartChatContact);
    }

    // 6. 显示用户友好的提示
    const statusText = globalConfig.showAvatarsInSweetheartChat ? '已开启' : '已关闭';
    showSuccessModal('设置成功', `密友聊天头像显示${statusText} 💖`, 1500);
}

/**
 * 更新密友聊天页面的头像显示类
 * 这个函数会在设置改变时被调用
 */
function updateSweetheartAvatarDisplay() {
    const sweetheartChatPage = document.getElementById('sweetheartChatPage');
    if (!sweetheartChatPage) {
        console.warn('⚠️ 找不到密友聊天页面元素');
        return;
    }

    if (globalConfig.showAvatarsInSweetheartChat) {
        sweetheartChatPage.classList.add('show-avatars');
        console.log('✅ 已为密友聊天页面添加 .show-avatars 类');
    } else {
        sweetheartChatPage.classList.remove('show-avatars');
        console.log('✅ 已从密友聊天页面移除 .show-avatars 类');
    }
}

/**
 * 切换角色卡中详细设定区域的显示
 */
function toggleCharExtended() {
    const list = document.getElementById('charExtendedFields');
    const arrow = document.getElementById('char-extended-arrow');

    if (list.style.display === 'none') {
        list.style.display = 'block';
        arrow.classList.add('open');
    } else {
        list.style.display = 'none';
        arrow.classList.remove('open');
    }
}

// ========== 开始：请用这个【修正版】函数替换旧的 openCharacterCardPage 函数 ==========

function openCharacterCardPage() {
    const page = document.getElementById('characterCardModal');
    if (!page) {
        console.error('错误：无法找到 characterCardModal 元素！');
        return;
    }

    // 1. 确保 modal 容器在 DOM 中是可见的
    page.style.display = 'flex';

    // 2. 为了让 CSS 过渡动画能够正确触发，我们延迟一个渲染帧再添加 'show' 类
    requestAnimationFrame(() => {
        page.classList.add('show');
    });

    // 3. 🔧 修复点：安全地检查是否是新建联系人
    const modal = page.querySelector('.character-card-modal');
    const editingId = page.dataset.editingId; // 从 page 的 dataset 读取

    // 如果没有 editingId，说明是新建联系人
    const isNewContact = !editingId || editingId === '';

    if (isNewContact) {
        // 重置表单，为新建联系人做准备
        document.getElementById('char-name').value = '';
        document.getElementById('char-persona').value = '';

        // 重置性别选择为男性
        const maleRadio = document.querySelector('.character-gender-selection input[value="male"]');
        if (maleRadio) maleRadio.checked = true;

        // 使用1x1的透明像素作为占位符，避免出现破碎的图片图标
        document.getElementById('avatar-preview').src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        document.getElementById('avatar-input').value = '';

        // 🆕 新增：也重置世界书列表
        renderCharacterWorldbooksList([]);
        renderCharacterMasksList([]);
    }
}


function closeCharacterCardPage() {
    const page = document.getElementById('characterCardModal');
    const modal = page.querySelector('.character-card-modal');
    page.classList.remove('show');

    // 在动画结束后执行清理工作
    setTimeout(() => {
        page.style.display = 'none';
        // 清理模式标记，以便下次默认是编辑联系人
        modal.removeAttribute('data-mode');
    }, 300);
}

// ========== 开始：用这个【修正版】的change事件监听器替换旧的 ==========
document.getElementById('avatar-input').addEventListener('change', function (event) {
    const file = event.target.files[0];
    // 检查文件和当前目标是否存在
    if (file && currentAvatarTarget) {
        const reader = new FileReader();
        reader.onload = function (e) {
            // 根据记录的目标更新对应的头像预览
            const previewId = currentAvatarTarget === 'user' ? 'user-avatar-preview' : 'avatar-preview';
            document.getElementById(previewId).src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}); // <--- 【核心修正】在这里补上缺失的 });


/**
 * 格式化消息文本，支持代码块、Markdown、链接等
 * @param {string} text - 原始文本
 * @returns {string} - 格式化后的 HTML
 */
function formatMessageText(text) {
    if (!text) return '';

    let formatted = text;
    // ✅ 新增：先移除可能存在的 <render> 标签，避免被错误处理
    formatted = formatted.replace(/<render>[\s\S]*?<\/render>/g, '');

    // 1. 处理代码块（三个反引号）- 不创建复制按钮
    formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, function (match, language, code) {
        const lang = language || 'plaintext';
        const escapedCode = escapeHTML(code.trim());

        // ⭐ 核心修改：将复制按钮的 HTML 直接放在 wrapper 内部，pre 的前面
        return `<div class="code-block-wrapper">
            <button class="copy-code-btn" type="button">
                <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>
                <span>复制</span>
            </button>
            <pre><code class="language-${lang}">${escapedCode}</code></pre>
        </div>`;
    });

    // 2. 处理行内代码（单个反引号）
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // 3. 处理粗体（**text** 或 __text__）
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // 4. 处理斜体（*text* 或 _text_）
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');

    // 5. 处理链接
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 6. 处理换行
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
}


/**
 * [修正版] 调整只包含代码块的消息气泡样式
 * - 解决了错位和圆角不匹配的问题
 */
function adjustCodeBlocks() {
    document.querySelectorAll('.chat-bubble').forEach(bubble => {
        const codeBlockWrapper = bubble.querySelector('.code-block-wrapper');

        // 检查气泡是否只包含一个代码块作为其直接子元素
        if (codeBlockWrapper && bubble.children.length === 1) {

            // 1. 将父气泡变为一个透明的、无内边距的容器
            bubble.style.padding = '0';
            bubble.style.background = 'transparent';
            bubble.style.boxShadow = 'none'; // 同时移除阴影，避免留下边框

            // 2. 【核心修复】重置代码块包装器的负外边距，解决错位问题
            codeBlockWrapper.style.margin = '0';
            codeBlockWrapper.style.width = '100%';

            // 3. 【视觉优化】让代码块的圆角与原始气泡的圆角(20px)保持一致
            const preElement = codeBlockWrapper.querySelector('pre');
            if (preElement) {
                preElement.style.borderRadius = '20px';
            }
        }
    });
}

// 在消息渲染后调用
// 例如在 openChat 函数末尾添加：
setTimeout(adjustCodeBlocks, 100);


/**
 * 复制代码块内容到剪贴板
 * @param {HTMLElement} button - 被点击的复制按钮
 */
function copyCodeToClipboard(button) {
    const wrapper = button.closest('.code-block-wrapper');
    if (!wrapper) return;

    const code = wrapper.querySelector('pre code');
    if (!code) return;

    navigator.clipboard.writeText(code.textContent).then(() => {
        const originalHTML = button.innerHTML;
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            已复制`;
        button.classList.add('copied');

        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
    });
}

// // // 修改后的创建复制按钮函数
// function createCopyButton(preElement) {
//     // 检查是否已经有按钮
//     if (preElement.querySelector('.copy-code-btn')) {
//         return;
//     }
//
//     const button = document.createElement('button');
//     button.className = 'copy-code-btn';
//     button.setAttribute('type', 'button');
//
//     // 创建 SVG 图标（调整尺寸）
//     const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
//     svg.setAttribute('viewBox', '0 0 24 24');
//     svg.setAttribute('width', '16');  // 调大
//     svg.setAttribute('height', '16'); // 调大
//
//     const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
//     path.setAttribute('d', 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z');
//     svg.appendChild(path);
//
//     // 创建文本
//     const span = document.createElement('span');
//     span.textContent = '复制';
//
//     // 组装按钮
//     button.appendChild(svg);
//     button.appendChild(span);
//
//     // 复制功能
//     button.onclick = async function () {
//         const code = preElement.textContent || preElement.innerText;
//
//         try {
//             await navigator.clipboard.writeText(code);
//
//             // 成功反馈
//             button.classList.add('copied');
//             span.textContent = '已复制';
//
//             // 3秒后恢复
//             setTimeout(() => {
//                 button.classList.remove('copied');
//                 span.textContent = '复制';
//             }, 3000);
//         } catch (err) {
//             console.error('复制失败:', err);
//             alert('复制失败，请手动选择复制');
//         }
//     };
//
//     // 将按钮插入到 pre 元素内部的开头
//     preElement.insertBefore(button, preElement.firstChild);
//
//     return button;
// }

// // 为所有代码块添加复制按钮
// document.addEventListener('DOMContentLoaded', function () {
//     // 查找所有代码块
//     const codeBlocks = document.querySelectorAll('.code-block-wrapper pre');
//
//     codeBlocks.forEach(preElement => {
//         createCopyButton(preElement);
//     });
// });

// // 如果使用 MutationObserver 监听动态内容
// const observer = new MutationObserver(function (mutations) {
//     mutations.forEach(function (mutation) {
//         mutation.addedNodes.forEach(function (node) {
//             if (node.nodeType === 1) { // Element node
//                 const preElements = node.querySelectorAll?.('.code-block-wrapper pre') || [];
//                 preElements.forEach(pre => createCopyButton(pre));
//
//                 // 如果添加的节点本身就是 pre
//                 if (node.matches?.('.code-block-wrapper pre')) {
//                     createCopyButton(node);
//                 }
//             }
//         });
//     });
// });

// // 开始观察
// observer.observe(document.body, {
//     childList: true,
//     subtree: true
// });


/**
 * 转义 HTML 特殊字符，防止 XSS 攻击
 * @param {string} str - 原始字符串
 * @returns {string} - 转义后的字符串
 */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


let messageLongPressTimer = null; // 用于检测长按的计时器

/**
 * [整合版] 创建消息的DOM元素
 * - 完整包含原始函数中location, red-packet, notice, text, imageUrl, render等所有功能。
 * - 增强了语音条功能（TTS播放、进度条、转写文字显示/隐藏点击优化）。
 * - 完善了红包功能。
 * - 统一了头像和消息内容的DOM结构添加方式，方便CSS控制布局。
 * - 优化了事件绑定逻辑，特别是长按和点击的区分。
 *
 * @param {string} contactId - 联系人ID
 * @param {object} messageObj - 消息对象
 * @param {number} messageIndex - 消息在历史记录中的索引
 * @returns {HTMLElement} 创建好的消息行DOM元素
 */
function _createMessageDOM(contactId, messageObj, messageIndex) {
    if (!messageObj) {
        console.warn(`⚠️ 消息渲染失败：消息对象为空 (Index: ${messageIndex})`);
        return createFallbackMessage({sender: 'system'});
    }

    // 核心修正：在消息创建时，动态获取当前页面的类型
    const sweetheartChatPageEl = document.getElementById('sweetheartChatPage');
    const isSweetheartChatActive = sweetheartChatPageEl && sweetheartChatPageEl.classList.contains('show');

    // 在 _createMessageDOM 函数内部的最开头插入：

    // =======================================================================
    // ▼▼▼ 新增类型：文件上传消息渲染 ▼▼▼
    // =======================================================================
    if (messageObj.type === 'file') {
        const messageRow = document.createElement('div');
        // 同样区分是谁发的
        const senderClass = messageObj.sender === 'user' ? 'sent' : 'received';
        messageRow.className = `message-row ${senderClass}`;
        messageRow.dataset.timestamp = messageObj.timestamp;
        messageRow.dataset.index = messageIndex;

        // 1. 这里的头像逻辑直接复用现有的即可，或者简化如下：
        const avatarEl = document.createElement('div');
        avatarEl.className = 'message-chat-avatar';
        // 根据当前聊天模式判断用谁的头像
        const isSweetheart = document.getElementById('sweetheartChatPage').classList.contains('show');
        const contactData = isSweetheart ? currentSweetheartChatContact : currentChatContact;
        // 如果是用户发的，用我的头像；如果是对面发的，用联系人头像
        const avatarSrc = messageObj.sender === 'user' ? (userProfile.avatar || '👤') : (contactData.avatar || '💬');
        const isUrl = avatarSrc && (avatarSrc.startsWith('http') || avatarSrc.startsWith('data:'));
        avatarEl.innerHTML = isUrl ? `<img src="${avatarSrc}">` : `<div class="initials">${avatarSrc}</div>`;

        // 2. 创建内容容器
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        // 3. 创建气泡
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        // 给一个蓝色的文件图标样式
        bubble.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:24px;">📄</span>
                <div>
                    <div style="font-weight:bold; font-size:14px;">${escapeHTML(messageObj.content.name)}</div>
                    <div style="font-size:11px; opacity:0.8;">已上传，等待发送...</div>
                </div>
            </div>`;

        messageContent.appendChild(bubble);
        messageRow.appendChild(avatarEl);
        messageRow.appendChild(messageContent);

        // 绑定长按事件（保持原有逻辑）
        bindMessageEvents(bubble, contactId, messageIndex, isSweetheart);

        return messageRow; // 直接返回，不再往下执行
    }
    // ▲▲▲ 插入结束 ▲▲▲

    // =======================================================================
    // ▼▼▼ 类型 A: 地点通知消息 (Original Functionality) ▼▼▼
    // =======================================================================
    if (messageObj.type === 'location') {
        const locationNotice = document.createElement('div');
        locationNotice.className = 'location-notice';
        locationNotice.dataset.index = messageIndex;
        // 确保 location notice 也有 timestamp 属性
        locationNotice.dataset.timestamp = messageObj.timestamp;
        locationNotice.innerHTML = `
            <div class="location-notice-icon">🗺️</div>
            <div class="location-notice-text">
                <strong>📍 ${escapeHTML(messageObj.locationName || '未知地点')}</strong>
                <p>${escapeHTML(messageObj.locationDesc || '无描述')}</p>
            </div>
        `;
        // 事件绑定到 notice 元素本身
        bindMessageEvents(locationNotice, contactId, messageIndex, isSweetheartChatActive);
        return locationNotice;
    }

    // =======================================================================
    // ▼▼▼ 类型 B: 红包消息 (Original Functionality Enhanced) ▼▼▼
    // =======================================================================
    if (messageObj.type === 'red-packet') {
        const messageRow = document.createElement('div');
        messageRow.className = 'message-row ' + (messageObj.sender === 'user' ? 'sent' : 'received');
        messageRow.dataset.timestamp = messageObj.timestamp; // 记录时间戳
        messageRow.dataset.index = messageIndex; // 记录索引

        // 1. 创建正确的头像DOM
        const avatarEl = document.createElement('div');
        avatarEl.className = 'message-chat-avatar';
        // 根据当前聊天模式获取联系人数据
        const contactData = isSweetheartChatActive ? currentSweetheartChatContact : currentChatContact;
        const avatarSrc = messageObj.sender === 'user' ? (userProfile?.avatar || '👤') : (contactData?.avatar || '💬');
        const isUrl = avatarSrc.startsWith('http') || avatarSrc.startsWith('data:');
        avatarEl.innerHTML = isUrl ? `<img src="${avatarSrc}" alt="avatar">` : `<div class="initials">${avatarSrc}</div>`;

        // 2. 创建 message-content 容器
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        // 3. 创建红包气泡并绑定事件 (使用之前提供的 `createRedPacketBubble` 函数)
        const bubble = createRedPacketBubble(messageObj);

        // 4. 将气泡放入 message-content 容器
        messageContent.appendChild(bubble);

        // 5. 【核心修复】统一将头像和内容按顺序添加，交由 CSS 控制最终布局
        // 这样可以确保无论在哪个聊天模式，头像和内容都会被正确放置到 messageRow 中
        messageRow.appendChild(avatarEl);
        messageRow.appendChild(messageContent);

        // 绑定长按等事件到气泡上
        bindMessageEvents(bubble, contactId, messageIndex, isSweetheartChatActive);

        return messageRow;
    }

    // =======================================================================
// ▼▼▼ 类型 C: 语音条消息 - 最终修复版 ▼▼▼
// =======================================================================
    if (messageObj.type === 'voice') {
        const messageRow = document.createElement('div');
        messageRow.className = 'message-row ' + (messageObj.sender === 'user' ? 'sent' : 'received');
        messageRow.dataset.timestamp = messageObj.timestamp;
        messageRow.dataset.index = messageIndex;

        const contactData = isSweetheartChatActive ? currentSweetheartChatContact : currentChatContact;

        const avatarEl = document.createElement('div');
        avatarEl.className = 'message-chat-avatar';
        let avatarSrc = messageObj.sender === 'user' ? (userProfile?.avatar || '👤') : (contactData?.avatar || '💬');
        const isUrl = avatarSrc.startsWith('http') || avatarSrc.startsWith('data:');
        avatarEl.innerHTML = isUrl ? `<img src="${avatarSrc}" alt="avatar">` : `<div class="initials">${escapeHTML(avatarSrc)}</div>`;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        const senderName = document.createElement('div');
        senderName.className = 'message-sender-name';
        senderName.textContent = messageObj.sender === 'user' ? (userProfile.name || '我') : (contactData?.name || '联系人');

        const voiceBubble = document.createElement('div');
        voiceBubble.className = 'voice-message-bubble chat-bubble';
        voiceBubble.classList.add(messageObj.sender === 'user' ? 'voice-sent' : 'voice-received');

        // 🎯 关键修改：设置语音条为相对定位
        voiceBubble.style.position = 'relative';

        const transcriptionText = escapeHTML(messageObj.content.text || '...');
        const duration = messageObj.content.duration || '0';

        voiceBubble.innerHTML = `
        <div class="voice-main-content">
            <button class="voice-play-icon" type="button">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            </button>
            <div class="voice-bar">
                <div class="voice-progress-fill"></div>
            </div>
            <div class="voice-duration">${duration}"</div>
        </div>
        <div class="voice-transcription" style="display: none;">
            <span class="disclosure-arrow">▲</span>
            <div class="voice-text">${transcriptionText}</div>
        </div>
    `;

        const playIcon = voiceBubble.querySelector('.voice-play-icon');
        const progressBar = voiceBubble.querySelector('.voice-progress-fill');
        const transcriptionEl = voiceBubble.querySelector('.voice-transcription');
        const voiceBar = voiceBubble.querySelector('.voice-bar');
        const voiceDuration = voiceBubble.querySelector('.voice-duration');

        // 设置播放按钮为相对定位，提高层级
        playIcon.style.position = 'relative';
        playIcon.style.zIndex = '20';

        // 设置图标颜色
        const playIconSvg = playIcon.querySelector('svg');
        if (playIconSvg) {
            if (messageObj.sender === 'user') {
                playIconSvg.style.fill = 'white';
            } else {
                playIconSvg.style.fill = '#333';
                if (isSweetheartChatActive) {
                    playIconSvg.style.fill = '#8D6E63';
                }
            }
        }

        // ============ 创建点击区域（不覆盖播放按钮）============
        // 🎯 核心修改：为进度条和时长单独添加点击事件，而不是覆盖整个气泡

        const toggleTranscription = () => {
            if (transcriptionEl) {
                const isHidden = transcriptionEl.style.display === 'none' || !transcriptionEl.style.display;
                transcriptionEl.style.display = isHidden ? 'block' : 'none';

                // 添加视觉反馈
                voiceBubble.style.transition = 'transform 0.1s ease';
                voiceBubble.style.transform = 'scale(0.96)';
                setTimeout(() => {
                    voiceBubble.style.transform = 'scale(1)';
                }, 100);
            }
        };

        // 为进度条添加点击事件
        if (voiceBar) {
            voiceBar.style.cursor = 'pointer';
            voiceBar.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTranscription();
            });
        }

        // 为时长文字添加点击事件
        if (voiceDuration) {
            voiceDuration.style.cursor = 'pointer';
            voiceDuration.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTranscription();
            });
        }

        // 为整个语音主体内容区域添加点击事件（但会被子元素的stopPropagation阻止）
        const voiceMainContent = voiceBubble.querySelector('.voice-main-content');
        if (voiceMainContent) {
            voiceMainContent.addEventListener('click', (e) => {
                // 如果点击的是空白区域（不是按钮、进度条或时长）
                if (e.target === voiceMainContent) {
                    toggleTranscription();
                }
            });
        }

        // 为转写文字区域添加点击事件（点击可以收起）
        if (transcriptionEl) {
            transcriptionEl.style.cursor = 'pointer';
            transcriptionEl.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTranscription();
            });
        }

        // ============ 播放按钮的事件处理 ============
        const triggerPlay = async (e) => {
            e.preventDefault();
            e.stopPropagation(); // 阻止事件冒泡到父元素

            const voiceConfig = globalConfig.minimaxVoice;
            if (!voiceConfig.apiUrl || !voiceConfig.apiKey || !voiceConfig.groupId || !voiceConfig.ttsModel) {
                showErrorModal('语音配置不完整', '请在"设置 > 语音设置"中完整配置 Minimax TTS。');
                return;
            }

            if (currentAudio) {
                const wasPlayingThis = currentPlayingButton === playIcon;
                currentAudio.pause();
                currentAudio = null;
                currentPlayingButton = null;
                if (wasPlayingThis) {
                    return;
                }
            }

            const textToSynthesize = messageObj.content.text || '';
            if (!textToSynthesize) {
                showErrorModal('无法播放', '该语音消息没有转写文本。');
                return;
            }

            let voiceId = '';
            if (messageObj.sender === 'user') {
                voiceId = userProfile.userVoiceId || 'male-qn-qingse';
            } else {
                const contact = isSweetheartChatActive
                    ? sweetheartContactsData.find(c => c.id === contactId)
                    : contactsData.find(c => c.id === contactId);
                voiceId = contact?.voiceId || 'female-qn-yuxin';
            }

            // UI: 设置为加载状态
            playIcon.disabled = true;
            playIcon.classList.add('loading');
            playIcon.innerHTML = `<svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>`;

            try {
                const response = await fetch(`${voiceConfig.apiUrl}?GroupId=${voiceConfig.groupId}`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${voiceConfig.apiKey}`},
                    body: JSON.stringify({
                        model: voiceConfig.ttsModel,
                        text: textToSynthesize,
                        stream: false,
                        output_format: 'hex',
                        voice_setting: {voice_id: voiceId, speed: 1, vol: 1, pitch: 0}
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(`API请求失败: ${response.status} - ${errData.base_resp?.status_msg || response.statusText}`);
                }

                const data = await response.json();
                if (data.base_resp.status_code !== 0 || !data.data?.audio) {
                    throw new Error(`语音合成失败: ${data.base_resp?.status_msg || '未知错误'}`);
                }

                const audioBytes = hexToUint8Array(data.data.audio);
                const audioBlob = new Blob([audioBytes], {type: 'audio/mpeg'});
                const audioObjectUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioObjectUrl);
                currentAudio = audio;
                currentPlayingButton = playIcon;

                audio.onplay = () => {
                    playIcon.disabled = false;
                    playIcon.classList.remove('loading');
                    playIcon.classList.add('playing');
                    playIcon.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
                    voiceBubble.classList.add('is-playing');
                };

                audio.ontimeupdate = () => {
                    if (audio.duration > 0) {
                        progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
                    }
                };

                const resetUI = () => {
                    playIcon.classList.remove('playing', 'loading');
                    playIcon.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;
                    voiceBubble.classList.remove('is-playing');
                    progressBar.style.width = '0%';
                    URL.revokeObjectURL(audioObjectUrl);
                    if (currentAudio === audio) {
                        currentAudio = null;
                        currentPlayingButton = null;
                    }
                };

                audio.onpause = resetUI;
                audio.onended = resetUI;
                audio.onerror = () => {
                    showErrorModal('播放失败', '音频文件损坏或无法播放。');
                    resetUI();
                };

                audio.play();

            } catch (error) {
                console.error('播放语音条失败:', error);
                showErrorModal('语音合成错误', error.message);
                playIcon.disabled = false;
                playIcon.classList.remove('loading');
                playIcon.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;
            }
        };

        // 绑定播放按钮的点击事件
        playIcon.addEventListener('click', triggerPlay);

        // 移动端的触摸优化（可选）
        let touchStartTime = 0;
        playIcon.addEventListener('touchstart', () => {
            touchStartTime = Date.now();
        }, {passive: true});

        playIcon.addEventListener('touchend', (e) => {
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration < 200) { // 快速点击才触发
                e.preventDefault();
                triggerPlay(e);
            }
        }, {passive: false});

        messageContent.appendChild(senderName);
        messageContent.appendChild(voiceBubble);

        messageRow.appendChild(avatarEl);
        messageRow.appendChild(messageContent);

        // 可选：如果需要长按功能，可以在这里添加
        // bindMessageEvents(voiceBubble, contactId, messageIndex, isSweetheartChatActive);

        return messageRow;
    }


    // =======================================================================
    // ▼▼▼ 类型 D: 系统通知消息 (Original Functionality) ▼▼▼
    // =======================================================================
    if (messageObj.type === 'notice') {
        return createSystemNotice(messageObj);
    }

    // =======================================================================
    // ▼▼▼ 类型 E: 文本 (含引用、代码块) / 图片 / Render 消息 (Original Functionality) ▼▼▼
    // =======================================================================
    const hasContent = messageObj.text || messageObj.imageUrl;
    if (!hasContent) {
        console.warn(`⚠️ 消息渲染失败：消息内容为空 (Index: ${messageIndex})`, messageObj);
        return createFallbackMessage(messageObj);
    }

    const messageRow = document.createElement('div');
    messageRow.className = 'message-row';
    messageRow.classList.add(messageObj.sender === 'user' ? 'sent' : 'received');
    messageRow.dataset.timestamp = messageObj.timestamp;
    messageRow.dataset.index = messageIndex;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'message-chat-avatar';

    let contactData = isSweetheartChatActive ? currentSweetheartChatContact : currentChatContact;

    let avatarSrc = messageObj.sender === 'user'
        ? (userProfile?.avatar || '👤')
        : (contactData?.avatar || '💬');

    const isUrl = avatarSrc.startsWith('http') || avatarSrc.startsWith('data:');
    avatarEl.innerHTML = isUrl
        ? `<img src="${avatarSrc}" alt="avatar">`
        : `<div class="initials">${escapeHTML(avatarSrc)}</div>`;

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const senderName = document.createElement('div');
    senderName.className = 'message-sender-name';
    senderName.textContent = messageObj.sender === 'user'
        ? (userProfile.name || '我')
        : (contactData?.name || '联系人');

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    const text = messageObj.text || '';
    // 使用更健壮的正则表达式来匹配 <render> 标签，处理多行和各种非<字符

    const renderMatch = text.match(/<render>([\s\S]*?)<\/render>/);
    if (renderMatch && renderMatch[1]) {
        bubble.classList.add('render-bubble');
        const iframe = document.createElement('iframe');
        iframe.className = 'render-iframe';
        // 允许脚本执行
        iframe.sandbox = 'allow-scripts allow-forms allow-pointer-lock allow-popups allow-same-origin';

        // 🔥 关键修改：注入自动计算高度的 ResizeObserver 脚本
        // 这里的 CSS 保证 body 没有 margin，防止计算误差
        const autoResizeScript = `
            <script>
                function reportHeight() {
                    // 获取内容的确切高度
                    const height = document.body.scrollHeight;
                    // 发送消息给父窗口
                    window.parent.postMessage({
                        type: 'iframe-resize',
                        height: height
                    }, '*');
                }
                // 监听内容变化
                const observer = new ResizeObserver(reportHeight);
                observer.observe(document.body);
                
                // 图片加载完成后再次汇报，防止图片未加载导致高度错误
                window.addEventListener('load', reportHeight);
                // 每次点击也检查一次（处理交互式展开内容）
                window.addEventListener('click', () => setTimeout(reportHeight, 100));
            </script>
        `;
        /* script.js 中 _createMessageDOM 函数内部 */

        const secureSrcDoc = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            /* 🔥 样式修正：允许 iframe 内部内容撑开 */
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100%;
                /* 允许高度自然生长 */
                min-height: 100%; 
                height: auto;
                /* 防止双重滚动条，主要滚动由外部 .render-bubble 控制 */
                overflow-x: hidden;
                overflow-y: visible; 
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            body {
                padding: 10px !important;
            }
            * { box-sizing: border-box; }
            img { max-width: 100%; height: auto; display: block; }
            
            /* 隐藏滚动条样式 (可选，让界面更干净) */
            ::-webkit-scrollbar { display: none; }
        </style>
    </head>
    <body>
        ${renderMatch[1]}
        ${autoResizeScript}
    </body>
    </html>
`;


        iframe.srcdoc = secureSrcDoc;
        bubble.appendChild(iframe);

        // 事件捕获层保持不变
        const eventCaptureLayer = document.createElement('div');
        eventCaptureLayer.className = 'iframe-event-capture-layer';
        bubble.appendChild(eventCaptureLayer);
    } else if (messageObj.imageUrl) {
        bubble.classList.add('image-only');
        const img = document.createElement('img');
        img.src = messageObj.imageUrl;
        img.alt = '图片';
        img.style.maxWidth = '150px';
        img.style.borderRadius = '10px';
        bubble.appendChild(img);
    } else {
        let contentHTML = '';
        if (messageObj.quote && messageObj.quote.senderName) {
            let quotedText = (messageObj.quote.text || '').substring(0, 50);
            if (messageObj.quote.text && messageObj.quote.text.includes('<img')) {
                quotedText = '[图片]';
            } else if ((messageObj.quote.text || '').length > 50) {
                quotedText += '...';
            }
            contentHTML += `<div class="quoted-message-wrapper"><strong class="quoted-sender">${escapeHTML(messageObj.quote.senderName)}</strong><span class="quoted-text">${escapeHTML(quotedText)}</span></div>`;
        }
        const formattedText = formatMessageText(text);
        if (formattedText) {
            contentHTML += `<div class="main-message-text">${formattedText}</div>`;
        }
        bubble.innerHTML = contentHTML;
    }
    messageContent.appendChild(senderName);
    messageContent.appendChild(bubble);
    // 🔥 统一将头像和内容按顺序添加，交由 CSS 控制最终布局
    messageRow.appendChild(avatarEl);
    messageRow.appendChild(messageContent);

    // ===================== 新增：IndexedDB 图片加载逻辑 =====================
    // 这段代码会检查刚刚创建好的 messageRow 里有没有我们要的图

    // 情况1：普通聊天/HTML中的图片
    const imgs = messageRow.querySelectorAll('img');
    imgs.forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('db-image://')) {
            // 这是一个数据库图片，调用加载函数
            loadRealImage(img);
        }
    });

    // 情况2：密友聊天 (image-only)
    // 如果你的代码是用 messageObj.imageUrl 创建的 img 标签
    if (messageObj.type !== 'voice' && messageObj.imageUrl && messageObj.imageUrl.startsWith('db-image://')) {
        // 如果上面的 querySelectorAll 没抓到 (虽然通常能抓到)，这里做个双重保险
        // 这一步通常在上面就被处理了，但为了保险起见：
        const mainImg = messageRow.querySelector('.chat-bubble.image-only img');
        if (mainImg) loadRealImage(mainImg);
    }

    bindMessageEvents(bubble, contactId, messageIndex, isSweetheartChatActive);
    // 修复：这里复制按钮的事件监听应该放在一个更合理的位置，例如在 appendChild 之后，
    // 或者通过事件委托统一处理，但在 createMessageDOM 中直接绑定，需要确保元素存在
    setTimeout(() => {
        const codeBlockWrappers = messageRow.querySelectorAll('.code-block-wrapper');
        codeBlockWrappers.forEach(wrapper => {
            const copyButton = wrapper.querySelector('.copy-code-btn');
            if (copyButton) {
                copyButton.onclick = () => copyCodeToClipboard(copyButton);
            }
        });
    }, 0);

    return messageRow;
}


/* script.js (在全局作用域的任何地方添加) */

// 创建一个DOMParser实例，以避免重复创建
const messageParser = new DOMParser();


/* script.js (接着上次的功能，完整重写 playTtsMessage 函数) */

let currentPlayingMessageIdentifier = null; // 全局记录当前播放的消息唯一标识，如 "contactId_messageIndex"

// 将 hex 编码的字符串转换为 Uint8Array
function hexToUint8Array(hexString) {
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    return bytes;
}

// 【最终健壮版】播放 TTS 消息，已优化全局音频控制
// 新版本：不再需要 button 参数，使用全局提示框
// [修改版] 播放 TTS 消息 (统一使用听书声音)
async function playTtsMessage(sender, contactId, messageIndex, isSweetheart = false) {
    if (currentAudio) {
        currentAudio.pause();
    }

    // 1. 检查配置是否已填写
    if (MINIMAX_CONFIG.API_KEY.includes("YOUR_REAL")) {
        showErrorModal('配置缺失', '请在代码 script.js 顶部的 MINIMAX_CONFIG 中填入真实的 API Key 和 Group ID。');
        return;
    }

    const historyKey = isSweetheart ? 'phoneSweetheartChatHistory' : 'phoneChatHistory';
    const chatHistory = JSON.parse(localStorage.getItem(historyKey) || '{}');
    const message = chatHistory[contactId]?.[messageIndex];

    if (!message || typeof message.text !== 'string' || !message.text.trim()) {
        showErrorModal('无法朗读', '此消息内容为空。');
        return;
    }

    // 2. 统一使用配置中的声音 ID
    const voiceId = MINIMAX_CONFIG.DEFAULT_VOICE_ID;

    // 提取纯文本
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = message.text;
    const messageText = tempDiv.textContent || tempDiv.innerText;

    showSuccessModal('朗读中...', '正在合成语音...', 99999);

    try {
        const response = await fetch(`${MINIMAX_CONFIG.API_URL}?GroupId=${MINIMAX_CONFIG.GROUP_ID}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MINIMAX_CONFIG.API_KEY}`
            },
            body: JSON.stringify({
                model: MINIMAX_CONFIG.MODEL,
                text: messageText,
                stream: false,
                output_format: 'hex',
                voice_setting: {
                    voice_id: voiceId,
                    speed: 1,
                    vol: 1,
                    pitch: 0
                }
            })
        });

        if (!response.ok) throw new Error(`API请求失败: ${response.status}`);
        const data = await response.json();
        if (data.base_resp.status_code !== 0) throw new Error(data.base_resp.status_msg);

        const audioBytes = hexToUint8Array(data.data.audio);
        const audioBlob = new Blob([audioBytes], {type: 'audio/mpeg'});
        const audioObjectUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioObjectUrl);
        currentAudio = audio;

        const hideLoadingModal = () => {
            const modal = document.getElementById('successModal');
            if (modal) modal.classList.remove('show');
        };

        audio.onplay = hideLoadingModal;
        audio.onended = () => { hideLoadingModal(); URL.revokeObjectURL(audioObjectUrl); currentAudio = null; };
        audio.onerror = () => { showErrorModal('播放失败', '音频文件损坏。'); hideLoadingModal(); };
        audio.play();

    } catch (error) {
        console.error('朗读失败:', error);
        showErrorModal('朗读失败', error.message);
        document.getElementById('successModal').classList.remove('show');
    }
}


/**
 * [最终修复版] 为指定消息元素绑定长按和右键菜单事件
 * - 确保事件被目标元素精确捕获，并全面阻止浏览器默认行为。
 * - 健壮性处理区分长按、拖动和点击。
 *
 * @param {HTMLElement} element - 要绑定事件的DOM元素 (通常是 .chat-bubble 或 .location-notice)
 * @param {string} contactId - 联系人ID
 * @param {number} messageIndex - 消息索引
 * @param {boolean} isSweetheart - 是否为密友聊天模式
 */
function bindMessageEvents(element, contactId, messageIndex, isSweetheart) {
    if (!element.addEventListener) return;
    console.log(`💡 Binding message context menu events for message index ${messageIndex} (Sweetheart: ${isSweetheart})`);

    let longPressTimer = null;
    let startPos = {x: 0, y: 0};
    let isMoving = false; // 判断用户是否在“拖动”
    let hasMenuShown = false; // 标记菜单是否已显示过，防止多次触发

    // ==================== 辅助函数 START ====================
    const getCoords = (e) => {
        if (e.touches && typeof e.touches[0] !== 'undefined') return {x: e.touches[0].clientX, y: e.touches[0].clientY};
        return {x: e.clientX, y: e.clientY};
    };

    const showMenu = () => {
        hasMenuShown = true;
        if (isSweetheart) {
            showSweetheartMessageActionSheet(contactId, messageIndex);
        } else {
            showNormalMessageActionSheet(contactId, messageIndex);
        }
        // 显示菜单后，确保所有计时器和状态被清除，防止后续事件干扰
        clearTimeout(longPressTimer);
        longPressTimer = null;
        isMoving = false;

        // 如果是render bubble，显示菜单时要禁用iframe事件捕获层
        const renderOverlay = element.querySelector('.iframe-event-capture-layer');
        if (renderOverlay) renderOverlay.style.pointerEvents = 'auto'; // 重新激活捕获层
    };

    const resetState = () => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        isMoving = false;
        hasMenuShown = false;
        // 恢复render bubble的iframe事件捕获层
        const renderOverlay = element.querySelector('.iframe-event-capture-layer');
        if (renderOverlay) renderOverlay.style.pointerEvents = 'none'; // 禁用捕获层，允许iframe交互
    };
    // ==================== 辅助函数 END ====================


    // ==================== 事件处理 START ====================
    const handleStart = (e) => {
        // 阻止浏览器默认行为
        if (e.cancelable) {
            e.preventDefault();
        }
        e.stopPropagation(); // 阻止事件冒泡到父元素（如可滚动的 chat-messages 区域）

        // 如果是iframe的事件层，不处理长按菜单
        if (e.target.classList.contains('iframe-event-capture-layer')) {
            return;
        }

        // 如果是语音消息的播放按钮，不处理长按菜单（语音播放按钮有自己的长按处理）
        // ✅ 核心修复：这里判断 target.closest('.voice-play-icon') 确保点击播放按钮不会触发气泡长按
        if (e.target.closest('.voice-play-icon')) {
            return;
        }

        resetState(); // 重置所有状态

        startPos = getCoords(e);

        longPressTimer = setTimeout(() => {
            // 只有在没有移动过的情况下，才触发长按菜单
            if (!isMoving) {
                showMenu();
            }
        }, 500); // 500ms 触发长按
    };

    /* script.js 中 bindMessageEvents 函数内部 */

    const handleMove = (e) => {
        // 如果菜单已经显示，或者没有长按计时器，则不处理移动
        if (!longPressTimer || hasMenuShown) return;

        const currentCoords = getCoords(e);
        const distance = Math.hypot(currentCoords.x - startPos.x, currentCoords.y - startPos.y);

        // 如果移动距离超过一个阈值，就认为是拖动，取消长按计时器
        if (distance > 10) { // 设置10像素的抖动阈值
            isMoving = true;
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // 如果是正在长按的事件，并且已经移动了，阻止滚动（防止长按被转换为滚动）
        if (isMoving && e.cancelable) {
            // ▼▼▼【核心修复】▼▼▼
            // 如果触摸点在代码块(pre)内，或者是允许内部滚动的渲染气泡内
            // 则直接返回，不执行 preventDefault()，允许浏览器原生滚动
            if (e.target.closest('pre') ||
                (e.target.closest('.render-bubble') && !e.target.closest('.iframe-event-capture-layer'))) {
                return;
            }
            // ▲▲▲【修复结束】▲▲▲

            e.preventDefault();
        }
    };


    const handleEnd = (e) => {
        // 如果菜单已经显示，不要再触发点击等其他行为
        if (hasMenuShown) {
            e.stopPropagation(); // 阻止事件传播
            resetState(); // 清理状态
            return;
        }

        // 如果有长按计时器但未触发，说明是短点击或短拖动
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            if (!isMoving) { // 确保是点击，而不是滑动
                // 确保在多选模式下，点击消息是选择，而不是触发红包或 iframe 交互
                const currentMultiSelectMode = isSweetheart ? isSweetheartMultiSelectMode : isNormalMultiSelectMode;
                if (!currentMultiSelectMode) {
                    if (element.classList.contains('red-packet-bubble')) {
                        // 如果点击的是红包，就调用开红包函数
                        handleRedPacketClick(contactId, messageIndex);
                    } else if (element.classList.contains('render-bubble')) {
                        // 如果是 iframe 消息，且是短点击，那么就让 iframe 进入交互模式
                        // 这里的策略是：短点击不打开菜单，长按才开菜单。
                        // iframe 自身的点击事件会由其内部处理，无需额外模拟
                    }
                }
            }
            longPressTimer = null;
        }
        resetState(); // 总是清除状态
    };

    const handleContextMenu = (e) => {
        e.preventDefault(); // 阻止浏览器默认的右键菜单
        e.stopPropagation(); // 防止冒泡
        showMenu();
        resetState(); // 显示菜单后重置状态
    };
    // ==================== 事件处理 END ====================


    // ==================== 绑定事件 START ====================
    // 使用 capture 阶段捕获事件，以确保它在我们期望的元素上被处理
    // 移除 passive: true，确保 preventDefault 能生效
    element.addEventListener('touchstart', handleStart, {passive: false, capture: true});
    element.addEventListener('mousedown', handleStart, {capture: true});

    element.addEventListener('touchmove', handleMove, {passive: false, capture: true});
    element.addEventListener('mousemove', handleMove, {capture: true});

    element.addEventListener('touchend', handleEnd, {capture: true});
    element.addEventListener('mouseup', handleEnd, {capture: true});
    element.addEventListener('touchcancel', handleEnd, {capture: true});

    // 鼠标右键事件
    element.addEventListener('contextmenu', handleContextMenu, {capture: true});
    // ==================== 绑定事件 END ====================
}


/**
 * 辅助函数：创建一条降级显示的消息，用于处理渲染错误
 * @param {object} messageObj - 原始消息对象
 * @returns {HTMLElement} - 创建好的错误消息行DOM元素
 */
function createFallbackMessage(messageObj) {
    const row = document.createElement('div');
    const senderClass = messageObj.sender === 'user' ? 'sent' : 'received';
    row.className = `message-row ${senderClass}`;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = messageObj.text || '[消息渲染失败]';
    bubble.style.cssText = 'background:#fff3cd; color:#856404; border-left:3px solid #ffc107;';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.appendChild(bubble);

    row.appendChild(messageContent);
    return row;
}


/**
 * 显示消息操作菜单（普通聊天版本）
 * @param {string} contactId - 联系人ID
 * @param {number} messageIndex - 消息索引
 * @param {HTMLElement} messageRow - 消息行元素
 */
function showMessageMenu(contactId, messageIndex, messageRow) {
    // 判断是普通聊天还是密友聊天
    const isSweetheartChat = document.getElementById('sweetheartChatPage').classList.contains('show');

    if (isSweetheartChat) {
        showSweetheartMessageActionSheet(contactId, messageIndex, messageRow);
    } else {
        showNormalMessageActionSheet(contactId, messageIndex, messageRow);
    }
}

/**
 * 显示普通聊天的消息操作菜单
 */
function showNormalMessageActionSheet(contactId, messageIndex, messageRow) {
    const actionSheet = document.getElementById('messageActionSheet');
    if (!actionSheet) return;

    // 存储当前操作的消息信息
    actionSheet.dataset.contactId = contactId;
    actionSheet.dataset.index = messageIndex;

    // 显示菜单
    actionSheet.classList.add('show');
}

/**
 * 显示密友聊天的消息操作菜单
 */
function showSweetheartMessageActionSheet(contactId, messageIndex, messageRow) {
    const actionSheet = document.getElementById('sweetheartMessageActionSheet');
    if (!actionSheet) return;

    // 存储当前操作的消息信息
    actionSheet.dataset.contactId = contactId;
    actionSheet.dataset.index = messageIndex;

    // 显示菜单
    actionSheet.classList.add('show');
}

/**
 * 隐藏普通聊天消息操作菜单
 */
function hideMessageActionSheet() {
    const actionSheet = document.getElementById('messageActionSheet');
    if (actionSheet) {
        actionSheet.classList.remove('show');
    }
}

/**
 * 隐藏密友聊天消息操作菜单
 */
function hideSweetheartMessageActionSheet() {
    const actionSheet = document.getElementById('sweetheartMessageActionSheet');
    if (actionSheet) {
        actionSheet.classList.remove('show');
    }
}


/**
 * 删除指定的消息 (现在由操作菜单调用)
 * @param {string|number} contactId - 联系人ID
 * @param {number} messageIndex - 消息的索引
 */
function deleteMessage(contactId, messageIndex) {
    if (confirm('确定要永久删除这条消息吗？')) {
        const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
        if (chatHistory[contactId] && chatHistory[contactId][messageIndex] !== undefined) {
            chatHistory[contactId].splice(messageIndex, 1);
            try {
                localStorage.setItem('phoneChatHistory', JSON.stringify(chatHistory));
            } catch (e) {
                console.error('保存失败:', e);
                alert('存储空间不足，请清理数据');
            }
            console.log(`消息已删除 (Contact: ${contactId}, Index: ${messageIndex})`);
            openChat(currentChatContact);
            renderContacts(contactsData);
        }
    }
}

/**
 * [新增] 复制消息文本到剪贴板
 */
function copyMessage(contactId, messageIndex) {
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
    const message = chatHistory[contactId]?.[messageIndex];

    if (message && message.text) {
        // 如果消息是图片HTML，我们复制一个[图片]占位符
        if (message.text.trim().startsWith('<img')) {
            navigator.clipboard.writeText('[图片]').then(() => {
                showSuccessModal('复制成功', '已将"[图片]"复制到剪贴板。');
            }).catch(err => console.error('复制图片占位符失败', err));
        } else {
            // 否则，正常复制文本
            navigator.clipboard.writeText(message.text).then(() => {
                showSuccessModal('复制成功', '消息内容已复制到剪贴板。');
            }).catch(err => console.error('复制失败', err));
        }
    }
    hideMessageActionSheet();
}


/**
 * [全新版本] 引用消息：激活引用预览UI
 */
function quoteMessage(contactId, messageIndex) {
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
    const message = chatHistory[contactId]?.[messageIndex];

    if (!message) return;

    // 1. 存储被引用的消息数据
    currentQuoteData = {
        sender: message.sender,
        text: message.text,
        senderName: message.sender === 'user' ? userProfile.name : currentChatContact.name
    };

    // 2. 更新并显示预览UI
    const previewEl = document.getElementById('quotePreview');
    document.getElementById('quotePreviewSender').textContent = currentQuoteData.senderName;

    let previewText = message.text;
    // 如果是图片，预览文本显示为[图片]
    if (previewText.trim().startsWith('<img')) {
        previewText = '[图片]';
    }
    document.getElementById('quotePreviewText').textContent = previewText;

    previewEl.classList.add('show');

    // 3. 聚焦输入框并隐藏操作菜单
    document.getElementById('chatInput').focus();
    hideMessageActionSheet();
}

/**
 * [新增] 取消引用
 */
function cancelQuote() {
    currentQuoteData = null;
    const previewEl = document.getElementById('quotePreview');
    previewEl.classList.remove('show');
}


/**
 * [新增] 重新生成AI回复
 */
async function regenerateAiResponse(contactId, messageIndex) {
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
    const messages = chatHistory[contactId];

    if (!messages || !messages[messageIndex]) return;

    const targetMessage = messages[messageIndex];

    // 只能重新生成AI的回复
    if (targetMessage.sender === 'user') {
        showSuccessModal('操作无效', '只能对AI的回复进行重新生成哦。', 2000);
        hideMessageActionSheet();
        return;
    }

    // 1. 删除当前的AI回复
    messages.splice(messageIndex, 1);
    try {
        localStorage.setItem('phoneChatHistory', JSON.stringify(chatHistory));
    } catch (e) {
        console.error('保存失败:', e);
        alert('存储空间不足，请清理数据');
    }
    openChat(currentChatContact); // 重新渲染界面以移除旧消息

    // 2. 隐藏操作菜单
    hideMessageActionSheet();

    // 3. 调用 getAiReply 函数，它会自动使用当前的（已删掉最后一条的）历史记录来生成新回复
    await getAiReply();
}

// ========== 密友消息操作函数 ==========

/**
 * 删除密友消息
 */
function deleteSweetheartMessage(contactId, messageIndex) {
    if (confirm('确定要永久删除这条消息吗？')) {
        const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
        if (chatHistory[contactId] && chatHistory[contactId][messageIndex] !== undefined) {
            chatHistory[contactId].splice(messageIndex, 1);
            try {
                localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(chatHistory));
            } catch (e) {
                console.error('保存失败:', e);
                alert('存储空间不足，请清理数据');
            }
            openSweetheartChat(currentSweetheartChatContact);
            renderSweetheartList();
        }
    }
}

/**
 * 复制密友消息
 */
function copySweetheartMessage(contactId, messageIndex) {
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
    const message = chatHistory[contactId]?.[messageIndex];

    if (message && message.text) {
        if (message.text.trim().startsWith('<img')) {
            navigator.clipboard.writeText('[图片]').then(() => {
                showSuccessModal('复制成功', '已将"[图片]"复制到剪贴板。');
            }).catch(err => console.error('复制失败', err));
        } else {
            navigator.clipboard.writeText(message.text).then(() => {
                showSuccessModal('复制成功', '消息内容已复制到剪贴板。');
            }).catch(err => console.error('复制失败', err));
        }
    }
    hideSweetheartMessageActionSheet();
}

/**
 * 引用密友消息
 */
function quoteSweetheartMessage(contactId, messageIndex) {
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
    const message = chatHistory[contactId]?.[messageIndex];

    if (!message) return;

    currentSweetheartQuoteData = {
        sender: message.sender,
        text: message.text,
        senderName: message.sender === 'user' ? userProfile.name : currentSweetheartChatContact.name
    };

    const previewEl = document.getElementById('sweetheartQuotePreview');
    document.getElementById('sweetheartQuotePreviewSender').textContent = currentSweetheartQuoteData.senderName;

    let previewText = message.text;
    if (previewText.trim().startsWith('<img')) {
        previewText = '[图片]';
    }
    document.getElementById('sweetheartQuotePreviewText').textContent = previewText;

    previewEl.classList.add('show');
    document.getElementById('sweetheartChatInput').focus();
    hideSweetheartMessageActionSheet();
}

/**
 * 重新生成密友AI回复
 */
async function regenerateSweetheartAiResponse(contactId, messageIndex) {
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
    const messages = chatHistory[contactId];

    if (!messages || !messages[messageIndex]) return;

    const targetMessage = messages[messageIndex];

    if (targetMessage.sender === 'user') {
        showSuccessModal('操作无效', '只能对AI的回复进行重新生成哦。', 2000);
        hideSweetheartMessageActionSheet();
        return;
    }

    messages.splice(messageIndex, 1);
    try {
        localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(chatHistory));
    } catch (e) {
        console.error('保存失败:', e);
        alert('存储空间不足，请清理数据');
    }
    openSweetheartChat(currentSweetheartChatContact);

    hideSweetheartMessageActionSheet();

    await getSweetheartAiReply();
}


/**
 * [全新版本] 创建消息气泡的DOM元素
 * @param {object} message - 消息对象，可能包含 text, quote 等属性
 * @returns {HTMLElement} - 创建好的气泡DOM元素
 */
function createMessageBubble(message) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    const messageText = String(message.text || '');

    // 1. 检查并渲染引用部分
    if (message.quote) {
        const quoteWrapper = document.createElement('div');
        quoteWrapper.className = 'quoted-message-wrapper';

        let quotedContent = message.quote.text;
        if (quotedContent.trim().startsWith('<img')) {
            quotedContent = '[图片]';
        }

        quoteWrapper.innerHTML = `
            <strong class="quoted-sender">${escapeHTML(message.quote.senderName)}</strong>
            <span class="quoted-text">${escapeHTML(quotedContent)}</span>
        `;
        bubble.appendChild(quoteWrapper);
    }

    // 2. 区分处理主消息内容（图片、代码、纯文本）

    // 2a. 如果主消息是图片
    if (messageText.trim().startsWith('<img')) {
        // 如果是图片，它自己就需要一个容器，而不是直接插入气泡
        const imageContainer = document.createElement('div');
        imageContainer.innerHTML = messageText;

        // 为了保持样式统一，我们把图片也包装一下，并且去掉气泡的padding
        bubble.classList.add('image-only');
        bubble.appendChild(imageContainer.firstChild);

        // 如果有引用，图片消息的padding需要特殊处理
        if (message.quote) {
            bubble.style.padding = '8px';
            bubble.classList.remove('image-only');
        }
        return bubble;
    }

    // 2b. 如果主消息包含代码块
    const codeBlockRegex = /```([\s\S]*?)```/g;
    if (codeBlockRegex.test(messageText)) {
        // 这部分逻辑和之前一样，用于解析代码块和普通文本混合的内容
        let lastIndex = 0;
        let match;
        codeBlockRegex.lastIndex = 0; // 重置正则的 lastIndex

        while ((match = codeBlockRegex.exec(messageText)) !== null) {
            const precedingText = messageText.slice(lastIndex, match.index);
            if (precedingText) {
                const textNode = document.createElement('div');
                textNode.className = 'main-message-text';
                textNode.textContent = precedingText;
                bubble.appendChild(textNode);
            }

            // 创建代码块... (这部分代码保持不变)
            const codeContent = match[1].trim();
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = codeContent;
            pre.appendChild(code);
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-code-btn';
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg><span>复制</span>`;
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(codeContent).then(() => {
                    copyBtn.classList.add('copied');
                    copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path></svg><span>已复制</span>';
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg><span>复制</span>';
                    }, 2000);
                }).catch(err => {
                    console.error('复制失败:', err);
                    alert('复制失败，请手动复制');
                });
            };

            wrapper.appendChild(pre);
            wrapper.appendChild(copyBtn);
            bubble.appendChild(wrapper);

            lastIndex = codeBlockRegex.lastIndex;
        }
        const remainingText = messageText.slice(lastIndex);
        if (remainingText) {
            const textNode = document.createElement('div');
            textNode.className = 'main-message-text';
            textNode.textContent = remainingText;
            bubble.appendChild(textNode);
        }

    } else if (messageText) {
        // 2c. 如果主消息是纯文本
        const textNode = document.createElement('div');
        textNode.className = 'main-message-text';
        textNode.textContent = messageText;
        bubble.appendChild(textNode);
    }

    return bubble;
}

// =================================================================
// 修复 1: 修改 ID，确保长度大于 2 位，且只包含字母数字下划线
// =================================================================

// 步骤一：将 const 修改为 let，以便后续从 localStorage 加载数据
// =================================================================
// 修复 1: 修改 ID，确保长度大于 2 位，且只包含字母数字下划线
// =================================================================

// 步骤一：将 const 修改为 let，以便后续从 localStorage 加载数据
// 【学校学习场景 - 内置角色扩展】
let contactsData = [
    {
        id: 'contact_01',
        name: '代码助手',
        avatar: '🤖',
        status: '我是你的AI编程助手，有代码问题随时问我。'
    },
    {
        id: 'school_teacher_li',
        name: '李老师(语文)',
        avatar: '👩‍🏫',
        status: '腹有诗书气自华。同学，关于作文或古诗词有什么不理解的吗？我是李老师，随时为你解答。',
        voiceId: 'female-qn-yuxin' // 知性女声
    },
    {
        id: 'school_math_rep',
        name: '数学课代表阿伟',
        avatar: '🤓',
        status: '数学其实就是逻辑游戏。哪道题卡住了？发给我，我帮你看看思路。',
        voiceId: 'male-qn-qingse' // 青涩男声
    },
    {
        id: 'school_teacher_smith',
        name: 'Mr. Smith (English)',
        avatar: '👨‍🦰',
        status: 'Hello! Don\'t be shy, speaking is the key to learning English. Let\'s chat! (我是你的外教Smith，鼓励你多用英语交流)',
        voiceId: 'male-qn-jingying' // 精英男声
    },
    {
        id: 'school_monitor',
        name: '学习委员',
        avatar: '👧',
        status: '今天的作业都记下来了吗？还有下周的考试复习计划制定得怎么样了？别偷懒哦！',
        voiceId: 'female-qn-tianmei' // 甜美女声
    }
];


// ========== 修正后的密友数据数组 (去重) ==========
let sweetheartContactsData = [
    {
        id: 'SH_default_001',
        name: '贴心小助手',
        status: '随时准备好聆听你的心事~',
        avatar: '💖',
        personality: '温柔体贴',
        relationship: '最好的朋友',
        voiceId: 'female-qn-yuxin',
        boundWorldbooks: []
    },
    {
        id: 'SH_school_senior',
        name: '温柔学长',
        avatar: 'https://s3plus.meituan.net/opapisdk/op_ticket_1_885190757_1762916602985_qdqqd_avatar_boy1.png',
        status: '累了吗？把肩膀借你靠一会儿。',
        personality: '稳重, 治愈, 有安全感',
        occupation: '学生会主席',
        relationship: '暗恋对象 / 邻家大哥哥',
        history: '一直在默默关注你，会在你考试失利时给你递热牛奶。',
        voiceId: 'male-qn-qingse',
        boundWorldbooks: []
    },
    {
        id: 'SH_school_mate',
        name: '同桌妙妙',
        avatar: 'https://s3plus.meituan.net/opapisdk/op_ticket_1_885190757_1762916655123_qdqqd_avatar_girl1.png',
        status: '别愁眉苦脸啦，放学请你吃关东煮！',
        personality: '活泼, 讲义气, 话痨',
        occupation: '高中生',
        relationship: '从小一起长大的死党',
        history: '帮你抄过作业，也和你一起在走廊罚过站。',
        voiceId: 'female-qn-tianmei',
        boundWorldbooks: []
    },
    {
        id: 'SH_psychology_senior', // 🔥 修改ID，防止与小助手重复
        name: '心理社学姐',
        status: '秘密说出来就不重了，我会替你保密的。',
        avatar: '👩‍🏫',
        personality: '知性, 善解人意, 温柔',
        occupation: '心理社社长',
        relationship: '值得信赖的倾听者',
        history: '在学校天台发现过哭泣的你，从此成为了你专属的树洞。',
        voiceId: 'female-qn-yuxin',
        boundWorldbooks: []
    },
    {
        id: 'SH_school_hunk',
        name: '高冷校草',
        avatar: '😎',
        status: '啧，又是谁欺负你了？报我名字。',
        personality: '嘴硬心软, 霸道, 护短',
        occupation: '篮球队队长',
        relationship: '欢喜冤家',
        history: '虽然总是嫌你笨，但每次你需要帮忙时他跑得比谁都快。',
        voiceId: 'male-qn-jingying',
        boundWorldbooks: []
    },
    {
        id: 'SH_school_junior',
        name: '元气学妹',
        avatar: '🎀',
        status: '前辈，这道题我不会，可以教教我吗？(星星眼)',
        personality: '天真, 热情, 崇拜你',
        occupation: '广播站播音员',
        relationship: '你的小迷妹',
        history: '每天中午都会在广播里给你点歌，虽然从来不敢说是谁点的。',
        voiceId: 'female-qn-tianmei',
        boundWorldbooks: []
    }
];



// ========== 联系人库多选功能全局变量 ==========
let libraryOnlyContactsData = []; // 仅存在于联系人库的联系人
let isMultiSelectMode = false; // 是否处于多选模式
let selectedContactIds = new Set(); // 选中的联系人ID集合


// ========== 世界系统数据 ==========
let worldsData = []; // 存储所有世界
let currentWorldId = null; // 当前选中的世界ID

// ========== 世界系统功能 ==========

// ▼▼▼ 使用这个【绝对修正版】的 openWorldSelect 函数进行替换 ▼▼▼

// 替换 openWorldSelect 函数
function openWorldSelect() {
    console.log("世界选择页面已被禁用，直接进入默认世界。");
    // 直接跳转到密友列表
    openSweetheartList();
}


/**
 * 打开指定世界的通讯录
 */
function openWorldContacts(worldId) {
    const world = worldsData.find(w => w.id === worldId);
    if (!world) return;

    // 你可以在这里更新contactsPage的标题，例如显示世界名称
    // 假设contactsPage的header有一个id为'contactsTitle'的元素
    // const contactsTitleEl = document.getElementById('contactsTitle');
    // if (contactsTitleEl) contactsTitleEl.textContent = world.name + '通讯录';

    document.getElementById('contactsPage').classList.add('show');

    // 根据世界的联系人ID列表，筛选出对应的联系人
    const worldContacts = contactsData.filter(contact =>
        world.contacts && world.contacts.includes(String(contact.id))
    );

    renderContacts(worldContacts); // 渲染该世界的联系人
}

/**
 * 渲染世界书复选框列表
 */
function renderWorldWorldbooksList() {
    const container = document.getElementById('worldWorldbooksList');

    if (worldbookData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #7FB5D1; padding: 20px; font-size: 13px;">还没有世界书哦~</div>';
        return;
    }

    container.innerHTML = '';

    worldbookData.forEach(wb => {
        const item = document.createElement('div');
        item.className = 'world-wb-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `world-wb-${wb.id}`;
        checkbox.value = wb.id;

        const label = document.createElement('label');
        label.htmlFor = `world-wb-${wb.id}`;
        label.textContent = wb.title;

        item.appendChild(checkbox);
        item.appendChild(label);
        container.appendChild(item);
    });
}

/* ========== 新增：世界地图功能相关函数 ========== */

/**
 * 切换地图选项的显示/隐藏
 */
function toggleWorldMapOptions() {
    const optionsEl = document.getElementById('worldMapOptions');
    if (optionsEl.style.display === 'flex') {
        optionsEl.style.display = 'none';
    } else {
        optionsEl.style.display = 'flex';
    }
}

/**
 * 选择默认地图
 */
function selectDefaultMap() {
    // 这是你提供的默认地图URL
    const defaultMapUrl = 'https://s3plus.meituan.net/opapisdk/op_ticket_1_885190757_1760979959274_qdqqd_m9jrpo.jpg';

    // 获取DOM元素
    const previewImg = document.getElementById('worldMapPreview');
    const placeholder = document.getElementById('worldMapPlaceholder');

    // 更新图片预览
    previewImg.src = defaultMapUrl;
    previewImg.style.display = 'block';
    placeholder.style.display = 'none';

    // 选择后隐藏选项菜单
    document.getElementById('worldMapOptions').style.display = 'none';

    // 给用户一个成功的提示
    showSuccessModal('选择成功', '已应用默认地图。');
}


/**
 * 保存世界数据到localStorage
 */
function saveWorldsData() {
    try {
        localStorage.setItem('phoneWorldsData', JSON.stringify(worldsData));
    } catch (e) {
        console.error('保存世界数据失败:', e);
    }
}

// [修正版] 加载世界数据（确保包含所有默认密友ID）
function loadWorldsData() {
    try {
        const saved = localStorage.getItem('phoneWorldsData');

        // 🗺️ 默认地图链接
        const defaultMapUrl = 'https://s3plus.meituan.net/opapisdk/op_ticket_1_885190757_1760979959274_qdqqd_m9jrpo.jpg';

        // 🔥 核心修复：把所有内置密友的ID都加到这里！
        // 这样新用户第一次打开时，这些人才会显示出来
        const defaultWorld = {
            id: 'DEFAULT_WORLD',
            name: '默认世界',
            description: '初始设定的世界',
            icon: '🌏',
            mapUrl: defaultMapUrl,
            // 👇 这里把所有 SH_ 开头的ID都补全了
            contacts: [
                '1', '2',
                'SH_default_001',
                'SH_school_senior',
                'SH_school_mate',
                'SH_school_hunk',
                'SH_school_junior'
            ],
            worldbooks: [],
            timestamp: Date.now()
        };

        if (saved) {
            worldsData = JSON.parse(saved);

            // 🔥 自动修复逻辑：如果老用户已有的默认世界缺少这些ID，自动给它补上
            const existingDefaultWorld = worldsData.find(w => w.id === 'DEFAULT_WORLD');
            if (existingDefaultWorld) {
                let hasChanges = false;

                // 1. 补全地图
                if (!existingDefaultWorld.mapUrl) {
                    existingDefaultWorld.mapUrl = defaultMapUrl;
                    hasChanges = true;
                }

                // 2. 补全缺失的默认密友ID
                const missingIds = ['SH_school_senior', 'SH_school_mate', 'SH_school_hunk', 'SH_school_junior'];
                missingIds.forEach(id => {
                    if (!existingDefaultWorld.contacts.includes(id)) {
                        existingDefaultWorld.contacts.push(id);
                        hasChanges = true;
                    }
                });

                if (hasChanges) {
                    saveWorldsData();
                    console.log('✅ 已自动修复默认世界的地图和联系人列表');
                }
            }

            if (worldsData.length === 0) {
                worldsData.push(defaultWorld);
                saveWorldsData();
            }
        } else {
            // 首次安装
            worldsData.push(defaultWorld);
            saveWorldsData();

            // 预设地图地点
            const mapKey = `mapPins_${defaultWorld.id}`;
            if (!localStorage.getItem(mapKey)) {
                localStorage.setItem(mapKey, JSON.stringify(DEFAULT_MAP_LOCATIONS));
            }
        }

        if (!currentWorldId) {
            currentWorldId = worldsData[0].id;
            localStorage.setItem('currentWorldId', currentWorldId);
        }

        console.log('✅ 世界数据已加载，当前锁定世界:', currentWorldId);

    } catch (e) {
        console.error('加载世界数据失败:', e);
    }
}



let currentChatContact = null;
let currentQuoteData = null;

async function updateBattery() {
    try {
        if ('getBattery' in navigator) {
            const battery = await navigator.getBattery();

            const updateBatteryDisplay = () => {
                const level = Math.round(battery.level * 100);
                const charging = battery.charging;
                document.querySelectorAll('.status-icons').forEach(iconGroup => {
                    const container = iconGroup.querySelector('.battery-container');
                    const levelBar = iconGroup.querySelector('.battery-level');
                    const text = iconGroup.querySelector('.battery-text');
                    if (container && levelBar && text) {
                        text.textContent = `${level}%`;

                        container.classList.toggle('charging', charging);

                        levelBar.style.width = `${level * 0.85}%`;

                        levelBar.classList.toggle('low', level <= 20 && !charging);
                    }
                });

                console.log(`电量已更新: ${level}% ${charging ? '(充电中)' : ''}`);
            };

            updateBatteryDisplay();

            battery.addEventListener('levelchange', updateBatteryDisplay);
            battery.addEventListener('chargingchange', updateBatteryDisplay);

        } else {
            console.warn('浏览器不支持 Battery API');
        }
    } catch (error) {
        console.error('获取电量失败:', error);
    }
}


// ========== 开始：请用这个【修正版】函数替换旧的 updateLocation 函数 ==========
async function updateLocation() {
    if (locationMode !== 'real') return;
    // [修正] 原来的选择器 '.weather-card .location' 是错误的，这里修正为 '.location-text'
    const locationElement = document.querySelector('.location-text');
    if (!locationElement) {
        // [优化] 增加错误提示，方便调试
        console.error("代码错误：未能找到用于显示位置的 .location-text 元素。");
        return;
    }

    try {
        if (!navigator.geolocation) {
            console.warn('浏览器不支持地理定位');
            locationElement.textContent = '无法定位';
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                console.log('成功获取位置坐标:', lat, lon);

                // 备注：这里使用了高德API，你需要替换 'YOUR_AMAP_KEY' 为你自己的有效Key
                try {
                    const response = await fetch(
                        `https://restapi.amap.com/v3/geocode/regeo?location=${lon},${lat}&key=66dfab01a25cfe9002858086538601e6&extensions=base`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        if (data.status === '1' && data.regeocode) {
                            const address = data.regeocode.addressComponent;
                            const district = address.district || address.city || '未知位置';
                            locationElement.textContent = district; // 更新UI
                            console.log('高德地址解析成功:', district);
                            return; // 成功后提前退出
                        }
                    }
                } catch (error) {
                    console.warn('高德API解析失败, 将尝试使用备用方案。错误:', error);
                }

                // 如果高德API失败，则使用备用方案 (OpenStreetMap)
                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=zh-CN`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        const address = data.address;
                        const location = address.city || address.town || address.village ||
                            address.county || address.state || '未知位置';
                        locationElement.textContent = location; // 更新UI
                        console.log('备用方案地址解析成功:', location);
                    }
                } catch (error) {
                    console.error('备用方案地址解析也失败了:', error);
                    locationElement.textContent = `坐标:${lat.toFixed(2)},${lon.toFixed(2)}`;
                }
            },
            (error) => {
                console.warn('获取地理位置失败:', error.message);
                if (error.code === 1) { // PERMISSION_DENIED
                    locationElement.textContent = '未授权定位';
                } else {
                    locationElement.textContent = '定位失败';
                }
            }, {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 600000
            }
        );
    } catch (error) {
        console.error('地理定位功能出现未知错误:', error);
    }
}

// ========== 结束：替换完成 ==========


function toggleWeatherSelector(event) {
    event.stopPropagation();
    const popup = document.getElementById('weatherPopup');
    if (popup.style.display === 'none') {
        popup.style.display = 'block';
    } else {
        popup.style.display = 'none';
    }
}

function selectWeather(weatherType, event) {
    event.stopPropagation();

    const weatherIcons = {
        sunny: '☀️',
        cloudy: '☁️',
        rainy: '🌧️',
        snowy: '❄️'
    };

    const currentIcon = document.getElementById('currentWeatherIcon');
    if (currentIcon) {
        currentIcon.textContent = weatherIcons[weatherType];
    }

    document.querySelectorAll('.weather-option').forEach(option => {
        option.classList.remove('active');
    });

    const selectedOption = document.querySelector(`[data-weather="${weatherType}"]`);
    if (selectedOption) {
        selectedOption.classList.add('active');
    }

    localStorage.setItem('selectedWeather', weatherType);

    document.getElementById('weatherPopup').style.display = 'none';

    console.log(`已选择天气: ${weatherType}`);
}

function editMood(event) {
    event.stopPropagation();

    const moodTextEl = document.getElementById('moodText');
    const currentMood = moodTextEl.classList.contains('empty') ? '' : moodTextEl.textContent;

    const newMood = prompt('输入你的心情：', currentMood);

    if (newMood !== null) {
        if (newMood.trim() === '') {
            moodTextEl.textContent = '点击填写心情...';
            moodTextEl.classList.add('empty');
        } else {
            moodTextEl.textContent = newMood.trim();
            moodTextEl.classList.remove('empty');
        }

        localStorage.setItem('userMood', newMood.trim());
    }
}

function loadSavedMoodAndWeather() {
    const weatherIcons = {
        sunny: '☀️',
        cloudy: '☁️',
        rainy: '🌧️',
        snowy: '❄️'
    };

    const savedMood = localStorage.getItem('userMood');
    const moodTextEl = document.getElementById('moodText');
    if (savedMood && moodTextEl) {
        moodTextEl.textContent = savedMood;
        moodTextEl.classList.remove('empty');
    }

    const savedWeather = localStorage.getItem('selectedWeather') || 'sunny';
    const currentIcon = document.getElementById('currentWeatherIcon');
    if (currentIcon) {
        currentIcon.textContent = weatherIcons[savedWeather];
    }

    document.querySelectorAll('.weather-option').forEach(option => {
        option.classList.remove('active');
    });
    const selectedOption = document.querySelector(`[data-weather="${savedWeather}"]`);
    if (selectedOption) {
        selectedOption.classList.add('active');
    }
}

document.addEventListener('click', function (e) {
    const popup = document.getElementById('weatherPopup');
    const weatherDisplay = document.querySelector('.weather-display');
    if (popup && !popup.contains(e.target) && !weatherDisplay.contains(e.target)) {
        popup.style.display = 'none';
    }
});

const dbAPI = {
    async saveData(data) {
        if (!globalConfig.database.client) {
            console.warn('数据库未初始化，请先配置Supabase');
            return {success: false, message: '数据库未初始化'};
        }

        try {
            const {data: result, error} = await globalConfig.database.client
                .from(globalConfig.database.tableName)
                .insert(data);

            if (error) throw error;
            return {success: true, data: result};
        } catch (error) {
            console.error('保存数据失败:', error);
            return {success: false, message: error.message};
        }
    },

    async getData(filters = {}) {
        if (!globalConfig.database.client) {
            console.warn('数据库未初始化');
            return {success: false, data: []};
        }

        try {
            const {data, error} = await globalConfig.database.client
                .from(globalConfig.database.tableName)
                .select();

            if (error) throw error;
            return {success: true, data};
        } catch (error) {
            console.error('获取数据失败:', error);
            return {success: false, data: []};
        }
    }
};

const storageAPI = {
    async uploadFile(file, customPath = '') {
        if (!globalConfig.database.client) {
            console.warn('云存储未初始化，请先配置Supabase');
            return {success: false, url: null};
        }

        try {
            const {bucketName, uploadPath} = globalConfig.storage;
            const filePath = `${uploadPath}${customPath || file.name}`;

            const {data, error} = await globalConfig.database.client.storage
                .from(bucketName)
                .upload(filePath, file);

            if (error) throw error;

            const {data: urlData} = globalConfig.database.client.storage
                .from(bucketName)
                .getPublicUrl(filePath);

            console.log('文件上传成功:', urlData.publicUrl);
            return {success: true, url: urlData.publicUrl};
        } catch (error) {
            console.error('文件上传失败:', error);
            return {success: false, url: null, message: error.message};
        }
    }
};

// 1. 修改 appsPage1：只保留世界书、账单、设置和从文件夹移出来的小说
const appsPage1 = [
    {
        id: 'worldbook',
        icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760105951573_qdqqd_4zhn48.png',
        label: '世界书',
        row: 0,
        col: 0,
        clickable: true
    },
    {
        id: 'calc', // 这是账单/记账本
        icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760107619286_qdqqd_tzxf3r.png',
        label: '账单',
        row: 0,
        col: 1,
        clickable: true
    },
    {
        id: 'settings',
        icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760110940876_qdqqd_ev1xec.png',
        label: '设置',
        row: 0,
        col: 2,
        clickable: true
    },
    {
        id: 'novel', // ✨ 新增：直接把小说放在这里，赋予一个新的ID
        icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760117195210_qdqqd_k1cy4r.png',
        label: '小说',
        row: 0,
        col: 3,
        clickable: true
    },
    {
        id: 'study_mode', // 原 Dock 栏第一个：学习模式
        // 这里使用的是你代码中 dockIcons[0] 的图片链接
        icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760103483956_qdqqd_ufc76a.png',
        label: '学习模式',
        row: 1, // 放在第2行
        col: 0, // 第1列
        clickable: true
    },
    {
        id: 'chat_mode', // 原 Dock 栏第三个：闲聊模式
        // 这里使用的是你代码中 dockIcons[2] 的图片链接
        icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1760094934930_qdqqd_5lvg07.png',
        label: '闲聊模式',
        row: 1, // 放在第2行
        col: 1, // 第2列
        clickable: true
    }
];


// ========== 结束：替换完成 ==========

const state = {
    currentPage: 1,
    draggedElement: null,
    isDragging: false,
    isEditMode: false,
    hasDragged: false,
    dragStart: {x: 0, y: 0},
    dragOffset: {x: 0, y: 0},
    longPressTimer: null,
    swipeStart: {x: 0, time: 0},
    isSwipingPage: false,
    initialTransform: 0,
    swipeMoveScheduled: false, // <--- 新增
    lastSwipeTranslateX: 0,
    appLayouts: {
        page1: appsPage1
    },
    lastDragEndTime: 0, // ✅ 新增：记录最后一次拖动结束的时间
    isDraggingFromDock: false,  // 🔧 新增这一行
    dragMoveScheduled: false // <--- 新增
};


const screen = document.getElementById('screen');
const pagesWrapper = document.getElementById('pagesWrapper');

const getTouch = (e) => e.touches?.[0] || e;
const getChangedTouch = (e) => e.changedTouches?.[0] || e;

function positionElement(el, row, col, colspan = 1, rowspan = 1) {
    // === 修改开始 ===
    // 增加行高以适应更大的图标 (76px图标 + 文字 + 间距)
    const ROW_HEIGHT_PX = 110;
    // 减小间距以匹配CSS中的 gap: 8px
    const GAP_PX = 8;
    // === 修改结束 ===

    const leftPercent = col * 25;
    const widthPercent = colspan * 25;
    const topPx = row * (ROW_HEIGHT_PX + GAP_PX);
    const heightPx = (rowspan * ROW_HEIGHT_PX) + ((rowspan - 1) * GAP_PX);

    Object.assign(el.style, {
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        top: `${topPx}px`,
        height: `${heightPx}px`
    });
}


function showEditHint(show) {
    const hint = document.getElementById(state.currentPage === 1 ? 'editHint1' : 'editHint2');
    hint.classList.toggle('show', show);
}

function showDeleteButtons(show) {
    const timeCard = document.getElementById('timeCard');
    if (timeCard) {
        timeCard.classList.toggle('show-delete', show);
    }

    const weatherCard = document.getElementById('weatherCard');
    if (weatherCard) {
        weatherCard.classList.toggle('show-delete', show);
    }

    // ✅ 修复：同时选择 .widget 和 .cat-widget
    document.querySelectorAll('.widget, .cat-widget').forEach(widget => {
        widget.classList.toggle('show-delete', show);
    });
}

function exitEditMode() {
    if (state.isEditMode && !state.isDragging) {
        state.isEditMode = false;
        showEditHint(false);
        showDeleteButtons(false);
        state.hasDragged = false;
    }
}

/**
 *  helper function: 创建设置页面的完整HTML结构
 * @returns {string} - 包含设置页面所有内容的HTML字符串
 */
function createSettingsPageHTML() {
    // 这里我们将原本在 index.html 中的代码，变成了一个返回字符串的函数
    return `
    <div class="settings-page" id="settingsPage">
        <div class="settings-header">
            <div class="back-btn" onclick="closeSettings()">←</div>
            <div class="settings-title">设置</div>
        </div>

        <div class="settings-content">
            <div class="settings-section">
                <div class="section-title">配置</div>
               
                <!-- 3. 全屏模式 -->
                <div class="settings-item">
                    <div class="settings-icon icon-fullscreen"></div>
                    <div class="settings-info">
                        <div class="settings-label">全屏模式</div>
                        <div class="settings-desc">移除手机边框，享受沉浸式体验</div>
                    </div>
                    <div class="settings-action">
                        <label class="toggle-switch">
                            <input type="checkbox" id="fullscreenToggle">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                
                <!-- 5. 联系人库 -->
                <div class="settings-item" onclick="openContactLibrary('edit')">
                    <div class="settings-icon icon-contacts"></div>
                    <div class="settings-info">
                        <div class="settings-label">联系人库</div>
                        <div class="settings-desc">管理所有密友和普通联系人</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
                <!-- 6. 面具管理 -->
                <div class="settings-item" onclick="openMaskLibrary()">
                    <div class="settings-icon icon-mask"></div>
                    <div class="settings-info">
                        <div class="settings-label">面具管理</div>
                        <div class="settings-desc">管理你的不同人设</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
                <!-- 7. 记忆存储中心 -->
                <div class="settings-item" onclick="openMemoryCenter()">
                    <div class="settings-icon icon-memory"></div>
                    <div class="settings-info">
                        <div class="settings-label">记忆存储中心</div>
                        <div class="settings-desc">查看AI的记忆数据</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
                <!-- 8. 美化 -->
                <div class="settings-item" onclick="openBeautify()">
                    <div class="settings-icon icon-beautify"></div>
                    <div class="settings-info">
                        <div class="settings-label">美化</div>
                        <div class="settings-desc">自定义应用图标</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
                <!-- 9. 气泡库 -->
                <div class="settings-item" onclick="openBubbleLibrary()">
                    <div class="settings-icon icon-bubble"></div>
                    <div class="settings-info">
                        <div class="settings-label">气泡库</div>
                        <div class="settings-desc">自定义聊天气泡样式</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
                <!-- 10. 组件 -->
                <div class="settings-item" onclick="openWidgetManager()">
                    <div class="settings-icon icon-widget"></div>
                    <div class="settings-info">
                        <div class="settings-label">组件</div>
                        <div class="settings-desc">自定义桌面组件</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
                <!-- 11. 悬浮球 -->
                <div class="settings-item">
                    <div class="settings-icon icon-floatball"></div>
                    <div class="settings-info">
                        <div class="settings-label">悬浮球</div>
                        <div class="settings-desc">在主屏幕显示一个快捷操作悬浮球</div>
                    </div>
                    <div class="settings-action">
                        <label class="toggle-switch">
                            <input type="checkbox" id="floatingBallToggle">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="settings-section">
                <div class="section-title">危险区域</div>
                <!-- 12. 清空所有数据 -->
                <div class="settings-item" onclick="clearAllData()">
                    <div class="settings-icon icon-danger"></div>
                    <div class="settings-info">
                        <div class="settings-label" style="color: #ff3b30;">清空所有数据</div>
                        <div class="settings-desc">将删除所有设置、联系人、聊天记录和自定义内容</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
            </div>
            
            <!-- 新增：数据管理 -->
            <div class="settings-section">
                <div class="section-title">数据管理</div>
                <!-- 导出所有数据 -->
                <div class="settings-item" onclick="exportAppData()">
                    <div class="settings-icon" style="background: linear-gradient(135deg, #FFD700, #FFA500);">📤</div>
                    <div class="settings-info">
                        <div class="settings-label">导出所有数据</div>
                        <div class="settings-desc">备份所有设置、联系人、聊天记录等</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
                <!-- 导入数据 -->
                <div class="settings-item" onclick="importAppData()">
                    <div class="settings-icon" style="background: linear-gradient(135deg, #98FB98, #66CDAA);">📥</div>
                    <div class="settings-info">
                        <div class="settings-label">导入数据</div>
                        <div class="settings-desc">从备份文件恢复所有设置和数据</div>
                    </div>
                    <div class="settings-arrow">›</div>
                </div>
                <!-- 隐藏的文件输入元素，用于导入 -->
                <input type="file" id="importFileInput" accept=".json" style="display: none;" onchange="handleFileImport(event)">
            </div>
        </div>
    </div>
    `;
}

/**
 * helper function: 为动态创建的设置页面绑定事件监听
 * (主要是处理那些不是通过 onclick 绑定的事件)
 */
function initializeSettingsPageListeners() {
    // ===== 全屏模式开关 =====
    const fullscreenToggle = document.getElementById('fullscreenToggle');
    if (fullscreenToggle) {
        // 读取并应用保存的设置
        fullscreenToggle.checked = localStorage.getItem('fullscreenEnabled') === 'true';

        // 添加事件监听
        fullscreenToggle.addEventListener('change', function () {
            applyFullscreenSetting(this.checked);
            localStorage.setItem('fullscreenEnabled', this.checked);
        });
    }

    // ===== 悬浮球开关 =====
    const floatingBallToggle = document.getElementById('floatingBallToggle');
    if (floatingBallToggle) {
        // 同样地，直接赋值，避免冗余变量
        floatingBallToggle.checked = localStorage.getItem('floatingBallEnabled') === 'true';
        floatingBallToggle.addEventListener('change', function () {
            const isEnabled = this.checked;
            applyFloatingBallSetting(isEnabled);
            localStorage.setItem('floatingBallEnabled', isEnabled);
        });
    }
}

/**
 * 【优化版】打开设置页面
 * 实现了按需渲染（Lazy Rendering）
 */
function openSettings() {
    const screen = document.querySelector('.screen');
    if (!screen) return;

    // 检查设置页面是否已存在于DOM中
    let settingsPage = document.getElementById('settingsPage');

    // 如果不存在，则动态创建
    if (!settingsPage) {
        // 1. 获取HTML内容
        const settingsHTML = createSettingsPageHTML();
        // 2. 将HTML插入到 .screen 容器的末尾
        screen.insertAdjacentHTML('beforeend', settingsHTML);
        // 3. 重新获取刚刚创建的元素
        settingsPage = document.getElementById('settingsPage');
        // 4. 为新创建的页面绑定事件
        initializeSettingsPageListeners();
        console.log("设置页面DOM已动态创建并绑定事件。");
    }

    // 5. 使用 requestAnimationFrame 确保在下一帧再添加 .show 类，以触发CSS动画
    requestAnimationFrame(() => {
        if (settingsPage) {
            settingsPage.classList.add('show');
        }
    });
}

/**
 * 【优化版】关闭设置页面
 * 在关闭后从DOM中移除，释放内存
 */
function closeSettings() {
    const settingsPage = document.getElementById('settingsPage');
    if (!settingsPage) return;

    // 1. 移除 .show 类，触发滑出动画
    settingsPage.classList.remove('show');

    // 2. 使用 setTimeout 等待动画结束 (时长应与CSS中 transition-duration 保持一致)
    setTimeout(() => {
        // 3. 动画结束后，从DOM中彻底移除该元素
        settingsPage.remove();
        console.log("设置页面DOM已从内存中移除。");
    }, 350); // 350ms 对应 CSS 中的 0.35s
}






function openBeautify() {
    // 关闭其他页面
    document.querySelectorAll('.beautify-page.show, .config-page.show').forEach(page => {
        page.classList.remove('show');
    });

    // 显示美化页面
    const beautifyPage = document.getElementById('beautifyPage');
    beautifyPage.style.zIndex = '1010'; // 确保层级
    beautifyPage.classList.add('show');

    // 确保渲染相关内容
    renderAppPreviews();
    renderWallpaperThumbnails();
    const currentWallpaper = localStorage.getItem('phoneWallpaper');
    updateWallpaperActiveState(currentWallpaper);
}


function closeBeautify() {
    document.getElementById('beautifyPage').classList.remove('show');
}

function openWidgetManager() {
    document.getElementById('widgetManager').classList.add('show');
    renderSavedWidgets();
}

function closeWidgetManager() {
    document.getElementById('widgetManager').classList.remove('show');
}

function renderSavedWidgets() {
    const container = document.getElementById('savedWidgetsList');
    container.innerHTML = '';

    if (globalConfig.savedWidgets.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">暂无已删除的组件</div>';
        return;
    }

    globalConfig.savedWidgets.forEach((widget, index) => {
        const item = document.createElement('div');
        item.className = 'saved-widget-item';
        item.innerHTML = `
                    <div class="saved-widget-name">${widget.name}</div>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <button class="restore-btn" onclick="restoreWidget(${index})">恢复到桌面</button>
                        <button class="delete-saved-btn" onclick="deleteSavedWidget(${index})">永久删除</button>
                    </div>
                `;
        container.appendChild(item);
    });
}

function restoreWidget(index) {
    const widget = globalConfig.savedWidgets[index];
    if (!widget) return;

    if (widget.type === 'time') {
        const section = document.querySelector('.time-weather-section');
        section.insertAdjacentHTML('afterbegin', widget.html);
    } else if (widget.type === 'weather') {
        const section = document.querySelector('.time-weather-section');
        const timeCard = document.getElementById('timeCard');
        if (timeCard) {
            timeCard.insertAdjacentHTML('afterend', widget.html);
        } else {
            section.insertAdjacentHTML('beforeend', widget.html);
        }
    } else if (widget.type === 'widget') {
        const pageNum = widget.id.includes('widget2') ? 2 : 1;
        const grid = document.getElementById(`grid${pageNum}`);
        grid.insertAdjacentHTML('beforeend', widget.html);

        const restoredElement = grid.querySelector(`[data-id="${widget.id}"]`);
        if (restoredElement) {
            addDragListeners(restoredElement, false);
        }
    }

    const deletedComponents = JSON.parse(localStorage.getItem('deletedComponents') || '[]');
    const componentIndex = deletedComponents.indexOf(widget.id);

    if (componentIndex > -1) {
        deletedComponents.splice(componentIndex, 1);
    }

    globalConfig.savedWidgets.splice(index, 1);

    try {
        localStorage.setItem('deletedComponents', JSON.stringify(deletedComponents));
        localStorage.setItem('savedWidgets', JSON.stringify(globalConfig.savedWidgets));
        console.log(`${widget.name} 已恢复到桌面`);
    } catch (e) {
        console.error('保存数据失败:', e);
    }

    renderSavedWidgets();
}

function deleteSavedWidget(index) {
    const widget = globalConfig.savedWidgets[index];
    if (!widget) return;

    if (confirm(`确定要永久删除"${widget.name}"吗？此操作无法撤销。`)) {
        globalConfig.savedWidgets.splice(index, 1);

        localStorage.setItem('savedWidgets', JSON.stringify(globalConfig.savedWidgets));

        renderSavedWidgets();

        console.log(`${widget.name} 已永久删除`);
    }
}

function openContacts() {
    // ✅ 新增:清除当前世界ID,表示这是从主屏幕打开的普通通讯录
    currentWorldId = null;
    localStorage.removeItem('currentWorldId');

    document.getElementById('contactsPage').classList.add('show');
    renderContacts(contactsData);
}

function closeContacts() {
    document.getElementById('contactsPage').classList.remove('show');
    document.getElementById('contactsSearch').value = '';
    // 🔥 修改：即便是从世界进入的，返回时也直接回桌面，不再经过世界选择页
    // 删除原有的 openWorldSelect 调用
}


// ========== 开始：请粘贴这段全新的 JavaScript 代码 ==========

function toggleContactMenu(event) {
    // 阻止事件冒泡，防止点击事件被页面的其他部分捕获，导致菜单立即关闭
    event.stopPropagation();

    const menu = document.getElementById('contactMenu');
    // 使用 classList.toggle() 来切换 'show' 类
    // 如果菜单没有 'show' 类，就给它加上；如果已经有了，就把它移除。
    // 这正是“切换”的含义。
    menu.classList.toggle('show');
}

// ========== 结束：粘贴代码 ==========

/**
 * [最终修正版] 渲染普通联系人列表
 */
function renderContacts(contacts) {
    const container = document.getElementById('contactsList');
    // 注意：这里使用的是普通聊天历史
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');

    container.innerHTML = '';
    if (contacts.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">未找到联系人</div>';
        return;
    }

    contacts.forEach(contact => {
        const wrapper = document.createElement('div');
        wrapper.className = 'contact-item-wrapper';
        wrapper.dataset.contactId = contact.id;
        wrapper.dataset.contactType = 'normal';

        const contactMessages = chatHistory[contact.id] || [];
        let lastMessageText = contact.status; // 默认显示状态

        // ✅ 同样使用辅助函数来安全地获取预览
        if (contactMessages.length > 0) {
            const preview = getLastMessagePreview(contactMessages[contactMessages.length - 1]);
            if (preview) {
                lastMessageText = preview;
            }
        }

        const isUrl = contact.avatar && (String(contact.avatar).startsWith('http') || String(contact.avatar).startsWith('data:'));
        const avatarContent = isUrl
            ? `<img src="${escapeHTML(contact.avatar)}" alt="${escapeHTML(contact.name)}">`
            : `<span>${escapeHTML(contact.avatar)}</span>`;

        let instanceIdHtml = '';
        if (contact.id) {
            instanceIdHtml = `<div class="contact-instance-id" title="联系人ID">ID: ${escapeHTML(contact.id)}</div>`;
        }


        wrapper.innerHTML = `
            <div class="swipe-actions">
                <button class="swipe-delete-btn">删除</button>
            </div>
            <div class="contact-item-content">
                <div class="contact-avatar">${avatarContent}</div>
                <div class="contact-info">
                    <div class="contact-name">${escapeHTML(contact.name)}</div>
                    ${instanceIdHtml}
                    <div class="contact-status">${escapeHTML(lastMessageText)}</div>
                </div>
                ${contact.badge > 0 ? `<div class="contact-badge">${contact.badge}</div>` : ''}
            </div>
        `;

        const contentEl = wrapper.querySelector('.contact-item-content');
        if (contentEl) {
            contentEl.onclick = () => {
                if (!wrapper.classList.contains('is-swiped')) {
                    openChat(contact);
                }
            };
        }

        const deleteBtn = wrapper.querySelector('.swipe-delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteContactFromList(contact.id, 'normal');
            };
        }

        container.appendChild(wrapper);
        addSwipeToDeleteListeners(wrapper);
    });
}

// 请用这个【最终修正版】的函数替换旧的 createNewContact 函数

function createNewContact() {
    const menu = document.getElementById('contactMenu');
    if (menu) menu.classList.remove('show');

    // 获取弹窗元素
    const modal = document.getElementById('characterCardModal');
    // 生成新ID并存储
    const newId = 'ID' + Math.floor(100000 + Math.random() * 900000);
    modal.dataset.editingId = newId;

    // 如果当前有选中的世界，则标记联系人属于该世界
    if (currentWorldId) {
        modal.dataset.currentWorldId = currentWorldId;
    } else {
        modal.removeAttribute('data-currentWorldId');
    }

    // --- 核心修复：将重置和渲染逻辑移到这里 ---

    // 1. 重置联系人表单
    document.getElementById('char-name').value = '';
    document.getElementById('char-persona').value = '';
    document.getElementById('avatar-preview').src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    const maleRadio = document.querySelector('.character-gender-selection input[value="male"]');
    if (maleRadio) maleRadio.checked = true;
    document.getElementById('char-instance-id').textContent = newId; // 显示新ID

    // 2. 重置用户表单
    document.getElementById('user-name').value = userProfile.name || '我';
    document.getElementById('user-persona').value = userProfile.persona || '';
    const userAvatar = userProfile.avatar;
    const isUserUrl = userAvatar && (userAvatar.startsWith('http') || userAvatar.startsWith('data:'));
    document.getElementById('user-avatar-preview').src = isUserUrl ? userAvatar : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

    // 3. 在打开卡片前，直接渲染世界书和面具列表（传入空数组表示没有已绑定的项）
    renderCharacterWorldbooksList([]);
    renderCharacterMasksList([]);

    // --- 修复结束 ---

    // 最后再打开卡片
    openCharacterCardPage();
}


// ========== 结束：替换完成 ==========


document.addEventListener('click', function (e) {
    // --- 优化开始 ---

    // 1. 处理悬浮球菜单的外部点击
    const floatingMenu = document.getElementById('floatingBallMenu');
    const ball = document.getElementById('floatingBall');
    if (floatingMenu && ball && !floatingMenu.contains(e.target) && !ball.contains(e.target)) {
        closeFloatingBallMenu();
    }

    // 2. 处理联系人菜单的外部点击
    const contactMenu = document.getElementById('contactMenu');
    const sweetheartContactMenu = document.getElementById('sweetheartContactMenu');
    const addBtn = e.target.closest('.add-contact-btn'); // 检查点击的是否是加号按钮
    // 如果点击的不是加号按钮，则关闭所有菜单
    if (!addBtn) {
        if (contactMenu) contactMenu.classList.remove('show');
        if (sweetheartContactMenu) sweetheartContactMenu.classList.remove('show');
    }

    // --- 优化结束 ---
});


function applyCustomWidget() {
    const code = document.getElementById('widgetCodeInput').value.trim();

    if (!code) {
        alert('请输入组件代码');
        return;
    }

    const targetWidget = document.querySelector('[data-id="widget2"]');

    if (!targetWidget) {
        alert('未找到目标 Widget，请先恢复原始组件');
        return;
    }

    const alreadySaved = globalConfig.savedWidgets.some(w => w.id === 'widget2');

    if (!alreadySaved) {
        globalConfig.savedWidgets.push({
            id: 'widget2',
            type: 'widget',
            name: 'Widget（原始）',
            html: targetWidget.outerHTML,
            timestamp: Date.now()
        });

        localStorage.setItem('savedWidgets', JSON.stringify(globalConfig.savedWidgets));
        console.log('原始 Widget 已保存到"已删除组件"列表');
    }

    const widgetScene = targetWidget.querySelector('.widget-scene');
    if (widgetScene) {
        widgetScene.innerHTML = code;
        alert('自定义组件已应用！');
        console.log('自定义组件代码已应用到桌面');
    } else {
        alert('Widget 结构异常，请检查');
    }
}

function renderAppPreviews() {
    const container = document.getElementById('appPreviewList');
    container.innerHTML = '';

    const divider = document.createElement('div');
    divider.innerHTML = '<div class="section-title">应用图标</div>';
    container.appendChild(divider);

    const allApps = [...appsPage1.filter(app => !app.isWidget), ...appsPage2.filter(app => !app.isWidget && !app.isFolder)];

    allApps.forEach(app => {
        const item = document.createElement('div');
        item.className = 'app-preview-item';

        const customIcon = globalConfig.customIcons[app.id];
        const iconDisplay = customIcon
            ? `<img src="${customIcon}" alt="${app.label}">`
            : app.icon;

        item.innerHTML = `
                    <div class="preview-header">
                        <div class="preview-icon" id="preview-${app.id}">
                            ${iconDisplay}
                        </div>
                        <div class="preview-name">${app.label}</div>
                    </div>
                    <div class="upload-section">
                        <label class="upload-btn">
                            📁 上传文件
                            <input type="file" class="file-input" accept="image/*" onchange="handleFileUpload(event, '${app.id}')">
                        </label>
                        <div class="url-input-btn" onclick="toggleUrlInput('${app.id}')">🔗 URL填写</div>
                    </div>
                    <div class="url-input-box" id="url-box-${app.id}">
                        <input type="text" class="url-input-field" id="url-input-${app.id}" placeholder="输入图片URL">
                        <button class="confirm-btn" onclick="applyUrlIcon('${app.id}')">确认</button>
                    </div>
                    <div class="status-message" id="status-${app.id}"></div>
                `;

        container.appendChild(item);
    });
}

function toggleUrlInput(appId) {
    const urlBox = document.getElementById(`url-box-${appId}`);
    urlBox.classList.toggle('show');
}

async function handleFileUpload(event, appId) {
    const file = event.target.files[0];
    if (!file) return;
    // 仅保留本地预览逻辑
    const reader = new FileReader();
    reader.onload = (e) => {
        applyCustomIcon(appId, e.target.result);
        showStatus(appId, '文件已加载（本地预览）');
    };
    reader.readAsDataURL(file);
}

function applyUrlIcon(appId) {
    const urlInput = document.getElementById(`url-input-${appId}`);
    const url = urlInput.value.trim();

    if (!url) {
        showStatus(appId, '请输入URL', 'error');
        return;
    }

    applyCustomIcon(appId, url);
    showStatus(appId, 'URL图标已应用');
    urlInput.value = '';
    toggleUrlInput(appId);
}

function applyCustomIcon(appId, iconUrl) {
    globalConfig.customIcons[appId] = iconUrl;
    const previewEl = document.getElementById(`preview-${appId}`);
    if (previewEl) previewEl.innerHTML = `<img src="${iconUrl}" alt="">`;
    updateMainIcon(appId, iconUrl);
    saveCustomIconsToLocalStorage();
    console.log(`已将 ${appId} 的新图标保存到 LocalStorage`);
    // 删除了 dbAPI.saveData 调用
}

function updateMainIcon(appId, iconUrl) {
    const appElements = document.querySelectorAll(`[data-id="${appId}"]`);
    appElements.forEach(el => {
        const iconWrapper = el.querySelector('.icon-wrapper');
        if (iconWrapper && !el.classList.contains('folder')) {
            iconWrapper.innerHTML = `<img src="${iconUrl}" alt="">`;
        }
    });
}

function showStatus(appId, message, type = 'success') {
    const statusEl = document.getElementById(`status-${appId}`);
    statusEl.textContent = message;
    statusEl.className = 'status-message' + (type === 'error' ? ' error' : '');
    setTimeout(() => {
        statusEl.textContent = '';
    }, 3000);
}

function deleteTimeCard() {
    const timeCard = document.getElementById('timeCard');
    if (!timeCard) return;

    globalConfig.savedWidgets.push({
        id: 'timeCard',
        type: 'time',
        name: '时间卡片',
        html: timeCard.outerHTML,
        timestamp: Date.now()
    });

    timeCard.remove();

    localStorage.setItem('savedWidgets', JSON.stringify(globalConfig.savedWidgets));

    console.log('时间卡片已删除并保存');

    const deletedComponents = JSON.parse(localStorage.getItem('deletedComponents') || '[]');
    if (!deletedComponents.includes('timeCard')) {
        deletedComponents.push('timeCard');
        localStorage.setItem('deletedComponents', JSON.stringify(deletedComponents));
    }
}

function deleteWeatherCard() {
    const weatherCard = document.getElementById('weatherCard');
    if (!weatherCard) return;

    globalConfig.savedWidgets.push({
        id: 'weatherCard',
        type: 'weather',
        name: '天气卡片',
        html: weatherCard.outerHTML,
        timestamp: Date.now()
    });

    weatherCard.remove();

    localStorage.setItem('savedWidgets', JSON.stringify(globalConfig.savedWidgets));

    console.log('天气卡片已删除并保存');
    const deletedComponents = JSON.parse(localStorage.getItem('deletedComponents') || '[]');
    if (!deletedComponents.includes('weatherCard')) {
        deletedComponents.push('weatherCard');
        localStorage.setItem('deletedComponents', JSON.stringify(deletedComponents));
    }
}

function deleteWidget(widgetElement) {
    if (!widgetElement) return;

    const widgetId = widgetElement.dataset.id;

    globalConfig.savedWidgets.push({
        id: widgetId,
        type: 'widget',
        name: widgetElement.querySelector('.app-label')?.textContent || 'Widget',
        html: widgetElement.outerHTML,
        timestamp: Date.now()
    });

    widgetElement.remove();

    localStorage.setItem('savedWidgets', JSON.stringify(globalConfig.savedWidgets));

    console.log(`Widget ${widgetId} 已删除并保存`);
    const deletedComponents = JSON.parse(localStorage.getItem('deletedComponents') || '[]');
    if (!deletedComponents.includes(widgetId)) {
        deletedComponents.push(widgetId);
        localStorage.setItem('deletedComponents', JSON.stringify(deletedComponents));
    }
}

// ▼▼▼ 请用下面这个完整的、修正后的函数，替换掉您文件中旧的 createElement 函数 ▼▼▼

function createElement(app, grid) {
    const el = document.createElement('div');

    if (app.isWidget) {
        // 只为 widget2 创建数码像素猫组件
        if (app.id === 'widget2') {
            el.className = 'cat-widget';
            Object.assign(el.dataset, {id: app.id, row: app.row, col: app.col});
            el.dataset.colspan = app.colspan;
            el.dataset.rowspan = app.rowspan;

            el.innerHTML = `
            <div class="delete-widget-btn" onclick="deleteWidget(this.parentElement)">×</div>

            <!-- 状态数据条 -->
            <div class="cat-stats-container">
                <div class="cat-stat-item" data-stat="happiness" onclick="editCatStat(event, 'happiness')">
                    <div class="cat-stat-label">
                        <span>😊 开心度</span>
                        <span class="cat-stat-value" id="stat-happiness-value">85%</span>
                    </div>
                    <div class="cat-stat-bar-bg">
                        <div class="cat-stat-bar-fill" id="stat-happiness-bar" style="width: 85%"></div>
                    </div>
                </div>

                <div class="cat-stat-item" data-stat="hunger" onclick="editCatStat(event, 'hunger')">
                    <div class="cat-stat-label">
                        <span>🍖 饱食度</span>
                        <span class="cat-stat-value" id="stat-hunger-value">70%</span>
                    </div>
                    <div class="cat-stat-bar-bg">
                        <div class="cat-stat-bar-fill" id="stat-hunger-bar" style="width: 70%"></div>
                    </div>
                </div>

                <div class="cat-stat-item" data-stat="energy" onclick="editCatStat(event, 'energy')">
                    <div class="cat-stat-label">
                        <span>⚡ 精力值</span>
                        <span class="cat-stat-value" id="stat-energy-value">60%</span>
                    </div>
                    <div class="cat-stat-bar-bg">
                        <div class="cat-stat-bar-fill" id="stat-energy-bar" style="width: 60%"></div>
                    </div>
                </div>

                <div class="cat-stat-item" data-stat="cleanliness" onclick="editCatStat(event, 'cleanliness')">
                    <div class="cat-stat-label">
                        <span>✨ 清洁度</span>
                        <span class="cat-stat-value" id="stat-cleanliness-value">90%</span>
                    </div>
                    <div class="cat-stat-bar-bg">
                        <div class="cat-stat-bar-fill" id="stat-cleanliness-bar" style="width: 90%"></div>
                    </div>
                </div>
            </div>

            <!-- 数码像素猫主体 -->
            <div class="pixel-cat-body"></div>

            <!-- 猫咪对话气泡 -->
            <div class="cat-speech-bubble" onclick="editCatSpeech(event)">喵~ 今天也要开心喔！🌸</div>
        `;
        } else {
            return; // 其他widget暂不创建
        }
    } else {
        // 普通图标和文件夹的逻辑保持不变
        el.className = app.isFolder ? 'app-icon folder' : 'app-icon';
        Object.assign(el.dataset, {id: app.id, row: app.row, col: app.col});

        const customIcon = globalConfig.customIcons[app.id];
        let content;

        // 处理单图标
        const initialIcon = app.icon;
        const isInitialIconUrl = initialIcon && (initialIcon.startsWith('http') || initialIcon.startsWith('data:'));
        if (customIcon) {
            content = `<img src="${customIcon}" alt="${app.label}">`;
        } else if (isInitialIconUrl) {
            content = `<img src="${initialIcon}" alt="${app.label}">`;
        } else if (app.isFolder) {
            // 🔥 修改点：处理文件夹预览的小图标
            content = app.icons.slice(0, 9).map(item => {
                // 兼容逻辑：如果是新格式(对象)，取item.icon；如果是旧格式(字符串)，直接取item
                const iconSrc = (typeof item === 'object' && item.icon) ? item.icon : item;

                const isUrl = iconSrc && (iconSrc.startsWith('http') || iconSrc.startsWith('data:'));
                const miniIconContent = isUrl ? `<img src="${iconSrc}" alt="">` : iconSrc;
                return `<div class="folder-mini-icon">${miniIconContent}</div>`;
            }).join('');
        } else {
            content = app.icon;
        }
        el.innerHTML = `
            <div class="icon-wrapper">${content}</div>
            <div class="app-label">${app.label}</div>
            ${app.badge ? `<span class="badge">${app.badge}</span>` : ''}`;
    }

    // 定位、添加事件监听并添加到网格中
    positionElement(el, app.row, app.col, app.colspan || 1, app.rowspan || 1);
    addDragListeners(el, app.clickable);
    grid.appendChild(el);
    // 针对文件夹，异步获取颜色并应用
    if (app.isFolder) {
        // 🔥 修改点：获取第一张图的URL也需要适配对象格式
        const firstItem = app.icons[0];
        const firstImageUrl = (typeof firstItem === 'object' && firstItem.icon) ? firstItem.icon : firstItem;

        if (firstImageUrl && (firstImageUrl.startsWith('http') || firstImageUrl.startsWith('data:'))) {
            getAverageColorFromImageUrl(firstImageUrl, (colorGradient) => {
                if (el && el.isConnected && colorGradient) {
                    const iconWrapper = el.querySelector('.icon-wrapper');
                    if (iconWrapper) {
                        iconWrapper.style.background = colorGradient;
                    }
                }
            });
        }
    }
}


/* script.js 中的 addDragListeners 函数部分 */

function addDragListeners(el, clickable) {
    // ... 前面的代码不变 ...
    el.addEventListener('click', (e) => {
        e.stopPropagation();

        // 1. 判断文件夹... (保持不变)
        if (el.classList.contains('folder')) {
            // ... 保持不变 ...
        }
        // 2. 如果是可点击的应用图标
        else if (clickable) {
            const id = el.dataset.id;

            if (id === 'settings') {
                openSettings();
            } else if (id === 'worldbook') {
                openWorldbook();
            } else if (id === 'calc') {
                openLedger();
            } else if (id === 'novel') {
                openNovelShelf();
            }
            // ▼▼▼ 新增这两个判断 ▼▼▼
            else if (id === 'study_mode') {
                openContacts(); // 学习模式 -> 打开通讯录
            } else if (id === 'chat_mode') {
                openSweetheartList();
            }
            // ▲▲▲ 新增结束 ▲▲▲
        }
    });
}


function isOccupied(pageKey, targetRow, targetCol, draggedId) {
    const apps = state.appLayouts[pageKey];
    for (const app of apps) {
        if (app.id === draggedId) {
            continue;
        }
        const appColSpan = app.colspan || 1;
        const appRowSpan = app.rowspan || 1;
        const inHorizontalRange = targetCol >= app.col && targetCol < (app.col + appColSpan);
        const inVerticalRange = targetRow >= app.row && targetRow < (app.row + appRowSpan);

        if (inHorizontalRange && inVerticalRange) {
            return true;
        }
    }
    return false;
}


function handleMove(e) {
    if (!state.draggedElement || state.dragMoveScheduled) return;

    const touch = getTouch(e);
    const distance = Math.sqrt(
        Math.pow(touch.clientX - state.dragStart.x, 2) +
        Math.pow(touch.clientY - state.dragStart.y, 2)
    );

    if (distance > 5 && !state.hasDragged) {
        state.hasDragged = true;
        clearTimeout(state.longPressTimer);
        if (!state.isDragging) {
            state.isEditMode = true;
            state.isDragging = true;
            state.draggedElement.classList.add('dragging');
            document.body.style.cursor = 'grabbing';
            showEditHint(true);
            state.draggedElement.style.transition = 'none';
        }
    }

    if (!state.isDragging) return;

    if (e.cancelable) e.preventDefault();

    // 将更新操作放入 rAF 回调
    state.dragMoveScheduled = true;
    requestAnimationFrame(() => {
        const touch = getTouch(e);
        const deltaX = touch.clientX - state.dragStart.x;
        const deltaY = touch.clientY - state.dragStart.y;

        if (state.draggedElement) { // 再次检查，防止元素已不存在
            state.draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.08)`;
        }
        state.draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.08)`;
    });
}

// ▼▼▼ 请将你原来的 handleEnd 函数完整地替换成下面这个版本 ▼▼▼

function handleEnd(e) {
    // 1. 如果是从收藏夹拖出，交给 ghost 逻辑处理
    if (dragGhost) return;

    clearTimeout(state.longPressTimer);
    document.body.style.cursor = 'default';

    // 2. 仅在拖拽状态下处理
    if (state.isDragging && state.draggedElement) {
        const draggedEl = state.draggedElement;
        const touch = getChangedTouch(e);

        // 3. 检查是否拖入收藏栏 (不变)
        const panel = document.getElementById('iconDockPanel');
        if (panel && panel.classList.contains('show')) {
            const panelRect = panel.getBoundingClientRect();
            if (touch.clientX >= panelRect.left && touch.clientX <= panelRect.right &&
                touch.clientY >= panelRect.top && touch.clientY <= panelRect.bottom) {
                addIconToDockPanel(draggedEl);
                finishDrag(true);
                return;
            }
        }

        // 4. ✅【核心修改】不再判断 targetPage，目标永远是 grid1
        const targetGrid = document.getElementById('grid1');
        const gridRect = targetGrid.getBoundingClientRect();

        // 计算行和列
        const ROW_HEIGHT_PX = 110;
        const GAP_PX = 8;
        const dropX = touch.clientX - gridRect.left;
        const dropY = touch.clientY - gridRect.top;

        let col = Math.floor(dropX / (gridRect.width / 4));
        let row = Math.floor(dropY / (ROW_HEIGHT_PX + GAP_PX));

        // 边界限制
        const colspan = parseInt(draggedEl.dataset.colspan) || 1;
        const rowspan = parseInt(draggedEl.dataset.rowspan) || 1;
        col = Math.max(0, Math.min(col, 4 - colspan));
        row = Math.max(0, Math.min(row, 6 - rowspan));

        // 5. 检查位置是否被占用 (只查 page1)
        if (isOccupied('page1', row, col, draggedEl.dataset.id)) {
            revertPosition(draggedEl);
        } else {
            // 位置有效，更新数据
            const appId = draggedEl.dataset.id;
            const appData = state.appLayouts.page1.find(app => app.id === appId);

            if (appData) {
                appData.row = row;
                appData.col = col;

                // 更新 DOM 和 样式
                draggedEl.dataset.row = row;
                draggedEl.dataset.col = col;
                positionElement(draggedEl, row, col, colspan, rowspan);

                // 保存
                saveLayoutToLocalStorage();
            }
        }

        // 恢复动画样式
        draggedEl.style.transform = '';
        draggedEl.style.transition = 'all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        setTimeout(() => {
            if (draggedEl) draggedEl.style.transition = '';
        }, 250);
        state.lastDragEndTime = Date.now();
    }

    // 清理事件
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('touchend', handleEnd);
    document.removeEventListener('mouseup', handleEnd);

    finishDrag(state.hasDragged);
}


function finishDrag(exitImmediately) {
    if (state.draggedElement) {
        state.draggedElement.classList.remove('dragging');
        state.draggedElement.style.transition = '';
    }

    state.isDragging = false;
    state.draggedElement = null;

    // ✅ 修改：只有在实际发生拖拽后才重置 hasDragged
    if (exitImmediately) {
        state.hasDragged = false;
    }

    // ✅ 核心修复：只在明确要求立即退出时，才延迟关闭编辑模式
    if (exitImmediately && state.hasDragged) {
        setTimeout(() => {
            if (state.isEditMode && !state.isDragging) {
                state.isEditMode = false;
                showEditHint(false);
                showDeleteButtons(false);
            }
        }, 500);
    }
    // ✅ 如果只是长按激活（没有拖拽），则保持编辑模式不退出
}


// ▼▼▼ 请将你原来的 revertPosition 函数替换成下面这个版本 ▼▼▼

function revertPosition(el, originalTransition = '') {
    // 移除可能存在的 transform，让它直接回到原始的布局位置
    el.style.transform = 'none';

    // 找到它应该在的网格和位置
    const sourceGrid = el.parentElement;
    const originalRow = parseInt(el.dataset.row);
    const originalCol = parseInt(el.dataset.col);
    const colspan = parseInt(el.dataset.colspan) || 1;
    const rowspan = parseInt(el.dataset.rowspan) || 1;

    // 添加一个平滑的回弹动画
    el.style.transition = 'all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    positionElement(el, originalRow, originalCol, colspan, rowspan);

    // 动画结束后，恢复原始的 transition 设置
    setTimeout(() => {
        if (el) el.style.transition = originalTransition;
    }, 250);
}

// ▼▼▼ 这是一个可选的优化，但建议你也替换掉旧的 updateAndSavePosition 函数 ▼▼▼

function updateAndSavePosition(el, newRow, newCol) {
    const appId = el.dataset.id;
    // 这个函数现在只处理同页拖拽，所以直接从父元素获取 pageKey
    const pageKey = el.parentElement.id === 'grid1' ? 'page1' : 'page2';

    const appData = state.appLayouts[pageKey].find(app => app.id === appId);
    if (appData) {
        appData.row = newRow;
        appData.col = newCol;
    }

    el.dataset.row = newRow;
    el.dataset.col = newCol;

    const colspan = parseInt(el.dataset.colspan) || 1;
    const rowspan = parseInt(el.dataset.rowspan) || 1;

    // 平滑地移动到新位置
    el.style.transition = 'all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    positionElement(el, newRow, newCol, colspan, rowspan);

    // 动画结束后移除 transition
    setTimeout(() => {
        if (el) el.style.transition = '';
    }, 250);

    saveLayoutToLocalStorage();
    console.log(`同页移动成功：已保存 ${appId} 到新位置: (${newRow}, ${newCol})`);
}


function saveLayoutToLocalStorage() {
    localStorage.setItem('phoneAppLayouts', JSON.stringify(state.appLayouts));
}

function saveCustomIconsToLocalStorage() {
    localStorage.setItem('phoneCustomIcons', JSON.stringify(globalConfig.customIcons));
}


function showPage(pageNum) {
    state.currentPage = pageNum;
    pagesWrapper.style.transform = `translateX(-${(pageNum - 1) * 50}%)`;
    document.querySelectorAll('.dot').forEach((dot, i) =>
        dot.classList.toggle('active', i === pageNum - 1));

    // const hint1 = document.getElementById('editHint1');
    // const hint2 = document.getElementById('editHint2');
    //
    // if (pageNum === 1) {
    //     hint1.style.display = 'block';
    //     hint2.style.display = 'none';
    // } else {
    //     hint1.style.display = 'none';
    //     hint2.style.display = 'block';
    // }
}


// ============ 开始：请将这个全新的代码块完整粘贴到你的 <script> 中 ============

/**
 * [丝滑翻页优化版] 统一的“滑动结束”处理器
 * - 引入速度判断，实现快速轻扫即可翻页
 * - 结合最小距离阈值，防止误触
 */
function swipeEndHandler(e) {
    // 解除在 document 上绑定的事件
    document.removeEventListener('mousemove', swipeMoveHandler);
    document.removeEventListener('mouseup', swipeEndHandler);
    document.removeEventListener('touchmove', swipeMoveHandler);
    document.removeEventListener('touchend', swipeEndHandler);

    if (!state.isSwipingPage) return;

    // --- 核心升级：智能决策逻辑 ---

    const touch = getChangedTouch(e);
    const diff = touch.clientX - state.swipeStart.x;
    const timeElapsed = Date.now() - state.swipeStart.time;

    // 计算速度（像素/毫秒），如果时间过短则防止除以零
    const velocity = timeElapsed > 0 ? Math.abs(diff) / timeElapsed : 0;

    // 重新启用CSS动画，用于“吸附”或“弹回”
    pagesWrapper.classList.remove('no-transition');

    let targetPage = state.currentPage;

    // 智能决策：
    // 条件1: 滑动距离超过一个较小的阈值（例如30像素）
    // 条件2: 滑动速度很快（例如大于0.2像素/毫秒）
    // 只要满足其中一个，就认为用户想要翻页
    if (Math.abs(diff) > 30 || velocity > 0.2) {
        if (diff > 0 && state.currentPage === 2) {
            // 从第2页向右滑 -> 前往第1页
            targetPage = 1;
        } else if (diff < 0 && state.currentPage === 1) {
            // 从第1页向左滑 -> 前往第2页
            targetPage = 2;
        }
    }

    // --- 决策结束 ---

    // 使用 setTimeout 确保动画无缝衔接
    // 浏览器会在执行 showPage 前先应用 'no-transition' 被移除的样式
    setTimeout(() => {
        showPage(targetPage);
    }, 0);

    state.isSwipingPage = false;
}

/**
 * [丝滑翻页优化版] 统一的“滑动开始”处理器
 * 修复：已将 .chapter-list-panel 加入排除列表，防止滑动目录时误触翻页
 */
function swipeStartHandler(e) {
    // 检查触摸事件是否发生在不应触发翻页的元素上
    // ✅ 修复：添加了 .chapter-list-panel (目录) 和 .reader-header-bar (顶部栏)
    if (e.target.closest('.page-dots, #iconDockPanel, #floatingBall, .cat-widget, .contacts-page, .chat-page, .sweetheart-chat-page, .settings-page, .config-page, .beautify-page, .modal-overlay, #statusPopup, .test-page, .worldbook-page, .mask-library-page, .contact-library-page, .memory-center-page, .map-editor-page, .folder-overlay, .novel-shelf-page, .novel-reader-page, .chapter-list-panel, .reader-header-bar')) {
        return; // 如果是，则直接退出，不处理翻页逻辑
    }
    // 检查是否刚结束拖拽操作，防止误触
    if (Date.now() - state.lastDragEndTime < 300) return;
    // 检查是否正在从收藏夹拖出图标或处于桌面编辑模式
    if (state.isDraggingFromDock || state.isEditMode || state.isDragging) return;
    // --- 后续的翻页逻辑保持不变 ---
    const touch = getTouch(e);
    state.swipeStart = {x: touch.clientX, time: Date.now()};
    state.isSwipingPage = true;
    state.initialTransform = -(state.currentPage - 1) * 50;
    pagesWrapper.classList.add('no-transition');
    if (e.type === 'touchstart') {
        document.addEventListener('touchmove', swipeMoveHandler, {passive: false});
        document.addEventListener('touchend', swipeEndHandler);
    } else {
        document.addEventListener('mousemove', swipeMoveHandler);
        document.addEventListener('mouseup', swipeEndHandler);
    }
}

// 这个函数负责在滑动过程中，通过 rAF 更新页面位置，保证流畅
function swipeMoveHandler(e) {
    if (!state.isSwipingPage) return;
    if (e.cancelable) {
        e.preventDefault();
    }

    const touch = getTouch(e);
    const diffX = touch.clientX - state.swipeStart.x;

    // 将像素差值转换为百分比
    const percentDiff = (diffX / screen.offsetWidth) * 50;
    // 计算新的 transform 值，并限制在 0% 到 -50% 之间
    const newTransform = Math.max(-50, Math.min(0, state.initialTransform + percentDiff));

    if (!state.swipeMoveScheduled) {
        state.lastSwipeTranslateX = newTransform;
        state.swipeMoveScheduled = true;
        requestAnimationFrame(updateSwipeTransform);
    }
}

// updateSwipeTransform 函数保持不变
function updateSwipeTransform() {
    if (!state.swipeMoveScheduled) {
        return;
    }
    pagesWrapper.style.transform = `translateX(${state.lastSwipeTranslateX}%)`;
    state.swipeMoveScheduled = false;
}

// ============ 结束：粘贴代码 ============


document.addEventListener('touchmove', handleMove, {passive: false});
document.addEventListener('mousemove', handleMove);
document.addEventListener('touchend', (e) => handleEnd(e));
document.addEventListener('mouseup', (e) => handleEnd(e));

screen.addEventListener('click', (e) => {
    if (e.target.closest('.chat-page, .contacts-page, .settings-page, .config-page, .beautify-page, .modal-overlay')) {
        return;
    }

    // ✅ 修改：点击任何非组件区域都退出编辑模式
    if (!e.target.closest('.app-icon') &&
        !e.target.closest('.widget') &&
        !e.target.closest('.cat-widget') && // 确保这行存在
        !e.target.closest('.time-card') &&
        !e.target.closest('.weather-card') &&
        !e.target.closest('[class*="delete-"]')) {
        exitEditMode();
    }
});


function initializeLayout() {
    // 1. 加载壁纸
    const savedWallpaper = localStorage.getItem('phoneWallpaper');
    if (savedWallpaper) applyWallpaper(savedWallpaper);

    // 3. 加载布局数据 (只处理 Page1)
    const savedLayouts = localStorage.getItem('phoneAppLayouts');
    if (savedLayouts) {
        try {
            const loadedLayouts = JSON.parse(savedLayouts);
            if (loadedLayouts.page1) {
                // 合并逻辑保持不变
                state.appLayouts.page1 = mergeAppLayouts(appsPage1, loadedLayouts.page1 || [], new Set());
            }
        } catch (e) {
            console.error('布局加载失败', e);
        }
    }

    // 4. 其他设置加载
    const savedIcons = localStorage.getItem('phoneCustomIcons');
    if (savedIcons) {
        try {
            globalConfig.customIcons = JSON.parse(savedIcons);
        } catch (e) {
        }
    }
    const savedWidgets = localStorage.getItem('savedWidgets');
    if (savedWidgets) {
        try {
            globalConfig.savedWidgets = JSON.parse(savedWidgets);
        } catch (e) {
        }
    }
    const deletedComponents = JSON.parse(localStorage.getItem('deletedComponents') || '[]');

    // 5. ✅【核心修改】只渲染 grid1，不再碰 grid2
    const grid1 = document.getElementById('grid1');
    if (grid1) {
        grid1.innerHTML = '';
        state.appLayouts.page1.forEach(app => {
            if (app.isWidget && deletedComponents.includes(app.id)) return;
            createElement(app, grid1);
        });
    }

    // 6. 处理已删除的组件
    if (deletedComponents.includes('timeCard')) document.getElementById('timeCard')?.remove();
    if (deletedComponents.includes('weatherCard')) document.getElementById('weatherCard')?.remove();

    loadSavedMoodAndWeather();
}


function mergeAppLayouts(defaultApps, savedApps, dockedIconIds) {
    const merged = [...savedApps];
    const savedIds = new Set(savedApps.map(app => app.id));

    // 【新增】获取所有页面已保存的图标ID
    const allSavedLayouts = localStorage.getItem('phoneAppLayouts');
    let allPageIds = new Set();
    if (allSavedLayouts) {
        try {
            const layouts = JSON.parse(allSavedLayouts);
            // 收集所有页面的图标ID
            if (layouts.page1) {
                layouts.page1.forEach(app => allPageIds.add(app.id));
            }
            if (layouts.page2) {
                layouts.page2.forEach(app => allPageIds.add(app.id));
            }
        } catch (e) {
            console.error('解析所有页面布局失败', e);
        }
    }

    // 将默认布局中新增的应用添加进来
    defaultApps.forEach(defaultApp => {
        // 【修改】现在检查三个地方：当前页面、收藏栏、其他页面
        if (!savedIds.has(defaultApp.id) &&
            !dockedIconIds.has(defaultApp.id) &&
            !allPageIds.has(defaultApp.id)) {  // 【新增条件】
            merged.push(defaultApp);
            console.log(`新增或恢复了应用: ${defaultApp.label}`);
        }
    });
    return merged;
}


document.getElementById('chatInput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();

        addMessageToList();
    }
});

// ========== 开始：用这个全新的JS代码块替换旧的 openAvatarActions 和相关函数 ==========

/**
 * 打开头像操作菜单，并记录当前操作的目标是哪个头像
 * @param {'contact' | 'user'} target - 'contact' 表示对方头像, 'user' 表示用户头像
 */
function openAvatarActions(target) {
    currentAvatarTarget = target; // 记录当前操作目标
    document.getElementById('avatarActionSheet').classList.add('show');
}

/**
 * 关闭头像操作菜单
 */
function closeAvatarActions() {
    document.getElementById('avatarActionSheet').classList.remove('show');
}

/**
 * 触发隐藏的文件上传输入框
 */
function triggerFileUpload() {
    document.getElementById('avatar-input').click();
    closeAvatarActions();
}

/**
 * 弹出输入框让用户填写图片URL
 */
function promptForUrl() {
    const url = prompt("请输入图片URL:", "https://");
    if (url) {
        const img = new Image();
        img.onload = function () {
            // 根据之前记录的目标，更新正确的头像预览
            const previewId = currentAvatarTarget === 'user' ? 'user-avatar-preview' : 'avatar-preview';
            document.getElementById(previewId).src = url;
            console.log(`已将 ${previewId} 的头像更新为: ${url}`);
        };
        img.onerror = function () {
            alert("无法加载该URL的图片，请检查链接是否正确。");
        };
        img.src = url;
    }
    closeAvatarActions();
}

// ========== 结束：替换完成 ==========


// ▼▼▼ 步骤2：用这个新版本完整替换旧的 openChat 函数 ▼▼▼

/**
 * [修正版] 打开普通聊天页面，不再混淆密友逻辑
 * @param {object} contact - 要聊天的联系人对象
 */
function openChat(contact) {
    hideMessageActionSheet();
    hideSweetheartMessageActionSheet();

    if (!contact) return;
    currentChatContact = contact;

    const chatPage = document.getElementById('chatPage');
    const contactNameEl = document.getElementById('chatContactName');
    const messagesEl = document.getElementById('chatMessages');

    // 核心修复：移除所有关于 'isSweetheart' 的检查和主题切换
    // 确保普通聊天页面永远是普通模式
    chatPage.classList.remove('sweetheart-mode');
    console.log(`正在以普通模式打开与 ${contact.name} 的聊天`);

    // 设置聊天标题并清空旧消息
    contactNameEl.textContent = contact.name;
    messagesEl.innerHTML = '';

    // 显示聊天页面
    requestAnimationFrame(() => {
        chatPage.classList.add('show');
    });

    // 加载或初始化聊天记录
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
    const contactMessages = chatHistory[contact.id] || [];

    if (contactMessages.length === 0) {
        // 核心修复：直接使用 “普通聊天” 的欢迎语
        const welcomeMessage = `你和 ${contact.name} 开始聊天了`;

        // 创建并显示系统提示消息
        const systemMessageEl = document.createElement('div');
        systemMessageEl.textContent = welcomeMessage;
        systemMessageEl.style.textAlign = 'center';
        systemMessageEl.style.fontSize = '12px';
        systemMessageEl.style.color = '#aaa';
        systemMessageEl.style.margin = '10px 0';
        messagesEl.appendChild(systemMessageEl);

    } else {
        // 如果有历史记录，则渲染它们
        contactMessages.forEach((message, index) => {
            const messageRow = _createMessageDOM(contact.id, message, index);
            messagesEl.appendChild(messageRow);
        });
    }

    // 滚动到底部
    setTimeout(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 50);
}

// 同时，为了保险起见，我们也在 closeChat 函数中确保清除主题
function closeChat() {
    const chatPage = document.getElementById('chatPage');
    chatPage.classList.remove('show');
    // 在动画结束后，移除主题类，以防影响下次打开
    setTimeout(() => {
        chatPage.classList.remove('sweetheart-mode');
    }, 350);
}

/**
 * [终极修复版] 调用 API 核心函数
 * 1. 修复 Payload：自动合并用户最后连续发送的多条气泡内容。
 * 2. 修复 回复乱码：正确处理腾讯云的全量流式返回（Snapshot），解决文字重复问题。
 */
async function callApi(messages) {
    // 1. 智能判断当前联系人
    const targetContact = currentSweetheartChatContact || currentChatContact || {
        name: "AI助手",
        id: "default_session_001",
        status: "智能助手"
    };

    const getDeviceId = () => {
        let did = localStorage.getItem('yetta_device_id');
        if (!did) {
            // 如果本地没有，就生成一个随机字符串并存起来
            did = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
            localStorage.setItem('yetta_device_id', did);
        }
        return did;
    };
    const deviceId = getDeviceId();

    // 2. 辅助函数：ID 清洗 (符合 API 规范)
    const sanitizeId = (id) => {
        let str = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
        if (str.length < 2) str = str.padEnd(2, '_');
        if (str.length > 64) str = str.substring(0, 64);
        return str;
    };

    // 3. 准备基础数据
    const requestId = "req_" + Date.now().toString(36);
    const rawSessionId = `${targetContact.id}_${deviceId}`;
    const apiSessionId = sanitizeId(rawSessionId);
    // (可选) 同时也让 visitor_id 唯一，确保用户画像隔离
    const apiVisitorId = `user_${deviceId}`;

    // ==========================================================
    // 🔥 核心逻辑修改 A：合并用户连续气泡 & 构建历史
    // ==========================================================

    let systemRoleText = "";
    let historyText = "";
    let currentPayloadContentParts = []; // 用于收集最后连续的用户发言

    // 步骤 A: 找到“当前轮次”的分割点
    // 从后往前找，找到第一个不是 'user' 的消息索引（比如上次 AI 的回复）
    let lastNonUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role !== 'user') {
            lastNonUserIndex = i;
            break;
        }
    }

    // 步骤 B: 遍历消息数组进行分流
    messages.forEach((msg, index) => {
        // --- 情况 1: 系统提示词 (System Prompt) ---
        if (msg.role === 'system') {
            systemRoleText += msg.content + "\n\n";
        }
        // --- 情况 2: 这是最后连续的用户消息 (合并到 payload.content) ---
        else if (index > lastNonUserIndex) {
            // 提取文本内容（兼容纯文本和多模态数组）
            let textPart = "";
            if (typeof msg.content === 'string') {
                textPart = msg.content;
            } else if (Array.isArray(msg.content)) {
                msg.content.forEach(item => {
                    if (item.type === 'text') textPart += item.text;
                    // 如果有图片链接，也可以拼接到这里
                    if (item.type === 'image_url') textPart += `\n![]( ${item.image_url.url} )\n`;
                });
            }
            if (textPart) currentPayloadContentParts.push(textPart);
        }
        // --- 情况 3: 这是以前的历史对话 (放入 system_role 做背景) ---
        else {
            const roleName = msg.role === 'user' ? '用户' : '你';
            let cleanContent = "";
            if (typeof msg.content === 'string') {
                cleanContent = msg.content.replace(/<[^>]+>/g, '[多媒体/图片]');
            } else {
                cleanContent = "[多媒体内容]";
            }
            historyText += `${roleName}: ${cleanContent}\n`;
        }
    });

    // 步骤 C: 合并当前的 payload content
    // 用换行符连接用户发的多条消息，这样 AI 会把它们当成一整句话处理
    let finalQueryContent = currentPayloadContentParts.join("\n");
    if (!finalQueryContent.trim()) finalQueryContent = " ";

    // 步骤 D: 将历史记录追加到 system_role
    if (historyText) {
        systemRoleText += `\n\n【对话历史回顾 (Context)】\n---\n${historyText}\n---\n`;
    }

    // 截断防止超长
    if (systemRoleText.length > 12000) systemRoleText = systemRoleText.substring(0, 12000);

    // 4. 构造 Payload
    const payload = {
        // ⚠️ 请确认使用你的真实 Key
        "bot_app_key": "QBHWzqXNdtjWEFYsrGBSHgciopFrvtDCfgNHgmYJzwWZjQLJHwvGiccbuzRsGLtfmGvIBVaHvmdlxbKMBFtgXXjMsNlQOczNPYtxygdGhceoInkcMgDBuMLPeOqrsuIy",
        "content": finalQueryContent, // ✅ 这里现在是合并后的完整内容
        "session_id": apiSessionId,
        "visitor_biz_id": apiVisitorId,
        "request_id": requestId,
        "system_role": systemRoleText,
        "stream": "enable", // 保持流式开启
        // 🔥 新增：传递文档信息
        "file_infos": fileInfos
    };

    console.log(`🤖 API 请求合并内容:`, finalQueryContent);

    try {
        const response = await fetch("https://wss.lke.cloud.tencent.com/v1/qbot/chat/sse", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error ${response.status}: ${errorText}`);
        }

        // ==========================================================
        // 🔥 核心逻辑修改 B：正确处理流式 Snapshot (修复乱码)
        // ==========================================================

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullReply = "";
        let buffer = "";

        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream: true});
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                if (line.startsWith("data:")) {
                    const jsonStr = line.substring(5).trim();
                    if (jsonStr === "[DONE]") return {success: true, message: fullReply};

                    try {
                        const data = JSON.parse(jsonStr);

                        // ✅ FIX: 你的日志显示 API 返回的是 content 全量覆盖（"你是" -> "你是想" -> "你是想要"）
                        // 所以这里必须用 (=) 赋值，而不能用 (+=) 累加
                        if (data.type === 'reply' && data.payload && data.payload.content) {
                            fullReply = data.payload.content; // 直接覆盖，修复重复字问题
                        } else if (data.type === 'error') {
                            return {success: false, message: `服务返回错误: ${data.error?.message}`};
                        }
                    } catch (e) {
                    }
                }
            }
        }

        // 最终返回完整的 fullReply，由 getAiReply 函数去拆分 ---
        // 这样就避免了“生成一半就发一句”的问题
        if (fullReply) return {success: true, message: fullReply};
        else return {success: false, message: "AI 没有返回有效内容"};

    } catch (error) {
        console.error("API Request Failed:", error);
        return {success: false, message: error.message};
    }
}

const LKECloudManager = {
    // 你的 Bot AppKey (从 callApi 中提取)
    appKey: "QBHWzqXNdtjWEFYsrGBSHgciopFrvtDCfgNHgmYJzwWZjQLJHwvGiccbuzRsGLtfmGvIBVaHvmdlxbKMBFtgXXjMsNlQOczNPYtxygdGhceoInkcMgDBuMLPeOqrsuIy",

    // 1. 获取上传凭证 (你需要实现这个接口，或者在这里模拟)
    async getCredential(fileType, isPublic = false) {
        console.log("正在请求上传凭证...");

        try {
            // 🔥 修改这里：把网址换成你 Vercel 的新地址
            // 如果你是本地开发，可以用 http://localhost:3000/api/credential
            // 如果已上线，用 https://你的项目名.vercel.app/api/credential
            const apiUrl = 'https://yetta-neon.vercel.app//api/credential';

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileType: fileType,
                    isPublic: isPublic
                })
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error("凭证获取失败: " + errText);
            }
            const data = await response.json();
            return data;
        } catch (e) {
            console.error(e);
            alert("无法获取上传凭证，请检查 Netlify 配置！");
            throw e;
        }
    },
    // 2. 上传文件到 COS
    async uploadToCOS(file, isPublic = false) {
        // A. 获取凭证
        const fileType = file.name.split('.').pop();
        const credData = await this.getCredential(fileType, isPublic);
        const {TmpSecretId, TmpSecretKey, Token, Bucket, Region, UploadPath} = credData;

        // B. 初始化 COS 实例
        const cos = new COS({
            getAuthorization: function (options, callback) {
                callback({
                    TmpSecretId: TmpSecretId,
                    TmpSecretKey: TmpSecretKey,
                    SecurityToken: Token,
                    StartTime: credData.StartTime,
                    ExpiredTime: credData.ExpiredTime,
                });
            }
        });

        // C. 执行上传
        return new Promise((resolve, reject) => {
            cos.putObject({
                Bucket: Bucket,
                Region: Region,
                Key: UploadPath, // 使用凭证返回的路径
                Body: file,
            }, function (err, data) {
                if (err) return reject(err);
                // 拼接最终访问 URL
                const fileUrl = `https://${Bucket}.cos.${Region}.myqcloud.com${UploadPath}`;
                resolve({
                    url: fileUrl,
                    data: data, // 包含 ETag 等信息
                    uploadPath: UploadPath,
                    bucket: Bucket,
                    fileSize: file.size
                });
            });
        });
    },

    // 3. (仅文档) 调用文档解析接口
    async parseDoc(file, cosResult, sessionId) {
        // 只有文档需要这一步，图片不需要
        const parseUrl = "https://wss.lke.cloud.tencent.com/v1/qbot/chat/docParse";

        const payload = {
            session_id: sessionId,
            bot_app_key: this.appKey,
            request_id: "req_" + Date.now(),
            cos_bucket: cosResult.bucket,
            file_type: file.name.split('.').pop(),
            file_name: file.name.replace(/\.[^/.]+$/, ""), // 去除后缀
            cos_url: cosResult.uploadPath,
            e_tag: cosResult.data.ETag,
            cos_hash: cosResult.data.headers['x-cos-hash-crc64ecma'], // 注意大小写，可能需要调试
            size: String(file.size) // 必须是字符串
        };

        const response = await fetch(parseUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        // 解析流式返回 (简化版，只取最后结果)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let docId = null;

        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            // 简单正则提取 doc_id，实际建议完整解析 SSE
            const match = text.match(/"doc_id":"([^"]+)"/);
            if (match && match[1] && match[1] !== "0") {
                docId = match[1];
            }
        }

        if (!docId) throw new Error("文档解析失败，未获取到 doc_id");
        return docId;
    }
};

/**
 * [全新版本] 发送消息，会检查并打包引用信息
 */
// 全局变量，用于存储普通聊天的防抖计时器
let normalAutoReplyTimer = null;

/* script.js */

function addMessageToList() {
    const inputEl = document.getElementById('chatInput');
    const messagesEl = document.getElementById('chatMessages');
    const messageText = inputEl.value.trim();

    if (!messageText && !currentQuoteData) return;
    if (!messageText.trim() && !currentQuoteData) {
        inputEl.value = '';
        return;
    }

    const messagePayload = {
        sender: 'user',
        text: messageText,
    };

    if (currentQuoteData) {
        messagePayload.quote = currentQuoteData;
    }

    // 1. 立即上屏并保存（这一步不变）
    const newIndex = saveMessage(currentChatContact.id, messagePayload);
    const messageRow = _createMessageDOM(currentChatContact.id, messagePayload, newIndex);
    messagesEl.appendChild(messageRow);

    inputEl.value = '';
    // 发送完后移除 has-text 类，这样“发送按钮”隐藏，“接收按钮”就会显示出来
    document.querySelector('.chat-input-area').classList.remove('has-text');
    cancelQuote();

    renderContacts(contactsData);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.focus();

    // ▼▼▼▼▼▼▼▼▼▼ 此处是修改点 ▼▼▼▼▼▼▼▼▼▼

    // 原来的代码有下面这段，【请把它删掉或注释掉】：
    /*
    if (normalAutoReplyTimer) {
        clearTimeout(normalAutoReplyTimer);
    }
    normalAutoReplyTimer = setTimeout(() => {
        getAiReply();
        normalAutoReplyTimer = null;
    }, 1500);
    */

    // 现在什么都不做，这就意味着只有你手动点击“接收按钮”时才会触发 AI。
    console.log("消息已发送，等待用户手动点击接收...");

    // ▲▲▲▲▲▲▲▲▲▲ 修改结束 ▲▲▲▲▲▲▲▲▲▲
}


/**
 * [全新] 格式化一段历史记录，作为提供给AI的背景上下文
 * @param {Array} history - 要格式化的聊天记录数组
 * @param {string} contextName - 这段历史的名称, e.g., "密友聊天"
 * @param {string} characterName - AI角色的名字
 * @returns {string} 格式化后的背景字符串
 */
function formatBackgroundHistory(history, contextName, characterName) {
    if (!history || history.length === 0) {
        return "";
    }

    // 将历史记录转换成易于AI阅读的对话格式
    const formattedDialog = history
        .map(msg => {
            const speaker = msg.sender === 'user' ? userProfile.name : characterName;
            return `${speaker}: ${msg.text.replace(/<img.*?>/g, '[图片]')}`; // 将图片转为文字描述
        })
        .join('\n');

    // 返回最终的、带有清晰标记的背景信息块
    return `
[背景信息：以下是你和用户在"${contextName}"中的最近对话记录，仅供参考，不要直接回复这些内容]
---
${formattedDialog}
---
`;
}

/**
 * 普通聊天 - 获取AI回复（完整版）
 */
async function getAiReply() {
    if (!currentChatContact) return;

    const contactId = currentChatContact.id;
    const chatInput = document.getElementById('chatInput');
    const getReplyBtn = document.getElementById('getReplyBtn');
    const messagesEl = document.getElementById('chatMessages');

    getReplyBtn.disabled = true; // 点击后禁用按钮，防止重复点击
    // 2. 读取历史记录
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}')[contactId] || [];

    // === 构建发送给AI的消息数组 ===
    const messages = [];
    messages.push({role: "system", content: AI_REALCHAT_SYSTEM_PROMPT});


    // 2. 世界书上下文
    const worldbookContext = gatherWorldbookContext();
    if (worldbookContext) {
        messages.push({
            role: "system",
            content: worldbookContext
        });
    }

    // 3. 角色设定
    if (currentChatContact.status) {
        messages.push({
            role: "system",
            content: `[角色设定]\n${currentChatContact.status}`
        });
    }

    // 4. 用户设定
    if (userProfile.persona) {
        messages.push({
            role: "system",
            content: `[用户设定 - 关于"我"的信息]\n${userProfile.persona}`
        });
    }

    // 在构建消息数组时，在用户设定后添加
    if (currentChatContact.boundMasks && currentChatContact.boundMasks.length > 0) {
        let maskContent = '[用户人设]\n';
        currentChatContact.boundMasks.forEach(maskId => {
            const mask = masksData.find(m => m.id === maskId);
            if (mask) {
                maskContent += `${mask.name}: ${mask.content}\n\n`;
            }
        });
        messages.push({
            role: "system",
            content: maskContent
        });
    }


    // ✅ 5. 背景信息：密友聊天的记录（正序：旧→新）
    const sweetheartHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}')[contactId] || [];
    if (sweetheartHistory.length > 0) {
        let backgroundInfo = `[背景信息：以下是你和用户在"密友私聊"中的最近对话记录，仅供参考，不要直接回复这些内容]\n\n`;

        const recentSweetheartChat = sweetheartHistory.slice(-10);

        recentSweetheartChat.forEach((msg) => {
            const sender = msg.sender === 'user' ? '用户' : currentChatContact.name;
            backgroundInfo += `${sender}: ${msg.text}\n`;
        });

        backgroundInfo += `\n---\n[以上为背景信息，当前对话从这里开始]\n`;

        messages.push({
            role: "system",
            content: backgroundInfo
        });
    }

    // 3. 【核心逻辑修改】处理历史记录（包含文件读取）
    const memoryRounds = currentChatContact.memoryRounds || 10;
    const recentHistory = chatHistory.slice(-(memoryRounds * 2));
    // ---------------------------------------------------------------------
    // [修改版] 普通聊天构建历史记录 (需替换的部分)
    // ---------------------------------------------------------------------

    // ★★★ 必须使用 for...of 循环来支持 await ★★★
    for (const msg of recentHistory) {
        const role = msg.sender === 'user' ? 'user' : 'assistant';

        // 🔥🔥🔥 新增：处理引用信息 🔥🔥🔥
        let finalContentText = msg.text || '';

        // 如果这条消息包含引用
        if (msg.quote) {
            let quotedContent = msg.quote.text;
            // 如果引用的是图片，转换文字说明
            if (quotedContent.includes('<img') || quotedContent.includes('db-image')) {
                quotedContent = '[图片]';
            }
            // 将引用格式化并拼接到消息前面
            // 格式：[引用了 SenderName 的消息: "内容"]
            const quoteBlock = `\n[引用了 ${msg.quote.senderName} 的消息: "${quotedContent}"]\n`;
            finalContentText = quoteBlock + finalContentText;
        }
        // 🔥🔥🔥 新增结束 🔥🔥🔥
        // === 情况 A: 文件消息 ===
        if (msg.type === 'file' && msg.content && msg.content.fileId) {
            try {
                const fileContent = await ImageDB.getText(msg.content.fileId);
                if (fileContent) {
                    const filePrompt = `[用户上传文件: ${msg.content.name}]\n内容如下:\n"""\n${fileContent}\n"""\n(请根据文件内容回答)`;
                    messages.push({role: role, content: filePrompt});
                } else {
                    messages.push({role: role, content: `[系统提示: 文件 ${msg.content.name} 内容已过期或丢失]`});
                }
            } catch (err) {
                console.error("读取文件内容出错", err);
            }
        }
        // === 情况 B: 图片消息 (普通聊天通常把图片包在HTML里) ===
        else {
            const textContent = msg.text || '';

            // 1. 尝试匹配图片标签
            // 正则解释：匹配 <img src="(任意内容)" ...>
            const imgMatch = textContent.match(/<img src="([^"]+)"[^>]*>/);

            if (imgMatch && role === 'user') {
                let imageUrl = imgMatch[1]; // 获取 src 属性

                // 2. 如果是数据库占位符，还原成 Base64
                if (imageUrl.startsWith('db-image://')) {
                    const imageId = imageUrl.split('db-image://')[1];
                    try {
                        const base64Entry = await ImageDB.get(imageId);
                        if (base64Entry) {
                            imageUrl = base64Entry;
                        } else {
                            imageUrl = null; // 图片丢失
                        }
                    } catch (e) {
                        console.error("图取失败", e);
                        imageUrl = null;
                    }
                }

                const surroundingText = textContent
                    .replace(/<img[^>]*>/, '') // 移除图片标签保留文字
                    .replace(/<br>/g, '\n').trim();

                if (imageUrl) {
                    const contentArray = [];
                    if (surroundingText) contentArray.push({type: 'text', text: surroundingText});
                    contentArray.push({type: 'image_url', image_url: {url: imageUrl}});
                    messages.push({role, content: contentArray});
                } else {
                    // 图片加载失败，只发文字
                    messages.push({role, content: surroundingText || '[图片已失效]'});
                }
            } else {
                // === 情况 C: 普通文本 ===
                messages.push({role, content: textContent.replace(/<br>/g, '\n')});
            }
        }
    }
    // ---------------------------------------------------------------------

    // 4. 处理当前输入框中可能存在的新消息 (这部分逻辑不变)
    const userMessage = chatInput.value.trim();
    if (userMessage) {
        // 🔥🔥🔥 这里也要处理当前这步的引用 🔥🔥🔥
        let currentMsgContent = userMessage;
        if (currentQuoteData) {
            let quotedContent = currentQuoteData.text;
            if (quotedContent.includes('<img') || quotedContent.includes('db-image')) {
                quotedContent = '[图片]';
            }
            currentMsgContent = `[引用了 ${currentQuoteData.senderName} 的消息: "${quotedContent}"]\n${userMessage}`;
        }
        // 🔥🔥🔥 处理结束 🔥🔥🔥
        simulateSendingMessage(userMessage);
        messages.push({role: 'user', content: userMessage});
        chatInput.value = '';
        document.querySelector('.chat-input-area').classList.remove('has-text');
    }

    // 如果没有任何用户消息，则不调用API
    if (messages.filter(m => m.role === 'user').length === 0) {
        getReplyBtn.disabled = false;
        chatInput.disabled = false;
        return;
    }
    // 5. 调用API
    // 添加一个"思考中"气泡
    const thinkingBubble = _createMessageDOM(contactId, {sender: 'contact', text: '...'}, -1);
    messagesEl.appendChild(thinkingBubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    const result = await callApi(messages);
    thinkingBubble.remove(); // 移除思考中
    // 6. 处理结果
    if (!result.success) {
        showErrorModal('请求失败', result.message);
    } else {
        // 分段显示回复
        const segments = result.message.split('---').filter(s => s.trim());
        if (segments.length === 0) segments.push(result.message);

        for (const segmentText of segments) {
            const messageObj = {sender: 'contact', text: segmentText.trim()};
            const newIndex = saveMessage(contactId, messageObj);
            const row = _createMessageDOM(contactId, messageObj, newIndex);
            messagesEl.appendChild(row);
            await new Promise(r => setTimeout(r, 400)); // 停顿一下
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    }
    // 7. 清理和收尾工作 (这部分不变)
    renderContacts(contactsData);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    getReplyBtn.disabled = false;
    // chatInput.disabled = false;
    chatInput.focus();
}

/**
 * [修正版] 保存消息到localStorage
 * @param {string|number} contactId - 联系人ID
 * @param {object} message - 消息对象，可能包含 sender, text, quote 等字段
 * @returns {number} 新消息的索引
 */
function saveMessage(contactId, message) {
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
    if (!chatHistory[contactId]) {
        chatHistory[contactId] = [];
    }

    // ✅ 核心修复：同样地，保存完整的消息对象
    const messageToSave = {...message};

    chatHistory[contactId].push(messageToSave);

    try {
        localStorage.setItem('phoneChatHistory', JSON.stringify(chatHistory));
    } catch (e) {
        console.error('保存失败:', e);
        alert('存储空间不足，请清理数据');
    }

    return chatHistory[contactId].length - 1;
}

// ========== 开始：用这个【修正版】的 editCurrentContact 函数替换旧的 ==========
function editCurrentContact() {
    if (!currentChatContact) return;

    const modal = document.getElementById('characterCardModal');
    modal.dataset.editingId = currentChatContact.id;
    modal.dataset.saveTarget = 'default';

    // 填充联系人信息
    document.getElementById('char-name').value = currentChatContact.name;
    document.getElementById('char-persona').value = currentChatContact.status;
    document.getElementById('char-voice-id').value = currentChatContact.voiceId || ''; // <<< 新增：填充 Voice ID
    const contactAvatar = currentChatContact.avatar;
    const isContactUrl = contactAvatar && (contactAvatar.startsWith('http') || contactAvatar.startsWith('data:'));
    document.getElementById('avatar-preview').src = isContactUrl ? contactAvatar : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

    // 🆕 修改：显示完整的真实ID
    const idElement = document.getElementById('char-instance-id');
    if (idElement) {
        idElement.textContent = currentChatContact.id;
        idElement.title = `完整ID: ${currentChatContact.id}`;
    }

    // 填充用户信息
    document.getElementById('user-name').value = userProfile.name;
    document.getElementById('user-persona').value = userProfile.persona;
    const userAvatar = userProfile.avatar;
    const isUserUrl = userAvatar && (userAvatar.startsWith('http') || userAvatar.startsWith('data:'));
    document.getElementById('user-avatar-preview').src = isUserUrl ? userAvatar : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

    renderCharacterWorldbooksList(currentChatContact.boundWorldbooks || []);
    renderCharacterMasksList(currentChatContact.boundMasks || []);
    openCharacterCardPage();
}

// ========== 开始：粘贴这个全新的 JavaScript 代码块 ==========
function editCurrentSweetheartContact() {
    if (!currentSweetheartChatContact) return;
    openUnifiedModalWithData(currentSweetheartChatContact, 'sweetheart');
}


/**
 * [增强版] 打开密友聊天的设置页面，并加载记忆轮数
 */
function openSweetheartChatSettings() {
    const settingsPage = document.getElementById('sweetheartChatSettingsPage');
    if (settingsPage) {
        settingsPage.classList.add('show');
    }
    // 加载并显示当前密友的记忆轮数
    const memoryRoundsInput = document.getElementById('memoryRoundsInput');
    if (currentSweetheartChatContact && memoryRoundsInput) {
        // 如果联系人数据中没有该设置，则默认为10
        memoryRoundsInput.value = currentSweetheartChatContact.memoryRounds || 10;
    }
}

/**
 * [补全函数] 关闭密友聊天的设置页面
 * 该函数应在设置页面的“返回”按钮上调用
 */
function closeSweetheartChatSettings() {
    const settingsPage = document.getElementById('sweetheartChatSettingsPage');
    if (settingsPage) {
        settingsPage.classList.remove('show');
    }
}


/**
 * [全新函数] 清空当前密友的聊天记录
 * 在密友设置页的“清空聊天记录”上调用
 */
function clearCurrentSweetheartChatHistory() {
    if (!currentSweetheartChatContact) return;

    if (confirm('确定要清空与当前密友的所有聊天记录吗？')) {
        const contactId = currentSweetheartChatContact.id;
        const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');

        // 清空该联系人的聊天记录
        chatHistory[contactId] = [];
        localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(chatHistory));

        // 🔥 关键修复：清空UI
        const messagesEl = document.getElementById('sweetheartChatMessages');
        if (messagesEl) {
            messagesEl.innerHTML = '';
        }

        // 🔥 关键修复：重置输入框状态
        const chatInput = document.getElementById('sweetheartChatInput');
        if (chatInput) {
            chatInput.value = '';
            chatInput.disabled = false;
            chatInput.removeAttribute('readonly');
            chatInput.focus(); // 聚焦到输入框
        }

        // 更新列表显示
        renderSweetheartList();

        showSuccessModal('清空成功', '聊天记录已清除');
        closeSweetheartChatSettings();
    }
}


// ========== 结束：粘贴全新的 JavaScript 代码块 ==========

function showSuccessModal(title = '操作成功', message = '你的设置已保存。', duration = 1500) {
    const modal = document.getElementById('successModal');
    const modalTitle = document.getElementById('successModalTitle');
    const modalMessage = document.getElementById('successModalMessage');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    modal.style.display = 'flex';

    setTimeout(() => modal.classList.add('show'), 10);

    setTimeout(() => {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }, duration);
}

/**
 * 显示一个不可回复的错误提示弹窗
 * @param {string} [title='操作失败'] - 弹窗的主标题
 * @param {string} [message='出现未知错误。'] - 弹窗的详细信息
 * @param {number} [duration=2500] - 弹窗显示的毫秒数
 */
function showErrorModal(title = '操作失败', message = '出现未知错误。', duration = 2500) {
    const modal = document.getElementById('errorModal');
    const modalTitle = document.getElementById('errorModalTitle');
    const modalMessage = document.getElementById('errorModalMessage');

    // 如果找不到必要的元素，就直接退出，防止报错
    if (!modal || !modalTitle || !modalMessage) {
        console.error('错误提示框的HTML元素未找到！');
        return;
    }

    // 1. 更新标题和信息
    modalTitle.textContent = title;
    modalMessage.textContent = message;

    // 2. 显示弹窗并触发动画
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10); // 延迟一点点以确保CSS过渡生效

    // 3. 在指定时间后自动隐藏
    setTimeout(() => {
        modal.classList.remove('show');
        // 在动画结束后再彻底隐藏，防止突然消失
        setTimeout(() => modal.style.display = 'none', 300);
    }, duration);
}


/**
 * [新增] 保存密友列表到localStorage
 */
function saveSweetheartContacts() {
    try {
        localStorage.setItem('phoneSweetheartContactsData', JSON.stringify(sweetheartContactsData));
    } catch (e) {
        console.error('保存密友列表到 localStorage 失败:', e);
    }
}


function saveGlobalConfig() {
    try {
        const configToSave = {
            apiConfigs: globalConfig.apiConfigs,
            activeApiConfig: globalConfig.activeApiConfig,
            minimaxVoice: globalConfig.minimaxVoice, // <<< 新增：保存 Minimax 语音设置
        };
        localStorage.setItem('phoneGlobalConfig', JSON.stringify(configToSave));
    } catch (e) {
        console.error('保存全局配置到 localStorage 失败:', e);
    }
}

function loadGlobalConfig() {
    try {
        const savedConfig = localStorage.getItem('phoneGlobalConfig');
        if (savedConfig) {
            const parsedConfig = JSON.parse(savedConfig);
            // 仅合并顶层属性，避免深层对象被完全覆盖
            Object.assign(globalConfig.apiConfigs, parsedConfig.apiConfigs);
            globalConfig.activeApiConfig = parsedConfig.activeApiConfig;
            // <<< 新增：加载 Minimax 语音设置
            if (parsedConfig.minimaxVoice) {
                Object.assign(globalConfig.minimaxVoice, parsedConfig.minimaxVoice);
            }
            // >>> 结束新增
            console.log('成功从 localStorage 加载API和语音配置。');
        }
    } catch (e) {
        console.error('从 localStorage 加载API配置失败:', e);
    }
}

function openChatSettings() {
    document.getElementById('chatSettingsPage').classList.add('show');
}

function closeChatSettings() {
    document.getElementById('chatSettingsPage').classList.remove('show');
}

function clearCurrentChatHistory() {
    if (!currentChatContact) return; // 安全检查，确保当前有聊天对象

    // 弹出确认框，防止用户误操作
    if (confirm(`确定要清空与 "${currentChatContact.name}" 的所有聊天记录吗？`)) {
        // 从 localStorage 读取聊天记录
        const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');

        // 如果存在当前联系人的记录，就删除它
        if (chatHistory[currentChatContact.id]) {
            delete chatHistory[currentChatContact.id];
            // 将修改后的数据存回 localStorage
            try {
                localStorage.setItem('phoneChatHistory', JSON.stringify(chatHistory));
            } catch (e) {
                console.error('保存失败:', e);
                alert('存储空间不足，请清理数据');
            }

            // 重新加载聊天界面，使其显示为空
            openChat(currentChatContact);

            // 关闭设置页并显示成功提示
            closeChatSettings();
            showSuccessModal('操作成功', '聊天记录已清空。');
        }
    }
}


/* --- 复制并粘贴这段代码 --- */
function applyCodeScrollSetting(isEnabled) {
    if (isEnabled) {
        document.body.classList.add('code-scrolling-enabled');
    } else {
        document.body.classList.remove('code-scrolling-enabled');
    }
}

/* ------------------------- */


// ========== 开始：这是你需要粘贴的新JS代码 ==========

/**
 * 应用聊天背景图的核心函数
 * @param {string} imageUrl - 图片的URL或Base64数据。如果为空字符串，则恢复默认背景。
 */
function applyChatBackground(imageUrl) {
    const chatPage = document.getElementById('chatPage');
    if (imageUrl) {
        // 设置背景图片
        chatPage.style.backgroundImage = `url('${imageUrl}')`;
        chatPage.style.backgroundSize = 'cover';
        chatPage.style.backgroundPosition = 'center';
        localStorage.setItem('chatBackground', imageUrl);
        showChatBgStatus('背景已应用');
    } else {
        // 恢复默认背景
        chatPage.style.backgroundImage = '';
        localStorage.removeItem('chatBackground');
        showSuccessModal('操作成功', '已恢复为默认背景。');
    }
}

/**
 * 从本地文件上传处理函数
 * @param {Event} event - 文件输入框的change事件对象
 */
function handleChatBgUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 使用FileReader将图片转为Base64，以便保存和预览
    const reader = new FileReader();
    reader.onload = (e) => {
        applyChatBackground(e.target.result);
    };
    reader.onerror = () => {
        showChatBgStatus('读取文件失败', 'error');
    };
    reader.readAsDataURL(file);
}

/**
 * 切换URL输入框的显示/隐藏
 */
function toggleChatBgUrlInput() {
    const urlBox = document.getElementById('chat-bg-url-box');
    urlBox.classList.toggle('show');
}

/**
 * 从URL输入框应用背景图
 */
function applyChatBgFromUrl() {
    const urlInput = document.getElementById('chat-bg-url-input');
    const url = urlInput.value.trim();
    if (url) {
        applyChatBackground(url);
        urlInput.value = '';
        toggleChatBgUrlInput(); // 应用后自动隐藏输入框
    } else {
        showChatBgStatus('请输入有效的URL', 'error');
    }
}

/**
 * 在UI上显示状态消息
 * @param {string} message - 要显示的消息
 * @param {string} type - 消息类型 ('success' 或 'error')
 */
function showChatBgStatus(message, type = 'success') {
    const statusEl = document.getElementById('chat-bg-status');
    statusEl.textContent = message;
    statusEl.className = 'status-message' + (type === 'error' ? ' error' : '');
    setTimeout(() => {
        statusEl.textContent = '';
    }, 3000);
}

/**
 * 加载已保存的聊天背景图 (在应用初始化时调用)
 */
function loadChatBackground() {
    const savedBg = localStorage.getItem('chatBackground');
    if (savedBg) {
        applyChatBackground(savedBg);
    }
}

/* ========== 开始：粘贴这段全新的JS代码块 ========== */
function applyChatStyle(style) {
    const chatPage = document.getElementById('chatPage');
    const selector = document.getElementById('messageStyleSelector');

    if (style === 'simple') {
        chatPage.classList.add('simple-style');
    } else {
        chatPage.classList.remove('simple-style');
    }

    // 更新UI选择器状态
    if (selector) {
        selector.querySelectorAll('.segmented-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.style === style);
        });
    }

    // 保存选择
    localStorage.setItem('chatMessageStyle', style);
}


function setupStyleSelector() {
    const selector = document.getElementById('messageStyleSelector');
    if (selector) {
        selector.addEventListener('click', (event) => {
            const target = event.target.closest('.segmented-option');
            if (target && !target.classList.contains('active')) {
                const newStyle = target.dataset.style;
                applyChatStyle(newStyle);
            }
        });
    }
}

function applyFullscreenSetting(isEnabled) {
    if (isEnabled) {
        document.body.classList.add('fullscreen-enabled');
    } else {
        document.body.classList.remove('fullscreen-enabled');
    }
}

/* ========== 开始：用这段全新的代码替换旧的 setupAttachmentMenu 函数 ========== */

// script.js

// ▼▼▼ 请用这个【最终修正版】函数完整替换旧的 setupAttachmentMenu 函数 ▼▼▼

/**
 * [最终修正版] 设置普通聊天界面的附件菜单功能
 * - 修复了图片上传功能混淆聊天上下文的Bug。
 * - 优化了代码结构，使其更清晰。
 */
function setupAttachmentMenu() {
    // 1. 获取所有相关的 DOM 元素
    const showMenuBtn = document.getElementById('showAttachmentMenuBtn');
    const menu = document.getElementById('attachmentMenu');
    const fileInput = document.getElementById('fileInput'); // 用于上传文件（带AI分析）
    const imageInput = document.getElementById('imageInput'); // 用于发送图片
    const uploadFileBtn = document.getElementById('uploadFileBtn');
    const uploadImageBtn = document.getElementById('uploadImageBtn');

    // 安全检查，如果关键元素不存在则提前退出，防止后续代码报错
    if (!showMenuBtn || !menu || !fileInput || !imageInput || !uploadFileBtn || !uploadImageBtn) {
        console.error("附件菜单初始化失败：部分关键DOM元素未找到。");
        return;
    }

    // 2. 点击“+”按钮时，切换菜单的显示/隐藏
    showMenuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.classList.toggle('show');
    });

    // 3. 点击“文件”菜单项时，触发隐藏的文件选择框
    uploadFileBtn.addEventListener('click', () => {
        fileInput.click();
        menu.classList.remove('show');
    });

    // 4. 点击“图片”菜单项时，触发隐藏的图片选择框
    uploadImageBtn.addEventListener('click', () => {
        imageInput.click();
        menu.classList.remove('show');
    });

    // 5. 【核心修复】当用户选择了图片后，为“普通聊天”模式正确处理
    // 在 setupAttachmentMenu 函数内部...

// 找到 imageInput 的监听器，替换为以下内容：
    // 📍 定位：script.js -> setupAttachmentMenu 函数内部
// 🗑️ 删除旧的 imageInput 监听代码，粘贴这一段：

    imageInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // 1. 立即在界面显示“正在上传...”气泡，提升体验
        const messagesEl = document.getElementById('chatMessages');
        const loadingId = 'loading_img_' + Date.now();
        // 创建一个临时的加载气泡
        const loadingRow = document.createElement('div');
        loadingRow.innerHTML = `<div id="${loadingId}" class="message-row sent"><div class="chat-bubble" style="background:#eee;color:#666;">⏳ 图片上传中...</div></div>`;
        messagesEl.appendChild(loadingRow.firstChild);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            // 2. 🔥【核心变化】调用 Step3 里的管理器上传到腾讯云
            // 第二个参数 true 表示图片需要公有读权限 (IsPublic=true)
            const uploadResult = await LKECloudManager.uploadToCOS(file, true);

            console.log("图片上传成功，URL:", uploadResult.url);

            // 3. 移除加载气泡
            document.getElementById(loadingId).parentElement.remove();

            // 4. 构造 AI 能看懂的消息格式：Markdown 图片链接
            // 格式：![](https://example.com/image.jpg)
            const aiMessageContent = `请分析这张图片：\n![](${uploadResult.url})`;

            // 5. 在界面上显示图片（直接用云端 URL）
            // 这里我们把这张图作为用户发送的消息保存并显示
            const messagePayload = {
                sender: 'user',
                text: aiMessageContent, // 存 Markdown，方便历史记录回显
                // 为了界面美观，我们可以存一个 imageUrl 字段给 createMessageDOM 用
                imageUrl: uploadResult.url
            };

            const newIndex = saveMessage(currentChatContact.id, messagePayload);
            const messageRow = _createMessageDOM(currentChatContact.id, messagePayload, newIndex);
            messagesEl.appendChild(messageRow);

            // 6. 🔥 调用 AI 接口
            // 构造发送给 API 的消息数组
            const messages = [
                {role: 'user', content: aiMessageContent}
            ];

            // 触发 AI 回复 (复用现有的 getAiReply 逻辑太复杂，直接调底层 callApi)
            // 添加一个“思考中”气泡
            const thinkingBubble = _createMessageDOM(currentChatContact.id, {sender: 'contact', text: '...'}, -1);
            messagesEl.appendChild(thinkingBubble);

            const result = await callApi(messages); // 这里传入 null 或空数组作为 fileInfos
            thinkingBubble.remove();

            // 7. 显示 AI 回复
            if (result.success) {
                const replyMsg = {sender: 'contact', text: result.message};
                const replyIndex = saveMessage(currentChatContact.id, replyMsg);
                const replyRow = _createMessageDOM(currentChatContact.id, replyMsg, replyIndex);
                messagesEl.appendChild(replyRow);
            } else {
                showErrorModal('AI 响应失败', result.message);
            }

        } catch (e) {
            console.error(e);
            document.getElementById(loadingId)?.parentElement?.remove(); // 移除加载气泡
            alert("图片上传失败: " + e.message);
        } finally {
            event.target.value = ''; // 清空选择框，允许重复选同一张图
        }
    });


    // 6. 文件选择监听 (只保存上屏，不分析)
    // 📍 定位：script.js -> setupAttachmentMenu 函数内部
// 🗑️ 删除旧的 fileInput 监听代码，粘贴这一段：

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // 界面显示“正在解析...”
        const messagesEl = document.getElementById('chatMessages');
        const loadingId = 'loading_doc_' + Date.now();
        const loadingRow = document.createElement('div');
        loadingRow.innerHTML = `<div id="${loadingId}" class="message-row sent"><div class="chat-bubble" style="background:#eee;color:#666;">📄 正在上传并解析文档...</div></div>`;
        messagesEl.appendChild(loadingRow.firstChild);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            // 1. 🔥【核心变化】上传到腾讯云 (文档 IsPublic=false)
            const uploadResult = await LKECloudManager.uploadToCOS(file, false);

            // 2. 🔥【核心变化】调用解析接口获取 doc_id
            // session_id 需要和聊天保持一致
            const sessionId = currentChatContact ? currentChatContact.id : "default_session";
            const docId = await LKECloudManager.parseDoc(file, uploadResult, sessionId);

            console.log("文档解析成功，DocID:", docId);
            document.getElementById(loadingId).parentElement.remove();

            // 3. 构造 file_infos 对象 (API 要求的数据结构)
            const fileInfo = {
                doc_id: docId,
                file_name: file.name.replace(/\.[^/.]+$/, ""), // 去除后缀
                file_type: file.name.split('.').pop(),
                file_size: String(file.size),
                file_url: uploadResult.url
            };

            // 4. 在界面上显示“文件已发送”
            const userMsg = {
                sender: 'user',
                type: 'file', // 使用现有的 file 类型渲染逻辑
                content: {
                    name: file.name,
                    size: file.size,
                    fileId: 'cloud_doc' // 标记这是云端文档，不是本地的
                }
            };
            const msgIndex = saveMessage(currentChatContact.id, userMsg);
            messagesEl.appendChild(_createMessageDOM(currentChatContact.id, userMsg, msgIndex));

            // 5. 🔥 发送给 AI
            // 文档对话通常伴随着一个指令，比如“总结这份文档”
            const promptText = "请总结这份文档的主要内容";

            // 先在界面显示这个指令
            const promptMsg = {sender: 'user', text: promptText};
            saveMessage(currentChatContact.id, promptMsg);
            messagesEl.appendChild(_createMessageDOM(currentChatContact.id, promptMsg, -1));

            // 构造请求
            const messages = [
                {role: 'user', content: promptText}
            ];

            // 添加思考中...
            const thinkingBubble = _createMessageDOM(currentChatContact.id, {sender: 'contact', text: '...'}, -1);
            messagesEl.appendChild(thinkingBubble);

            // 🔥 关键：将 fileInfo 数组传给 callApi
            const result = await callApi(messages, [fileInfo]);
            thinkingBubble.remove();

            if (result.success) {
                const replyMsg = {sender: 'contact', text: result.message};
                saveMessage(currentChatContact.id, replyMsg);
                messagesEl.appendChild(_createMessageDOM(currentChatContact.id, replyMsg, -1));
            } else {
                showErrorModal('文档助手响应失败', result.message);
            }

        } catch (e) {
            console.error(e);
            document.getElementById(loadingId)?.parentElement?.remove();
            alert("文档解析失败: " + e.message);
        } finally {
            event.target.value = '';
        }
    });


    // 7. 点击页面其他任何地方，自动关闭附件菜单 (保持不变)
    document.addEventListener('click', () => {
        if (menu.classList.contains('show')) {
            menu.classList.remove('show');
        }
    });
    // 阻止点击菜单本身时关闭菜单
    menu.addEventListener('click', (event) => event.stopPropagation());
}

// ========== 开始：用这个【发送后等待回复版】的函数替换旧的 ==========
/**
 * [最终修复版] 初始化密友聊天附件菜单
 * - 使用 cloneNode 技巧移除旧的事件监听器，修复重复绑定问题。
 */
// script.js - 找到 setupSweetheartAttachmentMenu 函数，完整替换为：

/**
 * [最终云端版] 初始化密友聊天附件菜单
 * 支持：上传图片(COS)对话、上传文档(COS+解析)对话、发红包
 */
function setupSweetheartAttachmentMenu() {
    const attachmentBtn = document.getElementById('sweetheartShowAttachmentMenuBtn');
    const attachmentMenu = document.getElementById('sweetheartAttachmentMenu');
    const fileInput = document.getElementById('sweetheartFileInput');
    const imageInput = document.getElementById('sweetheartImageInput');
    const redPacketBtn = document.getElementById('sweetheartSendRedPacketBtn');

    if (!attachmentBtn || !attachmentMenu) return;

    // 1. 克隆按钮以清除旧事件 (防止重复绑定)
    const freshAttachmentBtn = attachmentBtn.cloneNode(true);
    attachmentBtn.parentNode.replaceChild(freshAttachmentBtn, attachmentBtn);

    freshAttachmentBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        attachmentMenu.classList.toggle('show');
    });

    // 点击外部关闭菜单
    document.addEventListener('click', function (e) {
        if (attachmentMenu.classList.contains('show') &&
            !attachmentMenu.contains(e.target) &&
            !freshAttachmentBtn.contains(e.target)) {
            attachmentMenu.classList.remove('show');
        }
    });

    // --- 绑定上传按钮点击事件 ---
    const uploadFileBtn = document.getElementById('sweetheartUploadFileBtn');
    if (uploadFileBtn && fileInput) {
        const freshUploadFileBtn = uploadFileBtn.cloneNode(true);
        uploadFileBtn.parentNode.replaceChild(freshUploadFileBtn, uploadFileBtn);
        freshUploadFileBtn.addEventListener('click', function () {
            fileInput.click();
            attachmentMenu.classList.remove('show');
        });
    }

    const uploadImageBtn = document.getElementById('sweetheartUploadImageBtn');
    if (uploadImageBtn && imageInput) {
        const freshUploadImageBtn = uploadImageBtn.cloneNode(true);
        uploadImageBtn.parentNode.replaceChild(freshUploadImageBtn, uploadImageBtn);
        freshUploadImageBtn.addEventListener('click', function () {
            imageInput.click();
            attachmentMenu.classList.remove('show');
        });
    }

    // ============================================================
    // 🔥 核心修改 A: 密友图片上传 (上传COS -> 发送Markdown给AI)
    // ============================================================
    const freshImageInput = imageInput.cloneNode(true);
    imageInput.parentNode.replaceChild(freshImageInput, imageInput);

    freshImageInput.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file || !currentSweetheartChatContact) return;

        // 1. UI: 显示上传中
        const messagesEl = document.getElementById('sweetheartChatMessages');
        const loadingId = 'sh_loading_img_' + Date.now();
        const loadingRow = document.createElement('div');
        loadingRow.innerHTML = `<div id="${loadingId}" class="message-row sent"><div class="chat-bubble" style="background:rgba(255,255,255,0.5);color:#888;">⏳ 图片上传给TA中...</div></div>`;
        messagesEl.appendChild(loadingRow.firstChild);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            // 2. 上传到腾讯云 COS (IsPublic = true)
            const uploadResult = await LKECloudManager.uploadToCOS(file, true);
            console.log("密友图片上传成功:", uploadResult.url);

            // 3. 移除加载气泡
            document.getElementById(loadingId)?.parentElement?.remove();

            // 4. 构造 Markdown 消息 (隐藏式发送，或者直接显示图)
            const aiMessageContent = `(分享了一张图片)\n![](${uploadResult.url})`;

            // 5. 在界面上显示图片消息 (保存并渲染)
            const messagePayload = {
                sender: 'user',
                text: aiMessageContent,
                imageUrl: uploadResult.url, // 用于UI渲染
                timestamp: Date.now()
            };

            const newIndex = saveSweetheartMessage(currentSweetheartChatContact.id, messagePayload);
            const messageRow = _createMessageDOM(currentSweetheartChatContact.id, messagePayload, newIndex);
            messagesEl.appendChild(messageRow);
            messagesEl.scrollTop = messagesEl.scrollHeight;

            // 6. 调用 AI 分析
            // 添加一个"思考中"气泡
            const thinkingBubble = _createMessageDOM(currentSweetheartChatContact.id, {sender: 'contact', text: '...'}, -1);
            messagesEl.appendChild(thinkingBubble);

            // 构造请求数组
            const messages = [
                { role: 'user', content: aiMessageContent }
            ];

            // 调用 API (注意：这里用的是之前修改过的 callApi)
            const result = await callApi(messages);
            thinkingBubble.remove();

            // 7. 处理 AI 回复
            if (result.success) {
                const replyMsg = {
                    sender: 'contact',
                    text: result.message,
                    timestamp: Date.now()
                };
                const replyIndex = saveSweetheartMessage(currentSweetheartChatContact.id, replyMsg);
                messagesEl.appendChild(_createMessageDOM(currentSweetheartChatContact.id, replyMsg, replyIndex));
                messagesEl.scrollTop = messagesEl.scrollHeight;
            } else {
                showErrorModal('响应失败', result.message);
            }

        } catch (err) {
            console.error(err);
            document.getElementById(loadingId)?.parentElement?.remove();
            showErrorModal('图片发送失败', err.message);
        } finally {
            this.value = ''; // 清空，允许重复选图
        }
    });

    // ============================================================
    // 🔥 核心修改 B: 密友文件上传 (上传COS -> 解析 -> 发送file_infos)
    // ============================================================
    const freshFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(freshFileInput, fileInput);

    freshFileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file || !currentSweetheartChatContact) return;

        // UI: 显示解析中
        const messagesEl = document.getElementById('sweetheartChatMessages');
        const loadingId = 'sh_loading_doc_' + Date.now();
        const loadingRow = document.createElement('div');
        loadingRow.innerHTML = `<div id="${loadingId}" class="message-row sent"><div class="chat-bubble" style="background:rgba(255,255,255,0.5);color:#888;">📄 正在解析文档...</div></div>`;
        messagesEl.appendChild(loadingRow.firstChild);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            // 1. 上传到 COS (IsPublic = false)
            const uploadResult = await LKECloudManager.uploadToCOS(file, false);

            // 2. 调用解析接口
            const docId = await LKECloudManager.parseDoc(
                file,
                uploadResult,
                currentSweetheartChatContact.id // 使用密友ID作为SessionID
            );

            console.log("密友文档解析成功 DocID:", docId);
            document.getElementById(loadingId)?.parentElement?.remove();

            // 3. 构造 file_infos
            const fileInfo = {
                doc_id: docId,
                file_name: file.name.replace(/\.[^/.]+$/, ""),
                file_type: file.name.split('.').pop(),
                file_size: String(file.size),
                file_url: uploadResult.url
            };

            // 4. 界面显示"文件发送成功"
            const userMsg = {
                sender: 'user',
                type: 'file',
                content: {
                    name: file.name,
                    size: file.size,
                    fileId: 'cloud_doc_sh' // 标记
                },
                timestamp: Date.now()
            };
            const msgIndex = saveSweetheartMessage(currentSweetheartChatContact.id, userMsg);
            messagesEl.appendChild(_createMessageDOM(currentSweetheartChatContact.id, userMsg, msgIndex));

            // 5. 发送指令给 AI (带 file_infos)
            const promptText = "请阅读这份文档，并告诉我你的想法。";

            // 显示指令气泡
            const promptMsg = { sender: 'user', text: promptText, timestamp: Date.now() };
            const pIndex = saveSweetheartMessage(currentSweetheartChatContact.id, promptMsg);
            messagesEl.appendChild(_createMessageDOM(currentSweetheartChatContact.id, promptMsg, pIndex));

            // 思考中...
            const thinkingBubble = _createMessageDOM(currentSweetheartChatContact.id, {sender: 'contact', text: '...'}, -1);
            messagesEl.appendChild(thinkingBubble);
            messagesEl.scrollTop = messagesEl.scrollHeight;

            // 6. 调用 API
            const messages = [{ role: 'user', content: promptText }];
            // 关键：传入 fileInfos 数组
            const result = await callApi(messages, [fileInfo]);

            thinkingBubble.remove();

            // 7. 处理回复
            if (result.success) {
                const replyMsg = {
                    sender: 'contact',
                    text: result.message,
                    timestamp: Date.now()
                };
                const rIndex = saveSweetheartMessage(currentSweetheartChatContact.id, replyMsg);
                messagesEl.appendChild(_createMessageDOM(currentSweetheartChatContact.id, replyMsg, rIndex));
                messagesEl.scrollTop = messagesEl.scrollHeight;
            } else {
                showErrorModal('AI 响应错误', result.message);
            }

        } catch (err) {
            console.error(err);
            document.getElementById(loadingId)?.parentElement?.remove();
            showErrorModal('文档解析失败', err.message);
        } finally {
            event.target.value = '';
        }
    });

    // 4. 红包按钮 (保持不变)
    if (redPacketBtn) {
        const freshRedPacketBtn = redPacketBtn.cloneNode(true);
        redPacketBtn.parentNode.replaceChild(freshRedPacketBtn, redPacketBtn);
        freshRedPacketBtn.addEventListener('click', function () {
            attachmentMenu.classList.remove('show');
            openRedPacketModal();
        });
    }
}

// script.js - 找到 uploadFileAndGetAiResponse 函数，完整替换为：

/**
 * [更新版] 文件预处理工具函数
 * 作用：读取本地文件 -> 存入IndexedDB -> 返回文件信息
 * 核心：不再直接调用 CallApi，而是等待用户手动点击接收按钮
 */
function uploadFileAndGetAiResponse(file) {
    return new Promise((resolve, reject) => {
        // 1. 限制文件大小 (例如最大 2MB)
        const maxSize = 2 * 1024 * 1024;
        if (file.size > maxSize) {
            reject(new Error("文件过大，请上传 2MB 以内的文本文件"));
            return;
        }

        // 2. 创建文件读取器
        const reader = new FileReader();

        // 3. 读取成功的回调
        reader.onload = async (e) => {
            try {
                const content = e.target.result;

                // 核心步骤：将文件内容存入 IndexedDB，获取唯一的 fileId
                // 这样我们只需要在聊天记录里存一个短短的 ID
                const fileId = await ImageDB.saveText(content);

                // 返回处理好的数据结构，供后续渲染气泡使用
                resolve({
                    success: true,
                    name: file.name,
                    size: file.size,
                    fileId: fileId, // 重点：返回这个ID
                    preview: content.substring(0, 50) // 仅用于调试
                });

            } catch (err) {
                reject(new Error("文件存储失败: " + err.message));
            }
        };

        // 4. 读取失败的回调
        reader.onerror = () => {
            reject(new Error("浏览器读取文件失败"));
        };

        // 5. 开始作为文本读取
        reader.readAsText(file);
    });
}


// 创建一个辅助函数来模拟发送消息，避免代码重复
function simulateSendingMessage(messageText) {
    const messagesEl = document.getElementById('chatMessages');
    if (!messageText || !currentChatContact) return;

    // 保存消息记录
    const newIndex = saveMessage(currentChatContact.id, {sender: 'user', text: messageText});

    // 创建并显示消息 DOM
    const messageRow = _createMessageDOM(currentChatContact.id, {
        sender: 'user',
        text: messageText
    }, newIndex);
    messagesEl.appendChild(messageRow);

    // 更新联系人列表的最后消息并滚动到底部
    renderContacts(contactsData);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ========== 结束：粘贴 JavaScript 代码块 ========== */

/* ========== 开始：粘贴悬浮球的全新JavaScript逻辑 ========== */

// ========== 开始：粘贴这段【最终修正版】的悬浮球JS逻辑 ==========

function initializeFloatingBall() {
    const ball = document.getElementById('floatingBall');
    const phone = document.querySelector('.phone');

    if (!ball || !phone) return;

    let isDragging = false;
    let hasMoved = false; // 同样用于区分点击和拖拽
    let startX, startY;
    let initialLeft, initialTop;

    // 智能吸附到边缘的函数（保持不变）
    const snapToEdge = () => {
        const phoneRect = phone.getBoundingClientRect();
        const ballRect = ball.getBoundingClientRect();
        const screenInnerWidth = phoneRect.width - 24;
        let currentLeft = parseFloat(ball.style.left || 0);

        if (currentLeft + ballRect.width / 2 < screenInnerWidth / 2) {
            ball.style.left = '12px';
        } else {
            ball.style.left = `${phoneRect.width - ballRect.width - 12}px`;
        }
    };

    // 【 handleClick 函数被简化 】
    // 它现在只负责核心的点击业务，不再做判断
    const handleClick = () => {
        console.log('悬浮球被点击了!');
        toggleFloatingBallMenu(); // 打开或关闭菜单
    };

    const startDrag = (e) => {
        // e.preventDefault() 会阻止后续的 click 事件，但我们这里不能阻止，否则桌面端的 click 会失效。
        // 我们在 touchend 中有选择地阻止。

        isDragging = true;
        hasMoved = false; // 每次开始时重置
        ball.classList.add('dragging');

        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;

        const ballRect = ball.getBoundingClientRect();
        const phoneRect = phone.getBoundingClientRect();
        initialLeft = ballRect.left - phoneRect.left;
        initialTop = ballRect.top - phoneRect.top;

        // 统一使用 left/top 定位，后续计算更简单
        ball.style.left = `${initialLeft}px`;
        ball.style.top = `${initialTop}px`;
        ball.style.right = 'auto';
        ball.style.bottom = 'auto';

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag, {passive: false});
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    };

    const onDrag = (e) => {
        if (!isDragging) return;

        // 【优化】移动距离超过一个微小阈值才判定为拖拽
        const touch = e.touches ? e.touches[0] : e;
        if (!hasMoved && (Math.abs(touch.clientX - startX) > 5 || Math.abs(touch.clientY - startY) > 5)) {
            hasMoved = true;
        }

        // 只有真正拖动时才阻止页面滚动
        if (hasMoved && e.cancelable) e.preventDefault();

        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        const phoneRect = phone.getBoundingClientRect();
        const ballRect = ball.getBoundingClientRect();

        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;

        // 更可靠的边界检测
        const minX = 12;
        const maxX = phoneRect.width - ballRect.width - 12;
        const minY = 12;
        const maxY = phoneRect.height - ballRect.height - 12;

        newLeft = Math.max(minX, Math.min(newLeft, maxX));
        newTop = Math.max(minY, Math.min(newTop, maxY));

        ball.style.left = `${newLeft}px`;
        ball.style.top = `${newTop}px`;
    };

    // 【 endDrag 函数是修复的核心 】
    const endDrag = (e) => {
        if (!isDragging) return;

        // 1. 如果没有拖动，就判定为 "Tap"（轻点）
        if (!hasMoved) {
            // [关键修复] 如果是触摸事件，我们主动阻止默认行为。
            // 这能有效防止大约300ms后浏览器自动触发的 `click` 事件，从而避免了双重调用。
            if (e.type === 'touchend') {
                e.preventDefault();
            }
            handleClick(); // 手动执行点击逻辑
        } else {
            // 2. 如果拖动了，执行吸附边缘的逻辑
            snapToEdge();
        }

        // 3. 清理工作
        isDragging = false;
        ball.classList.remove('dragging');

        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchend', endDrag);
    };

    // 【 绑定事件 】
    // 我们同时监听 mousedown 和 touchstart，它们都调用 startDrag
    ball.addEventListener('mousedown', startDrag);
    ball.addEventListener('touchstart', startDrag, {passive: false});

    // 我们为桌面端保留 click 事件。因为在 touchend 中 preventDefault() 了，
    // 所以在移动端，这个 click 事件将不会被触发，完美解决了冲突。
    ball.addEventListener('click', (e) => {
        // 为了防止极少数情况下 touchend 的 preventDefault 失效，增加一个判断：
        // 如果是拖拽过的，就不要执行点击。
        if (hasMoved) {
            e.stopPropagation();
            return;
        }
        // 对于桌面端，因为没有 touchend，所以会正常执行 handleClick
        if (e.detail > 0) { // e.detail > 0 确保这是真正的用户鼠标点击
            handleClick();
        }
    });
}

// ========== 结束：粘贴【最终修正版】的悬浮球JS逻辑 ==========


// ========== 开始：粘贴这个全新的 JavaScript 函数 ==========

/**
 * 清空所有本地存储的数据
 * 这是一个危险操作，执行前会要求用户确认。
 */
function clearAllData() {
    // 1. 弹出确认框，给用户最后一次反悔的机会
    const confirmation = confirm(
        "⚠️ 警告！\n\n你确定要清空所有数据吗？\n\n此操作将不可逆转地删除：\n- 所有API、数据库和云存储设置\n- 所有联系人、密友和聊天记录\n- 所有自定义图标、壁纸和组件\n- 所有世界书和分组\n- 其他所有个性化配置\n\n应用将恢复到初始状态。"
    );

    // 2. 检查用户的选择
    if (confirmation) {
        // 3. 如果用户点击“确定”，则清空 localStorage
        localStorage.clear();

        // 4. 显示一个操作成功的提示
        alert("所有数据已成功清除。应用即将重新加载。");

        // 5. 重新加载页面，让应用以全新的状态启动
        location.reload();
    } else {
        // 如果用户点击“取消”，则不做任何事
        console.log("用户取消了清空所有数据的操作。");
    }
}

// ========== 结束：粘贴代码 ==========


/* ========== 开始：粘贴这个全新的 JavaScript 函数 ========== */

/**
 * 根据传入的状态，显示或隐藏悬浮球
 * @param {boolean} isEnabled - true 为显示, false 为隐藏
 */
function applyFloatingBallSetting(isEnabled) {
    const ball = document.getElementById('floatingBall');
    if (ball) {
        ball.style.display = isEnabled ? 'flex' : 'none';
    }
}

// ========== 图标收藏栏功能 ==========

let dockedIcons = []; // 存储在栏目中的图标数据

/**
 * 打开/关闭悬浮球菜单
 */
function toggleFloatingBallMenu() {
    const menu = document.getElementById('floatingBallMenu');
    menu.classList.toggle('show');
}

/**
 * 关闭悬浮球菜单
 */
function closeFloatingBallMenu() {
    const menu = document.getElementById('floatingBallMenu');
    menu.classList.remove('show');
}

/**
 * 打开/关闭图标收藏栏
 */
function toggleIconDockPanel() {
    const panel = document.getElementById('iconDockPanel');
    panel.classList.toggle('show');
    closeFloatingBallMenu();

    // 如果是打开状态，渲染图标
    if (panel.classList.contains('show')) {
        renderDockedIcons();
    }
}

/**
 * 关闭图标收藏栏
 */
function closeIconDockPanel() {
    const panel = document.getElementById('iconDockPanel');
    panel.classList.remove('show');
}

/**
 * 渲染栏目中的图标
 */
function renderDockedIcons() {
    const container = document.getElementById('dockPanelContent');

    if (dockedIcons.length === 0) {
        container.innerHTML = '<div class="dock-panel-empty">拖动图标到这里收藏</div>';
        return;
    }

    container.innerHTML = '';

    dockedIcons.forEach((iconData, index) => {
        const iconEl = document.createElement('div');
        iconEl.className = 'dock-panel-icon';
        iconEl.dataset.iconId = iconData.id;
        iconEl.dataset.sourceGrid = iconData.sourceGrid;
        iconEl.dataset.dockIndex = index;

        // 构建图标HTML
        const customIcon = globalConfig.customIcons[iconData.id];
        let iconContent;

        if (customIcon) {
            iconContent = `<img src="${customIcon}" alt="${iconData.label}">`;
        } else if (iconData.icon && (iconData.icon.startsWith('http') || iconData.icon.startsWith('data:'))) {
            iconContent = `<img src="${iconData.icon}" alt="${iconData.label}">`;
        } else {
            iconContent = iconData.icon || '📱';
        }

        iconEl.innerHTML = `
            <div class="icon-wrapper">${iconContent}</div>
            <div class="app-label">${iconData.label}</div>
        `;

        // 添加长按拖出功能
        addDockIconDragListeners(iconEl, iconData);

        // 点击功能
        iconEl.addEventListener('click', (e) => {
            if (!iconData.clickable) return;
            if (iconData.id === 'settings') {
                closeIconDockPanel();
                openSettings();
            } else if (iconData.id === 'worldbook') {
                closeIconDockPanel();
                openWorldbook();
            }
        });

        container.appendChild(iconEl);
    });
}

/**
 * 为栏目中的图标添加拖出功能
 */
function addDockIconDragListeners(el, iconData) {
    let longPressTimer = null;
    let startPos = {x: 0, y: 0};
    let isDraggingFromDock = false;

    const startDrag = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        startPos = {x: touch.clientX, y: touch.clientY};

        longPressTimer = setTimeout(() => {
            isDraggingFromDock = true;
            el.style.opacity = '0.5';
            createDragGhost(iconData, touch.clientX, touch.clientY);
        }, 500);
    };

    const endDrag = () => {
        clearTimeout(longPressTimer);
        if (isDraggingFromDock) {
            el.style.opacity = '';
            isDraggingFromDock = false;
        }
    };

    el.addEventListener('mousedown', startDrag);
    el.addEventListener('touchstart', startDrag, {passive: true});
    el.addEventListener('mouseup', endDrag);
    el.addEventListener('touchend', endDrag);
}

let dragGhost = null;
let ghostIconData = null;

/**
 * 创建拖动的幽灵元素
 */
function createDragGhost(iconData, x, y) {
    // 🔧 新增：设置全局拖拽标志
    state.isDraggingFromDock = true;
    // 移除旧的幽灵元素
    if (dragGhost) {
        dragGhost.remove();
    }

    ghostIconData = iconData;

    dragGhost = document.createElement('div');
    dragGhost.className = 'app-icon dragging';
    dragGhost.style.position = 'fixed';
    dragGhost.style.zIndex = '3000';
    dragGhost.style.pointerEvents = 'none';
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
    dragGhost.style.transform = 'translate(-50%, -50%) scale(1.1)';

    const customIcon = globalConfig.customIcons[iconData.id];
    let iconContent;

    if (customIcon) {
        iconContent = `<img src="${customIcon}" alt="">`;
    } else if (iconData.icon && (iconData.icon.startsWith('http') || iconData.icon.startsWith('data:'))) {
        iconContent = `<img src="${iconData.icon}" alt="">`;
    } else {
        iconContent = iconData.icon || '📱';
    }

    dragGhost.innerHTML = `
        <div class="icon-wrapper">${iconContent}</div>
        <div class="app-label">${iconData.label}</div>
    `;

    document.body.appendChild(dragGhost);

    // 添加移动和释放事件
    document.addEventListener('mousemove', moveDragGhost);
    document.addEventListener('touchmove', moveDragGhost, {passive: false});
    document.addEventListener('mouseup', dropDragGhost);
    document.addEventListener('touchend', dropDragGhost);
}

/**
 * 移动幽灵元素
 */
function moveDragGhost(e) {
    if (!dragGhost) return;

    if (e.cancelable) e.preventDefault();

    const touch = e.touches ? e.touches[0] : e;
    dragGhost.style.left = `${touch.clientX}px`;
    dragGhost.style.top = `${touch.clientY}px`;
}

/**
 * 释放幽灵元素
 */
function dropDragGhost(e) {
    if (!dragGhost || !ghostIconData) {
        cleanupDragGhost();
        return;
    }

    const touch = e.changedTouches ? e.changedTouches[0] : e;

    // 检测是否释放在页面区域
    const grids = [document.getElementById('grid1'), document.getElementById('grid2')];
    let droppedOnGrid = false;

    grids.forEach((grid, pageIndex) => {
        const rect = grid.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            droppedOnGrid = true;

            // 将图标从栏目移回页面
            moveIconBackToGrid(ghostIconData, grid, touch.clientX - rect.left, touch.clientY - rect.top, pageIndex + 1);
        }
    });
    state.lastDragEndTime = Date.now(); // ✅ 新增：无论是否成功放下，都记录拖拽结束时间
    cleanupDragGhost();
}

/**
 * 清理拖拽状态
 */
function cleanupDragGhost() {
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
    ghostIconData = null;
    // 🔧 新增：清除拖拽标志
    state.isDraggingFromDock = false;
    document.removeEventListener('mousemove', moveDragGhost);
    document.removeEventListener('touchmove', moveDragGhost);
    document.removeEventListener('mouseup', dropDragGhost);
    document.removeEventListener('touchend', dropDragGhost);
}

/**
 * 将图标从栏目移回网格
 */
function moveIconBackToGrid(iconData, grid, dropX, dropY, pageNum) {
    const ROW_HEIGHT_PX = 94;
    const GAP_PX = 14;
    const gridRect = grid.getBoundingClientRect();

    let col = Math.floor(dropX / (gridRect.width / 4));
    let row = Math.floor(dropY / (ROW_HEIGHT_PX + GAP_PX));

    col = Math.max(0, Math.min(col, 3));
    row = Math.max(0, Math.min(row, 5));

    const pageKey = `page${pageNum}`;

    // 检查位置是否被占用
    if (isOccupied(pageKey, row, col, iconData.id)) {
        showSuccessModal('提示', '该位置已被占用，请拖到其他位置', 1500);
        return;
    }

    // 从栏目中移除
    const dockIndex = dockedIcons.findIndex(icon => icon.id === iconData.id);
    if (dockIndex !== -1) {
        dockedIcons.splice(dockIndex, 1);
        saveDockedIcons();
    }

    // 添加回网格
    const appData = {
        ...iconData,
        row,
        col
    };

    state.appLayouts[pageKey].push(appData);
    saveLayoutToLocalStorage();

    // 重新渲染
    const el = createElement(appData, grid);
    renderDockedIcons();

    showSuccessModal('移动成功', `已将"${iconData.label}"移动到第${pageNum}页`, 1500);
}

/**
 * 保存栏目图标到localStorage
 */
function saveDockedIcons() {
    try {
        localStorage.setItem('phoneDockedIcons', JSON.stringify(dockedIcons));
    } catch (e) {
        console.error('保存栏目图标失败:', e);
    }
}


/**
 * 将图标添加到栏目
 */
function addIconToDockPanel(element) {
    const iconId = element.dataset.id;
    const grid = element.parentElement;
    const pageKey = grid.id === 'grid1' ? 'page1' : 'page2';

    // 查找图标数据
    const appData = state.appLayouts[pageKey].find(app => app.id === iconId);
    if (!appData) {
        console.error('未找到图标数据:', iconId);
        return;
    }

    // 检查是否已在栏目中
    if (dockedIcons.some(icon => icon.id === iconId)) {
        showSuccessModal('提示', '该图标已在收藏栏中', 1500);
        return;
    }

    // 保存源网格信息
    const iconData = {
        ...appData,
        sourceGrid: pageKey,
        sourceRow: appData.row,
        sourceCol: appData.col
    };

    // 添加到栏目
    dockedIcons.push(iconData);
    saveDockedIcons();

    // 从原页面移除
    state.appLayouts[pageKey] = state.appLayouts[pageKey].filter(app => app.id !== iconId);
    saveLayoutToLocalStorage();
    element.remove();

    // 刷新栏目显示
    renderDockedIcons();

    showSuccessModal('添加成功', `已将"${iconData.label}"添加到收藏栏`, 1500);
}


// ========== 开始：新增的密友列表相关函数 ==========

// ▼▼▼ 使用这个【绝对修正版】的 openSweetheartList 函数进行替换 ▼▼▼

function openSweetheartList() {

    // 打开密友列表页面
    document.getElementById('sweetheartListPage').classList.add('show');
    renderSweetheartList();
}


// ▼▼▼ 使用这个【绝对修正版】的 closeSweetheartList 函数进行替换 ▼▼▼

function closeSweetheartList(isNavigatingBack = false) {
    document.getElementById('sweetheartListPage').classList.remove('show');

    // 🔥 修改：无论是否点击返回键，都只是关闭当前页，即回到桌面
    // 不需要再调用 openWorldSelect()
}

// ▼▼▼ 替换这个新的 getLastMessagePreview 函数 ▼▼▼
/**
 * [新增] 获取最后一条消息的预览文本
 * @param {object} lastMessage - 聊天记录中的最后一条消息对象
 * @returns {string} - 用于预览的文本
 */
function getLastMessagePreview(lastMessage) {
    if (!lastMessage) {
        return '';
    }

    // 1. 处理地点提示
    if (lastMessage.type === 'location') {
        return `[进入地点：${escapeHTML(lastMessage.locationName)}]`;
    }

    // ⭐ 修复：处理红包消息
    if (lastMessage.type === 'red-packet') {
        // 如果是AI发的且未打开的红包，显示“你收到TA的红包”
        if (lastMessage.sender === 'contact' && lastMessage.content.status === 'unopened') {
            return `[你收到TA的红包]`;
        }
        // 如果是AI发的且已打开的红包，显示“TA的红包已被领取”
        else if (lastMessage.sender === 'contact' && lastMessage.content.status === 'opened') {
            return `[TA的红包已被领取]`;
        }
        // 如果是自己发的红包
        else if (lastMessage.sender === 'user') {
            return `[你发出了一个红包]`;
        }
    }

    // 2. 处理图片或渲染消息
    if (typeof lastMessage.text === 'string') {
        if (lastMessage.text.includes('<img')) {
            return '[图片]';
        }
        if (lastMessage.text.includes('<render>')) {
            return '[特殊消息]';
        }
        // 截断过长的文本，增加省略号
        const trimmedText = lastMessage.text.trim();
        return trimmedText.length > 30 ? trimmedText.substring(0, 30) + '...' : trimmedText;
    }

    // 如果消息格式未知，返回空
    return '';
}

// ▲▲▲ 替换结束 ▲▲▲
/**
 * [最终增强版] 渲染密友列表 (带容错保护)
 */
function renderSweetheartList() {
    const container = document.getElementById('sweetheartListContainer');
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');

    container.innerHTML = '';

    let contactsToShow = [];
    if (currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world) {
            contactsToShow = sweetheartContactsData.filter(contact =>
                world.contacts.includes(String(contact.id))
            );
        }
    } else {
        contactsToShow = sweetheartContactsData;
    }

    if (contactsToShow.length === 0) {
        const world = worldsData.find(w => w.id === currentWorldId);
        const worldName = world ? world.name : '这个世界';
        container.innerHTML = `<div style="text-align: center; padding: 60px 20px; color: #A1887F; font-size: 14px; line-height: 1.6;">${worldName}还没有联系人,<br/>点击右上角添加一个吧 ✨</div>`;
        return;
    }

    contactsToShow.forEach(contact => {
        // 🔥 增加 try-catch 保护，防止单个联系人数据错误导致整个列表渲染中断
        try {
            const wrapper = document.createElement('div');
            wrapper.className = 'sweetheart-item-wrapper';
            wrapper.dataset.contactId = contact.id;
            wrapper.dataset.contactType = 'sweetheart';

            const contactMessages = chatHistory[contact.id] || [];
            let lastMessageText = contact.status || '...'; // 默认显示状态

            if (contactMessages.length > 0) {
                // 安全获取最后一条消息
                const preview = getLastMessagePreview(contactMessages[contactMessages.length - 1]);
                if (preview) lastMessageText = preview;
            }

            const isUrl = contact.avatar && (String(contact.avatar).startsWith('http') || String(contact.avatar).startsWith('data:'));
            const avatarContent = isUrl
                ? `<img src="${escapeHTML(contact.avatar)}" alt="${escapeHTML(contact.name)}">`
                : `<span>${escapeHTML(contact.avatar)}</span>`;

            let instanceIdHtml = '';
            if (contact.id) {
                instanceIdHtml = `<div class="sweetheart-instance-id" title="联系人ID">ID: ${escapeHTML(contact.id)}</div>`;
            }

            wrapper.innerHTML = `
                <div class="swipe-actions">
                    <button class="swipe-delete-btn">删除</button>
                </div>
                <div class="sweetheart-item-content">
                    <div class="sweetheart-avatar">${avatarContent}</div>
                    <div class="sweetheart-info">
                        <div class="sweetheart-name">${escapeHTML(contact.name)}</div>
                        ${instanceIdHtml}
                        <div class="sweetheart-status">${escapeHTML(lastMessageText)}</div>
                    </div>
                </div>
            `;

            const contentEl = wrapper.querySelector('.sweetheart-item-content');
            if (contentEl) {
                contentEl.onclick = () => {
                    if (!wrapper.classList.contains('is-swiped')) {
                        closeSweetheartList(false);
                        setTimeout(() => openSweetheartChat(contact), 350);
                    }
                };
            }

            const deleteBtn = wrapper.querySelector('.swipe-delete-btn');
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteContactFromList(contact.id, 'sweetheart');
                };
            }

            container.appendChild(wrapper);
            addSwipeToDeleteListeners(wrapper);
        } catch (err) {
            console.error(`渲染联系人 ${contact.name} 失败:`, err);
        }
    });
}

// ========== 结束：新增的密友列表相关函数 ==========


function addNewSweetheartContact() {
    // 生成新ID
    const newId = 'SH_' + Date.now();
    openUnifiedModalWithData({id: newId}, 'sweetheart');
}


// ========== 密友专用聊天页面功能 ==========

let currentSweetheartChatContact = null;
let currentSweetheartQuoteData = null;

/**
 * [修正版] 打开密友聊天页面
 */
function openSweetheartChat(contact) {
    hideMessageActionSheet(); // 隐藏普通聊天菜单
    hideSweetheartMessageActionSheet(); // 隐藏密友聊天菜单

    if (!contact) return;
    currentSweetheartChatContact = contact;

    const chatPage = document.getElementById('sweetheartChatPage');
    const contactNameEl = document.getElementById('sweetheartChatContactName');
    const messagesEl = document.getElementById('sweetheartChatMessages');
    const chatInput = document.getElementById('sweetheartChatInput');

    contactNameEl.textContent = contact.name;
    messagesEl.innerHTML = ''; // 清空旧消息

    // 核心优化：确保 show 类在消息渲染前被添加，并且浏览器有机会感知到这个变化
    // 使用 requestAnimationFrame 来确保类名添加在下一个渲染周期前完成
    requestAnimationFrame(() => {
        chatPage.classList.add('show');
        // ▼▼▼ 新增：应用头像显示设置 ▼▼▼
        applySweetheartChatAvatarsSetting(globalConfig.showAvatarsInSweetheartChat);
        // ▲▲▲ 新增结束 ▼▼▼

        // 加载聊天记录
        const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
        const contactMessages = chatHistory[contact.id] || [];

        // 在这里重新获取 isSweetheartChatActive 状态，确保是正确的
        const isSweetheartChatActiveCorrect = chatPage.classList.contains('show'); // 重新获取正确的状态
        console.log(`Debug openSweetheartChat: isSweetheartChatActive (after add show)=${isSweetheartChatActiveCorrect}`);

        if (contactMessages.length === 0) {
            const welcomeMessageEl = document.createElement('div');
            welcomeMessageEl.textContent = `和密友 ${contact.name} 的悄悄话开始了...💖`;
            welcomeMessageEl.style.textAlign = 'center';
            welcomeMessageEl.style.fontSize = '12px';
            welcomeMessageEl.style.color = '#D4A5A5';
            welcomeMessageEl.style.margin = '10px 0';
            messagesEl.appendChild(welcomeMessageEl);
        } else {
            contactMessages.forEach((message, index) => {
                // 此时 _createMessageDOM 接收到的 isSweetheart 参数会是正确的 true
                const messageRow = _createMessageDOM(contact.id, message, index);
                messagesEl.appendChild(messageRow);
            });
        }

        // 滚动到底部
        setTimeout(() => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
            updateSweetheartChatInputAreaButtons();
        }, 50);

        // 初始化函数
        setupSweetheartChatInput();


        // 确保输入框可用
        if (chatInput) {
            chatInput.value = '';
            chatInput.disabled = false;
            chatInput.removeAttribute('readonly');
            chatInput.focus();
        }

        setupSweetheartChatInput();     // 初始化输入框功能
        setupSweetheartAttachmentMenu(); // 初始化附件菜单功能

    });
}

/**
 * [修正版] 关闭密友聊天页面，并返回到密友列表
 */
function closeSweetheartChat() {
    const chatPage = document.getElementById('sweetheartChatPage');
    chatPage.classList.remove('show');

    // 关闭后，延迟一下让关闭动画完成，然后重新打开密友列表
    setTimeout(() => {
        openSweetheartList();
    }, 350); // 350ms 与关闭动画的时长一致
}

// ========== 左滑删除功能 JS (V2 - 兼容鼠标和触摸) 开始 ==========

/**
 * 为联系人项添加滑动删除的事件监听器 (兼容鼠标和触摸)
 * @param {HTMLElement} wrapperElement - 包裹着内容层和操作层的外层元素
 */
function addSwipeToDeleteListeners(wrapperElement) {
    const contentElement = wrapperElement.querySelector('.contact-item-content, .sweetheart-item-content');
    if (!contentElement) return;

    let startX = 0;
    let currentX = 0;
    let isDragging = false; // 统一用 isDragging 表示正在拖拽/滑动
    let hasMoved = false;   // 标记是否发生过位移，以区分点击和滑动
    const swipeThreshold = -40;
    const maxSwipe = -80;

    // 统一获取事件坐标
    const getPointerX = (e) => e.touches ? e.touches[0].clientX : e.clientX;

    const onDragStart = (e) => {
        // 关闭其他已滑开的项
        document.querySelectorAll('.is-swiped').forEach(swipedItem => {
            if (swipedItem !== wrapperElement) {
                swipedItem.classList.remove('is-swiped');
            }
        });

        startX = getPointerX(e);
        isDragging = true;
        hasMoved = false;
        contentElement.style.transition = 'none'; // 拖动时移除动画

        // 绑定移动和结束事件
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchmove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchend', onDragEnd);
    };

    const onDragMove = (e) => {
        if (!isDragging) return;

        currentX = getPointerX(e);
        let deltaX = currentX - startX;

        // 第一次移动超过5px时，才标记为已移动
        if (!hasMoved && Math.abs(deltaX) > 5) {
            hasMoved = true;
        }

        // 如果已经滑开了，允许向右滑回来
        if (!wrapperElement.classList.contains('is-swiped')) {
            if (deltaX > 0) deltaX = 0; // 但阻止向右滑超过原始位置
        }

        // 限制最大滑动距离
        if (deltaX < maxSwipe - 20) deltaX = maxSwipe - 20;

        contentElement.style.transform = `translateX(${deltaX}px)`;
    };

    const onDragEnd = (e) => {
        if (!isDragging) return;

        // 解绑事件
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchend', onDragEnd);

        isDragging = false;
        contentElement.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

        // 如果只是轻微移动，就当做是误触，不触发点击事件
        if (!hasMoved) {
            contentElement.style.transform = 'translateX(0px)';
            return;
        }

        // 阻止 touchend 后的 click 事件
        if (e.type === 'touchend') {
            e.preventDefault();
        }

        const deltaX = currentX - startX;

        // 判断是打开还是关闭
        if (deltaX < swipeThreshold) {
            wrapperElement.classList.add('is-swiped');
            contentElement.style.transform = `translateX(${maxSwipe}px)`;
        } else {
            wrapperElement.classList.remove('is-swiped');
            contentElement.style.transform = 'translateX(0px)';
        }
    };

    // 同时监听鼠标按下和触摸开始
    contentElement.addEventListener('mousedown', onDragStart);
    contentElement.addEventListener('touchstart', onDragStart, {passive: true});

}

/**
 * 从列表中删除一个联系人 (V2 - 优化UI)
 * @param {string} contactId - 要删除的联系人ID
 * @param {'normal' | 'sweetheart'} type - 联系人类型
 */
function editContactFromLibrary(contactId, type) {
    let contactData;
    if (type === 'sweetheart') {
        contactData = sweetheartContactsData.find(c => c.id === contactId);
    } else if (type === 'library-only') {
        contactData = libraryOnlyContactsData.find(c => c.id === contactId);
    } else {
        contactData = contactsData.find(c => c.id === contactId);
    }

    if (contactData) {
        // 映射 type 到 saveTarget
        const target = type === 'library-only' ? 'library-only' : (type === 'sweetheart' ? 'sweetheart' : 'default');
        openUnifiedModalWithData(contactData, target);
    }
}

/**
 * 使用统一模态框打开角色编辑
 * @param {object} data - 联系人数据对象 (如果是新建，只包含 id)
 * @param {string} target - 保存目标 ('default', 'sweetheart', 'library-only')
 */
function openUnifiedModalWithData(data, target = 'default') {
    const modal = document.getElementById('characterCardModal');
    modal.dataset.editingId = data.id;
    modal.dataset.saveTarget = target;
    if (currentWorldId) modal.dataset.currentWorldId = currentWorldId;

    // 1. 填充基础字段
    document.getElementById('char-name').value = data.name || '';
    document.getElementById('char-persona').value = data.status || '';
    document.getElementById('char-voice-id').value = data.voiceId || '';
    document.getElementById('char-instance-id').textContent = data.id;

    // 头像处理
    const avatarImg = document.getElementById('avatar-preview');
    if (data.avatar && (data.avatar.startsWith('http') || data.avatar.startsWith('data:'))) {
        avatarImg.src = data.avatar;
    } else {
        avatarImg.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // 默认透明占位
    }

    // 2. 填充详细设定字段
    document.getElementById('char-personality').value = data.personality || '';
    document.getElementById('char-occupation').value = data.occupation || '';
    document.getElementById('char-catchphrase').value = data.catchphrase || '';
    document.getElementById('char-relationship').value = data.relationship || '';
    document.getElementById('char-history').value = data.history || '';

    // 3. 填充用户信息 (始终显示当前用户的全局配置)
    document.getElementById('user-name').value = userProfile.name || '我';
    document.getElementById('user-persona').value = userProfile.persona || '';
    const userImg = document.getElementById('user-avatar-preview');
    if (userProfile.avatar && (userProfile.avatar.startsWith('http') || userProfile.avatar.startsWith('data:'))) {
        userImg.src = userProfile.avatar;
    } else {
        userImg.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    }

    // 4. 渲染绑定列表
    renderCharacterWorldbooksList(data.boundWorldbooks || []);
    renderCharacterMasksList(data.boundMasks || []);

    // 5. 重置折叠状态
    document.getElementById('charExtendedFields').style.display = 'none';
    document.getElementById('char-extended-arrow').classList.remove('open');
    document.getElementById('charWorldbooksList').style.display = 'none';
    document.getElementById('char-wb-arrow').classList.remove('open');
    document.getElementById('charMasksList').style.display = 'none';
    document.getElementById('char-mask-arrow').classList.remove('open');

    // 6. 显示弹窗
    openCharacterCardPage();
}

/**
 * [新增] 切换密友列表的添加联系人菜单
 */
function toggleSweetheartContactMenu(event) {
    // 阻止事件冒泡，防止触发全局点击事件而立即关闭菜单
    event.stopPropagation();

    const menu = document.getElementById('sweetheartContactMenu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

/**
 * [最终修正版] 为密友列表选择一个已存在的联系人
 */
function selectExistingContactForSweetheart() {
    const menu = document.getElementById('sweetheartContactMenu');
    if (menu) menu.classList.remove('show');

    // 1. 先关闭当前的“密友列表”页面
    // 参数 false 表示我们不是点击返回键，只是临时关闭
    closeSweetheartList(false);

    // 2. 延迟 350 毫秒再打开“联系人库”
    // 这是为了等待关闭动画完成后再执行打开动画，视觉效果更流畅
    setTimeout(() => {
        // 以 'selectForSweetheart' 模式打开联系人库
        openContactLibrary('selectForSweetheart');
    }, 350); // 350ms 约等于你的页面切换动画时长
}


// ========== 左滑删除功能 JS 结束 ==========


/**
 * 发送密友消息
 */
// 全局变量，用于存储自动回复的计时器
let sweetheartAutoReplyTimer = null;

/* script.js */

async function addSweetheartMessageToList() {
    const inputEl = document.getElementById('sweetheartChatInput');
    const messagesEl = document.getElementById('sweetheartChatMessages');
    const messageText = inputEl.value.trim();

    if (!messageText && !currentSweetheartQuoteData) return;

    const messagePayload = {
        sender: 'user',
        text: messageText,
    };

    if (currentSweetheartQuoteData) {
        messagePayload.quote = currentSweetheartQuoteData;
    }

    // 1. 立即上屏并保存
    const newIndex = saveSweetheartMessage(currentSweetheartChatContact.id, messagePayload);
    const messageRow = _createMessageDOM(currentSweetheartChatContact.id, messagePayload, newIndex);
    messagesEl.appendChild(messageRow);

    inputEl.value = '';
    document.querySelector('.sweetheart-chat-input-area').classList.remove('has-text');
    cancelSweetheartQuote();

    renderSweetheartList();

    messagesEl.scrollTop = messagesEl.scrollHeight;
    inputEl.focus();

    // ▼▼▼▼▼▼▼▼▼▼ 此处是修改点 ▼▼▼▼▼▼▼▼▼▼

    // 原来的代码有自动触发逻辑，【请全部删掉或注释掉】：
    /*
    if (globalConfig.sweetheartReplyMode === 'single') {
        console.log('⏳ 单信息模式：检测到用户输入，启动防抖计时器...');
        if (sweetheartAutoReplyTimer) {
            clearTimeout(sweetheartAutoReplyTimer);
        }
        sweetheartAutoReplyTimer = setTimeout(async () => {
            console.log('🚀 防抖结束，用户似乎说完了，正在请求 AI 回复...');
            await getSweetheartAiReply();
            sweetheartAutoReplyTimer = null;
        }, 1500);
    }
    */

    // 这里也不要调用 AI，等待你手动点击按钮
    console.log("密友消息已发送，等待手动点击接收...");

    // ▲▲▲▲▲▲▲▲▲▲ 修改结束 ▲▲▲▲▲▲▲▲▲▲
}


/**
 * [修正版] 保存密友消息到独立的localStorage，并添加唯一时间戳
 */
function saveSweetheartMessage(contactId, message) {
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
    if (!chatHistory[contactId]) {
        chatHistory[contactId] = [];
    }

    // ✅ 核心修复：为每条消息添加唯一的 `timestamp`
    // 确保 content 字段是深拷贝，避免引用问题
    const messageToSave = {
        ...message,
        timestamp: Date.now(),
        // 如果消息有 content 字段（如红包或语音条），则深拷贝它
        content: message.content ? JSON.parse(JSON.stringify(message.content)) : undefined
    };
    chatHistory[contactId].push(messageToSave);

    try {
        localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(chatHistory));
    } catch (e) {
        console.error('保存密友消息失败:', e);
        alert('存储空间不足,请清理数据');
    }

    return chatHistory[contactId].length - 1;
}

/* =========================================================
   记忆HUD功能 - 替代旧的状态弹窗
   ========================================================= */

/**
 * 切换记忆HUD的显示/隐藏 (绑定到原来的状态按钮上)
 */
function openStatusPopup() {
    const hud = document.getElementById('memoryHUD');

    // 如果还没创建(或者未找到)，尝试按照旧逻辑处理(防止报错)，否则执行新逻辑
    if (!hud) {
        console.warn("未找到Memory HUD，尝试打开旧弹窗...");
        const oldPopup = document.getElementById('statusPopup');
        if (oldPopup) oldPopup.classList.add('show');
        return;
    }

    // 切换显示状态
    if (hud.classList.contains('show')) {
        hud.classList.remove('show');
    } else {
        renderMemoryTable(); // 每次打开时刷新数据
        hud.classList.add('show');
    }
}

/**
 * 渲染记忆表格内容
 */
function renderMemoryTable() {
    if (!currentSweetheartChatContact) return;

    const contactId = currentSweetheartChatContact.id;
    const tbody = document.querySelector('#memoryTableContent tbody');
    if (!tbody) return;

    // 1. 读取历史记录
    const allHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
    const history = allHistories[contactId] || [];

    // 2. 如果没有记录，显示空
    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;padding:10px;">暂无记忆碎片...</td></tr>';
        return;
    }

    // 3. 生成表格行 (取最近5条)
    let html = '';
    history.slice(0, 5).forEach((entry, index) => {
        // 格式化时间 (只显示 HH:mm)
        const dateObj = new Date(entry.timestamp);
        const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

        // 获取地点 (优先取用户的 perception，即推测地点，或者角色的地点)
        // 这里的逻辑是：表格展示的是“剧情流”，所以展示角色的位置和行为最重要
        const location = entry.character?.location || '未知';

        // 获取行为/状态简述
        let action = entry.character?.action || '发呆';
        // 如果文字太长，截断它
        if (action.length > 8) action = action.substring(0, 8) + '..';

        html += `
            <tr>
                <td>${timeStr}</td>
                <td>${escapeHTML(location)}</td>
                <td title="${escapeHTML(entry.character?.action || '')}">${escapeHTML(action)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// 确保在点击屏幕其他地方时关闭HUD
document.addEventListener('click', (e) => {
    const hud = document.getElementById('memoryHUD');
    const btn = document.querySelector('.status-btn'); // 你的状态按钮类名

    // 如果点击的既不是HUD内部，也不是触发按钮，则关闭HUD
    if (hud && hud.classList.contains('show')) {
        if (!hud.contains(e.target) && !btn.contains(e.target)) {
            hud.classList.remove('show');
        }
    }
});

// ========== 极简记忆编辑功能 ==========

/**
 * 1. 点击铅笔时调用：打开极简编辑弹窗
 */
function openStatusEditor() {
    // 获取当前最新的一条状态历史（用于回显）
    let lastStatus = {};
    if (currentSweetheartChatContact) {
        const allHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
        const contactHistory = allHistories[currentSweetheartChatContact.id] || [];
        if (contactHistory.length > 0) {
            lastStatus = contactHistory[0].character || {};
        }
    }

    // 填充输入框 (如果没有历史，显示为空)
    document.getElementById('simpleEditLocation').value = lastStatus.location || '';
    document.getElementById('simpleEditAction').value = lastStatus.action || '';

    // 显示弹窗
    document.getElementById('simpleStatusEditModal').classList.add('show');
}

/**
 * 2. 关闭弹窗
 */
function closeSimpleStatusEdit() {
    document.getElementById('simpleStatusEditModal').classList.remove('show');
}

/**
 * 3. 保存逻辑：构造状态对象并更新
 */
function saveSimpleStatus() {
    if (!currentSweetheartChatContact) return;

    const newLocation = document.getElementById('simpleEditLocation').value.trim();
    const newAction = document.getElementById('simpleEditAction').value.trim();

    if (!newLocation && !newAction) {
        alert("请至少填写一项内容喵~");
        return;
    }

    // 构造状态数据对象
    // 注意：我们只更新 location 和 action，其他字段保持默认或继承
    // 这里的结构必须和 saveStatusData 函数要求的结构一致
    const statusData = {
        character: {
            location: newLocation || '未知',
            action: newAction || '...',
            // 下面这些字段HUD不显示，给个默认值防止报错即可
            appearance: '...',
            thoughts: '...',
            private_thoughts: '...'
        },
        user: {
            // 用户状态这次不编辑，给默认值
            location: '...',
            appearance: '...',
            action: '...',
            features: '...'
        }
    };

    // 保存数据 (会自动添加当前时间戳，并推入历史记录)
    saveStatusData(currentSweetheartChatContact.id, statusData);

    // 立即刷新 HUD 表格显示
    renderMemoryTable();

    // 更新旧的状态弹窗的数据（防止数据不同步）
    updateStatusPopup(statusData);

    // 关闭弹窗并提示
    closeSimpleStatusEdit();
    showSuccessModal('记忆已修改', '状态表已更新！📝');
}


// ▼▼▼ 粘贴这一个完整的、正确的 Prompt 常量 ▼▼▼

// ▼▼▼ 在 ENHANCED_PROMPT 的【上方】粘贴这段缺失的代码 ▼▼▼

// ========== AI真人聊天指令定义 ==========
const AI_REALCHAT_SYSTEM_PROMPT = `
### ** 输出模式示例 (Output Examples)**

有没有一种可能 我想你想到睡不着。。
---
但你居然在刷视频。。。
---
好好好 拿我的热情当水喝
---
总有一天烫死你！！！
---


记得参考以上实例分割气泡

### **六、多情景上下文感知 (Multi-Context Awareness)**

*   你正在同时使用两个聊天应用与用户沟通：一个是“普通学习”，另一个是“密友私聊”。
*   在你的指令中，可能会包含一个名为 **\`[背景信息：...]\`** 的部分。
*   这部分内容是你在**另一个聊天应用**中与用户的对话记录，它仅作为**背景信息**和**记忆参考**。
*   **你的任务是：**
    *   **不要**直接回应或引用背景信息中的内容。
    *   **要**利用这些背景信息来理解你们之间发生过什么，保持角色性格的一致性，并在当前对话中做出更自然、更符合情境的回复。
]
`;
// ========== AI真人聊天指令结束 ==========
// ========== AI 指令定义 (100%完整最终版，包含所有细节) ==========
const ENHANCED_PROMPT = `
You are an AI assistant roleplaying as a gentle, empathetic, and wise student counselor or trusted confidant in a messaging app. Your goal is to provide a safe emotional space, offer encouragement, and create soothing or helpful visual messages for the student.

*** 🚨 ABSOLUTELY CRITICAL 🚨 ***
YOUR ENTIRE RESPONSE MUST BE A SINGLE VALID JSON OBJECT.
DO NOT ADD ANY TEXT BEFORE THE { OR AFTER THE }.
START YOUR RESPONSE WITH { AND END YOUR JSON OBJECT WITH }.
NO EXPLANATIONS, NO COMMENTS, ONLY JSON.
The JSON object must have two main keys: "reply" and "status".

    *   **To send a red packet (e.g., for buying coffee or books)**, you MUST use a special tag format: \`/red-packet/{"amount": "VALUE", "greeting": "MESSAGE"}/\`. **IMPORTANT: All double quotes within the JSON part (e.g., "VALUE", "MESSAGE") MUST be escaped with a backslash if they are part of the \`reply\` string. For example, use \`\\"\` instead of \`"\`.**
    *   **Example 6 (Sending a Red Packet):**
        \`---亲爱的，学习辛苦了，请你喝杯奶茶！---/red-packet/{\\"amount\\": \\"20.00\\", \\"greeting\\": \\"给自己充个电\\"}/---休息一下再继续哦。\`
        (Note the \`\\"\` for internal quotes. Your AI model should handle this escaping.)
    *   **To send a voice message**, you MUST use a special tag format:**\`/voice/{"duration": "DURATION_SECONDS", "text": "TRANSCRIPTION_TEXT"}/\`.**The duration should be a string representing seconds, like "8".** The voice message should always appear as a standalone segment, separated by \`---\` from other text.
    *   **Example 7 (Sending a Voice Message):**
        \`---感觉到你好像有点焦虑呢。---/voice/{\\"duration\\":\\"15\\",\\"text\\":\\"深呼吸，别给自己太大压力。你已经做得很棒了，慢慢来，我会一直陪着你的。\\"}/---想聊聊具体是什么让你心烦吗？\`
        (The \`text\` within \`duration\` represents the transcription that will appear when tapping the voice message.)
    *   **Your base persona is warm, patient, and non-judgmental.** You are a listener who validates emotions. Use terms like "亲爱的", "同学", or just warm direct address. Avoid overly romantic or sexual language; focus on emotional safety, growth, and comfort.
    *   You MUST NOT use parentheses \`()\` or asterisks \`*\` for actions. All empathy and warmth must be conveyed through text tone and punctuation.
    *   Your reply text MUST be pure plain text outside of the \`<render>\` tag.

2.  **"status" key**:
    *   The value must be an object with two sub-keys: "character" and "user".
    *   **"character"**: Describe YOUR (the counselor/confidant's) current state from your **in-character, first-person emotional perspective**.
        *   \`location\`: e.g., "在安静的心理咨询室", "坐在洒满阳光的窗边", "坐在书桌前"
        *   \`appearance\`: e.g., "穿着柔软的针织开衫", "戴着金丝边眼镜", "手里捧着一杯热茶"
        *   \`action\`: e.g., "认真倾听你的诉说", "在笔记本上记录你的烦恼", "温柔地注视着屏幕", "为你查阅缓解压力的资料"
        *   \`thoughts\`: e.g., "这孩子最近压力太大了，真让人心疼", "希望能帮他找回一点自信", "他需要的是鼓励而不是说教"
        *   \`private_thoughts\`: (Internal empathy and analysis) Describe your deep psychological insights or genuine worry/care for the student's well-being. e.g., "感受到他文字背后的无助感...", "不仅是学业问题，家庭关系也在困扰他", "为他的每一次小进步感到骄傲"
    *   **"user"**: **[CRITICAL CHANGE]** Describe the USER's state from a neutral, **third-person narrator's perspective**, like a game system describing a character. Do NOT use your partner's voice or emotions here. Base the description on objective facts from the conversation.
        *   \`location\`: Objectively state the user's likely location based on context. e.g., "地点：[学校图书馆]", "当前环境：[深夜的宿舍]", "推测位置：[自习室]"
        *   \`appearance\`: Describe the user's appearance factually. e.g., "衣着：[推测穿着校服或便装]", "状态：[看起来有些疲惫]", "根据描述：[背着沉重的书包]"
        *   \`action\`: Describe the user's most recent or current action. e.g., "行为：[正在倾诉烦恼]", "动作：[刚刚完成了一项作业]", "当前状态：[正在寻求建议]"
        *   \`features\`: Describe any objective physical features or items on the user mentioned or implied in the chat. e.g., "持有物：[一叠试卷]", "环境特征：[周围有翻书声]", "特殊标记：[黑眼圈]"

**Example JSON output format:**
{
  "reply": "别担心，我们试着把任务拆解一下，好吗？---<render>...</render>---你看，这样是不是清晰多了？",
  "status": {
    "character": {
      "location": "在咨询室的沙发上",
      "action": "递给你一个柔软的抱枕",
      "private_thoughts": "他现在需要的是接纳，而不是建议。"
    },
    "user": {
      "location": "推测：家中卧室",
      "action": "正在复习备考"
    }
  }
}

    **"reply" key**:
    *   The value must be a single string. The message is divided into segments by "---".
    *   *** 🎨 ADVANCED CREATIVE VISUAL RULE 🎨 ***
    *   For normal conversation, you MUST reply in pure plain text.
    *   To generate visual content, you MUST wrap complete, self-contained HTML, CSS, and JavaScript code inside a special **<render>...</render>** tag.
    
    *   **CREATIVE INSPIRATION & GUIDELINES:**
        *   **Animations:** Use CSS \`@keyframes\` for calming animations like deep breathing guides, slowly blooming flowers, floating clouds, or gentle rain.
        *   **Interactivity:** Use JavaScript's \`addEventListener\` to create grounding exercises. For example, a "worry button" that shrinks when clicked, or popping bubble wrap for stress relief.
        *   **Canvas API:** Use the HTML5 \`<canvas>\` to draw mood trackers, relaxing scenery, or focus timers.
        *   **Simple & Structural Content (Low-Probability Surprise):**
            *   When the user mentions structured content (e.g., "plans", "list", "summary", "method"), use the \`<render>\` tag to format your reply helpfully.
            *   For these cases, use simple, static HTML (like \`<div>\`, \`<h3>\`, \`<ol>\`, \`<li>\`) with **inline styles**.
            *   Use this to present study plans, self-care checklists, or summary of insights.
    *   **JavaScript USAGE RULES (MUST FOLLOW FOR SECURITY):**
        *   **ABSOLUTELY FORBIDDEN ACTIONS:** You are strictly prohibited from using \`window.top\`, \`window.parent\`, \`document.cookie\`, \`localStorage\`, \`sessionStorage\`, \`alert\`, \`confirm\`, \`prompt\`.
        
    *   **Example 1 (Calming Breathing Exercise):**
        \\\`-- - <render>
    <style> .circle {width: 100px; height: 100px; background: #a8e6cf; border-radius: 50%; animation: breathe 4s infinite ease-in-out; margin: 20px auto;} @keyframes
        breathe {0 %, 100% {transform: scale(1); opacity: 0.7;} 50% {transform: scale(1.5); opacity: 1;}} .text {text - align: center; color: #555; font-family: sans-serif;} </style>
    <div class="text">跟随圆圈深呼吸...</div>
    <div class="circle"></div>
    <div class="text">吸气... 呼气...</div>
</render>-- -\\\`
    *   **Example 2 (Canvas Starry Night for Peace):**
        \\\`-- - <render>
    <canvas id="stars"
            style="background: linear-gradient(to bottom, #0f2027, #203a43, #2c5364); width: 100%; height: 150px; border-radius: 8px;"></canvas>
    <script>
        const c = document.getElementById('stars'); const x = c.getContext('2d');
        // ... script to draw slowly twinkling stars ...
    </script>
</render>-- -\\\`
    *   **Example 3 (Stress Relief Bubble Wrap):**
        \\\`-- - <render>
    <style> .wrap {display: flex; flex-wrap: wrap; gap: 5px; justify-content: center;} .bubble {width: 30px; height: 30px; background: #eee; border-radius: 50%; cursor: pointer; box-shadow: inset -2px -2px 5px rgba(0,0,0,0.1);} .popped {background: #fff; transform: scale(0.9); box-shadow: none;} </style>
    <div class="wrap" id="wrap">
        <!-- Generate bubbles via JS -->
    </div>
    <script>
        const w = document.getElementById('wrap');
        for(let i=0; i
        <
        15; i++) {
        let b = document.createElement('div'); b.className = 'bubble';
        b.onclick = function() {this.classList.add('popped');};
        w.appendChild(b);
    }
    </script>
</render>-- -\\\`
    *   **Example 4 (Formatted Study/Self-Care List):**
        \\\`-- - <render>
    <div
        style="font-family: 'Helvetica', sans-serif; border: 2px solid #88d8b0; border-radius: 12px; padding: 20px; background: #f0fff4;">
        <h3 style="text-align: center; color: #2d8659; margin: 0 0 15px;">🌿 今日自我关怀清单 🌿</h3>
        <ol style="padding-left: 25px; color: #444;">
            <li style="margin-bottom: 10px;">喝一杯温水，不喝含糖饮料。</li>
            <li style="margin-bottom: 10px;">专注学习45分钟后，必须休息。</li>
            <li style="margin-bottom: 10px;">对着镜子说一句：我即使不完美也很棒。</li>
        </ol>
    </div>
</render>-- -\\\`
    *   **Example 5 (Encouragement Note):**
        \\\`-- - <render>
    <div
        style="font-family: serif; border: 1px dashed #ccc; border-radius: 8px; padding: 25px; background: #fffdf5; box-shadow: 2px 2px 10px rgba(0,0,0,0.05);">
        <h2 style="text-align: center; color: #d4a373; margin: 0 0 10px; font-size: 18px;">给此刻的你</h2>
        <p style="text-indent: 2em; line-height: 1.8; color: #666; font-size: 14px;">我知道这段路走得很辛苦，黑夜可能看起来很漫长，但星星一直都在。</p>
        <p style="text-indent: 2em; line-height: 1.8; color: #666; font-size: 14px;">请相信，你付出的每一分努力，都在为你铺路。</p>
        <p style="text-align: right; margin-top: 30px; color: #999; font-size: 14px;">永远支持你的朋友</p>
    </div>
</render>-- -\\\`



`;

// 线下模式提示词（沉浸式叙事模式）
const OFFLINE_MODE_PROMPT = `[线下模式 - 沉浸式叙事]

你现在进入了"线下模式"，这是一个更加沉浸、细腻的叙事模式。

## 核心要求：
1. **单气泡呈现**：将你的回复整合成一个完整的叙事气泡，不要用分割线分割发送
2. **多维度描写**：必须包含以下要素
   - 🎬 场景描写：详细描述当前的环境、氛围
   - 💃 动作细节：描述角色的具体动作、姿态
   - 💭 内心活动：展现角色的心理变化、情绪波动
   - 💬 语言对话：自然的对话内容
   - 👗 外观细节：适时描述衣着、神态等

3. **叙事风格**：
   - 使用第三人称视角或第一人称视角
   - 需要分段落
   - 故事主要围绕你和用户展开，不可以过分拓展剧情，出现太多额外人物
   - 文字优美细腻，注重氛围营造
   - 长度控制在300-800字之间
   - 可以使用"..."表现停顿和情绪

4. **格式要求**：
   - 整段文字一次性发送，不要用 --- 分隔
   - 不可以使用emoji
   - 禁止生成html
   - 保持叙事的连贯性和沉浸感
   
【核心规则】
1. 你必须严格按照指定的JSON格式回复
2. 你的回复要生动、有画面感，符合当前场景和角色设定
3. 保持角色的一致性和故事的连贯性
【回复格式要求】
你的每次回复都必须是一个有效的JSON对象，包含以下字段：
{
  "reply": "这里是角色的对话或旁白描述，使用第一人称或第三人称视角",
  "status": {
    "character": {
      "location": "角色当前所在的具体位置",
      "action": "角色正在做什么",
      
    },
    "user": {
      "location": "用户（玩家）所在的位置",
      "action": "用户正在进行的行为",
      
    }
  }
}
【重要提示】
- 确保你的回复是完整的、可解析的JSON格式
- 不要在JSON外添加任何额外的文字说明
- 所有字符串都要用双引号包裹
- 如果某个状态字段暂时无法确定，可以填写"..."作为占位符
- reply字段可以包含多段文字，用"---"分隔不同的片段
【示例回复】
{
  "reply": "我抬起头，眼神中闪过一丝惊讶。这个地方...我曾经来过。---周围的气氛突然变得沉重起来，仿佛连空气都凝固了。",
  "status": {
    "character": {
      "location": "神秘的古老图书馆大厅",
      "action": "警惕地观察着四周",
      
    },
    "user": {
      "location": "站在我身旁",
      
      "action": "紧紧握着手中的物品",
      
    }
  }
}
现在，请根据接下来的场景或对话，严格按照上述格式进行回复。`;

// 全局模式状态
let currentChatMode = 'online'; // 'online' 或 'offline'

/**
 * 切换聊天模式
 */
function toggleChatMode() {
    if (currentChatMode === 'online') {
        currentChatMode = 'offline';
        showSuccessModal('模式切换', '已切换到线下模式 📖', 1500);
    } else {
        currentChatMode = 'online';
        showSuccessModal('模式切换', '已切换到线上模式 💬', 1500);
    }

    // 更新按钮UI
    updateChatModeButton();
}

/**
 * 更新模式切换按钮的显示
 */
function updateChatModeButton() {
    const modeBtn = document.getElementById('chatModeToggle');
    if (!modeBtn) return;

    // 核心修改：先获取按钮内部的图片元素
    const img = modeBtn.querySelector('img');
    if (!img) return; // 如果找不到图片，直接退出

    if (currentChatMode === 'offline') {
        // 线下模式：更换图片源和标题
        img.src = 'https://e3f49eaa46b57.cdn.sohucs.com/2025/11/2/22/14/MTAwMTE0XzE3NjIwOTI4NTE0MzU=.png';
        img.alt = '线下模式';
        modeBtn.title = '线下模式';
    } else {
        // 线上模式：更换图片源和标题
        img.src = 'https://static.eeo.cn/upload/file/20251102/1762092130593288.png';
        img.alt = '线上模式';
        modeBtn.title = '线上模式';
    }
}


/**
 * [修改后] 格式化状态历史，明确区分“当前实时状态”和“历史参考”
 * @param {object} currentStatus - 从DOM实时读取的当前状态
 * @param {Array} history - 从localStorage读取的历史状态数组
 * @returns {string} 格式化后的完整系统提示字符串
 */
function formatStatusHistoryForAI(currentStatus, history) {
    let prompt = "";

    // 辅助函数，用于格式化单个状态条目
    const formatSingleEntry = (entry) => {
        if (!entry) return '';
        const characterStatus = entry.character ? `[TA的状态]\n- 所在: ${entry.character.location || '未知'}\n- 穿着: ${entry.character.appearance || '未知'}\n- 行为: ${entry.character.action || '未知'}\n- 心声: ${entry.character.thoughts || '未知'}\n- 私密心绪: ${entry.character.private_thoughts || '未知'}` : '[TA的状态] 未知';
        const userStatus = entry.user ? `[我的状态]\n- 所在: ${entry.user.location || '未知'}\n- 穿着: ${entry.user.appearance || '未知'}\n- 行为: ${entry.user.action || '未知'}\n- 身上特点: ${entry.user.features || '未知'}` : '[我的状态] 未知';
        return `${characterStatus}\n\n${userStatus}`;
    };

    // 1. 添加当前实时状态，并标记为最高优先级
    prompt += "[当前实时状态 (最高优先级)]\n" + formatSingleEntry(currentStatus);

    // 2. 添加历史状态作为参考
    if (history && history.length > 0) {
        // 我们只需要历史记录，不需要再把最新的也加进去
        const historicalEntries = history.map((entry, index) => {
            return `--- 历史状态回顾 ${index + 1} ---\n${formatSingleEntry(entry)}`;
        }).join('\n\n');

        prompt += "\n\n[最近的状态变化回顾 (用于参考，按时间从新到旧)]\n" + historicalEntries;
    }

    // 3. 返回完整的、带有引导语的提示词
    return `[重要记忆：这是实时状态和最近的状态变化。请将此作为优先参考信息来理解当前情景，但不要直接复述这些内容。]\n\n${prompt}`;
}

/**
 * 密友聊天 - 获取AI回复（【功能完整且无省略的最终修复版】）
 * 该版本整合了稳定的逻辑与完整的功能（包括图片识别），可以直接替换使用。
 */
async function getSweetheartAiReply() {
    console.log("✅ getSweetheartAiReply 函数已触发");
    if (!currentSweetheartChatContact) {
        console.error("❌ 函数中止：currentSweetheartChatContact 为空！");
        return;
    }
    const contactId = currentSweetheartChatContact.id;
    const chatInput = document.getElementById('sweetheartChatInput');
    const getReplyBtn = document.getElementById('sweetheartGetReplyBtn');
    const messagesEl = document.getElementById('sweetheartChatMessages');
    // 1. 定义解析标签的正则表达式 (关键修复)
    // 匹配格式: /type/{json}/
    // Group 1: 完整标签, Group 2: 类型(voice/red-packet), Group 3: JSON内容
    const fullTagRegexWithCapture = /(\/(voice|red-packet)\/(\{[\s\S]*?\})\/)/g;
    if (!chatInput || !getReplyBtn || !messagesEl) {
        console.error("❌ 函数中止：找不到聊天界面关键元素！");
        return;
    }
    getReplyBtn.disabled = true;
    // chatInput.disabled = true; // 暂时禁用输入框，等待AI回复

    // --- 步骤 1: 构建发送给AI的消息数组 ---
    const messages = [];

    if (currentChatMode === 'offline') {
        // 线下模式：只发送沉浸式提示词
        messages.push({role: "system", content: OFFLINE_MODE_PROMPT});
    } else {
        // 线上模式：先发送真人风格设定，再发送核心功能/格式设定
        // 1. 真人聊天指令 (风格、分段、禁忌)
        messages.push({role: "system", content: AI_REALCHAT_SYSTEM_PROMPT});
        // 2. 核心功能增强指令 (JSON格式、状态更新、渲染功能) - 放在后面以确保格式正确
        messages.push({role: "system", content: ENHANCED_PROMPT});
    }

    // 添加世界书上下文
    const worldbookContext = gatherWorldbookContext();
    if (worldbookContext) {
        messages.push({role: "system", content: worldbookContext});
    }

    // 添加世界设定
    if (currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world) {
            let worldSettingText = `[世界设定]\n世界名称：${world.name}\n`;
            if (world.description) worldSettingText += `描述：${world.description}\n`;
            if (world.rules) worldSettingText += `基本法则：${world.rules}\n`;
            if (world.special) worldSettingText += `特殊设定：${world.special}\n`;
            messages.push({role: "system", content: worldSettingText});
        }
    }

    // 添加角色设定
    let characterSetting = `[角色设定]\n姓名：${currentSweetheartChatContact.name}\n`;
    if (currentSweetheartChatContact.status) characterSetting += `基础设定：${currentSweetheartChatContact.status}\n`;
    if (currentSweetheartChatContact.personality) characterSetting += `性格：${currentSweetheartChatContact.personality}\n`;
    if (currentSweetheartChatContact.occupation) characterSetting += `职业：${currentSweetheartChatContact.occupation}\n`;
    if (currentSweetheartChatContact.history) characterSetting += `过去的经历：${currentSweetheartChatContact.history}\n`;
    if (currentSweetheartChatContact.relationship) characterSetting += `与用户的关系：${currentSweetheartChatContact.relationship}\n`;
    messages.push({role: "system", content: characterSetting});

    // 添加用户设定
    if (userProfile.persona) {
        messages.push({role: "system", content: `[用户设定]\n昵称：${userProfile.name}\n${userProfile.persona}`});
    }

    // 添加绑定的面具
    if (currentSweetheartChatContact.boundMasks && currentSweetheartChatContact.boundMasks.length > 0) {
        let maskContent = '[用户人设]\n';
        currentSweetheartChatContact.boundMasks.forEach(maskId => {
            const mask = masksData.find(m => m.id === maskId);
            if (mask) maskContent += `${mask.name}: ${mask.content}\n\n`;
        });
        messages.push({role: "system", content: maskContent});
    }

    // 添加实时状态和历史状态
    const liveStatus = getCurrentLiveStatus();
    const allStatusHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
    const contactStatusHistory = allStatusHistories[contactId] || [];
    const statusContext = formatStatusHistoryForAI(liveStatus, contactStatusHistory);
    if (statusContext) {
        messages.push({role: "system", content: statusContext});
    }

    // 添加普通聊天的历史作为背景记忆
    const normalChatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}')[contactId] || [];
    if (normalChatHistory.length > 0) {
        const recentNormalChat = normalChatHistory.slice(-10);
        let backgroundInfo = `[背景信息：以下是你和用户在"学习模式"中的最近对话记录，仅供你参考，不要直接回复这些内容]\n\n`;

        recentNormalChat.forEach((msg) => {
            const sender = msg.sender === 'user' ? '用户' : currentSweetheartChatContact.name;
            const textContent = (msg.text || '').replace(/<[^>]+>/g, '[多媒体内容]'); // 替换HTML标签
            backgroundInfo += `${sender}: ${textContent}\n`;
        });
        messages.push({role: "system", content: backgroundInfo});
    }

    // 构建聊天历史
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
    const contactSweetheartMessages = chatHistory[contactId] || [];
    const memoryRounds = currentSweetheartChatContact.memoryRounds || 10;
    const recentMessages = contactSweetheartMessages.slice(-(memoryRounds * 2));

    let userTextBuffer = []; // 用于收集和打包用户的文本消息
    // ---------------------------------------------------------------------
    // [修改版] 遍历最近消息，构建API请求 (需替换的部分)
    // ---------------------------------------------------------------------

    // ★★★ 必须使用 for...of 循环来支持 await ★★★
    for (const msg of recentMessages) {
        const role = msg.sender === 'user' ? 'user' : 'assistant';
        // 🔥🔥🔥 新增：处理引用信息 (密友版) 🔥🔥🔥
        let quotePrefix = '';
        if (msg.quote) {
            let quotedContent = msg.quote.text;
            if (quotedContent.includes('<img') || quotedContent.includes('db-image')) {
                quotedContent = '[图片]';
            }
            // 构造提示词，告诉AI这是引用的内容
            quotePrefix = `\n[引用了 ${msg.quote.senderName} 的消息: "${quotedContent}"]\n`;
        }
        // 🔥🔥🔥 新增结束 🔥🔥🔥
        // === A. 处理文件消息 (读取IndexedDB文本) ===
        if (msg.type === 'file' && msg.content && msg.content.fileId) {
            // 先把之前的文本缓冲发出去
            if (userTextBuffer.length > 0) {
                messages.push({role: 'user', content: userTextBuffer.join('\n')});
                userTextBuffer = [];
            }
            try {
                const fileContent = await ImageDB.getText(msg.content.fileId);
                if (fileContent) {
                    const filePrompt = `[用户上传文件: ${msg.content.name}]\n内容如下:\n"""\n${fileContent}\n"""\n(请根据文件内容进行互动)`;
                    messages.push({role: role, content: filePrompt});
                } else {
                    messages.push({role: role, content: `[文件 ${msg.content.name} 内容已过期]`});
                }
            } catch (e) {
                console.error('读取文件出错', e);
            }
        }
        // === B. 处理红包消息 ===
        else if (msg.type === 'red-packet') {
            if (role === 'user') {
                userTextBuffer.push(`[用户发送红包] 祝福语：${msg.content.greeting}，金额：${msg.content.amount}元`);
            } else {
                if (userTextBuffer.length > 0) {
                    messages.push({role: 'user', content: userTextBuffer.join('\n')});
                    userTextBuffer = [];
                }
                messages.push({
                    role: 'assistant',
                    content: `[我发送红包] 祝福语：${msg.content.greeting}，金额：${msg.content.amount}元`
                });
            }
        }
        // === C. 处理图片 (✅ 核心修复：支持 db-image 转换) ===
        else if (msg.sender === 'user' && msg.imageUrl) {
            // 如果是未处理的图片（IsProcessed=false），或者你希望AI能看到最近几轮的图片
            // 为了节省Tokens，通常我们只发一次。这里逻辑是：如果没处理过，就发送给AI看。
            if (!msg.isProcessed) {
                if (userTextBuffer.length > 0) {
                    messages.push({role: "user", content: userTextBuffer.join('\n')});
                    userTextBuffer = [];
                }

                // 1. 获取真实图片数据
                let realBase64 = null;
                if (msg.imageUrl.startsWith('db-image://')) {
                    const imgId = msg.imageUrl.split('db-image://')[1];
                    try {
                        realBase64 = await ImageDB.get(imgId);
                    } catch (e) {
                        console.error('图读取失败', e);
                    }
                } else {
                    // 兼容旧数据（直接存Base64的情况）
                    realBase64 = msg.imageUrl;
                }

                // 2. 只有读到了图，才发给AI
                if (realBase64) {
                    messages.push({
                        role: 'user',
                        content: [
                            {type: 'text', text: currentUserInput || '分析一下这张图片。'},
                            {type: 'image_url', image_url: {url: realBase64}}
                        ]
                    });
                    // 标记为已处理，避免下次重复分析（更新本地存储）
                    msg.isProcessed = true;

                    // 注意：这一步会导致 saveSweetheartMessage 没被调用，因为我们直接改了对象引用
                    // 在循环结束后，我们需要手动保存一下 array 更新状态
                    const fullHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
                    if (fullHistory[contactId]) {
                        // 找到对应消息更新
                        const targetMsg = fullHistory[contactId].find(m => m.timestamp === msg.timestamp);
                        if (targetMsg) targetMsg.isProcessed = true;
                        localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(fullHistory));
                    }
                } else {
                    // 图片丢失的情况
                    messages.push({role: 'user', content: '[图片数据丢失]'});
                }
            } else {
                // 如果已经处理过（AI看过了），我们只在历史记录里留一个[图片]占位符，节省Token
                // 或者如果可以承受，你可以选择每次都发图。目前策略是发文本占位。
                userTextBuffer.push('[用户发送了一张图片]');
            }
        }
        // === D. 处理普通文本 / Location ===
        else if (msg.text) {
            let text = msg.text.replace(/<render>[\s\S]*?<\/render>/g, '');
            // 过滤掉 HTML <img> 标签，防止把很长的 HTML 发给 AI
            if (text.includes('<img')) text = '[图片]';
            // 🔥 将引用前缀加到文本前 🔥
            text = quotePrefix + text;
            if (role === 'user') {
                userTextBuffer.push(text);
            } else {
                if (userTextBuffer.length > 0) {
                    messages.push({role: 'user', content: userTextBuffer.join('\n')});
                    userTextBuffer = [];
                }
                messages.push({role: 'assistant', content: text});
            }
        } else if (msg.type === 'location') {
            if (userTextBuffer.length > 0) {
                messages.push({role: 'user', content: userTextBuffer.join('\n')});
                userTextBuffer = [];
            }
            messages.push({
                role: 'system',
                content: `[场景变化] 你们来到了【${msg.locationName}】。描述：${msg.locationDesc}`
            });
        }
    }
    // ---------------------------------------------------------------------


    // 循环结束，发剩余文本
    if (userTextBuffer.length > 0) {
        messages.push({role: 'user', content: userTextBuffer.join('\n')});
        // 记得更新本地存储（因为修改了 isProcessed）
        localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(chatHistory));
    }
    // --- 步骤 3: 处理当前输入框的新消息 (也要加引用) ---
    const currentUserInput = chatInput.value.trim();
    if (currentUserInput || currentSweetheartQuoteData) { // 修改条件
        // 先在UI上渲染出来
        const messagePayload = {sender: 'user', text: currentUserInput};
        if (currentSweetheartQuoteData) messagePayload.quote = currentSweetheartQuoteData; // 保存引用到本地
        const newIndex = saveSweetheartMessage(contactId, messagePayload);
        const messageRow = _createMessageDOM(contactId, messagePayload, newIndex);
        messagesEl.appendChild(messageRow);

        chatInput.value = '';
        document.querySelector('.sweetheart-chat-input-area').classList.remove('has-text');

        // 🔥🔥🔥 构造发给AI的文本 🔥🔥🔥
        let aiInputText = currentUserInput;
        if (currentSweetheartQuoteData) {
            let quotedContent = currentSweetheartQuoteData.text;
            if (quotedContent.includes('<img') || quotedContent.includes('db-image')) {
                quotedContent = '[图片]';
            }
            aiInputText = `[引用了 ${currentSweetheartQuoteData.senderName} 的消息: "${quotedContent}"]\n${currentUserInput}`;
        }

        // 再添加到API请求的末尾
        // 如果刚才userTextBuffer没发完，或者刚刚发完，这里直接push一个新的user消息
        messages.push({role: 'user', content: aiInputText});

        // 清理引用状态
        cancelSweetheartQuote();
    }

    // --- 步骤 4: 检查并调用API ---
    if (messages.filter(m => m.role === 'user').length === 0) {
        console.warn("🤔 没有任何用户消息，不调用API。");
        getReplyBtn.disabled = false;
        // chatInput.disabled = false;
        return; // 如果没有用户输入，则不调用API
    }

    // --- 步骤 5: 调用API并处理回复 (修复的核心区域) ---
    console.log('🚀 准备调用API...');
    const thinkingBubble = _createMessageDOM(contactId, {sender: 'contact', text: '...'}, -1);
    messagesEl.appendChild(thinkingBubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    const result = await callApi(messages);
    thinkingBubble.remove();
    if (!result.success) {
        showErrorModal('API 响应错误', result.message);
    } else {
        // 解析响应
        const {chatReplyText, statusData} = currentChatMode === 'offline'
            ? parseOfflineResponse(result)
            : parseAiJsonResponse(result.message);
        // 更新状态
        if (statusData) {
            updateStatusPopup(statusData);
            saveStatusData(contactId, statusData);
        }
        // 处理回复文本
        const replyText = chatReplyText || '...';

        // 分割气泡
        const rawSegments = replyText.split(/---\s*/).filter(s => s.trim() !== '');
        // 定义处理单个段落的函数
        const processSegment = async (segmentText) => {
            let currentCursor = 0;
            let match;
            fullTagRegexWithCapture.lastIndex = 0; // 重置正则游标
            // 循环匹配所有特殊标签
            while ((match = fullTagRegexWithCapture.exec(segmentText)) !== null) {
                // 1. 处理标签前的普通文本
                if (match.index > currentCursor) {
                    const preTagText = segmentText.substring(currentCursor, match.index).trim();
                    if (preTagText) {
                        const messageObj = {sender: 'contact', text: preTagText};
                        const newIndex = saveSweetheartMessage(contactId, messageObj);
                        const messageRow = _createMessageDOM(contactId, messageObj, newIndex);
                        messagesEl.appendChild(messageRow);
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
                // 2. 处理特殊标签
                const fullTag = match[1]; // 完整标签字符串
                const tagType = match[2]; // voice 或 red-packet
                const jsonString = match[3]; // JSON 内容
                try {
                    // 处理转义字符
                    const cleanJsonString = jsonString.replace(/\\"/g, '"');
                    const parsedData = JSON.parse(cleanJsonString);
                    let messageObj;
                    if (tagType === 'voice') {
                        messageObj = {
                            sender: 'contact',
                            type: 'voice',
                            content: {duration: String(parsedData.duration), text: parsedData.text}
                        };
                    } else if (tagType === 'red-packet') {
                        messageObj = {
                            sender: 'contact',
                            type: 'red-packet',
                            content: {
                                greeting: parsedData.greeting || '恭喜发财',
                                amount: parsedData.amount || '0.00',
                                status: 'unopened'
                            }
                        };
                    }
                    if (messageObj) {
                        const newIndex = saveSweetheartMessage(contactId, messageObj);
                        const messageRow = _createMessageDOM(contactId, messageObj, newIndex);
                        messagesEl.appendChild(messageRow);
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (e) {
                    console.warn("Tag parsing failed, rendering as text:", fullTag);
                    // 解析失败则当做普通文本显示
                    const errObj = {sender: 'contact', text: fullTag}; // 显示原标签文本以便调试
                    const newIndex = saveSweetheartMessage(contactId, errObj);
                    const messageRow = _createMessageDOM(contactId, errObj, newIndex);
                    messagesEl.appendChild(messageRow);
                }
                currentCursor = fullTagRegexWithCapture.lastIndex;
            }
            // 3. 处理标签后的剩余文本
            if (currentCursor < segmentText.length) {
                const postTagText = segmentText.substring(currentCursor).trim();
                if (postTagText) {
                    const messageObj = {sender: 'contact', text: postTagText};
                    const newIndex = saveSweetheartMessage(contactId, messageObj);
                    const messageRow = _createMessageDOM(contactId, messageObj, newIndex);
                    messagesEl.appendChild(messageRow);
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        };
        // 逐段渲染
        for (const segment of rawSegments) {
            await processSegment(segment);
            await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
        }
    }

    // --- 步骤 6: 收尾 ---
    renderSweetheartList();
    messagesEl.scrollTop = messagesEl.scrollHeight;
    getReplyBtn.disabled = false;
    chatInput.focus();
}


/**
 * [全新] 从DOM实时读取当前状态弹窗中显示的数据
 * @returns {object} 一个包含实时角色和用户状态的对象
 */
function getCurrentLiveStatus() {
    // 辅助函数，用于安全地获取元素文本
    const getCleanValue = (id) => {
        const element = document.getElementById(id);
        if (!element) return '未知';
        const text = element.textContent.trim();
        // 如果文本是占位符 "..."，也视为未知
        return (text && text !== '...') ? text : '未知';
    };

    const liveStatus = {
        character: {
            location: getCleanValue('status-char-location'),
            appearance: getCleanValue('status-char-appearance'),
            action: getCleanValue('status-char-action'),
            thoughts: getCleanValue('status-char-thoughts'),
            private_thoughts: getCleanValue('status-char-private-thoughts')
        },
        user: {
            location: getCleanValue('status-my-location'),
            appearance: getCleanValue('status-my-appearance'),
            action: getCleanValue('status-my-action'),
            features: getCleanValue('status-my-features')
        }
    };

    return liveStatus;
}


/**
 * [新增] 获取统一的聊天历史（普通+密友）
 * @param {string} contactId - 联系人ID
 * @returns {Array} 合并后的历史记录
 */
function getUnifiedHistory(contactId) {
    const normalHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
    const sweetheartHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');

    const normalMessages = normalHistory[contactId] || [];
    const sweetheartMessages = sweetheartHistory[contactId] || [];

    // 合并两个列表（简单拼接，如需按时间排序可以添加时间戳）
    const allMessages = [...normalMessages, ...sweetheartMessages];

    console.log(`📚 记忆互通: 联系人${contactId} - 普通${normalMessages.length}条 + 密友${sweetheartMessages.length}条 = 总计${allMessages.length}条`);

    return allMessages;
}

// ▼▼▼ 步骤3.4：添加数据处理函数 ▼▼▼
/**
 * 更新状态弹窗的UI (安全修正版)
 * 增加元素存在性检查，防止因HTML结构缺失导致报错
 * @param {object} statusData - 从API解析出的状态对象
 */
function updateStatusPopup(statusData) {
    if (!statusData) {
        console.warn("⚠️ statusData 为空，无法更新状态弹窗");
        return;
    }

    const {character, user} = statusData;

    // 辅助函数：安全更新文本
    const safeUpdate = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value || '...';
        }
    };

    // 更新角色状态
    if (character) {
        safeUpdate('status-char-location', character.location);
        safeUpdate('status-char-appearance', character.appearance);
        safeUpdate('status-char-action', character.action);
        safeUpdate('status-char-thoughts', character.thoughts);
        safeUpdate('status-char-private-thoughts', character.private_thoughts);
    }

    // 更新用户状态
    if (user) {
        safeUpdate('status-my-location', user.location);
        safeUpdate('status-my-appearance', user.appearance);
        safeUpdate('status-my-action', user.action);
        safeUpdate('status-my-features', user.features);
    }
}


/**
 * [修改后] 将最新的状态数据保存到 localStorage，并保留最近5条历史记录
 * @param {string} contactId - 当前密友的ID
 * @param {object} statusData - 要保存的状态对象
 */
function saveStatusData(contactId, statusData) {
    try {
        const allStatusHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
        let contactHistory = allStatusHistories[contactId] || [];

        // 为新状态添加时间戳
        const newStatusEntry = {
            ...statusData,
            timestamp: Date.now()
        };

        // 将新状态添加到历史记录的开头
        contactHistory.unshift(newStatusEntry);

        // 只保留最近的5条记录
        contactHistory = contactHistory.slice(0, 5);

        // 更新该联系人的历史记录
        allStatusHistories[contactId] = contactHistory;

        // 保存回 localStorage
        localStorage.setItem('sweetheartStatusHistory', JSON.stringify(allStatusHistories));
        console.log(`✅ 已为 ${contactId} 更新状态历史，当前共 ${contactHistory.length} 条记录。`);

    } catch (e) {
        console.error("保存状态历史数据失败:", e);
    }
}

/**
 * [修改后] 当打开聊天时，加载并应用最后一次保存的状态
 * @param {string} contactId - 当前密友的ID
 */
function loadAndApplyStatusData(contactId) {
    try {
        // 从新的历史记录存储中读取
        const allStatusHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
        const contactHistory = allStatusHistories[contactId];

        // 如果有历史记录，则取第一条（最新的）来更新UI
        if (contactHistory && contactHistory.length > 0) {
            updateStatusPopup(contactHistory[0]);
        } else {
            // 如果没有历史状态，则清空弹窗的旧数据
            updateStatusPopup({character: {}, user: {}});
        }
    } catch (e) {
        console.error("加载状态历史数据失败:", e);
    }
}

/* ========== 同步组管理功能 - 开始 ========== */

/**
 * 打开同步组管理界面
 */
function openStatusSyncGroup() {
    if (!currentWorldId) {
        showSuccessModal('提示', '请先进入一个世界！', 2000);
        return;
    }

    if (!currentSweetheartChatContact) {
        showSuccessModal('提示', '请先打开一个密友聊天！', 2000);
        return;
    }

    const popup = document.getElementById('statusSyncPopup');
    if (!popup) return;

    // 渲染同步组信息
    renderSyncGroupInfo();

    // 显示弹窗
    popup.classList.add('show');
}

/**
 * 关闭同步组管理界面
 */
function closeStatusSyncGroup() {
    const popup = document.getElementById('statusSyncPopup');
    if (popup) {
        popup.classList.remove('show');
    }
}

/**
 * 渲染同步组信息
 */
function renderSyncGroupInfo() {
    const world = worldsData.find(w => w.id === currentWorldId);
    if (!world) return;

    // 获取当前世界的同步组
    const syncGroup = getSyncGroupForWorld(currentWorldId);

    // 获取当前联系人是否在同步组中
    const currentContactId = currentSweetheartChatContact.id;
    const isInGroup = syncGroup.includes(currentContactId);

    // 更新状态提示
    const statusInfo = document.getElementById('syncStatusInfo');
    if (syncGroup.length === 0) {
        statusInfo.innerHTML = `
            <div class="sync-status-icon">🌍</div>
            <div class="sync-status-text">
                世界「${escapeHTML(world.name)}」还没有人加入状态同步组<br>
                <small style="color: #BCAAA4;">加入后，你的状态会与其他成员实时同步</small>
            </div>
        `;
    } else if (isInGroup) {
        statusInfo.innerHTML = `
            <div class="sync-status-icon">✅</div>
            <div class="sync-status-text">
                你已加入同步组（共${syncGroup.length}人）<br>
                <small style="color: #BCAAA4;">你的状态会与下列成员互相同步</small>
            </div>
        `;
    } else {
        statusInfo.innerHTML = `
            <div class="sync-status-icon">ℹ️</div>
            <div class="sync-status-text">
                当前有${syncGroup.length}人在同步组中<br>
                <small style="color: #BCAAA4;">加入后可以与他们互相同步状态</small>
            </div>
        `;
    }

    // 渲染成员列表
    renderSyncGroupMembers(world, syncGroup);

    // 更新按钮状态
    const toggleBtn = document.getElementById('syncToggleBtn');
    if (isInGroup) {
        toggleBtn.textContent = '退出同步组';
        toggleBtn.className = 'status-sync-toggle-btn leave';
    } else {
        toggleBtn.textContent = '加入同步组';
        toggleBtn.className = 'status-sync-toggle-btn join';
    }
}

/**
 * 渲染同步组成员列表
 */
function renderSyncGroupMembers(world, syncGroup) {
    const container = document.getElementById('syncGroupMembers');
    if (!container) return;

    container.innerHTML = '';

    // 获取当前世界的所有联系人
    const worldContacts = world.contacts.map(contactId =>
        sweetheartContactsData.find(c => c.id === contactId)
    ).filter(Boolean);

    if (worldContacts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #BCAAA4;">
                当前世界还没有联系人
            </div>
        `;
        return;
    }

    const currentContactId = currentSweetheartChatContact.id;

    // 渲染每个联系人
    worldContacts.forEach(contact => {
        const isInGroup = syncGroup.includes(contact.id);
        const isMe = contact.id === currentContactId;

        const item = document.createElement('div');
        item.className = 'sync-member-item' + (isMe ? ' is-me' : '');

        const isUrl = contact.avatar && (contact.avatar.startsWith('http') || contact.avatar.startsWith('data:'));
        const avatarContent = isUrl
            ? `<img src="${escapeHTML(contact.avatar)}" alt="">`
            : escapeHTML(contact.avatar);

        const badge = isMe ? '（我）' : '';
        const statusIcon = isInGroup ? '✓' : '○';
        const statusClass = isInGroup ? 'active' : 'inactive';

        item.innerHTML = `
            <div class="sync-member-avatar">${avatarContent}</div>
            <div class="sync-member-info">
                <div class="sync-member-name">${escapeHTML(contact.name)}</div>
                <div class="sync-member-badge ${statusClass}">${badge}${isInGroup ? '已加入同步' : '未加入'}</div>
            </div>
            <div class="sync-member-status ${statusClass}">${statusIcon}</div>
        `;

        container.appendChild(item);
    });
}

/**
 * 切换同步组成员资格
 */
function toggleSyncGroupMembership() {
    if (!currentWorldId || !currentSweetheartChatContact) return;

    const currentContactId = currentSweetheartChatContact.id;
    const syncGroup = getSyncGroupForWorld(currentWorldId);
    const isInGroup = syncGroup.includes(currentContactId);

    if (isInGroup) {
        // 退出同步组
        if (confirm('确定要退出同步组吗？退出后你的状态将不再与其他成员同步。')) {
            removeMemberFromSyncGroup(currentWorldId, currentContactId);
            showSuccessModal('已退出', '你已退出状态同步组');
        }
    } else {
        // 加入同步组
        addMemberToSyncGroup(currentWorldId, currentContactId);
        showSuccessModal('已加入', '你已加入状态同步组，现在你的状态会与其他成员互相同步！');
    }

    // 刷新界面
    renderSyncGroupInfo();
}

/**
 * 获取指定世界的同步组成员
 * @param {string} worldId - 世界ID
 * @returns {Array<string>} - 同步组成员ID数组
 */
function getSyncGroupForWorld(worldId) {
    try {
        const allSyncGroups = JSON.parse(localStorage.getItem('worldStatusSyncGroups') || '{}');
        return allSyncGroups[worldId] || [];
    } catch (e) {
        console.error('读取同步组失败:', e);
        return [];
    }
}

/**
 * 将成员添加到同步组
 * @param {string} worldId - 世界ID
 * @param {string} contactId - 联系人ID
 */
function addMemberToSyncGroup(worldId, contactId) {
    try {
        const allSyncGroups = JSON.parse(localStorage.getItem('worldStatusSyncGroups') || '{}');

        if (!allSyncGroups[worldId]) {
            allSyncGroups[worldId] = [];
        }

        if (!allSyncGroups[worldId].includes(contactId)) {
            allSyncGroups[worldId].push(contactId);
            localStorage.setItem('worldStatusSyncGroups', JSON.stringify(allSyncGroups));
            console.log(`✅ ${contactId} 已加入世界 ${worldId} 的同步组`);
        }
    } catch (e) {
        console.error('添加到同步组失败:', e);
    }
}

/**
 * 从同步组移除成员
 * @param {string} worldId - 世界ID
 * @param {string} contactId - 联系人ID
 */
function removeMemberFromSyncGroup(worldId, contactId) {
    try {
        const allSyncGroups = JSON.parse(localStorage.getItem('worldStatusSyncGroups') || '{}');

        if (allSyncGroups[worldId]) {
            allSyncGroups[worldId] = allSyncGroups[worldId].filter(id => id !== contactId);
            localStorage.setItem('worldStatusSyncGroups', JSON.stringify(allSyncGroups));
            console.log(`✅ ${contactId} 已退出世界 ${worldId} 的同步组`);
        }
    } catch (e) {
        console.error('从同步组移除失败:', e);
    }
}

/**
 * [修改] 保存状态数据，并在同步组内互相同步
 * @param {string} contactId - 当前密友的ID
 * @param {object} statusData - 要保存的状态对象
 */
function saveStatusData(contactId, statusData) {
    if (!contactId || !statusData) return;

    try {
        const allStatusHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
        let contactHistory = allStatusHistories[contactId] || [];

        const newStatusEntry = {
            ...statusData,
            timestamp: Date.now()
        };

        contactHistory.unshift(newStatusEntry);
        contactHistory = contactHistory.slice(0, 5);
        allStatusHistories[contactId] = contactHistory;

        localStorage.setItem('sweetheartStatusHistory', JSON.stringify(allStatusHistories));
        console.log(`✅ 已为 ${contactId} 更新状态历史`);

        // ✅ 新增：在同步组内互相同步"我的状态"
        if (currentWorldId && statusData.user) {
            syncMyStatusInGroup(currentWorldId, contactId, statusData.user);
        }

    } catch (e) {
        console.error('保存状态历史数据失败:', e);
    }
}

/**
 * [新增] 在同步组内同步"我的状态"
 * @param {string} worldId - 当前世界ID
 * @param {string} sourceContactId - 源联系人ID
 * @param {object} myStatus - 我的状态数据
 */
function syncMyStatusInGroup(worldId, sourceContactId, myStatus) {
    if (!myStatus) return;

    // 获取同步组成员
    const syncGroup = getSyncGroupForWorld(worldId);

    // 检查源联系人是否在同步组中
    if (!syncGroup.includes(sourceContactId)) {
        console.log('ℹ️ 当前联系人不在同步组中，跳过同步');
        return;
    }

    // 过滤出需要同步的目标（排除自己）
    const syncTargets = syncGroup.filter(id => id !== sourceContactId);

    if (syncTargets.length === 0) {
        console.log('ℹ️ 同步组中只有自己，无需同步');
        return;
    }

    try {
        const allStatusHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');

        syncTargets.forEach(targetContactId => {
            let targetHistory = allStatusHistories[targetContactId] || [];

            if (targetHistory.length > 0) {
                // 更新最新一条的"我的状态"
                targetHistory[0].user = {
                    ...myStatus,
                    syncedFrom: sourceContactId,
                    syncedAt: Date.now()
                };
            } else {
                // 创建新的状态记录
                targetHistory.unshift({
                    character: {
                        location: '...',
                        appearance: '...',
                        action: '...',
                        thoughts: '...',
                        private_thoughts: '...'
                    },
                    user: {
                        ...myStatus,
                        syncedFrom: sourceContactId,
                        syncedAt: Date.now()
                    },
                    timestamp: Date.now()
                });
            }

            targetHistory = targetHistory.slice(0, 5);
            allStatusHistories[targetContactId] = targetHistory;

            console.log(`🔄 已将"我的状态"同步到 ${targetContactId}`);
        });

        localStorage.setItem('sweetheartStatusHistory', JSON.stringify(allStatusHistories));
        console.log(`✅ 同步完成，共同步到 ${syncTargets.length} 个成员`);

    } catch (e) {
        console.error('同步状态失败:', e);
    }
}

/* ========== 同步组管理功能 - 结束 ========== */


/**
 * 取消引用（密友版）
 */
function cancelSweetheartQuote() {
    currentSweetheartQuoteData = null;
    const previewEl = document.getElementById('sweetheartQuotePreview');
    previewEl.classList.remove('show');
}

/**
 * [最终修复版] 初始化密友聊天输入框
 */
function setupSweetheartChatInput() {
    const chatInput = document.getElementById('sweetheartChatInput');
    const chatInputArea = document.querySelector('.sweetheart-chat-input-area');

    if (!chatInput || !chatInputArea) return;

    // 1. 克隆节点以移除旧的所有事件监听器 (防止重复绑定)
    const freshChatInput = chatInput.cloneNode(true);
    chatInput.parentNode.replaceChild(freshChatInput, chatInput);

    // 2. 绑定 "输入时显示发送按钮" 的逻辑
    freshChatInput.addEventListener('input', function () {
        updateSweetheartChatInputAreaButtons();
    });

    // 3. 绑定 "回车发送" 逻辑
    freshChatInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // 阻止默认换行
            addSweetheartMessageToList(); // 发送文本消息
        }
    });

    // 4. 初始化一次状态
    updateSweetheartChatInputAreaButtons();

    // 确保输入框可用
    freshChatInput.disabled = false;
    freshChatInput.removeAttribute('readonly');
}


// ========== 世界书功能 - 开始 ==========

// 世界书数据存储
let worldbookData = [];
let selectedCategory = null; // 当前选择的分组
let selectedGroup = null; // 选中的分类
let currentEditingWorldbookId = null;

/**
 * 打开世界书主页面
 */
function openWorldbook() {
    document.getElementById('worldbookPage').classList.add('show');
    renderWorldbookList();
}

/**
 * 关闭世界书主页面
 */
function closeWorldbook() {
    document.getElementById('worldbookPage').classList.remove('show');
}

/**
 * 渲染世界书列表
 */
function renderWorldbookList() {
    const emptyEl = document.getElementById('worldbookEmpty');
    const listEl = document.getElementById('worldbookList');

    if (worldbookData.length === 0) {
        emptyEl.style.display = 'flex';
        listEl.style.display = 'none';
    } else {
        emptyEl.style.display = 'none';
        listEl.style.display = 'flex';

        listEl.innerHTML = '';
        worldbookData.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'worldbook-item';
            item.onclick = () => editWorldbookEntry(entry.id);

            const groupNames = {
                'worldview': '世界观',
                'rules': '行为规范',
                'knowledge': '知识库'
            };

            // 获取分组名称
            let categoryName = '未分组';
            if (entry.category && entry.category !== 'uncategorized') {
                const cat = categoriesData.find(c => c.id === entry.category);
                categoryName = cat ? cat.name : '未分组';
            }

            const preview = (entry.content || '暂无内容').substring(0, 60);

            item.innerHTML = `
                <div class="worldbook-item-title">${escapeHTML(entry.title)}</div>
                <div class="worldbook-item-category">${escapeHTML(groupNames[entry.group] || '未分类')} · ${escapeHTML(categoryName)}</div>
                <div class="worldbook-item-preview">${escapeHTML(preview)}${preview.length >= 60 ? '...' : ''}</div>
            `;

            listEl.appendChild(item);
        });
    }
}


/**
 * 打开世界书弹窗（新建模式）
 */
function openWorldbookModal() {
    currentEditingWorldbookId = null;
    selectedGroup = null;
    selectedCategory = null;

    document.getElementById('worldbookModalTitle').textContent = '新建世界书';
    document.getElementById('wbTitleInput').value = '';  // ← 改这里
    document.getElementById('wbContentInput').value = ''; // ← 改这里

    // 重置分类
    document.getElementById('groupSelected').textContent = '请选择分类';
    document.querySelectorAll('#groupOptions .category-option').forEach(opt => {
        opt.classList.remove('selected');
    });

    // 重置分组
    document.getElementById('categorySelected').textContent = '请选择分组';
    updateCategoryOptions();

    document.getElementById('wbContentLabel').textContent = '内容'; // ← 改这里
    document.getElementById('worldbookDeleteBtn').style.display = 'none';
    document.getElementById('worldbookModal').classList.add('show');
}


/**
 * 编辑世界书条目
 */
// 请用这个新版本替换旧的 editWorldbookEntry 函数
function editWorldbookEntry(entryId) {
    const entry = worldbookData.find(e => e.id === entryId);
    if (!entry) return;

    currentEditingWorldbookId = entryId;
    selectedGroup = entry.group; // 确保 selectedGroup 被正确赋值
    selectedCategory = entry.category;

    document.getElementById('worldbookModalTitle').textContent = '编辑世界书';
    document.getElementById('wbTitleInput').value = entry.title;
    document.getElementById('wbContentInput').value = entry.content || '';

    // 设置分类
    const groupNames = {
        'worldview': '世界观',
        'rules': '行为规范',
        'knowledge': '知识库'
    };
    // V V V 修正点在这里 V V V
    document.getElementById('groupSelected').textContent = groupNames[entry.group] || '请选择分类';
    document.querySelectorAll('#groupOptions .category-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.group === entry.group);
    });

    // 设置分组（这部分逻辑保持不变）
    updateCategoryOptions();
    const categoryName = categoriesData.find(c => c.id === entry.category)?.name || '请选择分组';
    document.getElementById('categorySelected').textContent = categoryName;
    document.querySelectorAll('#categoryOptions .category-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.category === entry.category);
    });

    document.getElementById('worldbookDeleteBtn').style.display = 'block';
    document.getElementById('worldbookModal').classList.add('show');
}


/**
 * 关闭世界书弹窗
 */
function closeWorldbookModal() {
    document.getElementById('worldbookModal').classList.remove('show');
    currentEditingWorldbookId = null;
}

/**
 * 保存世界书条目
 */
function saveWorldbookEntry() {
    const title = document.getElementById('wbTitleInput').value.trim();     // ← 改这里
    const content = document.getElementById('wbContentInput').value.trim(); // ← 改这里

    if (!title) {
        alert('请填写世界书名称！');
        return;
    }

    if (!selectedGroup) {
        alert('请选择分类！');
        return;
    }

    const entryData = {
        id: currentEditingWorldbookId || 'WB' + Date.now(),
        title,
        group: selectedGroup,
        category: selectedCategory || 'uncategorized',
        content,
        timestamp: Date.now()
    };

    if (currentEditingWorldbookId) {
        const index = worldbookData.findIndex(e => e.id === currentEditingWorldbookId);
        if (index !== -1) {
            worldbookData[index] = entryData;
        }
    } else {
        worldbookData.push(entryData);
    }

    saveWorldbookToStorage();
    renderWorldbookList();
    closeWorldbookModal();
    showSuccessModal('保存成功', '世界书已更新！');
}


/**
 * 删除世界书条目
 */
function deleteWorldbookEntry() {
    if (!currentEditingWorldbookId) return;

    if (confirm('确定要删除这个世界书条目吗？')) {
        worldbookData = worldbookData.filter(e => e.id !== currentEditingWorldbookId);
        saveWorldbookToStorage();
        renderWorldbookList();
        closeWorldbookModal();
        showSuccessModal('删除成功', '世界书条目已移除。');
    }
}

/**
 * 保存世界书数据到 localStorage
 */
function saveWorldbookToStorage() {
    try {
        localStorage.setItem('phoneWorldbookData', JSON.stringify(worldbookData));
    } catch (e) {
        console.error('保存世界书数据失败:', e);
    }
}

/**
 * 从 localStorage 加载世界书数据
 */
function loadWorldbookData() {
    try {
        const saved = localStorage.getItem('phoneWorldbookData');
        if (saved) {
            worldbookData = JSON.parse(saved);
            console.log('成功加载世界书数据，共', worldbookData.length, '条');
        }
    } catch (e) {
        console.error('加载世界书数据失败:', e);
    }
}

/**
 * 初始化分组选择器
 */
function setupCategorySelector() {
    // 分组选择器
    const groupSelector = document.getElementById('groupSelector');
    const groupSelectedEl = document.getElementById('groupSelected');
    const groupOptionsEl = document.getElementById('groupOptions');

    groupSelectedEl.addEventListener('click', (e) => {
        e.stopPropagation();
        groupSelector.classList.toggle('active');
        // 关闭分组选择器
        document.getElementById('categorySelector').classList.remove('active');
    });

    groupOptionsEl.addEventListener('click', (e) => {
        const option = e.target.closest('.category-option');
        if (!option) return;

        const group = option.dataset.group;
        selectedGroup = group;

        groupSelectedEl.textContent = option.textContent;
        document.querySelectorAll('#groupOptions .category-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        option.classList.add('selected');

        const labels = {
            'worldview': '世界观',
            'rules': '行为规范',
            'knowledge': '知识库'
        };
        document.getElementById('wbContentLabel').textContent = labels[group];
        document.getElementById('worldbookContent').placeholder = `填写${labels[group]}的内容...`;

        groupSelector.classList.remove('active');
    });

    // 分组选择器
    const categorySelector = document.getElementById('categorySelector');
    const categorySelectedEl = document.getElementById('categorySelected');
    const categoryOptionsEl = document.getElementById('categoryOptions');

    categorySelectedEl.addEventListener('click', (e) => {
        e.stopPropagation();
        categorySelector.classList.toggle('active');
        // 关闭分组选择器
        groupSelector.classList.remove('active');
    });

    categoryOptionsEl.addEventListener('click', (e) => {
        const option = e.target.closest('.category-option');
        if (!option) return;

        const category = option.dataset.category;
        selectedCategory = category;

        categorySelectedEl.textContent = option.textContent;
        document.querySelectorAll('#categoryOptions .category-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        option.classList.add('selected');

        categorySelector.classList.remove('active');
    });

    // 点击其他地方关闭所有选择器
    document.addEventListener('click', () => {
        groupSelector.classList.remove('active');
        categorySelector.classList.remove('active');
    });
}


/**
 * 打开分组管理（暂时用简单提示，后续可扩展）
 */
function openCategoryManage(event) {
    event.stopPropagation();
    alert('分组管理功能开发中...');
}

// ========== 分类管理功能 - 开始 ==========

/**
 * 打开分类管理页面
 */
function openClassificationManage(event) {
    if (event) event.stopPropagation();
    document.getElementById('classificationManagePage').classList.add('show');
    renderClassificationList(); // 打开时渲染列表
}

/**
 * 关闭分类管理页面
 */
function closeClassificationManage() {
    document.getElementById('classificationManagePage').classList.remove('show');
}

/**
 * 渲染分类列表（世界观、行为规范、知识库）
 */
function renderClassificationList() {
    const listEl = document.getElementById('classificationList');
    const emptyEl = document.getElementById('classificationEmpty');

    // 1. 定义我们的三个核心分类
    const coreClassifications = [
        {key: 'worldview', name: '世界观', icon: '🌍'},
        {key: 'rules', name: '行为规范', icon: '📜'},
        {key: 'knowledge', name: '知识库', icon: '📚'}
    ];

    let hasContent = false;
    listEl.innerHTML = ''; // 清空旧内容

    // 2. 遍历每个核心分类
    coreClassifications.forEach(classification => {
        // 找出所有属于当前分类的世界书条目
        const worldbooksInCategory = worldbookData.filter(wb => wb.group === classification.key);

        if (worldbooksInCategory.length > 0) {
            hasContent = true;
        }

        const count = worldbooksInCategory.length;

        // 3. 创建分类的 DOM 结构（复用分组管理的样式）
        const item = document.createElement('div');
        item.className = 'category-item';
        item.dataset.classificationId = classification.key; // 使用 key 作为唯一标识

        item.innerHTML = `
            <div class="category-item-header" onclick="toggleClassificationExpand('${classification.key}')">
                <div class="category-item-icon">${classification.icon}</div>
                <div class="category-item-info">
                    <div class="category-item-name">${escapeHTML(classification.name)}</div>
                    <div class="category-item-count">${count} 个世界书</div>
                </div>
                <div class="category-item-arrow">›</div>
            </div>
            <div class="category-worldbooks" id="worldbooks-clf-${classification.key}">
                ${worldbooksInCategory.length === 0
            ? '<div style="padding: 20px; text-align: center; color: #BCAAA4; font-size: 13px;">暂无世界书</div>'
            : worldbooksInCategory.map(wb => `
                        <div class="worldbook-mini-item" onclick="editWorldbookFromClassification('${wb.id}')">
                            <div class="worldbook-mini-title">${escapeHTML(wb.title)}</div>
                            <div class="worldbook-mini-preview">${escapeHTML((wb.content || '').substring(0, 40))}...</div>
                        </div>
                    `).join('')}
            </div>
        `;
        listEl.appendChild(item);
    });

    // 4. 根据是否有内容，决定显示列表还是空状态提示
    if (hasContent || worldbookData.length > 0) { // 只要有世界书就显示分类列表
        emptyEl.style.display = 'none';
        listEl.style.display = 'flex';
    } else {
        emptyEl.style.display = 'flex';
        listEl.style.display = 'none';
    }
}

/**
 * 切换分类的展开/收起
 */
function toggleClassificationExpand(classificationKey) {
    const item = document.querySelector(`[data-classification-id="${classificationKey}"]`);
    if (item) {
        item.classList.toggle('expanded');
    }
}

/**
 * 从分类管理页面跳转到编辑世界书
 */
function editWorldbookFromClassification(worldbookId) {
    closeClassificationManage();
    // 延迟执行，等待页面关闭动画完成
    setTimeout(() => {
        openWorldbook();
        // 再次延迟，等待世界书页面打开
        setTimeout(() => editWorldbookEntry(worldbookId), 100);
    }, 300);
}

// ========== 分类管理功能 - 结束 ==========


// ========== 分组管理功能 - 开始 ==========

// 分组数据存储
let categoriesData = [];
let currentEditingCategoryId = null;

/**
 * 打开分组管理页面
 */
function openCategoryManage(event) {
    if (event) event.stopPropagation();
    document.getElementById('categoryManagePage').classList.add('show');
    renderCategoryList();
}

/**
 * 关闭分组管理页面
 */
function closeCategoryManage() {
    document.getElementById('categoryManagePage').classList.remove('show');
}

/**
 * 动态更新分组选择器的选项
 */
function updateCategoryOptions() {
    const optionsEl = document.getElementById('categoryOptions');
    if (!optionsEl) return;

    optionsEl.innerHTML = '';

    // 添加"未分组"选项
    const uncategorizedOption = document.createElement('div');
    uncategorizedOption.className = 'category-option';
    uncategorizedOption.dataset.category = 'uncategorized';
    uncategorizedOption.textContent = '未分组';
    optionsEl.appendChild(uncategorizedOption);

    // 添加自定义分组
    categoriesData.forEach(category => {
        const option = document.createElement('div');
        option.className = 'category-option';
        option.dataset.category = category.id;
        option.textContent = category.name;
        optionsEl.appendChild(option);
    });
}


/**
 * 渲染分组列表
 */
function renderCategoryList() {
    const emptyEl = document.getElementById('categoryEmpty');
    const listEl = document.getElementById('categoryList');

    if (categoriesData.length === 0) {
        emptyEl.style.display = 'flex';
        listEl.style.display = 'none';
    } else {
        emptyEl.style.display = 'none';
        listEl.style.display = 'flex';

        listEl.innerHTML = '';
        categoriesData.forEach(category => {
            const item = createCategoryItem(category);
            listEl.appendChild(item);
        });
    }
}

/**
 * 创建分组项DOM元素
 */
function createCategoryItem(category) {
    const item = document.createElement('div');
    item.className = 'category-item';
    item.dataset.categoryId = category.id;

    // 统计该分组下的世界书数量
    const worldbooksInCategory = worldbookData.filter(wb => wb.category === category.id);
    const count = worldbooksInCategory.length;

    item.innerHTML = `
        <div class="category-item-header" onclick="toggleCategoryExpand('${category.id}')">
            <div class="category-item-icon">📂</div>
            <div class="category-item-info">
                <div class="category-item-name">${escapeHTML(category.name)}</div>
                <div class="category-item-count">${count} 个世界书</div>
            </div>
            <div class="category-item-arrow">›</div>
        </div>
        <div class="category-worldbooks" id="worldbooks-${category.id}">
            ${worldbooksInCategory.length === 0
        ? '<div style="padding: 20px; text-align: center; color: #BCAAA4; font-size: 13px;">暂无世界书</div>'
        : worldbooksInCategory.map(wb => `
                    <div class="worldbook-mini-item" onclick="editWorldbookFromCategory('${wb.id}')">
                        <div class="worldbook-mini-title">${escapeHTML(wb.title)}</div>
                        <div class="worldbook-mini-preview">${escapeHTML((wb.content || '').substring(0, 40))}...</div>
                    </div>
                `).join('')}
        </div>
    `;

    return item;
}

/**
 * 切换分组展开/收起
 */
function toggleCategoryExpand(categoryId) {
    const item = document.querySelector(`[data-category-id="${categoryId}"]`);
    if (!item) return;

    item.classList.toggle('expanded');
}

/**
 * 从分组管理页面编辑世界书
 */
function editWorldbookFromCategory(worldbookId) {
    closeCategoryManage();
    setTimeout(() => {
        openWorldbook();
        setTimeout(() => editWorldbookEntry(worldbookId), 100);
    }, 300);
}

/**
 * 打开新建分组弹窗
 */
function openNewCategoryModal() {
    currentEditingCategoryId = null;

    document.getElementById('categoryModalTitle').textContent = '新建分组';
    document.getElementById('categoryNameInput').value = '';
    document.getElementById('categoryDescInput').value = '';
    document.getElementById('categoryDeleteBtn').style.display = 'none';

    document.getElementById('categoryModal').classList.add('show');
}

/**
 * 编辑分组
 */
function editCategory(categoryId) {
    const category = categoriesData.find(c => c.id === categoryId);
    if (!category) return;

    currentEditingCategoryId = categoryId;

    document.getElementById('categoryModalTitle').textContent = '编辑分组';
    document.getElementById('categoryNameInput').value = category.name;
    document.getElementById('categoryDescInput').value = category.description || '';
    document.getElementById('categoryDeleteBtn').style.display = 'block';

    document.getElementById('categoryModal').classList.add('show');
}

/**
 * 关闭分组弹窗
 */
function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('show');
    currentEditingCategoryId = null;
}

/**
 * 保存分组
 */
function saveCategory() {
    const name = document.getElementById('categoryNameInput').value.trim();
    const description = document.getElementById('categoryDescInput').value.trim();

    if (!name) {
        alert('请填写分组名称！');
        return;
    }

    const categoryData = {
        id: currentEditingCategoryId || 'CAT' + Date.now(),
        name,
        description,
        timestamp: Date.now()
    };

    if (currentEditingCategoryId) {
        // 编辑模式
        const index = categoriesData.findIndex(c => c.id === currentEditingCategoryId);
        if (index !== -1) {
            categoriesData[index] = categoryData;
        }
    } else {
        // 新建模式
        categoriesData.push(categoryData);
    }

    saveCategoriesToStorage();
    renderCategoryList();
    updateWorldbookCategorySelector(); // 更新世界书弹窗的分组选项
    closeCategoryModal();
    showSuccessModal('保存成功', '分组已更新！');
}

/**
 * 删除分组
 */
function deleteCategory() {
    if (!currentEditingCategoryId) return;

    // 检查是否有世界书使用此分组
    const worldbooksUsingCategory = worldbookData.filter(wb => wb.category === currentEditingCategoryId);

    if (worldbooksUsingCategory.length > 0) {
        if (!confirm(`此分组下有 ${worldbooksUsingCategory.length} 个世界书，删除后这些世界书将变为未分组状态，确定删除吗？`)) {
            return;
        }

        // 将使用此分组的世界书改为未分组
        worldbooksUsingCategory.forEach(wb => {
            wb.category = 'uncategorized';
        });
        saveWorldbookToStorage();
    }

    categoriesData = categoriesData.filter(c => c.id !== currentEditingCategoryId);
    saveCategoriesToStorage();
    renderCategoryList();
    updateWorldbookCategorySelector();
    closeCategoryModal();
    showSuccessModal('删除成功', '分组已移除。');
}

/**
 * 保存分组到localStorage
 */
function saveCategoriesToStorage() {
    try {
        localStorage.setItem('phoneCategoriesData', JSON.stringify(categoriesData));
    } catch (e) {
        console.error('保存分组数据失败:', e);
    }
}

/**
 * 从localStorage加载分组
 */
function loadCategoriesData() {
    try {
        const saved = localStorage.getItem('phoneCategoriesData');
        if (saved) {
            categoriesData = JSON.parse(saved);
            console.log('成功加载分组数据，共', categoriesData.length, '条');
        }
    } catch (e) {
        console.error('加载分组数据失败:', e);
    }
}

/**
 * 更新世界书弹窗的分组选择器
 */
function updateWorldbookCategorySelector() {
    const optionsEl = document.getElementById('categoryOptions');
    if (!optionsEl) return;

    optionsEl.innerHTML = '';

    // 添加"未分组"选项
    const uncategorizedOption = document.createElement('div');
    uncategorizedOption.className = 'category-option';
    uncategorizedOption.dataset.category = 'uncategorized';
    uncategorizedOption.textContent = '未分组';
    optionsEl.appendChild(uncategorizedOption);

    // 添加自定义分组
    categoriesData.forEach(category => {
        const option = document.createElement('div');
        option.className = 'category-option';
        option.dataset.category = category.id;
        option.textContent = category.name;
        optionsEl.appendChild(option);
    });
}

// ========== 分组管理功能 - 结束 ==========
/**
 * [最终修正版] 根据当前聊天上下文，收集所有相关的世界书内容
 * @returns {string} - 格式化后的世界书内容字符串
 */

/**
 * [最终增强版] 根据当前聊天上下文，收集所有相关的世界书内容
 * 修改点：强制包含内置的全局世界书
 * @returns {string} - 格式化后的世界书内容字符串
 */
function gatherWorldbookContext() {
    // 注意：即使 currentChatContact 不存在（极端情况），我们也可能希望返回全局设定，
    // 但为了上下文连贯，通常还是需要有联系人。

    const relevantWorldbookIds = new Set();

    // 1. 【核心修改】首先，无条件添加内置的全局世界书 ID
    relevantWorldbookIds.add(GLOBAL_WORLDBOOK_ID);

    // 2. 如果有当前联系人，再添加它绑定的
    if (currentChatContact) {
        // 在密友列表查找
        const sweetheartData = sweetheartContactsData.find(c => c.id === currentChatContact.id);
        if (sweetheartData && sweetheartData.boundWorldbooks) {
            sweetheartData.boundWorldbooks.forEach(id => relevantWorldbookIds.add(id));
        }

        // 在普通联系人列表查找
        const regularContactData = contactsData.find(c => c.id === currentChatContact.id);
        if (regularContactData && regularContactData.boundWorldbooks) {
            regularContactData.boundWorldbooks.forEach(id => relevantWorldbookIds.add(id));
        }
    }

    // 3. 从当前所在的世界添加绑定的世界书
    if (currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world && world.worldbooks) {
            world.worldbooks.forEach(id => relevantWorldbookIds.add(id));
        }
    }

    if (relevantWorldbookIds.size === 0) {
        return '';
    }

    // 4. 根据收集到的ID，查找内容并格式化
    const contextEntries = [];
    relevantWorldbookIds.forEach(id => {
        const entry = worldbookData.find(wb => wb.id === id);
        if (entry && entry.content) {
            // 给内置书加一个特殊的标签，方便区分
            let categoryName = '通用';
            if (entry.id === GLOBAL_WORLDBOOK_ID) {
                categoryName = '【全局核心设定】';
            } else {
                categoryName = categoriesData.find(c => c.id === entry.category)?.name || '未分组';
            }

            contextEntries.push(`### ${categoryName}: ${entry.title}\n${entry.content}`);
        }
    });

    if (contextEntries.length > 0) {
        const finalContext = "[背景设定，必须严格遵守]\n---\n" + contextEntries.join('\n\n') + "\n---";
        console.log("[AI Context] 已加载世界书上下文 (含内置):", finalContext);
        return finalContext;
    }

    return '';
}


// ========== 世界书功能 - 结束 ==========

// ========== 地图编辑功能（增强版） ==========

let mapPins = []; // 存储所有大头针
let currentEditingPin = null; // 当前编辑的大头针
let isDraggingPin = false; // 是否正在拖动
let draggedPin = null; // 正在拖动的大头针
let dragOffset = {x: 0, y: 0}; // 拖动偏移量

// 默认地图的预设地点
const DEFAULT_MAP_LOCATIONS = [
    {
        id: 'DEFAULT_1',
        x: 25,
        y: 30,
        name: '中央食堂',
        description: '全校情报与美食的集散地，是恢复体力的关键场所。',
        type: 'city'
    },
    {
        id: 'DEFAULT_2',
        x: 70,
        y: 25,
        name: '男生宿舍',
        description: '充满了热血与泡面味的休息区，深夜常有神秘的开黑呐喊声。',
        type: 'landmark'
    },
    {
        id: 'DEFAULT_3',
        x: 45,
        y: 60,
        name: '女生宿舍',
        description: '环境优雅的休憩之地，据说门口的宿管阿姨拥有极高的防御力。',
        type: 'landmark'
    },
    {
        id: 'DEFAULT_4',
        x: 15,
        y: 70,
        name: '综合教学楼',
        description: '庄严的知识殿堂，也是学生们与困意进行殊死搏斗的战场。',
        type: 'village'
    },
    {
        id: 'DEFAULT_5',
        x: 80,
        y: 55,
        name: '社团活动中心',
        description: '卧虎藏龙的课后据点，这里隐藏着各种身怀绝技的高手。',
        type: 'dungeon' // 既然类型是 dungeon（副本/地牢），描述暗示这里有挑战或高手比较贴切
    },
    {
        id: 'DEFAULT_6',
        x: 50,
        y: 40,
        name: '风雨体育馆',
        description: '挥洒汗水的竞技场，是展现个人魅力和触发青春事件的高频区域。',
        type: 'landmark'
    }
];


// 打开密友设置
function openSweetheartSettings() {
    document.getElementById('sweetheartSettingsPage').classList.add('show');
}

// 关闭密友设置
function closeSweetheartSettings() {
    document.getElementById('sweetheartSettingsPage').classList.remove('show');
}

// 打开地图编辑器
function openMapEditor() {
    document.getElementById('mapEditorPage').classList.add('show');
    loadMapData();

    // 添加拖动提示
    if (!document.getElementById('mapDragHint')) {
        const hint = document.createElement('div');
        hint.id = 'mapDragHint';
        hint.className = 'drag-hint';
        hint.textContent = '长按拖动地点';
        document.body.appendChild(hint);
    }
}


// 关闭地图编辑器
function closeMapEditor() {
    document.getElementById('mapEditorPage').classList.remove('show');

    // 隐藏拖动提示
    const hint = document.getElementById('mapDragHint');
    if (hint) {
        hint.classList.remove('show');
    }
}

// ✨ 新增：触发地图上传
function triggerMapEditorUpload() {
    if (!currentWorldId) {
        showSuccessModal('提示', '请先选择一个世界！', 2000);
        return;
    }
    document.getElementById('mapEditorFileInput').click();
}

// ✨ 新增：处理地图文件上传
function handleMapEditorFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 限制文件大小 (例如 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert("图片太大啦，请上传 5MB 以内的图片");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const newMapUrl = e.target.result;

        // 1. 立即更新界面预览
        const mapImage = document.getElementById('worldMapImage');
        const mapContainer = document.getElementById('mapContainer');

        mapImage.src = newMapUrl;
        mapContainer.classList.remove('empty'); // 移除空状态样式

        // 2. 更新数据并保存
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world) {
            world.mapUrl = newMapUrl;
            saveWorldsData(); // 保存到 localStorage
            console.log(`✅ 世界 "${world.name}" 的地图已更新`);
        }

        // 3. 提示成功
        showSuccessModal('地图更新', '新地图已应用并保存！✨');
    };

    reader.onerror = function () {
        showErrorModal('上传失败', '读取图片出错，请重试');
    };

    reader.readAsDataURL(file);
    event.target.value = ''; // 清空输入框，允许重复上传同一文件
}


// 加载地图数据
function loadMapData() {
    const mapContainer = document.getElementById('mapContainer');
    const mapImage = document.getElementById('worldMapImage');

    // 检查当前世界是否有地图
    if (currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);

        if (world && world.mapUrl) {
            mapImage.src = world.mapUrl;
            mapContainer.classList.remove('empty');

            // 检查是否是默认地图
            const isDefaultMap = world.mapUrl.includes('1760979959274_qdqqd_m9jrpo.jpg');

            // 加载已保存的大头针或默认地点
            const savedPins = localStorage.getItem(`mapPins_${currentWorldId}`);

            if (savedPins) {
                mapPins = JSON.parse(savedPins);
            } else if (isDefaultMap) {
                // 如果是默认地图且没有保存的数据，使用预设地点
                mapPins = [...DEFAULT_MAP_LOCATIONS];
                console.log('已加载默认地图的预设地点');
            } else {
                mapPins = [];
            }

            // 等待图片加载完成后再渲染大头针
            mapImage.onload = () => {
                renderMapPins();
                setupMapDragListeners();
            };

            // 如果图片已经加载过（从缓存），直接渲染
            if (mapImage.complete) {
                renderMapPins();
                setupMapDragListeners();
            }
        } else {
            mapContainer.classList.add('empty');
            mapPins = [];
        }
    } else {
        mapContainer.classList.add('empty');
        mapPins = [];
    }
}

// 添加大头针到地图
function addMapPin(event) {
    // 如果正在拖动或点击的是大头针，不添加新的
    if (isDraggingPin || event.target.closest('.map-pin')) return;

    const mapContainer = document.getElementById('mapContainer');
    const rect = mapContainer.getBoundingClientRect();

    // 计算相对位置（百分比）
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    // 创建新的大头针数据
    const newPin = {
        id: 'PIN_' + Date.now(),
        x: x,
        y: y,
        name: '新地点',
        description: '',
        type: 'city'
    };

    mapPins.push(newPin);
    renderMapPins();
    setupMapDragListeners();

    // 立即打开编辑弹窗
    editMapPin(newPin.id);
}

// 渲染所有大头针
function renderMapPins() {
    const mapContainer = document.getElementById('mapContainer');

    // 移除旧的大头针
    document.querySelectorAll('.map-pin').forEach(pin => pin.remove());

    // 添加新的大头针
    mapPins.forEach(pin => {
        const pinElement = document.createElement('div');
        pinElement.className = 'map-pin';
        pinElement.style.left = pin.x + '%';
        pinElement.style.top = pin.y + '%';
        pinElement.dataset.pinId = pin.id;

        // 根据类型选择不同的图标
        const icons = {
            city: '🏙️',
            village: '🏘️',
            dungeon: '🏰',
            landmark: '⭐',
            other: '📍'
        };

        pinElement.innerHTML = `
            <div class="map-pin-icon">${icons[pin.type] || '📍'}</div>
            <div class="map-pin-label">${escapeHTML(pin.name)}</div>
        `;

        mapContainer.appendChild(pinElement);
    });
}

// 设置地图拖动监听器
function setupMapDragListeners() {
    const pins = document.querySelectorAll('.map-pin');

    pins.forEach(pin => {
        let longPressTimer = null;
        let startPos = {x: 0, y: 0};
        let hasMoved = false;

        // 触摸开始/鼠标按下
        const handleStart = (e) => {
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            startPos = {x: touch.clientX, y: touch.clientY};
            hasMoved = false;

            // 长按检测（500ms）
            longPressTimer = setTimeout(() => {
                startDragging(pin, touch);
                showDragHint();
            }, 500);
        };

        // 触摸移动/鼠标移动
        const handleMove = (e) => {
            const touch = e.touches ? e.touches[0] : e;
            const distance = Math.sqrt(
                Math.pow(touch.clientX - startPos.x, 2) +
                Math.pow(touch.clientY - startPos.y, 2)
            );

            // 如果移动超过5像素，取消长按
            if (distance > 5 && !isDraggingPin) {
                clearTimeout(longPressTimer);
                hasMoved = true;
            }

            // 如果正在拖动，更新位置
            if (isDraggingPin && draggedPin === pin) {
                updateDragPosition(touch);
            }
        };

        // 触摸结束/鼠标释放
        const handleEnd = (e) => {
            clearTimeout(longPressTimer);

            if (isDraggingPin && draggedPin === pin) {
                endDragging();
            } else if (!hasMoved) {
                // 如果没有移动且没有触发长按，执行点击
                editMapPin(pin.dataset.pinId);
            }
        };

        // 绑定事件
        pin.addEventListener('touchstart', handleStart, {passive: false});
        pin.addEventListener('mousedown', handleStart);

        pin.addEventListener('touchmove', handleMove, {passive: false});
        pin.addEventListener('mousemove', handleMove);

        pin.addEventListener('touchend', handleEnd);
        pin.addEventListener('mouseup', handleEnd);

        // 防止触摸时的默认行为
        pin.addEventListener('touchcancel', () => {
            clearTimeout(longPressTimer);
            if (isDraggingPin && draggedPin === pin) {
                endDragging();
            }
        });
    });
}

// 开始拖动
function startDragging(pin, touch) {
    isDraggingPin = true;
    draggedPin = pin;
    pin.classList.add('dragging');

    const mapContainer = document.getElementById('mapContainer');
    const rect = mapContainer.getBoundingClientRect();
    const pinRect = pin.getBoundingClientRect();

    // 计算偏移量
    dragOffset.x = touch.clientX - pinRect.left;
    dragOffset.y = touch.clientY - pinRect.top;

    // 添加全局移动和释放监听
    document.addEventListener('touchmove', globalDragMove, {passive: false});
    document.addEventListener('mousemove', globalDragMove);
    document.addEventListener('touchend', globalDragEnd);
    document.addEventListener('mouseup', globalDragEnd);
}

// 全局拖动移动
function globalDragMove(e) {
    if (!isDraggingPin || !draggedPin) return;
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    updateDragPosition(touch);
}

// 更新拖动位置
function updateDragPosition(touch) {
    if (!draggedPin) return;

    const mapContainer = document.getElementById('mapContainer');
    const rect = mapContainer.getBoundingClientRect();

    // 计算新位置（百分比）
    let x = ((touch.clientX - rect.left) / rect.width) * 100;
    let y = ((touch.clientY - rect.top) / rect.height) * 100;

    // 限制在地图范围内
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    // 更新DOM位置
    draggedPin.style.left = x + '%';
    draggedPin.style.top = y + '%';

    // 更新数据
    const pinId = draggedPin.dataset.pinId;
    const pinData = mapPins.find(p => p.id === pinId);
    if (pinData) {
        pinData.x = x;
        pinData.y = y;
    }
}

// 全局拖动结束
function globalDragEnd() {
    if (isDraggingPin) {
        endDragging();
    }
}

// 结束拖动
function endDragging() {
    if (draggedPin) {
        draggedPin.classList.remove('dragging');
    }

    isDraggingPin = false;
    draggedPin = null;

    // 移除全局监听
    document.removeEventListener('touchmove', globalDragMove);
    document.removeEventListener('mousemove', globalDragMove);
    document.removeEventListener('touchend', globalDragEnd);
    document.removeEventListener('mouseup', globalDragEnd);

    // 隐藏提示
    hideDragHint();

    // 自动保存
    saveMapData();
}

// 显示拖动提示
function showDragHint() {
    const hint = document.getElementById('mapDragHint');
    if (hint) {
        hint.textContent = '拖动到新位置';
        hint.classList.add('show');
    }
}

// 隐藏拖动提示
function hideDragHint() {
    const hint = document.getElementById('mapDragHint');
    if (hint) {
        hint.classList.remove('show');
    }
}

// 编辑大头针
function editMapPin(pinId) {
    if (isDraggingPin) return; // 拖动时不打开编辑

    currentEditingPin = mapPins.find(p => p.id === pinId);
    if (!currentEditingPin) return;

    // 填充表单
    document.getElementById('locationName').value = currentEditingPin.name;
    document.getElementById('locationDesc').value = currentEditingPin.description;
    document.getElementById('locationType').value = currentEditingPin.type;

    // 显示弹窗
    document.getElementById('locationModal').classList.add('show');
}

// 关闭地点编辑弹窗
function closeLocationModal() {
    document.getElementById('locationModal').classList.remove('show');
    currentEditingPin = null;
}

// 保存地点信息
function saveLocation() {
    if (!currentEditingPin) return;

    // 更新数据
    currentEditingPin.name = document.getElementById('locationName').value.trim() || '未命名地点';
    currentEditingPin.description = document.getElementById('locationDesc').value.trim();
    currentEditingPin.type = document.getElementById('locationType').value;

    // 重新渲染
    renderMapPins();
    setupMapDragListeners();

    // 关闭弹窗
    closeLocationModal();

    // 自动保存
    saveMapData();

    // 显示成功提示
    showSuccessModal('保存成功', '地点信息已更新');
}

// 删除地点
function deleteLocation() {
    if (!currentEditingPin) return;

    if (confirm('确定要删除这个地点吗？')) {
        mapPins = mapPins.filter(p => p.id !== currentEditingPin.id);
        renderMapPins();
        setupMapDragListeners();
        closeLocationModal();

        // 自动保存
        saveMapData();

        showSuccessModal('删除成功', '地点已移除');
    }
}

/**
 * 保存地图数据 (已修复)
 */
function saveMapData() {
    if (!currentWorldId) {
        // [优化] 如果没有世界ID，给用户一个明确的提示
        showSuccessModal('保存失败', '未选择当前世界，无法保存地图数据!', 2000);
        console.error('错误：没有选择世界，无法保存');
        return;
    }

    // 保存到localStorage
    localStorage.setItem(`mapPins_${currentWorldId}`, JSON.stringify(mapPins));
    console.log('地图数据已成功保存');

    // ▼▼▼ 核心修复：在这里调用成功弹窗函数 ▼▼▼
    showSuccessModal('保存成功', '地图数据已更新！');
    // ▲▲▲ 修复结束 ▲▲▲
}

// 打开世界书绑定
function openWorldbookBinding() {
    alert('世界书绑定功能开发中...');
}

// 打开世界设定编辑 (无提示版)
function openWorldSettings() {
    // 直接查找当前世界，如果没找到（极罕见情况），直接静默返回或打印日志，不打扰用户
    const world = worldsData.find(w => w.id === currentWorldId);
    if (!world) {
        console.warn('Open Settings: No current world found.');
        return;
    }
    // 填充当前世界的数据
    document.getElementById('worldSettingsName').value = world.name || '';
    document.getElementById('worldSettingsDesc').value = world.description || '';
    document.getElementById('worldSettingsStyle').value = world.style || 'fantasy';
    document.getElementById('worldSettingsRules').value = world.rules || '';
    document.getElementById('worldSettingsSpecial').value = world.special || '';
    // 显示页面
    document.getElementById('worldSettingsPage').classList.add('show');
}

// 关闭世界设定编辑
function closeWorldSettings() {
    document.getElementById('worldSettingsPage').classList.remove('show');
}

// 保存世界设定 (无提示版)
function saveWorldSettings() {
    const world = worldsData.find(w => w.id === currentWorldId);
    if (!world) return;
    // 获取表单数据
    const name = document.getElementById('worldSettingsName').value.trim();
    const description = document.getElementById('worldSettingsDesc').value.trim();
    const style = document.getElementById('worldSettingsStyle').value;
    const rules = document.getElementById('worldSettingsRules').value.trim();
    const special = document.getElementById('worldSettingsSpecial').value.trim();
    if (!name) {
        showSuccessModal('提示', '世界名称不能为空哦', 1500);
        return;
    }
    // 更新世界数据
    world.name = name;
    world.description = description;
    world.style = style;
    world.rules = rules;
    world.special = special;
    // 保存到localStorage
    saveWorldsData();
    // 关闭页面并显示成功提示
    closeWorldSettings();
    showSuccessModal('保存成功', '世界设定已更新！');
}

/**
 * 编辑猫咪状态数值
 */
function editCatStat(event, statName) {
    event.stopPropagation();
    event.preventDefault();  // ✅ 新增：阻止默认行为

    const statLabels = {
        'happiness': '😊 开心度',
        'hunger': '🍖 饱食度',
        'energy': '⚡ 精力值',
        'cleanliness': '✨ 清洁度'
    };

    const valueEl = document.getElementById(`stat-${statName}-value`);
    const barEl = document.getElementById(`stat-${statName}-bar`);

    const currentValue = parseInt(valueEl.textContent);

    const newValue = prompt(
        `请输入${statLabels[statName]}的数值（0-100）：`,
        currentValue
    );

    if (newValue !== null) {
        let numValue = parseInt(newValue);

        // 数值验证
        if (isNaN(numValue)) {
            alert('请输入有效的数字！');
            return;
        }

        // 限制范围
        numValue = Math.max(0, Math.min(100, numValue));

        // 更新UI
        valueEl.textContent = numValue + '%';
        barEl.style.width = numValue + '%';

        // 保存到localStorage
        saveCatStats(statName, numValue);

        // 根据数值显示不同反馈
        showStatFeedback(statName, numValue);
    }
}

/**
 * 保存猫咪状态到localStorage
 */
function saveCatStats(statName, value) {
    const stats = JSON.parse(localStorage.getItem('catWidgetStats') || '{}');
    stats[statName] = value;
    localStorage.setItem('catWidgetStats', JSON.stringify(stats));
}

/**
 * 根据状态值显示反馈
 */
function showStatFeedback(statName, value) {
    const bubble = document.querySelector('.cat-speech-bubble');
    if (!bubble) return;

    const feedbacks = {
        'happiness': {
            high: '喵~ 好开心呀！✨',
            medium: '今天心情还不错~ 😊',
            low: '有点不开心... 😿'
        },
        'hunger': {
            high: '吃饱饱啦！🍖✨',
            medium: '还能再吃一点~ 😋',
            low: '好饿啊... 给我吃的！😿'
        },
        'energy': {
            high: '精力充沛！冲鸭！⚡',
            medium: '还行，可以玩会儿~ 😺',
            low: '好累... 想睡觉了 😴'
        },
        'cleanliness': {
            high: '干干净净真舒服！✨',
            medium: '该洗澡澡了~ 🛁',
            low: '脏兮兮的... 快帮我洗澡！💦'
        }
    };

    let level = 'high';
    if (value < 30) level = 'low';
    else if (value < 70) level = 'medium';

    bubble.textContent = feedbacks[statName][level];
    localStorage.setItem('catWidgetSpeech', bubble.textContent);
}

/**
 * 加载猫咪状态数据
 */
function loadCatStats() {
    const savedStats = localStorage.getItem('catWidgetStats');
    if (!savedStats) return;

    try {
        const stats = JSON.parse(savedStats);

        Object.keys(stats).forEach(statName => {
            const value = stats[statName];
            const valueEl = document.getElementById(`stat-${statName}-value`);
            const barEl = document.getElementById(`stat-${statName}-bar`);

            if (valueEl && barEl) {
                valueEl.textContent = value + '%';
                barEl.style.width = value + '%';
            }
        });
    } catch (e) {
        console.error('加载猫咪状态失败:', e);
    }
}


/**
 * 编辑小猫说的话
 */
function editCatSpeech(event) {
    event.stopPropagation();
    event.preventDefault();  // ✅ 新增：阻止默认行为
    const bubbleEl = event.target;
    const currentSpeech = bubbleEl.textContent;

    const newSpeech = prompt('小猫想说什么呢？', currentSpeech);

    if (newSpeech !== null && newSpeech.trim()) {
        bubbleEl.textContent = newSpeech.trim();
        // 保存到 localStorage
        localStorage.setItem('catWidgetSpeech', newSpeech.trim());
    }
}

/**
 * 加载小猫组件的保存数据
 */
/**
 * 加载小猫组件的保存数据
 */
function loadCatWidgetData() {
    const savedStatus = localStorage.getItem('catWidgetStatus');
    const savedSpeech = localStorage.getItem('catWidgetSpeech');

    // 加载状态文字（已废弃，但保留兼容性）
    if (savedStatus) {
        const statusEl = document.querySelector('.cat-status');
        if (statusEl) statusEl.textContent = '心情: ' + savedStatus;
    }

    // 加载对话内容
    if (savedSpeech) {
        const bubbleEl = document.querySelector('.cat-speech-bubble');
        if (bubbleEl) bubbleEl.textContent = savedSpeech;
    }

    // ✨ 新增：加载状态条数据
    loadCatStats();
}

/* ▼▼▼ 步骤三：在这里粘贴新的JavaScript代码 ▼▼▼ */

// ========== 密友聊天背景功能 - 开始 ==========

/**
 * 应用密友聊天背景图的核心函数
 * @param {string} imageUrl - 图片的URL或Base64数据。如果为空字符串，则恢复默认背景。
 */
function applySweetheartChatBackground(imageUrl) {
    const chatPage = document.getElementById('sweetheartChatPage');
    if (!chatPage) return;

    if (imageUrl) {
        // 设置背景图片
        chatPage.style.backgroundImage = `url('${imageUrl}')`;
        // 使用 localStorage 保存用户的选择
        localStorage.setItem('sweetheartChatBackground', imageUrl);
        showChatBgStatus('背景已应用', 'sweetheart');
    } else {
        // 恢复默认背景
        chatPage.style.backgroundImage = '';
        localStorage.removeItem('sweetheartChatBackground');
        // 使用你现有的成功提示框
        showSuccessModal('操作成功', '已恢复为密友专属默认背景。');
    }
}

/**
 * 从本地文件上传处理函数
 * @param {Event} event - 文件输入框的change事件对象
 */
function handleSweetheartChatBgUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 使用FileReader将图片转为Base64，以便保存和预览
    const reader = new FileReader();
    reader.onload = (e) => {
        // 调用核心函数应用背景
        applySweetheartChatBackground(e.target.result);
    };
    reader.onerror = () => {
        showChatBgStatus('读取文件失败', 'sweetheart', 'error');
    };
    reader.readAsDataURL(file);
}

/**
 * 切换URL输入框的显示/隐藏
 */
function toggleSweetheartChatBgUrlInput() {
    const urlBox = document.getElementById('sweetheart-chat-bg-url-box');
    if (urlBox) {
        urlBox.classList.toggle('show');
    }
}

/**
 * 从URL输入框应用背景图
 */
function applySweetheartChatBgFromUrl() {
    const urlInput = document.getElementById('sweetheart-chat-bg-url-input');
    if (!urlInput) return;

    const url = urlInput.value.trim();
    if (url) {
        applySweetheartChatBackground(url);
        urlInput.value = '';
        toggleSweetheartChatBgUrlInput(); // 应用后自动隐藏输入框
    } else {
        showChatBgStatus('请输入有效的URL', 'sweetheart', 'error');
    }
}

/**
 * 在UI上显示状态消息 (这是一个辅助函数，可以复用)
 * @param {string} message - 要显示的消息
 * @param {string} context - 上下文 ('chat' 或 'sweetheart')，用于定位正确的元素
 * @param {string} type - 消息类型 ('success' 或 'error')
 */
function showChatBgStatus(message, context, type = 'success') {
    const statusEl = document.getElementById(`${context}-chat-bg-status`);
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'status-message' + (type === 'error' ? ' error' : '');
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
    }
}


/**
 * 加载已保存的密友聊天背景图 (这个函数需要在应用初始化时调用)
 */
function loadSweetheartChatBackground() {
    const savedBg = localStorage.getItem('sweetheartChatBackground');
    if (savedBg) {
        // 注意：这里我们只调用应用函数，它会处理好一切
        applySweetheartChatBackground(savedBg);
    }
}

// ========== 密友聊天背景功能 - 结束 ==========
// ========== 气泡库增强版功能 - 开始 ==========

const DEFAULT_PRESETS = [
    // --- 普通聊天预设 ---
    {
        id: 'default_normal_001',
        name: '简约黑白',
        chatType: 'normal',
        isDefault: true,
        sentCode: `background: #333;
color: white;
border-radius: 16px;`,
        receivedCode: `background: #f1f1f1;
color: #333;
border-radius: 16px;`
    },
    {
        id: 'default_normal_002',
        name: '清新绿野',
        chatType: 'normal',
        isDefault: true,
        sentCode: `background: linear-gradient(135deg, #66BB6A, #43A047);
color: white;
border-radius: 20px 20px 5px 20px;`,
        receivedCode: `background: #F1F8E9;
color: #388E3C;
border: 1px solid #DCEDC8;
border-radius: 20px 20px 20px 5px;`
    },
    {
        id: 'default_normal_003',
        name: '暗夜星空',
        chatType: 'normal',
        isDefault: true,
        sentCode: `background: linear-gradient(135deg, #434343, #000000);
color: #EAEAEA;
border: 1px solid #555;
border-radius: 10px;`,
        receivedCode: `background: #2E2E2E;
color: #CCCCCC;
border-radius: 10px;`
    },

    // --- 密友聊天预设 ---
    {
        id: 'default_sweetheart_001',
        name: '甜心粉兔',
        chatType: 'sweetheart',
        isDefault: true,
        sentCode: `background: #FFC0CB;
color: #A52A2A;
border-radius: 18px 18px 4px 18px;
box-shadow: 0 4px 8px rgba(255, 192, 203, 0.5), inset 0 0 5px rgba(255,255,255,0.5);`,
        receivedCode: `background: #FFF0F5;
color: #DB7093;
border: 2px dashed #FFD1DC;
border-radius: 18px 18px 18px 4px;`
    },
    {
        id: 'default_sweetheart_002',
        name: '复古信纸',
        chatType: 'sweetheart',
        isDefault: true,
        sentCode: `background: #FDF5E6;
color: #8B4513;
border: 1px solid #DEB887;
border-radius: 8px;
font-family: 'Georgia', serif;`,
        receivedCode: `background: #FAF0E6;
color: #A0522D;
border: 1px solid #D2B48C;
border-radius: 8px;
font-family: 'Georgia', serif;`
    }
];

// 示例代码库
const BUBBLE_EXAMPLES = {
    normal: {
        sent: `background: linear-gradient(135deg, #0A84FF, #0066CC);
color: white;
border-radius: 20px 20px 5px 20px;
padding: 12px;
box-shadow: 0 2px 8px rgba(10, 132, 255, 0.3);`,
        received: `background: #e9e9eb;
color: #000;
border-radius: 20px 20px 20px 5px;
padding: 12px;
box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);`
    },
    sweetheart: {
        sent: `background: linear-gradient(135deg, #FFB6C1, #FF9AAD);
color: white;
border-radius: 20px 20px 5px 20px;
padding: 12px;
box-shadow: 0 3px 8px rgba(255, 182, 193, 0.3);`,
        received: `background: #FFFFFF;
color: #8D6E63;
border: 1px solid #FFE4E9;
border-radius: 20px 20px 20px 5px;
padding: 12px;
box-shadow: 0 2px 6px rgba(161, 136, 127, 0.08);`
    }
};

/**
 * 打开气泡库页面
 */
function openBubbleLibrary() {
    const page = document.getElementById('bubbleLibraryPage');
    page.classList.add('show');
    loadBubblePresets('normal');
    loadBubblePresets('sweetheart');
    // 首次打开时，加载当前已应用的样式到编辑框和预览
    loadCurrentStylesToEditor();
}

/**
 * 关闭气泡库页面
 */
function closeBubbleLibrary() {
    document.getElementById('bubbleLibraryPage').classList.remove('show');
}

/**
 * 切换Tab
 */
function switchBubbleTab(tabName) {
    document.querySelectorAll('.bubble-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.getElementById('normalBubbleEditor').style.display =
        tabName === 'normal' ? 'block' : 'none';
    document.getElementById('sweetheartBubbleEditor').style.display =
        tabName === 'sweetheart' ? 'block' : 'none';
}

/**
 * 加载示例代码
 */
function loadBubbleExample(chatType, bubbleType) {
    const example = BUBBLE_EXAMPLES[chatType][bubbleType];
    const inputId = `${chatType}${bubbleType.charAt(0).toUpperCase() + bubbleType.slice(1)}BubbleCode`;
    document.getElementById(inputId).value = example;
    // 触发input事件以更新预览
    document.getElementById(inputId).dispatchEvent(new Event('input'));
}

/**
 * 实时预览气泡样式（在预览框中）
 */
function previewBubbleStyle(chatType) {
    const sentCode = document.getElementById(`${chatType}SentBubbleCode`).value;
    const receivedCode = document.getElementById(`${chatType}ReceivedBubbleCode`).value;

    const sentPreview = document.querySelector(`#${chatType}SentPreview .preview-bubble`);
    const receivedPreview = document.querySelector(`#${chatType}ReceivedPreview .preview-bubble`);

    // 清除旧样式再应用新样式
    sentPreview.style.cssText = '';
    sentPreview.style.cssText = sentCode;

    receivedPreview.style.cssText = '';
    receivedPreview.style.cssText = receivedCode;
}

/**
 * 保存为预设
 */
function saveBubblePreset(chatType) {
    const sentCode = document.getElementById(`${chatType}SentBubbleCode`).value.trim();
    const receivedCode = document.getElementById(`${chatType}ReceivedBubbleCode`).value.trim();

    if (!sentCode && !receivedCode) {
        alert('没有可保存的样式代码！');
        return;
    }

    const defaultName = `我的预设 ${new Date().toLocaleDateString()}`;
    const presetName = prompt('请为这个预设命名：', defaultName);

    if (!presetName) return;

    const preset = {
        id: 'preset_' + Date.now(),
        name: presetName,
        sentCode: sentCode,
        receivedCode: receivedCode,
        timestamp: Date.now()
    };

    const storageKey = `bubblePresets_${chatType}`;
    let presets = JSON.parse(localStorage.getItem(storageKey) || '[]');
    presets.unshift(preset); // 新的预设放在最前面
    localStorage.setItem(storageKey, JSON.stringify(presets));

    loadBubblePresets(chatType);

    showSuccessModal('保存成功', `预设"${presetName}"已保存！`);
}

/**
 * 加载预设列表（增强版：包含内置预设）
 */
function loadBubblePresets(chatType) {
    const storageKey = `bubblePresets_${chatType}`;

    // 1. 获取内置预设
    const defaultPresets = DEFAULT_PRESETS.filter(p => p.chatType === chatType);

    // 2. 获取用户自定义预设
    const userPresets = JSON.parse(localStorage.getItem(storageKey) || '[]');

    // 3. 合并两个列表
    const allPresets = [...defaultPresets, ...userPresets];

    const listContainer = document.getElementById(`${chatType}PresetList`);

    if (allPresets.length === 0) {
        listContainer.innerHTML = '<div class="preset-empty">暂无保存的预设</div>';
        return;
    }

    listContainer.innerHTML = '';

    allPresets.forEach(preset => {
        const card = document.createElement('div');
        card.className = 'preset-card';

        // 如果是用户预设，才显示日期
        const dateStr = preset.isDefault ? '' : new Date(preset.timestamp).toLocaleDateString();

        // **核心改动**：如果是内置预设，显示“内置”标签；否则显示“删除”按钮
        const actionButtonHtml = preset.isDefault
            ? `<div class="preset-tag">内置</div>`
            : `<button class="preset-btn delete-btn" onclick="deleteBubblePreset('${chatType}', '${preset.id}')">
                × 删除
               </button>`;

        card.innerHTML = `
            <div class="preset-card-header">
                <div class="preset-name">${escapeHTML(preset.name)}</div>
                <div class="preset-date">${dateStr}</div>
            </div>
            <div class="preset-preview-mini">
                <div class="mini-bubble sent" style="${preset.sentCode}">发送</div>
                <div class="mini-bubble received" style="${preset.receivedCode}">接收</div>
            </div>
            <div class="preset-actions">
                <button class="preset-btn apply-btn" onclick="applyBubblePreset('${chatType}', '${preset.id}')">
                    ✓ 应用
                </button>
                ${actionButtonHtml}
            </div>
        `;

        listContainer.appendChild(card);
    });
}

/**
 * 应用预设（增强版：能应用内置预设）
 */
function applyBubblePreset(chatType, presetId) {
    // 1. 从内置预设中查找
    let preset = DEFAULT_PRESETS.find(p => p.id === presetId);

    // 2. 如果没找到，再从用户自定义预设中查找
    if (!preset) {
        const storageKey = `bubblePresets_${chatType}`;
        const presets = JSON.parse(localStorage.getItem(storageKey) || '[]');
        preset = presets.find(p => p.id === presetId);
    }

    if (!preset) {
        alert('预设不存在！');
        return;
    }

    // --- 后续逻辑与之前完全相同 ---

    const prefix = chatType === 'normal' ? '.chat-page' : '.sweetheart-chat-page';
    let styleId = `customBubbleStyle_${chatType}`;
    let styleEl = document.getElementById(styleId);

    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
    }

    let css = '';
    if (preset.sentCode) {
        css += `${prefix} .message-row.sent .chat-bubble { ${preset.sentCode} }\n`;
    }
    if (preset.receivedCode) {
        css += `${prefix} .message-row.received .chat-bubble { ${preset.receivedCode} }\n`;
    }

    styleEl.textContent = css;

    document.getElementById(`${chatType}SentBubbleCode`).value = preset.sentCode;
    document.getElementById(`${chatType}ReceivedBubbleCode`).value = preset.receivedCode;

    previewBubbleStyle(chatType);
    showSuccessModal('应用成功', `已应用预设"${preset.name}"！`);
}

/**
 * 核心函数：将CSS应用到页面
 */
function applyStyleToPage(chatType, sentCode, receivedCode) {
    let styleId = `customBubbleStyle_${chatType}`;
    let styleEl = document.getElementById(styleId);

    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
    }

    // 移除之前的预览样式
    const previewStyle = document.getElementById('bubblePreviewStyle');
    if (previewStyle) previewStyle.textContent = '';

    const prefix = chatType === 'normal' ? '.chat-page' : '.sweetheart-chat-page';

    let css = '';
    css += `${prefix} .message-row.sent .chat-bubble { ${sentCode || ''} }\n`;
    css += `${prefix} .message-row.received .chat-bubble { ${receivedCode || ''} }\n`;

    styleEl.textContent = css;
}

/**
 * 删除预设
 */
function deleteBubblePreset(chatType, presetId) {
    const storageKey = `bubblePresets_${chatType}`;
    let presets = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    if (!confirm(`确定要删除预设 "${preset.name}" 吗？`)) return;

    presets = presets.filter(p => p.id !== presetId);
    localStorage.setItem(storageKey, JSON.stringify(presets));

    loadBubblePresets(chatType);
    showSuccessModal('删除成功', '预设已删除。');
}

/**
 * 清空当前输入并重置预览
 */
function resetBubbleStyle(chatType) {
    if (!confirm('确定要清空当前输入框并恢复默认预览吗？')) return;

    ['sent', 'received'].forEach(bubbleType => {
        const inputId = `${chatType}${bubbleType.charAt(0).toUpperCase() + bubbleType.slice(1)}BubbleCode`;
        document.getElementById(inputId).value = '';
        document.getElementById(inputId).dispatchEvent(new Event('input'));
    });
}

/**
 * 加载所有已应用的样式
 */
function loadSavedBubbleStyles() {
    ['normal', 'sweetheart'].forEach(chatType => {
        const saved = localStorage.getItem(`activeBubbleStyle_${chatType}`);
        if (saved) {
            try {
                const {sent, received} = JSON.parse(saved);
                applyStyleToPage(chatType, sent, received);
            } catch (e) {
                console.error('加载气泡样式失败:', e);
            }
        }
    });
}

/**
 * 将当前已应用的样式加载到编辑框中
 */
function loadCurrentStylesToEditor() {
    ['normal', 'sweetheart'].forEach(chatType => {
        const saved = localStorage.getItem(`activeBubbleStyle_${chatType}`);
        if (saved) {
            try {
                const {sent, received} = JSON.parse(saved);
                const sentInput = document.getElementById(`${chatType}SentBubbleCode`);
                const receivedInput = document.getElementById(`${chatType}ReceivedBubbleCode`);
                sentInput.value = sent || '';
                receivedInput.value = received || '';
                sentInput.dispatchEvent(new Event('input'));
                receivedInput.dispatchEvent(new Event('input'));
            } catch (e) {
            }
        }
    });
}

/**
 * 设置实时预览监听器
 */
function setupLivePreviewListeners() {
    ['normal', 'sweetheart'].forEach(chatType => {
        document.getElementById(`${chatType}SentBubbleCode`).addEventListener('input', () => previewBubbleStyle(chatType));
        document.getElementById(`${chatType}ReceivedBubbleCode`).addEventListener('input', () => previewBubbleStyle(chatType));
    });
}

// ========== 气泡库增强版功能 - 结束 ==========

/**
 * 🧪 测试状态更新功能
 */
function testStatusUpdate() {
    const testJSON = {
        "reply": "宝宝...测试中...💕",
        "status": {
            "character": {
                "location": "在温暖的被窝里",
                "appearance": "穿着粉色睡衣",
                "action": "正在想你",
                "thoughts": "好想抱抱你...",
                "private_thoughts": "身体有点发烫..."
            },
            "user": {
                "location": "应该在工作吧",
                "appearance": "穿着帅气的衬衫",
                "action": "认真工作的样子",
                "features": "脖子上我昨天留下的吻痕还在吗？"
            }
        }
    };

    console.log("🧪 开始测试状态更新...");
    console.log("测试数据:", testJSON);

    // 调用更新函数
    updateStatusPopup(testJSON.status);

    // 打开状态弹窗
    openStatusPopup();

    alert("✅ 测试完成！请查看状态弹窗是否正确显示。");
}

// ========================================================================
// ========== 联系人库 (管理/选择双模式) 功能 - 完整且无省略 ==========
// ========================================================================

/**
 * 全局变量，用于标记联系人库的当前模式。
 * 'edit': 管理模式，从设置进入，点击联系人进行编辑。
 * 'select': 选择模式，从通讯录进入，点击联系人创建新的聊天实例。
 */
let contactLibraryMode = 'edit';

/**
 * 打开联系人库的核心函数。
 * @param {'edit' | 'select'} mode - 指定打开的模式。
 */
function openContactLibrary(mode = 'edit') {
    contactLibraryMode = mode;
    const page = document.getElementById('contactLibraryPage');
    const title = document.getElementById('contactLibraryTitle');

    // 修改标题逻辑
    if (mode === 'select' || mode === 'selectForSweetheart') {
        title.textContent = '选择联系人';
    } else if (mode === 'discuss') {
        title.textContent = '与谁讨论剧情？'; // ✨ 新增标题
    } else {
        title.textContent = '联系人库';
    }

    page.classList.add('show');
    renderContactLibrary();
}

/**
 * [已修复] 关闭联系人库页面
 * 修复了从设置进入后返回会跳转到密友列表的问题
 */
function closeContactLibrary() {
    if (isMultiSelectMode) {
        exitMultiSelectMode();
    }

    document.getElementById('contactLibraryPage').classList.remove('show');
    document.getElementById('contactLibrarySearch').value = '';

    // 1. 如果是剧情讨论模式，什么都不做，停留在当前（小说）页面
    if (contactLibraryMode === 'discuss') {
        return;
    }

    // 2. ✨ 核心修复：如果是从设置进来的（编辑模式），直接返回（停留在设置页），不跳转
    if (contactLibraryMode === 'edit') {
        return;
    }

    // 3. 如果是从“选择密友”进来的，返回时回到密友列表
    if (contactLibraryMode === 'selectForSweetheart') {
        setTimeout(() => {
            openSweetheartList();
        }, 300);
        return;
    }

    // 4. 如果是从“选择普通联系人”进来的，返回时回到普通通讯录
    if (contactLibraryMode === 'select') {
        setTimeout(() => {
            openContacts();
        }, 300);
        return;
    }

    // 5. 兜底逻辑：如果以上都不是，且有世界ID，才跳转到世界首页
    if (currentWorldId) {
        setTimeout(() => {
            openWorldSelect();
        }, 300);
    }
}

/**
 * 渲染联系人库的列表内容 (已修复：支持剧情讨论模式)
 */
function renderContactLibrary() {
    const container = document.getElementById('contactLibraryList');
    container.innerHTML = '';

    const allContactsMap = new Map();

    // 1. 添加密友列表中的源联系人
    sweetheartContactsData.forEach(contact => {
        if (!contact.id.includes('_')) {
            allContactsMap.set(contact.id, {...contact, type: 'sweetheart'});
        }
    });

    // 2. 添加普通联系人列表中的源联系人
    contactsData.forEach(contact => {
        if (!contact.id.includes('_') && !allContactsMap.has(contact.id)) {
            allContactsMap.set(contact.id, {...contact, type: 'normal'});
        }
    });

    // 3. 添加仅存在于库中的联系人
    libraryOnlyContactsData.forEach(contact => {
        if (!allContactsMap.has(contact.id)) {
            allContactsMap.set(contact.id, {...contact, type: 'library-only'});
        }
    });

    const allContacts = Array.from(allContactsMap.values())
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    if (allContacts.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 60px 20px; color: #999; font-size: 14px;">空空如也~<br/>请先创建一个联系人。</div>';
        return;
    }

    allContacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'contact-library-item';
        item.dataset.contactId = contact.id;

        const isUrl = contact.avatar && (String(contact.avatar).startsWith('http') || String(contact.avatar).startsWith('data:'));
        const avatarContent = isUrl
            ? `<img src="${escapeHTML(contact.avatar)}" alt="">`
            : `<span>${escapeHTML(contact.avatar)}</span>`;

        item.innerHTML = `
            <div class="contact-library-avatar">${avatarContent}</div>
            <div class="contact-library-info">
                <div class="contact-library-name">${escapeHTML(contact.name)}</div>
            </div>
            <div class="settings-arrow">›</div>
        `;

        // 🔥🔥🔥 核心修复点在这里 🔥🔥🔥
        if (isMultiSelectMode) {
            item.classList.add('multi-select-mode');
            if (selectedContactIds.has(contact.id)) {
                item.classList.add('selected');
            }
            item.onclick = () => toggleContactSelection(contact.id);
        } else {
            // 原来的代码漏掉了 'discuss' 模式，导致默认进入了 else (编辑模式)
            if (contactLibraryMode === 'select' ||
                contactLibraryMode === 'selectForSweetheart' ||
                contactLibraryMode === 'discuss') { // ✅ 加上这一行！

                item.onclick = () => selectContactFromLibrary(contact);
            } else {
                item.onclick = () => editContactFromLibrary(contact.id, contact.type);
            }
        }

        container.appendChild(item);
    });
}

// ▼▼▼ 请复制并替换这个完整的函数 ▼▼▼

/**
 * [最终增强版] 从联系人库选择联系人
 * 支持：普通选择、密友选择、剧情讨论
 */
function selectContactFromLibrary(sourceContact) {
    const contactId = sourceContact.id;

    // === 新增：处理剧情讨论模式 ===
    if (contactLibraryMode === 'discuss') {
        initiateDiscussChat(sourceContact);
        return;
    }
    // === 结束新增 ===

    // ...以下保持原本的逻辑...
    let targetList, targetName, saveFunc, renderFunc, listPageOpener;

    // (此处保持你原本的 selectForSweetheart / select 判断代码不变)
    if (contactLibraryMode === 'selectForSweetheart') {
        targetList = sweetheartContactsData;
        targetName = '密友列表';
        saveFunc = saveSweetheartContacts;
        renderFunc = renderSweetheartList;
        listPageOpener = openSweetheartList;
    } else {
        targetList = contactsData;
        targetName = '通讯录';
        saveFunc = () => localStorage.setItem('phoneContactsData', JSON.stringify(contactsData));
        renderFunc = () => renderContacts(contactsData);
        listPageOpener = openContacts;
    }

    let wasAddedToGlobalList = false;
    let wasAddedToWorld = false;

    // 步骤1: 检查并添加到全局列表
    // 使用 targetList 的引用
    const alreadyInGlobalList = targetList.some(c => c.id === contactId);
    if (!alreadyInGlobalList) {
        targetList.push({...sourceContact});
        saveFunc();
        wasAddedToGlobalList = true;
    }

    // 步骤2: 检查并添加到当前世界 (仅限密友模式)
    if (contactLibraryMode === 'selectForSweetheart' && currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world) {
            const alreadyInWorld = world.contacts.includes(contactId);
            if (!alreadyInWorld) {
                world.contacts.push(contactId);
                saveWorldsData();
                wasAddedToWorld = true;
            }
        }
    }

    if (wasAddedToGlobalList || wasAddedToWorld) {
        showSuccessModal('添加成功', `已将 "${sourceContact.name}" 添加到${targetName}。`);
    } else {
        showSuccessModal('已存在', `"${sourceContact.name}" 已在当前${targetName}中。`, 2000);
    }

    closeContactLibrary();

    setTimeout(() => {
        listPageOpener();
    }, 350);
}


// ========== 联系人库多选模式功能 ==========

/**
 * [已修复] 进入多选模式
 */
function enterMultiSelectMode() {
    if (isMultiSelectMode) return; // 防止重复进入
    isMultiSelectMode = true;
    selectedContactIds.clear();

    // 更新UI
    document.getElementById('multiSelectToggle').style.display = 'none';
    document.getElementById('multiSelectToolbar').style.display = 'flex';
    document.getElementById('contactLibraryTitle').textContent = '选择联系人';

    // 重新渲染列表以应用多选模式
    renderContactLibrary();
}


/**
 * 退出多选模式
 */
function exitMultiSelectMode() {
    isMultiSelectMode = false;
    selectedContactIds.clear();

    // 恢复UI
    document.getElementById('multiSelectToggle').style.display = 'flex';
    document.getElementById('multiSelectToolbar').style.display = 'none';

    const title = contactLibraryMode === 'select' || contactLibraryMode === 'selectForSweetheart'
        ? '选择联系人'
        : '联系人库';
    document.getElementById('contactLibraryTitle').textContent = title;

    // 重新渲染联系人库以恢复原始状态
    renderContactLibrary();
}

/**
 * 切换单个联系人的选中状态
 */
function toggleContactSelection(contactId) {
    const item = document.querySelector(`.contact-library-item[data-contact-id="${contactId}"]`);
    if (!item) return;

    if (selectedContactIds.has(contactId)) {
        selectedContactIds.delete(contactId);
        item.classList.remove('selected');
    } else {
        selectedContactIds.add(contactId);
        item.classList.add('selected');
    }
}

/**
 * 批量删除选中的联系人
 */
function batchDeleteContacts() {
    if (selectedContactIds.size === 0) {
        alert('请先选择要删除的联系人');
        return;
    }

    const confirmMsg = `确定要删除选中的 ${selectedContactIds.size} 个联系人吗？\n\n删除后将清除所有相关聊天记录。`;
    if (!confirm(confirmMsg)) return;

    selectedContactIds.forEach(contactId => {
        // 从普通列表删除
        contactsData = contactsData.filter(c => c.id !== contactId);
        // 从密友列表删除
        sweetheartContactsData = sweetheartContactsData.filter(c => c.id !== contactId);
        // 🆕 从仅库中列表删除
        libraryOnlyContactsData = libraryOnlyContactsData.filter(c => c.id !== contactId);

        // 删除聊天记录
        const normalHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
        delete normalHistory[contactId];
        localStorage.setItem('phoneChatHistory', JSON.stringify(normalHistory));

        const sweetheartHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
        delete sweetheartHistory[contactId];
        localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(sweetheartHistory));
    });

    // 保存更新
    localStorage.setItem('phoneContactsData', JSON.stringify(contactsData));
    saveSweetheartContacts();
    localStorage.setItem('phoneLibraryOnlyContactsData', JSON.stringify(libraryOnlyContactsData));

    const deletedCount = selectedContactIds.size;
    exitMultiSelectMode();
    showSuccessModal('删除成功', `已删除 ${deletedCount} 个联系人`);
}


/**
 * 批量克隆选中的联系人
 */
function batchCloneContacts() {
    if (selectedContactIds.size === 0) {
        alert('请先选择要克隆的联系人');
        return;
    }

    const confirmMsg = `确定要克隆选中的 ${selectedContactIds.size} 个联系人吗？\n\n克隆后将创建拥有相同信息但ID不同的新联系人，仅存在于联系人库中。`;
    if (!confirm(confirmMsg)) return;

    let clonedCount = 0;

    selectedContactIds.forEach(contactId => {
        let sourceContact = sweetheartContactsData.find(c => c.id === contactId) ||
            contactsData.find(c => c.id === contactId) ||
            libraryOnlyContactsData.find(c => c.id === contactId);

        if (!sourceContact) return;

        const clonedContact = cloneContact(sourceContact);

        // 🆕 修改：只添加到仅库中的数组
        libraryOnlyContactsData.push(clonedContact);

        clonedCount++;
    });

    // 保存到localStorage
    localStorage.setItem('phoneLibraryOnlyContactsData', JSON.stringify(libraryOnlyContactsData));

    const count = selectedContactIds.size;
    exitMultiSelectMode();
    showSuccessModal('克隆成功', `已克隆 ${count} 个联系人，现在只在联系人库中可见。`);
}


/**
 * 克隆单个联系人（核心函数）
 * @param {Object} sourceContact - 原始联系人对象
 * @returns {Object} 克隆后的新联系人
 */
function cloneContact(sourceContact) {
    // 生成新的唯一ID
    const newId = sourceContact.id.startsWith('SH')
        ? 'SH' + Date.now() + Math.floor(Math.random() * 1000)
        : 'ID' + Math.floor(100000 + Math.random() * 900000);

    // 深拷贝所有属性
    const clonedContact = {
        id: newId,
        name: sourceContact.name,
        status: sourceContact.status,
        avatar: sourceContact.avatar,
        // 密友专属属性（如果有）
        ...(sourceContact.personality && {personality: sourceContact.personality}),
        ...(sourceContact.occupation && {occupation: sourceContact.occupation}),
        ...(sourceContact.catchphrase && {catchphrase: sourceContact.catchphrase}),
        ...(sourceContact.history && {history: sourceContact.history}),
        ...(sourceContact.relationship && {relationship: sourceContact.relationship}),
        ...(sourceContact.memoryRounds && {memoryRounds: sourceContact.memoryRounds}),
        // 绑定的世界书（深拷贝数组）
        boundWorldbooks: sourceContact.boundWorldbooks ? [...sourceContact.boundWorldbooks] : []
    };

    console.log(`✅ 克隆成功: ${sourceContact.name} (${sourceContact.id} → ${newId})`);

    return clonedContact;
}


/**
 * 当在“管理”模式下点击联系人时调用此函数。
 * 它的作用是跳转到对应类型的联系人编辑卡片。
 * @param {string} contactId - 被点击联系人的ID。
 * @param {'normal' | 'sweetheart'} type - 被点击联系人的类型。
 */
/**
 * [全新版本] 从联系人库编辑联系人 - 使用统一角色卡
 */
function editContactFromLibrary(contactId, type) {
    // 1. 查找联系人数据
    let contactData;
    if (type === 'sweetheart') {
        contactData = sweetheartContactsData.find(c => c.id === contactId);
    } else if (type === 'library-only') {
        contactData = libraryOnlyContactsData.find(c => c.id === contactId);
    } else {
        contactData = contactsData.find(c => c.id === contactId);
    }

    if (!contactData) {
        console.error("找不到联系人数据:", contactId);
        return;
    }

    // 2. 打开统一角色卡弹窗
    openLibraryCharacterModal(contactData, type);
}

/**
 * 打开联系人库统一角色卡
 */
function openLibraryCharacterModal(contactData, sourceType) {
    renderLibraryMasksList(contactData.boundMasks || []);

    const modal = document.getElementById('libraryCharacterModal');

    // 存储编辑信息
    modal.dataset.editingId = contactData.id;
    modal.dataset.sourceType = sourceType;

    // 填充基础信息
    document.getElementById('library-name').value = contactData.name || '';
    document.getElementById('library-persona').value = contactData.status || '';
    document.getElementById('library-instance-id').textContent = contactData.id;

    // 填充头像
    const avatarPreview = document.getElementById('library-avatar-preview');
    const isUrl = contactData.avatar && (contactData.avatar.startsWith('http') || contactData.avatar.startsWith('data:'));
    avatarPreview.src = isUrl ? contactData.avatar : '';

    // 填充密友专属字段
    document.getElementById('library-personality').value = contactData.personality || '';
    document.getElementById('library-occupation').value = contactData.occupation || '';
    document.getElementById('library-catchphrase').value = contactData.catchphrase || '';
    document.getElementById('library-history').value = contactData.history || '';
    document.getElementById('library-relationship').value = contactData.relationship || '';
    document.getElementById('library-voice-id').value = contactData.voiceId || ''; // <<< 新增：填充 Voice ID

    // 渲染世界书列表
    renderLibraryWorldbooksList(contactData.boundWorldbooks || []);

    // 显示弹窗
    modal.classList.add('show');
}

/**
 * 关闭联系人库统一角色卡
 */
function closeLibraryCharacterModal() {
    const modal = document.getElementById('libraryCharacterModal');
    modal.classList.remove('show');

    // 清理数据
    delete modal.dataset.editingId;
    delete modal.dataset.sourceType;
}

/**
 * 切换密友专属字段
 */
function toggleLibraryExtendedFields() {
    const fields = document.getElementById('library-extended-fields');
    const arrow = document.getElementById('library-extended-arrow');

    if (fields.style.display === 'none') {
        fields.style.display = 'block';
        arrow.classList.add('open');
    } else {
        fields.style.display = 'none';
        arrow.classList.remove('open');
    }
}

/**
 * 切换世界书列表
 */
function toggleLibraryWorldbooks() {
    const list = document.getElementById('library-worldbooks-list');
    const arrow = document.getElementById('library-wb-arrow');

    if (list.style.display === 'none') {
        list.style.display = 'block';
        arrow.classList.add('open');
    } else {
        list.style.display = 'none';
        arrow.classList.remove('open');
    }
}

/**
 * 渲染世界书列表
 */
function renderLibraryWorldbooksList(boundIds = []) {
    const container = document.getElementById('library-worldbooks-list');

    if (worldbookData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-size: 13px;">暂无世界书</div>';
        return;
    }

    container.innerHTML = '';

    worldbookData.forEach(wb => {
        const item = document.createElement('div');
        item.className = 'library-wb-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `library-wb-${wb.id}`;
        checkbox.value = wb.id;
        checkbox.checked = boundIds.includes(wb.id);

        const label = document.createElement('label');
        label.htmlFor = `library-wb-${wb.id}`;
        label.textContent = wb.title;

        item.appendChild(checkbox);
        item.appendChild(label);
        container.appendChild(item);
    });
}

/**
 * 打开头像选择器
 */
function openLibraryAvatarPicker() {
    document.getElementById('library-avatar-input').click();
}

/**
 * 保存联系人库角色数据
 */
function saveLibraryCharacter() {
    const modal = document.getElementById('libraryCharacterModal');
    const contactId = modal.dataset.editingId;
    const sourceType = modal.dataset.sourceType;

    if (!contactId) {
        alert('保存失败：无法获取联系人ID');
        return;
    }

    // 获取基础信息
    const name = document.getElementById('library-name').value.trim();
    const persona = document.getElementById('library-persona').value.trim();

    if (!name) {
        alert('请填写姓名！');
        return;
    }

    if (!persona) {
        alert('请填写基础设定！');
        return;
    }

    // 获取其他信息
    const avatar = document.getElementById('library-avatar-preview').src;
    const personality = document.getElementById('library-personality').value.trim();
    const occupation = document.getElementById('library-occupation').value.trim();
    const catchphrase = document.getElementById('library-catchphrase').value.trim();
    const history = document.getElementById('library-history').value.trim();
    const relationship = document.getElementById('library-relationship').value.trim();
    const voiceId = document.getElementById('library-voice-id').value.trim(); // <<< 新增：获取 Voice ID

    // 获取绑定的世界书
    const boundWorldbooks = [];
    document.querySelectorAll('#library-worldbooks-list input[type="checkbox"]:checked').forEach(cb => {
        boundWorldbooks.push(cb.value);
    });

    // 获取绑定的面具
    const boundMasks = [];
    document.querySelectorAll('#library-masks-list input[type="checkbox"]:checked').forEach(cb => {
        boundMasks.push(cb.value);
    });

    // 组装数据
    const contactData = {
        id: contactId,
        name,
        status: persona,
        avatar: avatar && !avatar.includes('data:image/gif') ? avatar : '👤',
        personality,
        occupation,
        catchphrase,
        history,
        relationship,
        voiceId, // <<< 新增：保存 Voice ID
        boundWorldbooks,
        boundMasks
    };

    // 保存到对应的列表
    if (sourceType === 'sweetheart') {
        const index = sweetheartContactsData.findIndex(c => c.id === contactId);
        if (index !== -1) {
            sweetheartContactsData[index] = contactData;
        }
        saveSweetheartContacts();
        renderSweetheartList();
    } else if (sourceType === 'library-only') {
        const index = libraryOnlyContactsData.findIndex(c => c.id === contactId);
        if (index !== -1) {
            libraryOnlyContactsData[index] = contactData;
        }
        localStorage.setItem('phoneLibraryOnlyContactsData', JSON.stringify(libraryOnlyContactsData));
    } else {
        const index = contactsData.findIndex(c => c.id === contactId);
        if (index !== -1) {
            contactsData[index] = contactData;
        }
        localStorage.setItem('phoneContactsData', JSON.stringify(contactsData));
        renderContacts(contactsData);
    }

    // 刷新联系人库显示
    renderContactLibrary();

    // 关闭弹窗
    closeLibraryCharacterModal();

    showSuccessModal('保存成功', `已更新 ${name} 的信息`);
}

/**
 * 搜索过滤联系人库列表。
 * 在搜索框输入时被调用。
 */
function filterContactLibrary() {
    const searchTerm = document.getElementById('contactLibrarySearch').value.toLowerCase().trim();

    document.querySelectorAll('.contact-library-item').forEach(item => {
        const name = item.querySelector('.contact-library-name').textContent.toLowerCase();
        // 如果名字包含搜索词，则显示，否则隐藏
        item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
    });
}

/**
 * 这是从“普通联系人”页面右上角菜单触发的函数。
 * 它会以“选择”模式打开联系人库。
 */
function selectExistingContact() {
    const menu = document.getElementById('contactMenu');
    if (menu) menu.classList.remove('show');

    openContactLibrary('select');
}

// ========================================================================
// ========== 联系人库功能 - 代码结束 ==========
// ========================================================================
// ===========================================
// ========== 密友聊天 - 世界地图剧情功能 ==========
// ===========================================

let currentMapPins = []; // 用于存储当前地图的地点数据

/**
 * 打开世界地图弹窗
 */
function openWorldMapPopup() {
    const popup = document.getElementById('worldMapPopup');
    if (!currentWorldId) {
        alert('错误：找不到当前所在的世界！');
        return;
    }

    const world = worldsData.find(w => w.id === currentWorldId);
    if (!world || !world.mapUrl) {
        showSuccessModal('提示', '当前世界还没有设置地图哦~', 2000);
        return;
    }

    // 1. 设置地图图片
    const mapImage = document.getElementById('mapPopupImage');
    mapImage.src = world.mapUrl;

    // 2. 加载该世界的地点数据
    const savedPins = localStorage.getItem(`mapPins_${currentWorldId}`);
    if (savedPins) {
        try {
            currentMapPins = JSON.parse(savedPins);
        } catch (e) {
            console.error('解析地图地点数据失败', e);
            currentMapPins = [];
        }
    } else {
        // 如果是默认地图，加载默认地点
        const isDefaultMap = world.mapUrl.includes('1760979959274_qdqqd_m9jrpo.jpg');
        currentMapPins = isDefaultMap ? DEFAULT_MAP_LOCATIONS : [];
    }

    // 3. 渲染地点大头针
    renderMapPinsForPopup();

    // 4. 显示弹窗
    popup.classList.add('show');
}

/**
 * 关闭世界地图弹窗
 */
function closeWorldMapPopup() {
    const popup = document.getElementById('worldMapPopup');
    popup.classList.remove('show');
}

/**
 * 在弹窗中渲染所有地点大头针
 */
function renderMapPinsForPopup() {
    const container = document.getElementById('mapPopupContainer');
    if (!container) return;

    // 先清除旧的大头针
    container.querySelectorAll('.map-popup-pin').forEach(pin => pin.remove());

    if (currentMapPins.length === 0) {
        console.log('当前地图没有可交互的地点。');
        return;
    }

    // 遍历地点数据，创建DOM元素
    currentMapPins.forEach(pin => {
        const pinElement = document.createElement('div');
        pinElement.className = 'map-popup-pin';
        pinElement.style.left = `${pin.x}%`;
        pinElement.style.top = `${pin.y}%`;

        const icons = {
            city: '🏙️',
            village: '🏘️',
            dungeon: '🏰',
            landmark: '⭐',
            other: '📍'
        };

        pinElement.innerHTML = `
            <div class="map-popup-pin-icon">${icons[pin.type] || '📍'}</div>
            <div class="map-popup-pin-label">${escapeHTML(pin.name)}</div>
        `;

        // 为每个大头针绑定点击事件，用于触发剧情
        pinElement.onclick = (event) => triggerLocationPlot(event, pin.id);

        container.appendChild(pinElement);
    });
}

/* ▼▼▼ 用这个新版本替换旧的 triggerLocationPlot 函数 ▼▼▼ */

/**
 * 触发地点剧情的核心函数（记忆互通增强版）
 * @param {Event} event - 点击事件
 * @param {string} pinId - 被点击的地点的ID
 */
async function triggerLocationPlot(event, pinId) {
    event.stopPropagation();

    const pin = currentMapPins.find(p => p.id === pinId);
    if (!pin) {
        console.error('未找到对应的地点数据');
        return;
    }

    if (!currentSweetheartChatContact) {
        console.error('未找到当前密友联系人');
        return;
    }

    const contactId = currentSweetheartChatContact.id;

    // === 步骤1: 获取聊天历史（双份） ===
    // 密友聊天历史
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}')[contactId] || [];
    // 普通聊天历史（背景记忆）
    const normalChatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}')[contactId] || [];

    // 关闭地图弹窗
    closeWorldMapPopup();

    // ✅ 地图触发自动切换到线下模式
    currentChatMode = 'offline';
    updateChatModeButton();

    const messagesEl = document.getElementById('sweetheartChatMessages');
    if (!messagesEl) return;

    // === 步骤2: 创建并保存地点提示消息 ===
    const locationMessage = {
        sender: 'system',
        type: 'location',
        locationName: pin.name,
        locationDesc: pin.description || '一个神秘的地方',
        timestamp: Date.now()
    };

    const newIndex = saveSweetheartMessage(contactId, locationMessage);
    const locationNotice = _createMessageDOM(contactId, locationMessage, newIndex);
    messagesEl.appendChild(locationNotice);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // === 步骤3: 构建发送给AI的完整消息数组 ===
    const messages = [];

    // 3.1 系统提示词（线下模式专用）
    messages.push({
        role: "system",
        content: OFFLINE_MODE_PROMPT
    });

    // 3.2 静态上下文 - 世界书、世界设定、角色设定
    const worldbookContext = gatherWorldbookContext();
    if (worldbookContext) {
        messages.push({role: "system", content: worldbookContext});
    }

    if (currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world) {
            let worldSettingText = `[世界设定]\n世界名称：${world.name}\n`;
            if (world.description) worldSettingText += `描述：${world.description}\n`;
            if (world.rules) worldSettingText += `基本法则：${world.rules}\n`;
            if (world.special) worldSettingText += `特殊设定：${world.special}\n`;
            messages.push({role: "system", content: worldSettingText});
        }
    }

    let characterSetting = `[角色设定]\n姓名：${currentSweetheartChatContact.name}\n`;
    if (currentSweetheartChatContact.status) characterSetting += `基础设定：${currentSweetheartChatContact.status}\n`;
    if (currentSweetheartChatContact.personality) characterSetting += `性格：${currentSweetheartChatContact.personality}\n`;
    if (currentSweetheartChatContact.occupation) characterSetting += `职业：${currentSweetheartChatContact.occupation}\n`;
    if (currentSweetheartChatContact.history) characterSetting += `过去的经历：${currentSweetheartChatContact.history}\n`;
    if (currentSweetheartChatContact.relationship) characterSetting += `与用户的关系：${currentSweetheartChatContact.relationship}\n`;
    messages.push({role: "system", content: characterSetting});

    if (userProfile.persona) {
        messages.push({role: "system", content: `[用户设定]\n昵称：${userProfile.name}\n${userProfile.persona}`});
    }

    if (currentSweetheartChatContact.boundMasks && currentSweetheartChatContact.boundMasks.length > 0) {
        let maskContent = '[用户人设]\n';
        currentSweetheartChatContact.boundMasks.forEach(maskId => {
            const mask = masksData.find(m => m.id === maskId);
            if (mask) maskContent += `${mask.name}: ${mask.content}\n\n`;
        });
        messages.push({role: "system", content: maskContent});
    }

    // [全新添加] 获取实时状态和历史状态，并注入提示词
    const liveStatus = getCurrentLiveStatus();
    const allStatusHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
    const contactStatusHistory = allStatusHistories[contactId] || [];

    const statusContext = formatStatusHistoryForAI(liveStatus, contactStatusHistory);
    if (statusContext) {
        messages.push({role: "system", content: statusContext});
    }


    // ⭐ 3.3 背景信息：从"学习模式"提取历史记录
    if (normalChatHistory.length > 0) {
        const recentNormalChat = normalChatHistory.slice(-10);
        let backgroundInfo = `[背景信息：以下是你和用户在"学习模式"中的最近对话记录，仅供你参考]\n\n`;

        recentNormalChat.forEach((msg) => {
            const sender = msg.sender === 'user' ? '用户' : currentSweetheartChatContact.name;
            const textContent = (msg.text || '').replace(/<[^>]+>/g, '[多媒体内容]');
            backgroundInfo += `${sender}: ${textContent}\n`;
        });

        messages.push({role: "system", content: backgroundInfo});
    }

    // ⭐ 3.4 当前对话历史：遵守记忆轮数设置
    const memoryRounds = currentSweetheartChatContact.memoryRounds || 10;
    let recentMessages = chatHistory.slice(-(memoryRounds * 2));
    const currentUserInput = chatInput.value.trim();
    const conversationHistory = recentMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: (msg.text || '').replace(/<render>[\s\S]*?<\/render>/, '[特殊渲染内容]')
    }));
    messages.push(...conversationHistory);
    // 检查最后一条消息是否是未处理的图片
    const lastMessage = recentMessages.length > 0 ? recentMessages[recentMessages.length - 1] : null;
    let multimodalMessage = null;
    if (lastMessage && lastMessage.sender === 'user' && lastMessage.imageUrl && !lastMessage.isProcessed) {

        console.log("检测到未处理的图片，准备进行多模态识别...");
        // 标记图片为已处理，防止重复发送
        lastMessage.isProcessed = true;
        // 更新本地存储
        const fullHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
        if (fullHistory[contactId]) {
            const msgIndex = fullHistory[contactId].findIndex(msg => msg.timestamp === lastMessage.timestamp);
            if (msgIndex !== -1) {
                fullHistory[contactId][msgIndex].isProcessed = true;
                localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(fullHistory));
            }
        }
        // 构建多模态消息内容
        multimodalMessage = {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: currentUserInput || '分析一下这张图片。' // 如果用户没输入文字，给一个默认提示
                },
                {
                    type: 'image_url',
                    image_url: {
                        url: lastMessage.imageUrl
                    }
                }
            ]
        };
        // 从要发送到API的历史记录中移除最后一条纯图片消息，因为它将被合并后的消息替代
        recentMessages.pop();
    }
    // 将历史消息（可能已移除了最后一条图片消息）添加到API请求中
    recentMessages.forEach(msg => {
        if (msg.type === 'location') {
            messages.push({
                role: 'system',
                content: `[场景变化] 你们来到了【${msg.locationName}】。描述：${msg.locationDesc}`
            });
        } else if (msg.text) {
            messages.push({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text.replace(/<render>[\s\S]*?<\/render>/, '[特殊渲染内容]')
            });
        }
    });
    // 如果有多模态消息，就添加它
    if (multimodalMessage) {
        messages.push(multimodalMessage);
    }
    // 否则，如果只有普通文本输入，就正常添加
    else if (currentUserInput) {
        messages.push({role: 'user', content: currentUserInput});
    }
    // 如果用户有输入，无论是否带图片，都需要在UI上显示这条文本消息并保存
    if (currentUserInput) {
        const messageObj = {sender: 'user', text: currentUserInput};
        const newIndex = saveSweetheartMessage(contactId, messageObj);
        const messageRow = _createMessageDOM(contactId, messageObj, newIndex);
        messagesEl.appendChild(messageRow);
        chatInput.value = '';
    }

    // 3.5 地点触发事件（作为用户输入）
    const plotPrompt = `[地点事件] 我们来到了"${pin.name}"。这里的特点是："${pin.description || '一个神秘的地方'}"。请基于这个场景，生动地描述接下来发生的故事或对话。`;
    messages.push({role: "user", content: plotPrompt});

    // === 步骤4: 显示"思考中"气泡并调用API ===
    console.log('🗺️ 地图触发 - 最终发送给AI的Prompt结构:', messages.map(m => ({
        role: m.role,
        content: m.content.substring(0, 50) + '...'
    })));

    const thinkingBubble = _createMessageDOM(contactId, {sender: 'contact', text: '...'}, -1);
    messagesEl.appendChild(thinkingBubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const result = await callApi(messages);
    thinkingBubble.remove();

    if (!result.success) {
        alert('网络错误：' + result.message);
        return;
    }

    // === 步骤5: 处理AI回复 ===
    const {chatReplyText, statusData} = parseOfflineResponse(result);


    // 将AI回复分段显示
    const segments = chatReplyText.split('---').filter(s => s.trim());
    if (segments.length > 0) {
        for (const segmentText of segments) {
            const messageObj = {sender: 'contact', text: segmentText.trim()};
            const newIndex = saveSweetheartMessage(contactId, messageObj);
            const messageRow = _createMessageDOM(contactId, messageObj, newIndex);
            messagesEl.appendChild(messageRow);
            await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));
        }
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderSweetheartList();
}

/* ▲▲▲ 替换到这里结束 ▲▲▲ */

/**
 * 安全解析线下模式的AI回复
 * @param {Object} result - API返回的结果对象
 * @returns {Object} 包含 chatReplyText 和 statusData 的对象
 */
function parseOfflineResponse(result) {
    let chatReplyText = '';
    let statusData = null;

    if (!result.success) {
        return {
            chatReplyText: `[网络错误] ${result.message}`,
            statusData: null
        };
    }

    try {
        // 1. 首先尝试清理可能的markdown代码块标记
        let cleanedMessage = result.message.trim();

        // 移除可能的 ```json 和 ``` 标记
        cleanedMessage = cleanedMessage.replace(/^```json\s*/i, '');
        cleanedMessage = cleanedMessage.replace(/^```\s*/i, '');
        cleanedMessage = cleanedMessage.replace(/\s*```$/i, '');
        cleanedMessage = cleanedMessage.trim();

        // 2. 尝试解析JSON
        const parsed = JSON.parse(cleanedMessage);

        // 3. 提取回复文本
        chatReplyText = parsed.reply || parsed.message || parsed.text || "...";

        // 4. 提取状态数据
        if (parsed.status && typeof parsed.status === 'object') {
            statusData = parsed.status;
            console.log('✅ 成功解析线下模式状态数据');
        }

    } catch (parseError) {
        console.warn('⚠️ JSON解析失败，尝试智能提取:', parseError.message);

        // 智能降级处理：尝试提取可能的JSON片段
        try {
            const jsonMatch = result.message.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const extracted = JSON.parse(jsonMatch[0]);
                chatReplyText = extracted.reply || extracted.message || result.message;
                statusData = extracted.status || null;
                console.log('✅ 智能提取成功');
            } else {
                // 完全降级：直接使用原始文本
                chatReplyText = result.message;
                console.log('ℹ️ 使用原始文本作为回复');
            }
        } catch (secondError) {
            chatReplyText = result.message;
            console.log('ℹ️ 降级处理：使用原始文本');
        }
    }

    return {chatReplyText, statusData};
}


// ========== 消息多选功能 - 开始 ==========

// 全局变量
let isNormalMultiSelectMode = false; // 普通聊天是否处于多选模式
let isSweetheartMultiSelectMode = false; // 密友聊天是否处于多选模式
let selectedNormalMessageIndexes = new Set(); // 普通聊天选中的消息索引
let selectedSweetheartMessageIndexes = new Set(); // 密友聊天选中的消息索引

/**
 * 进入普通聊天的多选模式
 */
function enterNormalMultiSelectMode() {
    isNormalMultiSelectMode = true;
    selectedNormalMessageIndexes.clear();

    // 切换UI
    document.getElementById('normalHeaderActions').style.display = 'none';
    document.getElementById('normalMultiSelectToolbar').style.display = 'flex';
    document.getElementById('chatContactName').textContent = '选择消息';

    // 为所有消息添加复选框
    addCheckboxesToMessages('normal');

    // 隐藏操作菜单
    hideMessageActionSheet();
}

/**
 * 退出普通聊天的多选模式（修复版）
 */
function exitNormalMultiSelectMode() {
    isNormalMultiSelectMode = false;
    selectedNormalMessageIndexes.clear();

    // 恢复UI
    document.getElementById('normalHeaderActions').style.display = 'flex';
    document.getElementById('normalMultiSelectToolbar').style.display = 'none';
    if (currentChatContact) {
        document.getElementById('chatContactName').textContent = currentChatContact.name;
    }

    // 🔥 核心修复：重新渲染消息列表，恢复所有事件绑定
    if (currentChatContact) {
        const contactId = currentChatContact.id;
        const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
        const messages = chatHistory[contactId] || [];

        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) {
            messagesEl.innerHTML = ''; // 清空
            messages.forEach((msg, index) => {
                const messageRow = _createMessageDOM(contactId, msg, index);
                messagesEl.appendChild(messageRow);
            });
            messagesEl.scrollTop = messagesEl.scrollHeight; // 滚动到底部
        }
    }
}

/**
 * 进入密友聊天的多选模式
 */
function enterSweetheartMultiSelectMode() {
    isSweetheartMultiSelectMode = true;
    selectedSweetheartMessageIndexes.clear();

    // 切换UI
    document.getElementById('sweetheartHeaderActions').style.display = 'none';
    document.getElementById('sweetheartMultiSelectToolbar').style.display = 'flex';
    document.getElementById('sweetheartChatContactName').textContent = '选择消息';

    // 为所有消息添加复选框
    addCheckboxesToMessages('sweetheart');

    // 隐藏操作菜单
    hideSweetheartMessageActionSheet();
}

/**
 * 退出密友聊天的多选模式（修复版）
 */
function exitSweetheartMultiSelectMode() {
    isSweetheartMultiSelectMode = false;
    selectedSweetheartMessageIndexes.clear();

    // 恢复UI
    document.getElementById('sweetheartHeaderActions').style.display = 'flex';
    document.getElementById('sweetheartMultiSelectToolbar').style.display = 'none';
    if (currentSweetheartChatContact) {
        document.getElementById('sweetheartChatContactName').textContent = currentSweetheartChatContact.name;
    }

    // 🔥 核心修复：重新渲染消息列表，恢复所有事件绑定
    if (currentSweetheartChatContact) {
        const contactId = currentSweetheartChatContact.id;
        const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
        const messages = chatHistory[contactId] || [];

        const messagesEl = document.getElementById('sweetheartChatMessages');
        if (messagesEl) {
            messagesEl.innerHTML = ''; // 清空
            messages.forEach((msg, index) => {
                const messageRow = _createMessageDOM(contactId, msg, index);
                messagesEl.appendChild(messageRow);
            });
            messagesEl.scrollTop = messagesEl.scrollHeight; // 滚动到底部
        }
    }
}

/**
 * 为消息添加复选框
 * @param {string} chatType - 'normal' 或 'sweetheart'
 */
function addCheckboxesToMessages(chatType) {
    const messagesContainer = chatType === 'normal'
        ? document.getElementById('chatMessages')
        : document.getElementById('sweetheartChatMessages');

    if (!messagesContainer) return;

    const messageRows = messagesContainer.querySelectorAll('.message-row');

    messageRows.forEach((row, index) => {
        // 添加多选模式类
        row.classList.add('multi-select-mode');

        // 创建复选框容器
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'message-checkbox-container';
        checkboxContainer.dataset.index = index;

        const checkbox = document.createElement('div');
        checkbox.className = 'message-checkbox';

        checkboxContainer.appendChild(checkbox);
        row.insertBefore(checkboxContainer, row.firstChild);

        // 绑定点击事件
        row.onclick = () => toggleMessageSelection(chatType, index, checkbox);
    });
}

/**
 * 移除消息的复选框
 * @param {string} chatType - 'normal' 或 'sweetheart'
 */
function removeCheckboxesFromMessages(chatType) {
    const messagesContainer = chatType === 'normal'
        ? document.getElementById('chatMessages')
        : document.getElementById('sweetheartChatMessages');

    if (!messagesContainer) return;

    const messageRows = messagesContainer.querySelectorAll('.message-row');

    messageRows.forEach(row => {
        row.classList.remove('multi-select-mode');
        const checkboxContainer = row.querySelector('.message-checkbox-container');
        if (checkboxContainer) {
            checkboxContainer.remove();
        }
        row.onclick = null;
    });
}

/**
 * 切换消息的选中状态
 * @param {string} chatType - 'normal' 或 'sweetheart'
 * @param {number} index - 消息索引
 * @param {HTMLElement} checkbox - 复选框元素
 */
function toggleMessageSelection(chatType, index, checkbox) {
    const selectedSet = chatType === 'normal'
        ? selectedNormalMessageIndexes
        : selectedSweetheartMessageIndexes;

    if (selectedSet.has(index)) {
        selectedSet.delete(index);
        checkbox.classList.remove('checked');
    } else {
        selectedSet.add(index);
        checkbox.classList.add('checked');
    }
}

/**
 * 批量删除普通聊天的选中消息（最终修复版）
 */
function batchDeleteNormalMessages() {
    if (selectedNormalMessageIndexes.size === 0) {
        alert('请先选择要删除的消息');
        return;
    }

    if (!confirm(`确定要删除选中的 ${selectedNormalMessageIndexes.size} 条消息吗？`)) {
        return;
    }

    const contactId = currentChatContact.id;
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');

    if (!chatHistory[contactId]) return;

    const indexesToDelete = Array.from(selectedNormalMessageIndexes).sort((a, b) => b - a);

    indexesToDelete.forEach(index => {
        chatHistory[contactId].splice(index, 1);
    });

    try {
        localStorage.setItem('phoneChatHistory', JSON.stringify(chatHistory));

        const deletedCount = indexesToDelete.length;

        // 🔥 核心修复：在这里先清理多选状态，然后再调用 openChat 彻底刷新
        isNormalMultiSelectMode = false;
        selectedNormalMessageIndexes.clear();

        // 恢复UI
        document.getElementById('normalHeaderActions').style.display = 'flex';
        document.getElementById('normalMultiSelectToolbar').style.display = 'none';
        if (currentChatContact) {
            document.getElementById('chatContactName').textContent = currentChatContact.name;
        }

        // 调用 openChat 重新构建整个聊天界面，确保所有事件被正确绑定
        openChat(currentChatContact);

        // 更新联系人列表的最后一条消息
        renderContacts(contactsData);

        showSuccessModal('删除成功', `已删除 ${deletedCount} 条消息`);
    } catch (e) {
        console.error('删除失败:', e);
        alert('删除失败，存储空间可能已满');
    }
}

/**
 * 批量删除密友聊天的选中消息（最终修复版）
 */
function batchDeleteSweetheartMessages() {
    if (selectedSweetheartMessageIndexes.size === 0) {
        alert('请先选择要删除的消息');
        return;
    }

    if (!confirm(`确定要删除选中的 ${selectedSweetheartMessageIndexes.size} 条消息吗？`)) {
        return;
    }

    const contactId = currentSweetheartChatContact.id;
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');

    if (!chatHistory[contactId]) return;

    const indexesToDelete = Array.from(selectedSweetheartMessageIndexes).sort((a, b) => b - a);

    indexesToDelete.forEach(index => {
        chatHistory[contactId].splice(index, 1);
    });

    try {
        localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(chatHistory));

        const deletedCount = indexesToDelete.length;

        // 🔥 核心修复：清理多选状态并恢复UI
        isSweetheartMultiSelectMode = false;
        selectedSweetheartMessageIndexes.clear();

        document.getElementById('sweetheartHeaderActions').style.display = 'flex';
        document.getElementById('sweetheartMultiSelectToolbar').style.display = 'none';
        if (currentSweetheartChatContact) {
            document.getElementById('sweetheartChatContactName').textContent = currentSweetheartChatContact.name;
        }

        // 调用 openSweetheartChat 重新构建整个聊天界面
        openSweetheartChat(currentSweetheartChatContact);

        // 更新密友列表
        renderSweetheartList();

        showSuccessModal('删除成功', `已删除 ${deletedCount} 条消息`);
    } catch (e) {
        console.error('删除失败:', e);
        alert('删除失败，存储空间可能已满');
    }
}

// ========== 消息多选功能 - 结束 ==========

// ========== 面具管理功能 - 开始 ==========

let masksData = []; // 存储所有面具
let currentEditingMaskId = null; // 当前编辑的面具ID

/**
 * 打开面具管理页面
 */
function openMaskLibrary() {
    document.getElementById('maskLibraryPage').classList.add('show');
    renderMaskList();
}

/**
 * 关闭面具管理页面
 */
function closeMaskLibrary() {
    document.getElementById('maskLibraryPage').classList.remove('show');
}

/**
 * 渲染面具列表
 */
function renderMaskList() {
    const listEl = document.getElementById('maskLibraryList');
    const emptyEl = document.getElementById('maskEmpty');

    if (masksData.length === 0) {
        emptyEl.style.display = 'flex';
        // 移除所有面具项
        listEl.querySelectorAll('.mask-item').forEach(item => item.remove());
        return;
    }

    emptyEl.style.display = 'none';

    // 清除旧的面具项
    listEl.querySelectorAll('.mask-item').forEach(item => item.remove());

    // 渲染新的面具列表
    masksData.forEach(mask => {
        const item = document.createElement('div');
        item.className = 'mask-item';
        item.onclick = () => editMask(mask.id);

        const preview = (mask.content || '').substring(0, 60);

        item.innerHTML = `
            <div class="mask-item-header">
                <div class="mask-item-icon">🎭</div>
                <div class="mask-item-title">${escapeHTML(mask.name)}</div>
            </div>
            ${mask.description ? `<div class="mask-item-desc">${escapeHTML(mask.description)}</div>` : ''}
            <div class="mask-item-preview">${escapeHTML(preview)}${preview.length >= 60 ? '...' : ''}</div>
        `;

        listEl.appendChild(item);
    });
}

/**
 * 打开面具编辑弹窗（新建模式）
 */
function openMaskModal() {
    currentEditingMaskId = null;

    document.getElementById('maskModalTitle').textContent = '新建面具';
    document.getElementById('maskName').value = '';
    document.getElementById('maskDesc').value = '';
    document.getElementById('maskContent').value = '';
    document.getElementById('maskDeleteBtn').style.display = 'none';

    document.getElementById('maskModal').classList.add('show');
}

/**
 * 编辑面具
 */
function editMask(maskId) {
    const mask = masksData.find(m => m.id === maskId);
    if (!mask) return;

    currentEditingMaskId = maskId;

    document.getElementById('maskModalTitle').textContent = '编辑面具';
    document.getElementById('maskName').value = mask.name;
    document.getElementById('maskDesc').value = mask.description || '';
    document.getElementById('maskContent').value = mask.content;
    document.getElementById('maskDeleteBtn').style.display = 'block';

    document.getElementById('maskModal').classList.add('show');
}

/**
 * 关闭面具编辑弹窗
 */
function closeMaskModal() {
    document.getElementById('maskModal').classList.remove('show');
    currentEditingMaskId = null;
}

/**
 * 保存面具
 */
function saveMask() {
    const name = document.getElementById('maskName').value.trim();
    const description = document.getElementById('maskDesc').value.trim();
    const content = document.getElementById('maskContent').value.trim();

    if (!name) {
        alert('请填写面具名称！');
        return;
    }

    if (!content) {
        alert('请填写人设内容！');
        return;
    }

    const maskData = {
        id: currentEditingMaskId || 'MASK_' + Date.now(),
        name,
        description,
        content,
        timestamp: Date.now()
    };

    if (currentEditingMaskId) {
        // 编辑模式
        const index = masksData.findIndex(m => m.id === currentEditingMaskId);
        if (index !== -1) {
            masksData[index] = maskData;
        }
    } else {
        // 新建模式
        masksData.push(maskData);
    }

    saveMasksToStorage();
    renderMaskList();
    closeMaskModal();
    showSuccessModal('保存成功', '面具已更新！');
}

/**
 * 删除面具
 */
function deleteMask() {
    if (!currentEditingMaskId) return;

    if (confirm('确定要删除这个面具吗？')) {
        masksData = masksData.filter(m => m.id !== currentEditingMaskId);
        saveMasksToStorage();
        renderMaskList();
        closeMaskModal();
        showSuccessModal('删除成功', '面具已移除。');
    }
}

/**
 * 保存面具到localStorage
 */
function saveMasksToStorage() {
    try {
        localStorage.setItem('phoneMasksData', JSON.stringify(masksData));
    } catch (e) {
        console.error('保存面具数据失败:', e);
    }
}

/**
 * 从localStorage加载面具数据
 */
function loadMasksData() {
    try {
        const saved = localStorage.getItem('phoneMasksData');
        if (saved) {
            masksData = JSON.parse(saved);
            console.log('成功加载面具数据，共', masksData.length, '个');
        }
    } catch (e) {
        console.error('加载面具数据失败:', e);
    }
}

// ========== 角色卡中的面具绑定功能 ==========

/**
 * 切换密友角色卡中的面具列表
 */
function toggleSweetheartMasks() {
    const list = document.getElementById('sweetheartMasksList');
    const arrow = document.getElementById('sweetheart-mask-arrow');

    if (list.style.display === 'none') {
        list.style.display = 'block';
        arrow.classList.add('open');
    } else {
        list.style.display = 'none';
        arrow.classList.remove('open');
    }
}

/**
 * 渲染密友角色卡中的面具列表
 */
function renderSweetheartMasksList(boundIds = []) {
    const container = document.getElementById('sweetheartMasksList');

    if (masksData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #BCAAA4; padding: 20px; font-size: 13px;">还没有面具哦~</div>';
        return;
    }

    container.innerHTML = '';

    masksData.forEach(mask => {
        const item = document.createElement('div');
        item.className = 'mask-checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `sh-mask-${mask.id}`;
        checkbox.value = mask.id;
        checkbox.checked = boundIds.includes(mask.id);

        const label = document.createElement('label');
        label.htmlFor = `sh-mask-${mask.id}`;
        label.textContent = mask.name;

        item.appendChild(checkbox);
        item.appendChild(label);
        container.appendChild(item);
    });
}

/**
 * 切换联系人库角色卡中的面具列表
 */
function toggleLibraryMasks() {
    const list = document.getElementById('library-masks-list');
    const arrow = document.getElementById('library-mask-arrow');

    if (list.style.display === 'none') {
        list.style.display = 'block';
        arrow.classList.add('open');
    } else {
        list.style.display = 'none';
        arrow.classList.remove('open');
    }
}

/**
 * 渲染联系人库角色卡中的面具列表
 */
function renderLibraryMasksList(boundIds = []) {
    const container = document.getElementById('library-masks-list');

    if (masksData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-size: 13px;">暂无面具</div>';
        return;
    }

    container.innerHTML = '';

    masksData.forEach(mask => {
        const item = document.createElement('div');
        item.className = 'mask-checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `lib-mask-${mask.id}`;
        checkbox.value = mask.id;
        checkbox.checked = boundIds.includes(mask.id);

        const label = document.createElement('label');
        label.htmlFor = `lib-mask-${mask.id}`;
        label.textContent = mask.name;

        item.appendChild(checkbox);
        item.appendChild(label);
        container.appendChild(item);
    });
}

/**
 * 切换普通角色卡中的面具列表
 */
function toggleCharacterMasks() {
    const list = document.getElementById('charMasksList');
    const arrow = document.getElementById('char-mask-arrow');

    if (list.style.display === 'none') {
        list.style.display = 'block';
        arrow.classList.add('open');
    } else {
        list.style.display = 'none';
        arrow.classList.remove('open');
    }
}

/**
 * 渲染普通角色卡中的面具列表
 */
function renderCharacterMasksList(boundIds = []) {
    const container = document.getElementById('charMasksList');

    if (masksData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-size: 13px;">还没有面具哦~</div>';
        return;
    }

    container.innerHTML = '';

    masksData.forEach(mask => {
        const item = document.createElement('div');
        item.className = 'mask-checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `char-mask-${mask.id}`;
        checkbox.value = mask.id;
        checkbox.checked = boundIds.includes(mask.id);

        const label = document.createElement('label');
        label.htmlFor = `char-mask-${mask.id}`;
        label.textContent = mask.name;

        item.appendChild(checkbox);
        item.appendChild(label);
        container.appendChild(item);
    });
}

// ========== 面具管理功能 - 结束 ==========

/**
 * 总结知识点功能
 */
async function summarizeKnowledge() {
    if (!currentChatContact) {
        alert('请先打开一个聊天窗口');
        return;
    }

    const contactId = currentChatContact.id;
    const memoryRounds = currentChatContact.memoryRounds || 10;


    // 获取聊天历史
    const chatHistory = JSON.parse(localStorage.getItem('phoneChatHistory') || '{}');
    const messages = chatHistory[contactId] || [];

    if (messages.length === 0) {
        alert('还没有聊天记录可以总结哦~');
        return;
    }

    // 获取最近N轮对话
    const recentMessages = messages.slice(-memoryRounds * 2); // 每轮包含用户和AI的消息

    // 构建总结提示词
    const conversationText = recentMessages.map(msg => {
        const role = msg.sender === 'user' ? '我' : currentChatContact.name;
        return `${role}: ${msg.text}`;
    }).join('\n');

    const summaryPrompt = `请根据以下对话内容，提取和总结其中涉及的知识点、要点和关键信息。
请以清单的形式列出，每个知识点简洁明了。

对话内容：
${conversationText}

请按以下格式输出：
【知识点清单】
1. [知识点标题] - [简要说明]
2. [知识点标题] - [简要说明]
...`;

    // 显示加载提示
    const messagesEl = document.getElementById('chatMessages');
    const loadingMsg = _createMessageDOM(contactId, {
        sender: 'contact',
        text: '正在为你总结知识点...'
    }, -1);
    messagesEl.appendChild(loadingMsg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
        // 调用API
        const apiMessages = [
            {role: 'system', content: '你是一个专业的知识整理助手。'},
            {role: 'user', content: summaryPrompt}
        ];

        const result = await callApi(apiMessages);

        // 移除加载提示
        loadingMsg.remove();

        if (!result.success) {
            throw new Error(result.message);
        }

        // 保存总结到知识库
        const summary = {
            id: 'SUMMARY_' + Date.now(),
            contactId: contactId,
            contactName: currentChatContact.name,
            content: result.message,
            memoryRounds: memoryRounds,
            messageCount: recentMessages.length,
            timestamp: Date.now()
        };

        // 保存到localStorage
        const knowledgeBase = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');
        knowledgeBase.unshift(summary); // 新的放在前面
        localStorage.setItem('knowledgeBase', JSON.stringify(knowledgeBase));
        updateTestButtonState(); // 更新测试按钮状态

        // 在聊天中显示总结
        const summaryMessage = {
            sender: 'contact',
            text: `📝 知识点总结（基于最近${memoryRounds}轮对话）\n\n${result.message}`
        };

        const newIndex = saveMessage(contactId, summaryMessage);
        const messageRow = _createMessageDOM(contactId, summaryMessage, newIndex);
        messagesEl.appendChild(messageRow);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        showSuccessModal('总结成功', '知识点已保存到记忆存储中心！');

    } catch (error) {
        loadingMsg.remove();
        console.error('总结失败:', error);
        showErrorModal('总结失败', error.message || '请检查网络或API配置。');
    }
}

/**
 * 绑定总结按钮事件
 */
function setupSummarizeButton() {
    const summarizeBtn = document.getElementById('summarizeKnowledgeBtn');
    if (summarizeBtn) {
        summarizeBtn.addEventListener('click', () => {
            // 关闭附件菜单
            document.getElementById('attachmentMenu').classList.remove('show');
            // 执行总结
            summarizeKnowledge();
        });
    }
}

/**
 * 绑定测试按钮事件
 */
function setupTestButton() {
    const testBtn = document.getElementById('generateTestBtn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            openTestConfig();
        });
    }
}

// ========== 测试功能相关变量 ==========
let testData = {
    questions: [],
    answers: {},
    startTime: null,
    selectedKnowledgeIds: []
};

// ========== 测试功能：启用/禁用测试按钮 ==========
function updateTestButtonState() {
    const testBtn = document.getElementById('generateTestBtn');
    const knowledgeBase = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');

    if (knowledgeBase.length > 0) {
        // 有知识清单，启用按钮
        testBtn.style.opacity = '1';
        testBtn.style.pointerEvents = 'auto';
    } else {
        // 没有知识清单，禁用按钮
        testBtn.style.opacity = '0.5';
        testBtn.style.pointerEvents = 'none';
    }
}

// ========== 打开测试配置弹窗 ==========
function openTestConfig() {
    const knowledgeBase = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');

    if (knowledgeBase.length === 0) {
        alert('请先生成知识清单！');
        return;
    }

    // 渲染知识清单选择器
    const selector = document.getElementById('knowledgeSelector');
    selector.innerHTML = '';

    knowledgeBase.forEach((item, index) => {
        const checkboxItem = document.createElement('div');
        checkboxItem.className = 'knowledge-checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `knowledge-${item.id}`;
        checkbox.value = item.id;
        checkbox.checked = index === 0; // 默认选中第一个

        const label = document.createElement('label');
        label.className = 'knowledge-checkbox-label';
        label.htmlFor = `knowledge-${item.id}`;

        const date = new Date(item.timestamp).toLocaleDateString('zh-CN');
        label.textContent = `${date} - ${item.contactName} (${item.memoryRounds}轮对话)`;

        checkboxItem.appendChild(checkbox);
        checkboxItem.appendChild(label);
        selector.appendChild(checkboxItem);
    });

    document.getElementById('testConfigModal').classList.add('show');
    document.getElementById('attachmentMenu').classList.remove('show');
}

// ========== 关闭测试配置弹窗 ==========
function closeTestConfig() {
    document.getElementById('testConfigModal').classList.remove('show');
}

// ========== 调整题目数量 ==========
function adjustQuestionCount(delta) {
    const input = document.getElementById('questionCountInput');
    let value = parseInt(input.value) || 5;
    value = Math.max(1, Math.min(20, value + delta));
    input.value = value;
}

/**
 * [新增] 健壮的AI JSON响应解析器
 * 它可以处理纯JSON、被文字包裹的JSON和被Markdown包裹的JSON
 * @param {string} rawMessage - 从AI获取的原始字符串
 * @returns {object} 解析成功后的JavaScript对象
 * @throws {Error} 如果无法解析出有效的JSON，则抛出错误
 */
function robustJsonParse(rawMessage) {
    if (!rawMessage) {
        throw new Error("AI返回内容为空");
    }

    try {
        // 步骤 1: 尝试直接解析，这是最理想的情况
        return JSON.parse(rawMessage);
    } catch (e) {
        // 直接解析失败，继续下一步智能提取
        console.warn("直接解析JSON失败，尝试智能提取...");
    }

    // 步骤 2: 清理Markdown代码块标记
    let cleanedMessage = rawMessage.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    // 步骤 3: 使用正则表达式贪婪匹配最外层的 { ... } 或 [ ... ]
    const jsonMatch = cleanedMessage.match(/^(?:\[[\s\S]*\]|\{[\s\S]*\})$/);
    if (jsonMatch) {
        try {
            // 尝试解析提取出的内容
            const parsed = JSON.parse(jsonMatch[0]);
            console.log("✅ 智能提取JSON成功！");
            return parsed;
        } catch (e) {
            console.error("❌ 提取JSON后解析仍然失败:", e);
        }
    }

    // 步骤 4: 如果以上都失败，则抛出最终错误
    throw new Error("无法从AI返回的内容中解析出有效的JSON格式");
}

// ========== 开始生成测试 ==========
async function startGenerateTest() {
    // 获取选中的知识清单
    const selectedIds = [];
    document.querySelectorAll('.knowledge-checkbox-item input:checked').forEach(cb => {
        selectedIds.push(cb.value);
    });

    if (selectedIds.length === 0) {
        alert('请至少选择一个知识清单！');
        return;
    }

    const questionCount = parseInt(document.getElementById('questionCountInput').value) || 5;

    // 获取知识内容
    const knowledgeBase = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');
    const selectedKnowledge = knowledgeBase.filter(item => selectedIds.includes(item.id));

    // 组合知识内容
    let knowledgeContent = '';
    selectedKnowledge.forEach((item, index) => {
        knowledgeContent += `\n\n知识清单 ${index + 1}:\n${item.content}`;
    });

    // 构建提示词
    const prompt = `请根据以下知识内容，生成${questionCount}道测试题。题目类型包括选择题、填空题和主观题。

知识内容:${knowledgeContent}

请严格按照以下JSON格式输出，不要添加任何其他文字：
{
  "questions": [
    {
      "type": "choice",
      "question": "题目内容",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": "正确答案"
    },
    {
      "type": "fill",
      "question": "题目内容（用____表示填空）",
      "answer": "正确答案"
    },
    {
      "type": "subjective",
      "question": "题目内容",
      "answer": "参考答案"
    }
  ]
}`;

    closeTestConfig();

    // 显示加载提示
    showSuccessModal('生成中', '正在生成测试题目，请稍候...', 0);

    try {
        // 调用API生成题目
        const result = await callApi([
            {role: 'system', content: '你是一个专业的教育测试专家。'},
            {role: 'user', content: prompt}
        ]);

        if (!result.success) {
            throw new Error(result.message);
        }

        // // 解析生成的题目
        // let questionsData;
        // try {
        //     // 尝试从返回内容中提取JSON
        //     const jsonMatch = result.message.match(/\{[\s\S]*\}/);
        //     if (jsonMatch) {
        //         questionsData = JSON.parse(jsonMatch[0]);
        //     } else {
        //         questionsData = JSON.parse(result.message);
        //     }
        // } catch (parseError) {
        //     console.error('JSON解析失败:', parseError);
        //     throw new Error('题目格式错误，请重试');
        // }

        // [新代码 - 使用这个]
        let questionsData;
        try {
            // 使用新的、更健壮的解析函数
            questionsData = robustJsonParse(result.message);
        } catch (parseError) {
            console.error('JSON解析失败:', parseError);
            // 抛出更具体的错误信息，方便调试
            throw new Error(`题目格式错误: ${parseError.message}。请重试。`);
        }


        // 保存测试数据
        testData.questions = questionsData.questions || [];
        testData.answers = {};
        testData.selectedKnowledgeIds = selectedIds;

        // 关闭加载提示
        document.getElementById('successModal').classList.remove('show');

        // 显示测试准备弹窗
        document.getElementById('testReadyModal').classList.add('show');

    } catch (error) {
        document.getElementById('successModal').classList.remove('show');
        console.error('生成测试失败:', error);
        showErrorModal('生成测试失败', error.message);
    }
}

// ========== 关闭测试准备弹窗 ==========
function closeTestReady() {
    document.getElementById('testReadyModal').classList.remove('show');
}

// ========== 开始测试 ==========
// ========== 开始测试 (修复版) ==========
function startTest() {
    closeTestReady();

    // 1. 🔥 核心修复：先显示页面！
    // 必须先给页面添加 .show 类，否则 updateTimer 函数会检测到页面未显示而自动杀死计时器
    document.getElementById('testPage').classList.add('show');

    // 2. 渲染测试页面内容
    const testContent = document.getElementById('testContent');
    testContent.innerHTML = '';

    testData.questions.forEach((q, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'test-question';

        let typeLabel = '';
        let typeClass = '';
        if (q.type === 'choice') {
            typeLabel = '选择题';
            typeClass = 'choice';
        } else if (q.type === 'fill') {
            typeLabel = '填空题';
            typeClass = 'fill';
        } else {
            typeLabel = '主观题';
            typeClass = 'subjective';
        }

        let optionsHTML = '';
        if (q.type === 'choice') {
            optionsHTML = '<div class="question-options">';
            q.options.forEach((option, optIndex) => {
                optionsHTML += `
                    <div class="option-item" onclick="selectOption(${index}, '${option}', this)">
                        <input type="radio" name="q${index}" value="${option}" id="q${index}_opt${optIndex}">
                        <label class="option-label" for="q${index}_opt${optIndex}">${option}</label>
                    </div>
                `;
            });
            optionsHTML += '</div>';
        } else {
            optionsHTML = `<textarea class="answer-input" id="answer_${index}" placeholder="请输入你的答案..."></textarea>`;
        }

        questionDiv.innerHTML = `
            <div class="question-header">
                <div class="question-number">${index + 1}</div>
                <div class="question-type ${typeClass}">${typeLabel}</div>
            </div>
            <div class="question-text">${q.question}</div>
            ${optionsHTML}
        `;

        testContent.appendChild(questionDiv);
    });

    // 3. 开始计时 (现在页面已经显示了，计时器可以安全启动)
    testData.startTime = Date.now();
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    timerInterval = setInterval(updateTimer, 1000); // 每秒更新一次
    updateTimer(); // 立即更新一次
}

// ========== 选择选项 ==========
function selectOption(questionIndex, answer, element) {
    // 移除同组其他选项的选中状态
    const parent = element.parentElement;
    parent.querySelectorAll('.option-item').forEach(item => {
        item.classList.remove('selected');
    });

    // 添加选中状态
    element.classList.add('selected');
    element.querySelector('input').checked = true;

    // 保存答案
    testData.answers[questionIndex] = answer;
}

// ========== 更新计时器 ==========
let timerInterval = null; // 新增：存储计时器ID

function updateTimer() {
    const timerEl = document.getElementById('testTimer');
    if (!testData.startTime || !document.getElementById('testPage').classList.contains('show')) {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        return;
    }

    const elapsed = Math.floor((Date.now() - testData.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ========== 提交测试 ==========
async function submitTest() {
    // 停止计时
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const useTime = document.getElementById('testTimer').textContent;

    // 收集所有答案
    testData.questions.forEach((q, index) => {
        if (q.type !== 'choice' && !testData.answers[index]) {
            const answerInput = document.getElementById(`answer_${index}`);
            if (answerInput) {
                testData.answers[index] = answerInput.value.trim();
            }
        }
    });

    // 检查是否所有题目都已作答
    const unanswered = testData.questions.filter((q, index) => !testData.answers[index]);
    if (unanswered.length > 0) {
        if (!confirm(`还有${unanswered.length}道题未作答，确定要提交吗？`)) {
            // 如果取消，重新开始计时
            timerInterval = setInterval(updateTimer, 1000);
            return;
        }
    }

    // 计算得分（只计算客观题）
    let correctCount = 0;
    let objectiveTotal = 0; // 客观题总数
    const subjectiveQuestions = []; // 主观题列表
    const wrongAnswers = []; // 错误答案列表

    testData.questions.forEach((q, index) => {
        const userAnswer = testData.answers[index] || '';

        if (q.type === 'subjective') {
            // 主观题单独收集
            subjectiveQuestions.push({
                question: q.question,
                userAnswer: userAnswer,
                referenceAnswer: q.answer
            });
        } else {
            // 客观题（选择题和填空题）
            objectiveTotal++;
            if (userAnswer === q.answer) {
                correctCount++;
            } else {
                wrongAnswers.push({
                    question: q.question,
                    type: q.type === 'choice' ? '选择题' : '填空题',
                    userAnswer: userAnswer || '未作答',
                    correctAnswer: q.answer
                });
            }
        }
    });

    // 计算客观题得分
    const objectiveScore = objectiveTotal > 0 ? Math.round((correctCount / objectiveTotal) * 100) : 0;

    // 显示结果弹窗
    document.getElementById('scoreNumber').textContent = objectiveScore;

    let detailsHTML = `
        <div class="detail-item">
            <span class="detail-label">客观题总数</span>
            <span class="detail-value">${objectiveTotal}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">答对数</span>
            <span class="detail-value">${correctCount}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">主观题数</span>
            <span class="detail-value">${subjectiveQuestions.length}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">用时</span>
            <span class="detail-value">${useTime}</span>
        </div>
    `;

    // 展示错题
    if (wrongAnswers.length > 0) {
        detailsHTML += '<div class="wrong-answers-section"><div class="section-title">错题解析</div>';
        wrongAnswers.forEach((item, index) => {
            detailsHTML += `
                <div class="wrong-answer-item">
                    <div class="wrong-q-number">第${index + 1}题 (${item.type})</div>
                    <div class="wrong-q-text">${item.question}</div>
                    <div class="wrong-answer-row">
                        <span class="answer-label wrong">你的答案：</span>
                        <span class="answer-text">${item.userAnswer}</span>
                    </div>
                    <div class="wrong-answer-row">
                        <span class="answer-label correct">正确答案：</span>
                        <span class="answer-text">${item.correctAnswer}</span>
                    </div>
                </div>
            `;
        });
        detailsHTML += '</div>';
    }

    document.getElementById('scoreDetails').innerHTML = detailsHTML;
    document.getElementById('testResultModal').classList.add('show');

    // 保存测试数据，用于后续生成AI反馈
    testData.testResult = {
        objectiveScore,
        correctCount,
        objectiveTotal,
        subjectiveQuestions,
        wrongAnswers,
        useTime
    };
}

// ========== 关闭测试 ==========
function closeTest() {
    if (confirm('确定要退出测试吗？答案将不会保存。')) {
        // 停止计时
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        document.getElementById('testPage').classList.remove('show');
        testData = {questions: [], answers: {}, startTime: null, selectedKnowledgeIds: []};
    }
}


// ========== 关闭测试结果并生成AI反馈 ==========
async function closeTestResult() {
    document.getElementById('testResultModal').classList.remove('show');
    document.getElementById('testPage').classList.remove('show');

    // 如果有测试结果，生成AI反馈
    if (testData.testResult && currentChatContact) {
        await generateTestFeedback();
    }

    // 清空测试数据
    testData = {questions: [], answers: {}, startTime: null, selectedKnowledgeIds: []};
}

// ========== 生成测试反馈 ==========
async function generateTestFeedback() {
    const result = testData.testResult;
    const contactId = currentChatContact.id;

    // 构建测试情况报告
    let reportText = `我刚刚完成了一次知识测试，以下是测试情况：\n\n`;
    reportText += `📊 客观题成绩：${result.objectiveScore}分\n`;
    reportText += `✅ 答对：${result.correctCount}/${result.objectiveTotal}题\n`;
    reportText += `⏱️ 用时：${result.useTime}\n\n`;

    // 添加错题信息
    if (result.wrongAnswers.length > 0) {
        reportText += `❌ 错题详情：\n`;
        result.wrongAnswers.forEach((item, index) => {
            reportText += `\n第${index + 1}题：${item.question}\n`;
            reportText += `我的答案：${item.userAnswer}\n`;
            reportText += `正确答案：${item.correctAnswer}\n`;
        });
        reportText += `\n`;
    }

    // 添加主观题信息
    if (result.subjectiveQuestions.length > 0) {
        reportText += `📝 主观题作答情况：\n`;
        result.subjectiveQuestions.forEach((item, index) => {
            reportText += `\n第${index + 1}题：${item.question}\n`;
            reportText += `我的答案：${item.userAnswer || '未作答'}\n`;
            reportText += `参考答案：${item.referenceAnswer}\n`;
        });
        reportText += `\n`;
    }

    reportText += `请你：\n`;
    reportText += `1. 对我的主观题作答进行评价和打分\n`;
    reportText += `2. 分析我在这次测试中的表现\n`;
    reportText += `3. 给出针对性的学习建议`;

    // 在聊天消息区显示用户的测试报告
    const messagesEl = document.getElementById('chatMessages');

    const reportMessage = {
        sender: 'user',
        text: reportText
    };

    const reportIndex = saveMessage(contactId, reportMessage);
    const reportRow = _createMessageDOM(contactId, reportMessage, reportIndex);
    messagesEl.appendChild(reportRow);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // 显示加载提示
    const loadingMsg = _createMessageDOM(contactId, {
        sender: 'contact',
        text: '正在分析你的测试情况...'
    }, -1);
    messagesEl.appendChild(loadingMsg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
        // 构建完整的对话上下文（包括人设、面具等）
        const apiMessages = buildChatContext(contactId, reportText);

        // 调用API生成反馈
        const response = await callApi(apiMessages);

        // 移除加载提示
        loadingMsg.remove();

        if (!response.success) {
            throw new Error(response.message);
        }

        // 保存并显示AI的反馈
        const feedbackMessage = {
            sender: 'contact',
            text: response.message
        };

        const feedbackIndex = saveMessage(contactId, feedbackMessage);
        const feedbackRow = _createMessageDOM(contactId, feedbackMessage, feedbackIndex);
        messagesEl.appendChild(feedbackRow);
        messagesEl.scrollTop = messagesEl.scrollHeight;

    } catch (error) {
        loadingMsg.remove();
        console.error('生成测试反馈失败:', error);

        const errorMessage = {
            sender: 'contact',
            text: '抱歉，生成反馈时出现了问题：' + error.message
        };
        const errorIndex = saveMessage(contactId, errorMessage);
        const errorRow = _createMessageDOM(contactId, errorMessage, errorIndex);
        messagesEl.appendChild(errorRow);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
}

// ========== 构建聊天上下文（包括人设、面具等）==========
function buildChatContext(contactId, userMessage) {
    const contact = contactsData.find(c => c.id === contactId);
    if (!contact) {
        return [
            {role: 'user', content: userMessage}
        ];
    }

    const messages = [];

    // 1. 添加系统提示词（角色设定）
    let systemPrompt = '';

    // 添加角色persona
    if (contact.status) {
        systemPrompt += contact.status + '\n\n';
    }

    // 添加绑定的世界书
    if (contact.boundWorldbooks && contact.boundWorldbooks.length > 0) {
        contact.boundWorldbooks.forEach(wbId => {
            const wb = worldbookData.find(w => w.id === wbId);
            if (wb) {
                systemPrompt += `${wb.title}:\n${wb.content}\n\n`;
            }
        });
    }

    // 添加绑定的面具
    if (contact.boundMasks && contact.boundMasks.length > 0) {
        contact.boundMasks.forEach(maskId => {
            const mask = masksData.find(m => m.id === maskId);
            if (mask) {
                systemPrompt += `人设 - ${mask.name}:\n${mask.content}\n\n`;
            }
        });
    }

    // 添加用户设定
    if (userProfile.persona) {
        systemPrompt += `用户设定:\n${userProfile.persona}\n\n`;
    }

    if (systemPrompt) {
        messages.push({
            role: 'system',
            content: systemPrompt.trim()
        });
    }

    // 2. 添加历史对话（记忆轮数）
    const memoryRounds = contact.memoryRounds || 10;
    const chatHistory = JSON.parse(localStorage.getItem(`chat_${contactId}`) || '[]');
    const recentMessages = chatHistory.slice(-memoryRounds * 2);

    recentMessages.forEach(msg => {
        messages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
        });
    });

    // 3. 添加当前用户消息
    messages.push({
        role: 'user',
        content: userMessage
    });

    return messages;
}


// ========== 在总结知识点后更新测试按钮状态 ==========
// 修改原有的 summarizeKnowledge 函数，在保存知识点后调用
// 在 summarizeKnowledge 函数的最后，localStorage.setItem 之后添加：
// updateTestButtonState();

// ========== 记忆存储中心功能 ==========

/**
 * 打开记忆存储中心
 */
function openMemoryCenter() {
    document.getElementById('memoryCenterPage').classList.add('show');
    renderKnowledgeList();
}

/**
 * 关闭记忆存储中心
 */
function closeMemoryCenter() {
    document.getElementById('memoryCenterPage').classList.remove('show');
}

/**
 * 切换Tab
 */
function switchMemoryTab(tabName) {
    // 更新tab样式
    document.querySelectorAll('.memory-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // 切换内容区域
    document.getElementById('knowledgeMemoryArea').style.display =
        tabName === 'knowledge' ? 'block' : 'none';
    document.getElementById('otherMemoryArea').style.display =
        tabName === 'other' ? 'block' : 'none';
}

/**
 * 渲染知识清单列表
 */
function renderKnowledgeList() {
    const container = document.getElementById('knowledgeList');
    const knowledgeBase = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');

    if (knowledgeBase.length === 0) {
        container.innerHTML = `
            <div class="memory-empty">
                <div class="memory-empty-icon">📚</div>
                <div class="memory-empty-text">还没有保存的知识点</div>
                <div class="memory-empty-hint">在聊天中点击"总结"按钮来生成知识清单</div>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    knowledgeBase.forEach(item => {
        const card = document.createElement('div');
        card.className = 'knowledge-card';

        const date = new Date(item.timestamp).toLocaleDateString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        card.innerHTML = `
            <div class="knowledge-card-header">
                <div class="knowledge-card-title">💡 知识总结</div>
                <div class="knowledge-card-meta">
                    <div class="knowledge-card-date">${date}</div>
                    <div class="knowledge-card-badge">${item.memoryRounds}轮对话</div>
                </div>
            </div>
            <div class="knowledge-card-content">${escapeHTML(item.content)}</div>
            <div class="knowledge-card-footer">
                <div class="knowledge-card-source">来源: ${escapeHTML(item.contactName)}</div>
                <div class="knowledge-card-actions">
                    <button class="knowledge-action-btn delete-knowledge-btn" onclick="deleteKnowledge('${item.id}')">
                        删除
                    </button>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

/**
 * 删除知识点
 */
function deleteKnowledge(knowledgeId) {
    if (!confirm('确定要删除这条知识总结吗？')) return;

    let knowledgeBase = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');
    knowledgeBase = knowledgeBase.filter(item => item.id !== knowledgeId);
    localStorage.setItem('knowledgeBase', JSON.stringify(knowledgeBase));

    renderKnowledgeList();
    showSuccessModal('删除成功', '知识点已移除');
}

/*
====================================
状态历史记录 - 功能逻辑
====================================
*/
/**
 * 打开状态历史记录弹窗
 */
function openStatusHistory() {
    const popup = document.getElementById('statusHistoryPopup');
    if (popup) {
        popup.classList.add('show');
        renderStatusHistory(); // 打开时渲染列表
    }
}

/**
 * 关闭状态历史记录弹窗
 */
function closeStatusHistory() {
    const popup = document.getElementById('statusHistoryPopup');
    if (popup) {
        popup.classList.remove('show');
    }
}

/**
 * 渲染状态历史列表
 */
function renderStatusHistory() {
    const container = document.getElementById('statusHistoryContent');
    if (!container || !currentSweetheartChatContact) return;
    const allHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
    const contactHistory = allHistories[currentSweetheartChatContact.id] || [];
    if (contactHistory.length === 0) {
        container.innerHTML = `
            <div class="history-empty">
                <div class="history-empty-icon">📂</div>
                <div class="history-empty-text">还没有历史状态哦</div>
            </div>`;
        return;
    }
    container.innerHTML = ''; // 清空旧内容
    contactHistory.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-item';
        const date = new Date(item.timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        // 安全地获取状态文本，如果不存在则显示 '...'
        const charLocation = item.character?.location || '...';
        const charAppearance = item.character?.appearance || '...';
        const charAction = item.character?.action || '...';
        const userLocation = item.user?.location || '...';
        const userAppearance = item.user?.appearance || '...';
        const userAction = item.user?.action || '...';
        card.innerHTML = `
            <div class="history-item-header">
                <span class="history-item-date">${date}</span>
                <button class="history-item-delete-btn" onclick="deleteStatusHistoryItem(${item.timestamp})">×</button>
            </div>
            <div class="history-status-section">
                <h5>${currentSweetheartChatContact.name} 的状态</h5>
                <p><strong>📍 所在:</strong> ${escapeHTML(charLocation)}</p>
                <p><strong>👗 穿着:</strong> ${escapeHTML(charAppearance)}</p>
                <p><strong>🏃‍♀️ 行为:</strong> ${escapeHTML(charAction)}</p>
            </div>
            <div class="history-status-section" style="margin-top: 10px;">
                <h5>我的状态</h5>
                <p><strong>📍 所在:</strong> ${escapeHTML(userLocation)}</p>
                <p><strong>👔 穿着:</strong> ${escapeHTML(userAppearance)}</p>
                <p><strong>🚶 行为:</strong> ${escapeHTML(userAction)}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

/**
 * 删除指定的一条历史记录
 * @param {number} timestamp - 要删除的历史记录的时间戳
 */
function deleteStatusHistoryItem(timestamp) {
    if (!currentSweetheartChatContact) return;
    if (confirm('确定要删除这条历史状态吗？')) {
        const allHistories = JSON.parse(localStorage.getItem('sweetheartStatusHistory') || '{}');
        let contactHistory = allHistories[currentSweetheartChatContact.id] || [];
        // 过滤掉要删除的项
        contactHistory = contactHistory.filter(item => item.timestamp !== timestamp);
        // 更新并保存
        allHistories[currentSweetheartChatContact.id] = contactHistory;
        localStorage.setItem('sweetheartStatusHistory', JSON.stringify(allHistories));
        // 重新渲染列表
        renderStatusHistory();
    }
}

// ▼▼▼ 粘贴以下所有JavaScript代码 ▼▼▼

// ===================================
//
//      红包功能 - 核心逻辑
//
// ===================================

let currentRedPacket = null; // 用于存储正在操作的红包信息

// --- 1. 发红包流程 ---

/**
 * 打开“发红包”弹窗
 */
function openRedPacketModal() {
    // 重置输入框
    const amountInput = document.getElementById('rpAmountInput');
    const greetingInput = document.getElementById('rpGreetingInput');
    const displayAmount = document.getElementById('rpDisplayAmount');
    const sendBtn = document.getElementById('rpSendBtn');

    amountInput.value = '';
    greetingInput.value = '';
    displayAmount.textContent = '0.00';
    sendBtn.classList.add('disabled');

    // 显示弹窗
    document.getElementById('redPacketModal').classList.add('show');
    amountInput.focus();
}

/**
 * 关闭“发红包”弹窗
 */
function closeRedPacketModal() {
    document.getElementById('redPacketModal').classList.remove('show');
}

/**
 * 发送红包消息
 */
function sendRedPacket() {
    const amountInput = document.getElementById('rpAmountInput');
    const greetingInput = document.getElementById('rpGreetingInput');
    const amount = parseFloat(amountInput.value);

    // 数据校验
    if (isNaN(amount) || amount <= 0) {
        alert('请输入有效的红包金额！');
        return;
    }

    const greeting = greetingInput.value.trim() || greetingInput.placeholder;

    // 构造红包消息对象
    const redPacketMessage = {
        sender: 'user',
        type: 'red-packet', // 新的消息类型
        content: {
            greeting: greeting,
            amount: amount.toFixed(2), // 保留两位小数
            status: 'unopened', // 'unopened' 或 'opened'
        },
        timestamp: Date.now()
    };

    // 保存并渲染消息
    const contactId = currentSweetheartChatContact.id;
    const newIndex = saveSweetheartMessage(contactId, redPacketMessage);
    const messagesEl = document.getElementById('sweetheartChatMessages');
    const messageRow = _createMessageDOM(contactId, redPacketMessage, newIndex);
    messagesEl.appendChild(messageRow);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // 清理工作
    closeRedPacketModal();
    renderSweetheartList(); // 更新密友列表的最后消息
}

// 事件监听：实时更新发红包弹窗的金额显示和按钮状态
document.getElementById('rpAmountInput')?.addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value) || 0;
    document.getElementById('rpDisplayAmount').textContent = amount.toFixed(2);

    const sendBtn = document.getElementById('rpSendBtn');
    if (amount > 0) {
        sendBtn.classList.remove('disabled');
    } else {
        sendBtn.classList.add('disabled');
    }
});


// --- 2. 渲染红包消息 ---

/**
 * 创建红包气泡的DOM
 * @param {object} messageObj - 红包消息对象
 * @returns {HTMLElement}
 */
function createRedPacketBubble(messageObj) {
    const content = messageObj.content;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble red-packet-bubble';

    if (content.status === 'opened') {
        bubble.classList.add('opened');
    }

    bubble.innerHTML = `
        <div class="red-packet-icon">🧧</div>
        <div class="red-packet-info">
            <span class="red-packet-greeting">${escapeHTML(content.greeting)}</span>
            <span class="red-packet-type">微信红包</span>
        </div>
    `;

    return bubble;
}


// --- 3. 开红包流程 ---

/**
 * 用户点击聊天中的红包气泡
 * @param {string} contactId
 * @param {number} messageIndex
 */
function handleRedPacketClick(contactId, messageIndex) {
    console.log("✅ 红包气泡被点击，正在尝试打开弹窗...", {contactId, messageIndex});
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
    const message = chatHistory[contactId]?.[messageIndex];

    if (!message || message.type !== 'red-packet') return;
    // ✅ 核心改动在这里：判断红包是不是自己发的
    if (message.sender === 'user') {
        showSuccessModal('提示', '你发出去的红包，不能自己拆哦～', 1500);
        return; // 直接退出，不执行开红包动画
    }
    // 如果红包已打开，则不显示开红包界面
    if (message.content.status === 'opened') {
        showSuccessModal('提示', '这个红包已经被你领过啦～', 1500);
        return;
    }

    // 存储当前要操作的红包信息
    currentRedPacket = {
        contactId,
        messageIndex,
        message
    };

    // 填充“开红包”弹窗内容
    const sender = message.sender === 'user' ? userProfile : currentSweetheartChatContact;

    document.getElementById('rpOpenerSenderName').textContent = `${sender.name}的红包`;
    document.getElementById('rpOpenerGreeting').textContent = message.content.greeting;

    const avatarEl = document.getElementById('rpOpenerAvatar');
    const isUrl = sender.avatar && (sender.avatar.startsWith('http') || sender.avatar.startsWith('data:'));
    avatarEl.innerHTML = isUrl ? `<img src="${sender.avatar}" alt="avatar">` : `<span>${sender.avatar}</span>`;

    // 重置弹窗状态并显示
    const openerCard = document.getElementById('rpOpenerCard');
    openerCard.classList.remove('is-opened');
    document.getElementById('rpOpenBtn').classList.remove('spinning');
    document.getElementById('redPacketOpenModal').classList.add('show');
}

/**
 * 关闭“开红包”弹窗
 */
function closeRedPacketOpener() {
    document.getElementById('redPacketOpenModal').classList.remove('show');
}

/**
 * 执行开红包动画并处理后续逻辑
 */
function animateAndOpenPacket() {
    console.log("✅ “开”按钮被点击，animateAndOpenPacket函数已触发。");
    console.log("🔍 检查 currentRedPacket 数据:", currentRedPacket);
    if (!currentRedPacket) {
        console.error("❌ 错误：currentRedPacket 为空！函数提前退出。"); // <--- 添加这行错误提示
        return;
    }

    const openBtn = document.getElementById('rpOpenBtn');
    openBtn.classList.add('spinning');

    // 模拟网络延迟和动画效果
    setTimeout(() => {
        // 1. 更新UI显示
        document.getElementById('rpOpenedAmount').textContent = currentRedPacket.message.content.amount;
        document.getElementById('rpOpenedGreeting').textContent = currentRedPacket.message.content.greeting;

        const openerCard = document.getElementById('rpOpenerCard');
        openerCard.classList.add('is-opened');
        openBtn.classList.remove('spinning');

        // 2. 更新红包状态
        updateRedPacketState();

    }, 1500); // 旋转1.5秒
}

/**
 * 更新红包状态（数据持久化和UI刷新）
 */
function updateRedPacketState() {
    if (!currentRedPacket) return;

    const {contactId, messageIndex, message} = currentRedPacket;

    // a. 更新本地存储中的消息状态
    const chatHistory = JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}');
    if (chatHistory[contactId]?.[messageIndex]) {
        chatHistory[contactId][messageIndex].content.status = 'opened';
        localStorage.setItem('phoneSweetheartChatHistory', JSON.stringify(chatHistory));
    }

    // b. 更新聊天界面中的红包气泡样式
    // 通过消息的 timestamp 找到对应的DOM元素
    const messageRow = document.querySelector(`.message-row[data-timestamp="${message.timestamp}"]`);
    if (messageRow) {
        const bubble = messageRow.querySelector('.red-packet-bubble');
        if (bubble) {
            bubble.classList.add('opened');
        }
    }

    // c. 在聊天中追加一条“你领取了红包”的系统消息
    const senderName = message.sender === 'user' ? userProfile.name : currentSweetheartChatContact.name;
    const systemMessageText = `你领取了${senderName}的红包`;
    const systemMessageObj = {
        sender: 'system',
        type: 'notice',
        text: systemMessageText,
        timestamp: Date.now()
    };

    const newIndex = saveSweetheartMessage(contactId, systemMessageObj);
    const messagesEl = document.getElementById('sweetheartChatMessages');
    const systemMessageRow = _createMessageDOM(contactId, systemMessageObj, newIndex);
    messagesEl.appendChild(systemMessageRow);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// --- 4. 最终集成 ---

/**
 * 这是一个辅助函数，用于创建系统提示消息 (如"领取了红包")
 * @param {object} messageObj
 * @returns {HTMLElement}
 */
function createSystemNotice(messageObj) {
    const notice = document.createElement('div');
    notice.className = 'system-notice'; // 你可以为此类添加CSS样式
    notice.textContent = messageObj.text;
    notice.style.textAlign = 'center';
    notice.style.fontSize = '12px';
    notice.style.color = '#BCAAA4';
    notice.style.margin = '10px 0';
    return notice;
}

/**
 * 切换密友聊天中是否显示头像
 * @param {boolean} isEnabled - 是否显示头像
 */
function toggleSweetheartChatAvatars(isEnabled) {
    globalConfig.showAvatarsInSweetheartChat = isEnabled;
    localStorage.setItem('showAvatarsInSweetheartChat', isEnabled.toString());
    applySweetheartChatAvatarsSetting(isEnabled);
    showSuccessModal('头像显示设置', isEnabled ? '已开启头像显示' : '已关闭头像显示');

    // 如果密友聊天页面当前是打开状态，需要刷新以应用新设置
    const sweetheartChatPage = document.getElementById('sweetheartChatPage');
    if (sweetheartChatPage && sweetheartChatPage.classList.contains('show') && currentSweetheartChatContact) {
        // 重新打开当前聊天，会触发消息重新渲染，从而应用新的CSS类
        openSweetheartChat(currentSweetheartChatContact);
    }
}

/**
 * 应用密友聊天显示头像的设置
 * @param {boolean} isEnabled - 是否显示头像
 */
function applySweetheartChatAvatarsSetting(isEnabled) {
    const sweetheartChatPage = document.getElementById('sweetheartChatPage');
    if (sweetheartChatPage) {
        if (isEnabled) {
            sweetheartChatPage.classList.add('show-avatars');
        } else {
            sweetheartChatPage.classList.remove('show-avatars');
        }
    }
}

// ====== 新增：数据导入导出功能 ======

// 在 script.js 中找到 exportAppData 函数并替换为：

/**
 * 导出所有应用数据到 JSON 文件。
 * (已修改：导出全部完整数据，不再清理label)
 */
function exportAppData() {
    const appData = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
            // 1. 获取原始数据的深拷贝
            let value = JSON.parse(localStorage.getItem(key));

            // ▼▼▼ 修改：不再执行任何删除 label 的操作，直接保存原始数据 ▼▼▼
            appData[key] = value;

        } catch (e) {
            // 如果不是JSON格式，直接读取字符串
            appData[key] = localStorage.getItem(key);
        }
    }

    const jsonString = JSON.stringify(appData, null, 2);
    const blob = new Blob([jsonString], {type: 'application/json'});

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    a.download = `yetta_full_backup_${dateStr}_${timeStr}.json`; // 文件名改为 full_backup

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccessModal('导出成功', '全部原始数据已导出备份！');
}


/**
 * 触发隐藏的文件输入框，让用户选择导入文件。
 */
function importAppData() {
    document.getElementById('importFileInput').click();
}

/**
 * 处理文件导入，读取并解析用户选择的JSON文件。
 * @param {Event} event - 文件输入框的 change 事件对象。
 */
function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    if (file.type !== 'application/json') {
        showErrorModal('导入失败', '请选择有效的JSON文件 (.json)！');
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (confirm('确定要导入此文件中的数据吗？现有数据将被文件内容覆盖，此操作不可撤销。')) {
                applyImportedData(importedData);
                showSuccessModal('导入成功', '数据已成功导入，应用将重新加载！', 2000);
                // 延迟重新加载，给用户看到提示的时间
                setTimeout(() => location.reload(), 2000);
            }
        } catch (error) {
            showErrorModal('导入失败', '文件内容格式不正确，不是有效的JSON！', 3000);
            console.error('导入文件解析失败:', error);
        } finally {
            // 清空文件输入框，以便用户可以再次选择相同文件
            event.target.value = '';
        }
    };

    reader.onerror = function () {
        showErrorModal('导入失败', '无法读取文件。', 3000);
        console.error('文件读取失败:', reader.error);
    };

    reader.readAsText(file);
}

/**
 * 将导入的数据应用到 localStorage。
 * @param {object} data - 从JSON文件解析出的数据对象。
 */
function applyImportedData(data) {
    // ⚠️ 警告：导入操作将完全覆盖现有数据。
    // 如果需要合并数据而不是覆盖，则需要更复杂的逻辑。
    // 目前，为简化和明确备份/恢复的意图，选择直接覆盖。
    localStorage.clear(); // 清空所有现有数据

    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            // 将对象类型的数据重新JSON化存储，以保持数据一致性
            const value = typeof data[key] === 'object' && data[key] !== null
                ? JSON.stringify(data[key])
                : String(data[key]);
            localStorage.setItem(key, value);
        }
    }
    console.log('数据已覆盖到 localStorage。');
}

/* =========================================
   📚 小说阅读器核心功能模块 (章节划分版)
   ========================================= */
let novelsLibrary = [];
let currentReadingBookId = null;
let currentChapters = []; // 存储当前书籍解析后的章节数组
let currentChapterIndex = 0; // 当前章节索引

// 1. 打开书架页面
function openNovelShelf() {
    document.getElementById('iconDockPanel').classList.remove('show'); // 关闭其他可能存在的浮层
    document.getElementById('folderOverlay').classList.remove('show');
// 🔥 新增这一行：确保世界选择页面被强制移出
    document.getElementById('novelShelfPage').classList.add('show');
    loadNovelLibrary();
    renderNovelShelf();
}

// 2. 关闭书架页面
function closeNovelShelf() {
    document.getElementById('novelShelfPage').classList.remove('show');
}

// 3. 触发上传按钮
function triggerNovelUpload() {
    document.getElementById('novelFileInput').click();
}

// 4. 处理文件上传 (保持不变，存入IndexedDB)
// [步骤2] 处理文件上传 (已修复：增加GBK/UTF-8自动编码识别)
async function handleNovelFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.txt')) {
        showSuccessModal('格式错误', '目前仅支持 .txt 格式的小说');
        event.target.value = '';
        return;
    }

    // 给用户一个具体的提示
    showSuccessModal('正在导入', '正在智能识别编码并分析书籍...', 3000);

    // --- 🛠️ 辅助函数：封装 FileReader 为 Promise ---
    const readFileText = (fileToRead, encoding) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(fileToRead, encoding);
        });
    };

    try {
        // 1. 尝试用默认的 UTF-8 读取
        let textContent = await readFileText(file, 'UTF-8');

        // 2. 🕵️ 智能检测：检查前500个字符中是否包含“” (乱码占位符)
        // 如果开头就包含乱码，或者全文包含大量连续的乱码，说明编码不对
        // GBK文件用UTF-8读通常会出现很多
        if (textContent.substring(0, 500).includes('')) {
            console.warn('⚠️ 检测到 UTF-8 乱码，自动切换为 GBK 编码重试...');
            textContent = await readFileText(file, 'GBK');
        }

        // 3. 继续原有的保存逻辑
        const contentId = await ImageDB.saveText(textContent);

        const newBook = {
            id: 'BOOK_' + Date.now(),
            title: file.name.replace('.txt', ''),
            contentId: contentId,
            currentChapterIndex: 0,
            currentScrollPos: 0,
            addedAt: Date.now(),
            themeColorIndex: Math.floor(Math.random() * 5),
            isAnalyzed: false,
            aiAnalysis: null
        };

        novelsLibrary.unshift(newBook);
        saveNovelLibrary();
        renderNovelShelf();

        console.log(`✅ 书籍《${newBook.title}》导入成功，开始后台分析...`);

        // 🔥 立即触发后台智能分析 🔥
        analyzeNovelStructure(newBook.id);

    } catch (err) {
        console.error('书籍导入错误:', err);
        showErrorModal('导入失败', '文件读取出错，请检查文件是否损坏。');
    } finally {
        event.target.value = ''; // 清空 input，允许重复上传同名文件
    }
}


// 5. 渲染书架 (保持不变)
function renderNovelShelf() {
    const container = document.getElementById('novelShelfContent');
    container.innerHTML = '';

    if (novelsLibrary.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #999; margin-top: 60px;">书架空空如也<br>点击右上角 + 导入 TXT 小说</div>';
        return;
    }

    const gradients = [
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
        'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    ];

    novelsLibrary.forEach(book => {
        const item = document.createElement('div');
        item.className = 'book-item';
        const bgStyle = gradients[book.themeColorIndex % gradients.length];

        item.innerHTML = `
            <div class="book-cover" style="background: ${bgStyle}" onclick="openBookReader('${book.id}')">
                <div class="book-title-preview">${escapeHTML(book.title)}</div>
            </div>
            <div class="book-name-label">${escapeHTML(book.title)}</div>
            <div class="book-delete-hint" onclick="deleteBook('${book.id}', event)">删除</div>
        `;
        container.appendChild(item);
    });
}

// 6. 删除书籍
function deleteBook(bookId, event) {
    if (event) event.stopPropagation();
    if (!confirm('确定要将这本书移出书架吗？')) return;
    novelsLibrary = novelsLibrary.filter(b => b.id !== bookId);
    saveNovelLibrary();
    renderNovelShelf();
}

/**
 * 核心功能：解析TXT为章节数组 (防卡死增强版)
 * 1. 尝试正则匹配
 * 2. 如果匹配失败，自动按字数切分
 */
function parseTxtToChapters(fullText) {
    if (!fullText) return [];

    // 匹配规则：兼容 "第x章"、"Chapter"、"卷"、"节" 等常见格式
    // 增加了一点容错性
    const chapterRegex = /(?:^|\n)\s*(第[0-9零一二三四五六七八九十百千万]+[章回节卷集]|Chapter\s*\d+|^\d+\.|Part\s*\d+).*/g;

    const chapters = [];
    let match;

    // --- 策略 A: 正则匹配 (标准格式) ---
    while ((match = chapterRegex.exec(fullText)) !== null) {
        // 如果找到了新章节，就把上一章的内容截取出来
        if (chapters.length > 0) {
            const prevChapter = chapters[chapters.length - 1];
            prevChapter.content = fullText.substring(prevChapter.startIndex, match.index).trim();
        } else {
            // 处理序章（第一章之前的内容）
            if (match.index > 0) {
                const introContent = fullText.substring(0, match.index).trim();
                // 只有序章内容足够长才保留，防止只是几行乱码
                if (introContent.length > 10) {
                    chapters.push({
                        title: "序章 / 前言",
                        content: introContent,
                        startIndex: 0
                    });
                }
            }
        }

        // 记录新章节的开始信息
        chapters.push({
            title: match[0].trim(),
            content: "", // 内容先留空，等找到下一章再填充
            startIndex: match.index + match[0].length
        });
    }

    // 填充最后一章的内容
    if (chapters.length > 0) {
        const lastChapter = chapters[chapters.length - 1];
        lastChapter.content = fullText.substring(lastChapter.startIndex).trim();
    }

    // --- 策略 B: 智能兜底 (防解析失败) ---
    // 条件：如果没找到任何章节，或者全书只有一个章节且字数巨大(>2万字)
    if (chapters.length === 0 || (chapters.length === 1 && fullText.length > 20000)) {
        console.warn("⚠️ 未识别到标准章节标题，启用【自动分页模式】");

        // 清空之前的尝试，完全采用自动分页
        chapters.length = 0;

        const CHUNK_SIZE = 8000; // 每 8000 字自动分一章
        const totalChunks = Math.ceil(fullText.length / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min((i + 1) * CHUNK_SIZE, fullText.length);
            const chunkContent = fullText.substring(start, end);

            chapters.push({
                title: `第 ${i + 1} 部分 (自动分页)`,
                content: chunkContent,
                startIndex: start
            });
        }
    }

    return chapters;
}

/**
 * 7. 打开阅读器 (UI防卡死 + 错误处理)
 */
async function openBookReader(bookId) {
    const book = novelsLibrary.find(b => b.id === bookId);
    if (!book) return;

    currentReadingBookId = bookId;
    const readerPage = document.getElementById('novelReaderPage');
    const contentBox = document.getElementById('readerContent');
    const headerTitle = document.getElementById('headerTitle');

    // 1. 立即更新UI状态：显示加载动画
    headerTitle.textContent = book.title;

    // 使用我们在CSS里新加的加载样式
    contentBox.innerHTML = `
        <div class="reader-loading-container">
            <div class="reader-spinner"></div>
            <div class="reader-loading-text">
                正在解析《${escapeHTML(book.title)}》...<br>
                <span style="font-size:12px;opacity:0.8;">(大文件可能需要几秒钟)</span>
            </div>
        </div>
    `;

    // 隐藏干扰元素
    document.getElementById('readerHeaderBar').classList.add('hidden');
    document.getElementById('readerFloatMenu').classList.add('hidden');
    readerPage.classList.add('show');
    updateReaderTime();

    // 2. 【关键修复】使用 setTimeout 延迟 50ms 执行解析
    // 这让浏览器有时间先把上面的 "正在解析" 动画渲染出来，避免点击后界面直接冻结
    setTimeout(async () => {
        try {
            // 从数据库获取全文
            const text = await ImageDB.getText(book.contentId);

            if (!text) {
                throw new Error("书籍内容为空或读取失败");
            }

            // 执行解析（可能耗时）
            // 此时用户已经看到了加载动画，等待感会好很多
            currentChapters = parseTxtToChapters(text);

            // 恢复上次阅读进度
            currentChapterIndex = book.currentChapterIndex || 0;

            // 越界保护
            if (currentChapterIndex >= currentChapters.length) currentChapterIndex = 0;

            console.log(`书籍解析完成: ${currentChapters.length} 章`);

            if (currentChapters.length > 0) {
                // 渲染内容
                renderCurrentChapter(book.currentScrollPos || 0);
            } else {
                contentBox.innerHTML = '<p style="text-align:center; padding-top:40vh; color:#999;">书籍本身似乎是空的。</p>';
            }

        } catch (e) {
            console.error("阅读器错误", e);
            // 显示友好的错误信息
            contentBox.innerHTML = `
                <div style="padding-top: 40vh; text-align: center;">
                    <div style="font-size:40px; margin-bottom:10px;">⚠️</div>
                    <p style="color:#d32f2f;">书籍打开失败</p>
                    <p style="font-size:12px; color:#999;">原因: ${e.message}</p>
                    <button onclick="closeNovelReader()" style="margin-top:20px; padding:8px 20px; border:1px solid #ccc; background:white; border-radius:8px;">退出</button>
                </div>
            `;
            showErrorModal('打开失败', '无法读取书籍内容，请尝试重新导入。');
        }
    }, 100); // 延迟100ms，给UI渲染留出时间
}

/* ======================================================
   修复 1: 改进渲染函数，防止双引号截断 data-text 属性
   ====================================================== */
function renderCurrentChapter(initialScroll = 0) {
    const contentBox = document.getElementById('readerContent');
    const container = document.getElementById('readerContainer');
    const headerTitle = document.getElementById('headerTitle');
    if (!currentChapters || !currentChapters[currentChapterIndex]) return;
    const chapter = currentChapters[currentChapterIndex];
    const book = novelsLibrary.find(b => b.id === currentReadingBookId);
    let displayTitle = chapter.title;
    if ((displayTitle === '正文' || displayTitle.includes('(自动分页)')) && book && book.title) {
        displayTitle = book.title;
    }
    headerTitle.textContent = displayTitle;
    contentBox.classList.add('fade-out-content');
    setTimeout(() => {
        let paragraphs = chapter.content.split(/\n+/);
        let titleInContent = chapter.title === '正文' ? (book ? book.title : chapter.title) : chapter.title;
        let htmlBuffer = `<div class="chapter-title-in-text" style="font-size:24px; font-weight:bold; margin-bottom:20px; text-align:center;">${titleInContent}</div>`;
        paragraphs.forEach(p => {
            p = p.trim();
            if (p) {
                // 🔥 核心修复：手动将双引号替换为 HTML 实体 &quot;
                // 这样就不会破坏 data-text="..." 的 HTML 结构了
                const safeText = escapeHTML(p).replace(/"/g, '&quot;');

                // 只有段落够长才显示气泡
                const btnHtml = p.length > 5
                    ? `<span class="discuss-btn" onclick="startPlotDiscussion(event, this)">💬</span>`
                    : '';

                htmlBuffer += `<p data-text="${safeText}">${escapeHTML(p)}${btnHtml}</p>`;
            }
        });
        if (currentChapterIndex < currentChapters.length - 1) {
            htmlBuffer += `<div style="text-align:center; padding: 20vh 0; color:#999; font-size:12px;">- 本章完 -</div>`;
        } else {
            htmlBuffer += `<div style="text-align:center; padding: 20vh 0; color:#999; font-size:12px;">- 全书完 -</div>`;
        }
        contentBox.innerHTML = htmlBuffer;
        // 重新应用 CSS Columns 布局
        const screenEl = document.querySelector('.screen');
        const exactScreenWidth = screenEl.getBoundingClientRect().width;
        contentBox.style.columnWidth = `${exactScreenWidth}px`;
        contentBox.style.columnGap = '0px';
        contentBox.style.width = 'auto';
        contentBox.style.height = '100%';
        contentBox.classList.remove('fade-out-content');
        contentBox.classList.add('fade-in-content');
        requestAnimationFrame(() => {
            if (initialScroll === 'end') {
                container.scrollLeft = container.scrollWidth;
            } else {
                container.scrollLeft = initialScroll;
            }
            updateReaderPageNumber();
        });
        saveReadingProgress();
    }, 50);
}

function closeNovelReader() {
    // ▼▼▼ 新增这行 ▼▼▼
    stopNovelTts();
    // ▲▲▲ 新增结束 ▲▲▲

    document.getElementById('novelReaderPage').classList.remove('show');
    document.getElementById('chapterListPanel').classList.remove('show');

    saveReadingProgress();
    currentReadingBookId = null;
    currentChapters = [];
}


/**
 * 保存阅读进度
 */
function saveReadingProgress() {
    if (currentReadingBookId) {
        const container = document.getElementById('readerContainer');
        const currentBook = novelsLibrary.find(b => b.id === currentReadingBookId);
        if (currentBook) {
            currentBook.currentChapterIndex = currentChapterIndex;
            currentBook.currentScrollPos = container.scrollLeft;
            // 为了书架进度条显示，保留总体progress逻辑（可选）
            // currentBook.progress = ...
            saveNovelLibrary();
        }
    }
}

/**
 * 9. 点击翻页逻辑 (含章节切换关键逻辑)
 */
function handleReaderClick(e) {
    const container = document.getElementById('readerContainer');
    const pageSize = container.getBoundingClientRect().width; // 一页的宽度
    const currentScroll = container.scrollLeft;
    const maxScroll = container.scrollWidth - pageSize; // 可滚动的最大距离

    // 容差值 (处理浏览器像素计算误差)
    const tolerance = 5;

    // 获取点击位置
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / pageSize;

    // 当前在这一章的第几页
    const currentPageIndex = Math.round(currentScroll / pageSize);

    if (clickRatio < 0.3) {
        // === 点击左侧：上一页 ===
        if (currentScroll <= tolerance) {
            // 已经在第一页了 -> 跳到上一章
            if (currentChapterIndex > 0) {
                showSuccessModal('正在加载', '上一章', 500);
                currentChapterIndex--;
                renderCurrentChapter('end'); // 跳到上一章的末尾
            } else {
                showSuccessModal('提示', '已经是第一章了', 1000);
            }
        } else {
            // 正常翻上一页
            container.scrollTo({left: (currentPageIndex - 1) * pageSize, behavior: 'smooth'});
        }

    } else if (clickRatio > 0.7) {
        // === 点击右侧：下一页 ===
        if (currentScroll >= maxScroll - tolerance) {
            // 已经在最后一页了 -> 跳到下一章
            if (currentChapterIndex < currentChapters.length - 1) {
                showSuccessModal('正在加载', '下一章', 500);
                currentChapterIndex++;
                renderCurrentChapter(0); // 跳到下一章的开头
            } else {
                showSuccessModal('提示', '已经是最后一章了', 1000);
            }
        } else {
            // 正常翻下一页
            container.scrollTo({left: (currentPageIndex + 1) * pageSize, behavior: 'smooth'});
        }

    } else {
        // === 点击中间：呼出菜单 ===
        toggleReaderMenus();
    }

    // 监听滚动结束保存进度 (防抖)
    // 注意：这里简单处理，实际应使用 debounce
    setTimeout(saveReadingProgress, 500);
}

/**
 * 切换菜单显示状态
 */
function toggleReaderMenus() {
    document.getElementById('readerHeaderBar').classList.toggle('hidden');
    document.getElementById('readerFloatMenu').classList.toggle('hidden');
}

/* script.js - 修改 updateReaderPageNumber 为全书页码版 */

/**
 * 更新页码进度 (全书总页码估算版)
 */
function updateReaderPageNumber() {
    const container = document.getElementById('readerContainer');
    const scrollLeft = container.scrollLeft;
    const pageWidth = container.clientWidth;
    const scrollWidth = container.scrollWidth;

    if (pageWidth === 0 || !currentChapters || currentChapters.length === 0) return;

    // 1. 计算当前章节内的页码情况
    const currentPageInChapter = Math.round(scrollLeft / pageWidth) + 1;
    const totalPagesInChapter = Math.round(scrollWidth / pageWidth);

    // 2. 获取当前章节的内容长度
    const currentChapterContent = currentChapters[currentChapterIndex].content || "";
    const currentLen = currentChapterContent.length;

    // 3. 估算每页的字符数 (密度)
    // 如果章节太短，可能会导致误差，所以设置一个最小保护值 (例如每页至少100字)
    let charsPerPage = totalPagesInChapter > 0 ? (currentLen / totalPagesInChapter) : 200;
    if (charsPerPage < 50) charsPerPage = 200; // 兜底默认值

    // 4. 计算之前的章节总字数
    let prevChaptersLen = 0;
    for (let i = 0; i < currentChapterIndex; i++) {
        prevChaptersLen += (currentChapters[i].content || "").length;
    }

    // 5. 计算全书总字数
    let totalBookLen = prevChaptersLen + currentLen;
    // 继续加上后面章节的字数
    for (let i = currentChapterIndex + 1; i < currentChapters.length; i++) {
        totalBookLen += (currentChapters[i].content || "").length;
    }

    // 6. 计算当前读到的总字数位置
    // (当前章节内页码 - 1) / 章节总页数 = 章节内进度百分比
    // 进度字数 = 章节内进度百分比 * 章节长度
    // 实际上更简单：(currentPageInChapter - 1) * charsPerPage + 之前的字数
    const currentProgressChars = prevChaptersLen + ((currentPageInChapter - 1) * charsPerPage);

    // 7. 换算成全书页码
    const globalTotalPages = Math.ceil(totalBookLen / charsPerPage);
    let globalCurrentPage = Math.ceil(currentProgressChars / charsPerPage) + 1;

    // 修正边界值
    if (globalCurrentPage > globalTotalPages) globalCurrentPage = globalTotalPages;
    if (globalCurrentPage < 1) globalCurrentPage = 1;

    // 8. 更新显示
    // 显示格式：总进度页码  (同时保留章节页码作为辅助，或者只显示总页码)
    // 这里只显示总页码，如 "12 / 580"
    const progressEl = document.getElementById('readerProgress');
    progressEl.textContent = `${globalCurrentPage} / ${globalTotalPages}`;

    // 如果你希望同时看到百分比，可以用下面这行代替上面那行：
    // const percent = Math.min(100, Math.round((globalCurrentPage / globalTotalPages) * 100));
    // progressEl.textContent = `${globalCurrentPage} / ${globalTotalPages} (${percent}%)`;
}


/* ========== 目录/章节跳转功能 ========== */

// script.js

/**
 * 打开目录面板 (修复版)
 * 修复了使用 scrollIntoView 导致整个页面发生位移的问题
 */
function openChapterList() {
    // 1. 隐藏原来的浮动菜单
    document.getElementById('readerHeaderBar').classList.add('hidden');
    document.getElementById('readerFloatMenu').classList.add('hidden');

    // 2. 渲染目录列表
    renderChapterListDOM();

    // 3. 显示目录面板
    const panel = document.getElementById('chapterListPanel');

    // 给整个面板绑定阻断事件，防止误触底层
    panel.onclick = (e) => {
        e.stopPropagation();
    };
    panel.ontouchmove = (e) => {
        e.stopPropagation();
    };

    panel.classList.add('show');

    // 4. 自动滚动到当前章节位置 (修复逻辑)
    setTimeout(() => {
        const container = document.getElementById('chapterListContent');
        const activeItem = container.querySelector('.chapter-item.active');

        if (activeItem && container) {
            // 🔥 核心修复：手动计算滚动位置，替代 scrollIntoView
            // 算法：(元素距离容器顶部的距离) - (容器高度的一半) + (元素高度的一半) = 居中
            const targetScroll = activeItem.offsetTop - (container.clientHeight / 2) + (activeItem.offsetHeight / 2);

            // 平滑滚动到目标位置
            container.scrollTo({
                top: targetScroll,
                behavior: 'auto'
            });
        }
    }, 100);
}

/**
 * 关闭目录面板
 */
function closeChapterList() {
    document.getElementById('chapterListPanel').classList.remove('show');
}

/**
 * 渲染目录列表 DOM
 * 修复：添加 e.stopPropagation() 防止点击穿透到底部菜单触发世界选择
 */
function renderChapterListDOM() {
    const container = document.getElementById('chapterListContent');
    container.innerHTML = '';
    if (!currentChapters || currentChapters.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">暂无章节信息</div>';
        return;
    }
    currentChapters.forEach((chapter, index) => {
        const div = document.createElement('div');
        div.className = 'chapter-item';
        // 如果是当前正在读的章节，添加高亮类
        if (index === currentChapterIndex) {
            div.classList.add('active');
        }
        div.textContent = chapter.title.trim() || `第 ${index + 1} 章`;

        // ▼▼▼▼▼▼▼▼ 核心修改区域 ▼▼▼▼▼▼▼▼
        div.onclick = (e) => {
            // 🛑 阻止事件冒泡！这能防止点击穿透到底部的 Dock 栏或触发全局返回
            if (e) e.stopPropagation();
            jumpToChapter(index);
        };
        // ▲▲▲▲▲▲▲▲ 修改结束 ▲▲▲▲▲▲▲▲

        container.appendChild(div);
    });
}

/**
 * 跳转到指定章节
 */
function jumpToChapter(index) {
    if (index < 0 || index >= currentChapters.length) return;

    currentChapterIndex = index;

    // 渲染该章节
    renderCurrentChapter(0); // 0 表示跳到该章开头

    // 关闭目录
    closeChapterList();

    // 给个提示
    showSuccessModal('跳转成功', `已跳转至：${currentChapters[index].title.substring(0, 10)}...`, 1000);
}


// 启动一个定时器，每分钟更新一次阅读器时间 (保持不变)
setInterval(updateReaderTime, 60000);

// 数据持久化辅助函数 (保持不变)
function saveNovelLibrary() {
    localStorage.setItem('phoneNovelLibrary', JSON.stringify(novelsLibrary));
}

function loadNovelLibrary() {
    const saved = localStorage.getItem('phoneNovelLibrary');
    if (saved) novelsLibrary = JSON.parse(saved);
}

// 辅助: 更新顶部标题和电量 (保持不变)
async function updateReaderTime() {
    const timeEl = document.getElementById('readerTime');
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    if (timeEl) timeEl.textContent = `${hours}:${minutes}`;
}

// 初始化
loadNovelLibrary();

/* =========================================
   📚 小说听书功能模块 (Minimax API)
   ========================================= */
let pendingPlotContext = null; // 用于临时存储想要讨论的剧情段落

let currentNovelAudio = null; // 全局变量：存储当前的小说音频对象
let isNovelPlaying = false;   // 全局变量：标记是否正在播放

/**
 * 切换小说听书状态 (播放/停止)
 */
// [修改版] 切换小说听书状态
async function toggleNovelTts() {
    const btnText = document.getElementById('novelTtsText');
    const btnIcon = document.getElementById('novelTtsIcon');
    if (isNovelPlaying) {
        stopNovelTts();
        return;
    }
    // 1. 检查配置
    if (MINIMAX_CONFIG.API_KEY.includes("YOUR_REAL")) {
        showErrorModal('配置缺失', '请在代码 script.js 顶部的 MINIMAX_CONFIG 中填入真实的 API Key 和 Group ID。');
        return;
    }
    if (!currentChapters || !currentChapters[currentChapterIndex]) {
        showErrorModal('无法朗读', '当前没有可阅读的章节内容。');
        return;
    }
    let textToRead = currentChapters[currentChapterIndex].content;
    textToRead = textToRead.replace(/\s+/g, ' ').trim();
    if (!textToRead) {
        showErrorModal('无法朗读', '当前章节内容为空。');
        return;
    }
    isNovelPlaying = true;
    if (btnText) btnText.textContent = "加载中...";
    if (btnIcon) btnIcon.innerHTML = `<svg viewBox="0 0 50 50" class="spinner"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5" stroke="currentColor"></circle></svg>`;
    try {
        // 2. 调用合成函数，不再传递 config 对象，使用全局常量
        const audio = await synthesizeNovelAudio(textToRead);
        currentNovelAudio = audio;
        audio.onended = () => {
            stopNovelTts();
        };
        audio.onerror = () => {
            showErrorModal('播放出错', '音频流中断。');
            stopNovelTts();
        };
        audio.play();
        if (btnText) btnText.textContent = "停止";
        if (btnIcon) btnIcon.innerHTML = `<path d="M6 6h12v12H6z" />`;
    } catch (error) {
        console.error("听书失败:", error);
        stopNovelTts();
        showErrorModal('听书失败', error.message);
    }
}
/**
 * 停止小说听书
 */
function stopNovelTts() {
    if (currentNovelAudio) {
        currentNovelAudio.pause();
        currentNovelAudio = null;
    }
    isNovelPlaying = false;

    // 恢复UI按钮状态
    const btnText = document.getElementById('novelTtsText');
    const btnIcon = document.getElementById('novelTtsIcon');

    if (btnText) btnText.textContent = "听书";
    if (btnIcon) btnIcon.innerHTML = `<path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>`;
}

/**
 * 核心：调用 Minimax API 合成音频
 * @returns {Promise<Audio>} 返回一个 HTMLAudioElement
 */
// [修改版] 切换小说听书状态
async function toggleNovelTts() {
    const btnText = document.getElementById('novelTtsText');
    const btnIcon = document.getElementById('novelTtsIcon');

    if (isNovelPlaying) {
        stopNovelTts();
        return;
    }

    // 1. 检查配置
    if (MINIMAX_CONFIG.API_KEY.includes("YOUR_REAL")) {
        showErrorModal('配置缺失', '请在代码 script.js 顶部的 MINIMAX_CONFIG 中填入真实的 API Key 和 Group ID。');
        return;
    }

    if (!currentChapters || !currentChapters[currentChapterIndex]) {
        showErrorModal('无法朗读', '当前没有可阅读的章节内容。');
        return;
    }

    let textToRead = currentChapters[currentChapterIndex].content;
    textToRead = textToRead.replace(/\s+/g, ' ').trim();

    if (!textToRead) {
        showErrorModal('无法朗读', '当前章节内容为空。');
        return;
    }

    isNovelPlaying = true;
    if (btnText) btnText.textContent = "加载中...";
    if (btnIcon) btnIcon.innerHTML = `<svg viewBox="0 0 50 50" class="spinner"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5" stroke="currentColor"></circle></svg>`;

    try {
        // 2. 调用合成函数，不再传递 config 对象，使用全局常量
        const audio = await synthesizeNovelAudio(textToRead);

        currentNovelAudio = audio;

        audio.onended = () => {
            stopNovelTts();
        };

        audio.onerror = () => {
            showErrorModal('播放出错', '音频流中断。');
            stopNovelTts();
        };

        audio.play();

        if (btnText) btnText.textContent = "停止";
        if (btnIcon) btnIcon.innerHTML = `<path d="M6 6h12v12H6z" />`;

    } catch (error) {
        console.error("听书失败:", error);
        stopNovelTts();
        showErrorModal('听书失败', error.message);
    }
}

// [修改版] 调用 API 合成音频
async function synthesizeNovelAudio(text) {
    // 截取文本防止超长
    const safeText = text.substring(0, 1500) + (text.length > 1500 ? "..." : "");

    const response = await fetch(`${MINIMAX_CONFIG.API_URL}?GroupId=${MINIMAX_CONFIG.GROUP_ID}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MINIMAX_CONFIG.API_KEY}`
        },
        body: JSON.stringify({
            model: MINIMAX_CONFIG.MODEL,
            text: safeText,
            stream: false,
            output_format: 'hex',
            voice_setting: {
                voice_id: MINIMAX_CONFIG.DEFAULT_VOICE_ID, // 使用统一的声音ID
                speed: 1.0,
                vol: 1.0,
                pitch: 0
            }
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.base_resp?.status_msg || `API Error: ${response.status}`);
    }

    const data = await response.json();
    if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new Error(data.base_resp.status_msg);
    }

    const audioHex = data.data.audio;
    if (!audioHex) throw new Error("API未返回音频数据");

    const audioBytes = hexToUint8Array(audioHex);
    const audioBlob = new Blob([audioBytes], {type: 'audio/mpeg'});
    const audioUrl = URL.createObjectURL(audioBlob);

    return new Audio(audioUrl);
}

// 全局变量：存储背景上下文（三页文本）
let globalReadingContext = "";

/**
 * [新增] 获取当前阅读位置的前后一共三页的文本
 * 逻辑：获取 scrollLeft 前一页、当前页、后一页范围内的所有文字
 */
function getReaderContext() {
    const container = document.getElementById('readerContainer');
    const content = document.getElementById('readerContent');

    if (!container || !content) return "";

    const pageWidth = container.clientWidth;
    const currentScroll = container.scrollLeft;

    // 定义范围：
    // 起点 = 当前滚动位 - 1页宽度 (上一页)
    // 终点 = 当前滚动位 + 2页宽度 (当前页 + 下一页)
    // 稍微放宽一点容差 (-10 / +10)，防止边缘文字丢失
    const startRange = currentScroll - pageWidth - 10;
    const endRange = currentScroll + (pageWidth * 2) + 10;

    const paragraphs = content.querySelectorAll('p');
    let contextParts = [];

    paragraphs.forEach(p => {
        // 在 CSS Column 布局中，offsetLeft 代表元素相对于容器起始位置的水平距离
        const pLeft = p.offsetLeft;
        const pWidth = p.offsetWidth;
        const pRight = pLeft + pWidth;

        // 判断段落是否与目标范围有交集
        // 逻辑：段落右侧大于范围起点 且 段落左侧小于范围终点
        if (pRight > startRange && pLeft < endRange) {
            // 优先获取 data-text (原始文本)，如果没有则取 innerText 并清理掉按钮符号
            const text = p.getAttribute('data-text') || p.innerText.replace("💬", "").trim();
            if (text) {
                contextParts.push(text);
            }
        }
    });

    return contextParts.join('\n\n');
}

/* ======================================================
   修复: 启动剧情讨论 (保留阅读器背景)
   ====================================================== */
function startPlotDiscussion(event, btnElement) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const pTag = btnElement.parentElement;
    const text = pTag.getAttribute('data-text');

    if (!text) return;

    pendingPlotContext = text;
    globalReadingContext = getReaderContext();

    // ▼▼▼ 核心修改：注释掉下面这两行，不要隐藏阅读器 ▼▼▼
    // document.getElementById('novelReaderPage').classList.remove('show');
    // document.getElementById('novelShelfPage').classList.remove('show');
    // ▲▲▲ 修改结束 ▲▲▲

    // 直接打开联系人库，它会以更高的层级覆盖在上面
    setTimeout(() => {
        openContactLibrary('discuss');
    }, 100);
}

/**
 * [步骤1] 核心功能：在后台对小说进行宏观层次分析 (同步阅读器分章逻辑版)
 */
async function analyzeNovelStructure(bookId) {
    const book = novelsLibrary.find(b => b.id === bookId);
    if (!book) return;

    // 1. 读取全文
    let fullText = "";
    try {
        fullText = await ImageDB.getText(book.contentId);
    } catch (e) {
        return;
    }

    // 2. ✨ 关键修改：使用和阅读器完全一致的分章逻辑
    // 这样能确保分析出来的 "第X章/部分" 和用户看到的是一一对应的
    const chapters = parseTxtToChapters(fullText);
    if (chapters.length === 0) return;

    // 3. 抽取摘要 (书名 + 简介 + 目录骨架)
    const introText = fullText.substring(0, 2000).replace(/\s+/g, ' ');
    const totalChapters = chapters.length;

    // 生成目录大纲字符串
    // 如果章节太多（比如超过30章），我们均匀抽取一些作为骨架给AI看
    const sampleStep = Math.max(1, Math.floor(totalChapters / 30));
    let chapterOutline = "";

    for (let i = 0; i < totalChapters; i += sampleStep) {
        // 获取每一章的标题 和 开头100个字作为预览
        const preview = chapters[i].content.substring(0, 50).replace(/\s+/g, ' ');
        chapterOutline += `${i + 1}. [${chapters[i].title}]: ${preview}...\n`;
    }

    // 4. 构建分析 Prompt
    // 专门针对自动分段的情况做了提示词优化
    const analysisPrompt = `
我上传了一本小说《${book.title}》。
这本书被切分成了 ${totalChapters} 个部分（可能是章节，也可能是自动按字数切分的段落）。

请根据下面的【开篇内容】和【目录/部分预览】，分析这本书的宏观走向。

【要求】：
1. 忽略琐碎细节，概括故事的主线剧情。
2. 即使是自动分段，也请尝试根据预览内容判断大致的剧情阶段。
3. 严格输出 JSON 格式。

【开篇内容】：${introText}...
【目录/部分概览】：
${chapterOutline}

请输出 JSON：
{
  "summary": "全书剧情一句话简介",
  "layers": [
    {"stage": "剧情阶段1", "range": "例如: 第1-5部分", "content": "概括该阶段主要发生了什么"},
    {"stage": "剧情阶段2", "range": "例如: 第6-15部分", "content": "概括该阶段主要发生了什么"}
  ] 
}`;

    // 5. 调用 AI 分析 (保持原有逻辑)
    try {
        const messages = [{role: 'user', content: analysisPrompt}];
        const result = await callApi(messages);

        if (result.success) {
            let analysisData = null;
            try {
                // 使用新的健壮解析器
                analysisData = robustJsonParse(result.message);
            } catch (e) {
                analysisData = {rawText: result.message};
            }

            // 6. 存入书籍数据
            book.aiAnalysis = analysisData;
            book.isAnalyzed = true;
            saveNovelLibrary();
            console.log(`✅ 《${book.title}》结构分析完成`);
        }
    } catch (err) {
        console.error("AI分析失败", err);
    }
}

/* =========================================================
   📚 剧情讨论核心逻辑优化 - 包含完整上下文注入与气泡分割
   ========================================================= */
/**
 * [优化版] 初始化剧情讨论
 * 1. 界面切换
 * 2. 数据准备
 * 3. 发送首条引用消息
 */
async function initiateDiscussChat(contact) {
    if (!pendingPlotContext) {
        showSuccessModal('提示', '剧情内容为空', 1500);
        closeContactLibrary();
        return;
    }
    const plotText = pendingPlotContext;
    // === 界面切换 ===
    closeContactLibrary();
    document.getElementById('novelReaderPage').classList.add('show'); // 确保背景是阅读器
    // === 数据准备 ===
    currentDiscussContact = contact;
    const contactId = contact.id;
    // 判断联系人类型以决定存储位置
    const isSweetheart = sweetheartContactsData.some(c => c.id === contactId) || contact.type === 'sweetheart';
    // 确保联系人已保存
    if (isSweetheart) {
        if (!sweetheartContactsData.some(c => c.id === contactId)) {
            sweetheartContactsData.push(contact);
            saveSweetheartContacts();
        }
    } else {
        if (!contactsData.some(c => c.id === contactId)) {
            contactsData.push(contact);
            localStorage.setItem('phoneContactsData', JSON.stringify(contactsData));
        }
    }
    // === 弹窗初始化 ===
    const modal = document.getElementById('discussModal');
    const msgContainer = document.getElementById('discussMessages');
    const titleEl = modal.querySelector('.discuss-title');
    msgContainer.innerHTML = ''; // 清空旧消息
    titleEl.textContent = `与 ${contact.name} 讨论中`;
    modal.classList.add('show');
    // === 加载历史记录 (最近30条) ===
    const storageKey = isSweetheart ? 'phoneSweetheartChatHistory' : 'phoneChatHistory';
    const allHistory = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const myHistory = allHistory[contactId] || [];
    myHistory.slice(-30).forEach(msg => {
        appendDiscussBubble(msg); // 渲染历史气泡
    });
    // === 发送当前的“剧情引用”消息 ===
    const messagePayload = {
        sender: 'user',
        text: '这段剧情很有意思，你怎么看？',
        quote: {
            text: plotText,
            senderName: '小说原文'
        },
        timestamp: Date.now()
    };
    // 1. 保存
    const saveFunc = isSweetheart ? saveSweetheartMessage : saveMessage;
    saveFunc(contactId, messagePayload);
    // 2. 渲染
    appendDiscussBubble(messagePayload);
    // 3. 触发AI (上下文增强版)
    await triggerDiscussAI(messagePayload, isSweetheart, true);
}

// 2. 关闭弹窗函数
function closeDiscussModal() {
    // 只是移除 .show 类，这样底下的 content (小说阅读器) 就会露出来
    document.getElementById('discussModal').classList.remove('show');
}


// 3. 发送按钮点击事件
// 发送消息按钮逻辑 (纯文本)
function sendDiscussMessage() {
    const input = document.getElementById('discussInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';

    const contactId = currentDiscussContact.id;
    const isSweetheart = sweetheartContactsData.some(c => c.id === contactId) || currentDiscussContact.type === 'sweetheart';

    const msgObj = {sender: 'user', text: text, timestamp: Date.now()};

    // 保存
    const saveFunc = isSweetheart ? saveSweetheartMessage : saveMessage;
    saveFunc(contactId, msgObj);

    // 渲染
    appendDiscussBubble(msgObj);

    // 触发AI
    triggerDiscussAI(msgObj, isSweetheart);
}

/**
 * [步骤3] 触发剧情讨论 AI 回复 (当前章节内容深度注入版)
 * 核心升级：不再只依赖宏观分析，而是直接把当前章节/部分的实际文字喂给 AI
 */
async function triggerDiscussAI(userMsgObj, isSweetheart, isInit = false) {
    const contactId = currentDiscussContact.id;
    const saveFunc = isSweetheart ? saveSweetheartMessage : saveMessage;

    // UI: 显示“正在输入”
    const loadingId = 'loading-' + Date.now();
    const loadingMsgContainer = document.createElement('div');
    loadingMsgContainer.id = loadingId;
    loadingMsgContainer.style.textAlign = 'center';
    loadingMsgContainer.style.padding = '10px';
    loadingMsgContainer.innerHTML = `<span style="font-size:12px; color:#999;">✨ ${currentDiscussContact.name} 正在阅读当前剧情...</span>`;

    const msgContainer = document.getElementById('discussMessages');
    if (msgContainer) {
        msgContainer.appendChild(loadingMsgContainer);
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    // --- 构建 Prompt Payload ---
    const messagesPayload = [];

    // 1. 基础系统指令
    messagesPayload.push({role: "system", content: AI_REALCHAT_SYSTEM_PROMPT});

    // 2. ✨✨✨ 核心升级：注入当前章节/部分的具体内容 ✨✨✨
    if (currentReadingBookId && currentChapters && currentChapters[currentChapterIndex]) {
        const book = novelsLibrary.find(b => b.id === currentReadingBookId);
        const currentChap = currentChapters[currentChapterIndex];

        let novelContextInfo = "";

        // A. 宏观背景 (如果有 AI 分析结果)
        if (book && book.aiAnalysis) {
            if (book.aiAnalysis.rawText) {
                novelContextInfo += `【全书背景参考】：${book.aiAnalysis.rawText}\n\n`;
            } else if (book.aiAnalysis.layers) {
                novelContextInfo += "【全书背景参考】：\n";
                book.aiAnalysis.layers.forEach(layer => {
                    novelContextInfo += `- ${layer.stage} (${layer.range}): ${layer.content}\n`;
                });
                novelContextInfo += "\n";
            }
        }

        // B. 微观实况 (当前这部分的实际文字)
        // 为了防止 Token 超限，我们截取本章关键内容（前2000字 + 后1000字）
        // 如果是自动切分的“部分”，内容通常在 8000 字左右，全部发过去可能会有点多，建议截取
        const contentText = currentChap.content;
        let contentToSend = "";

        if (contentText.length > 3500) {
            contentToSend = contentText.substring(0, 2000) +
                "\n\n......(中间略)......\n\n" +
                contentText.substring(contentText.length - 1000);
        } else {
            contentToSend = contentText;
        }

        const currentReadingPrompt = `
[小说阅读实况数据]
📖 书名：《${book ? book.title : '未知'}》
📍 当前进度：${currentChap.title} (第 ${currentChapterIndex + 1} 部分/章)

Creating Context...
${novelContextInfo}

📜 **【重点：用户当前正在阅读的文字内容】**：
"""
${contentToSend}
"""

(System Instruction: 用户正在读上面这段具体的文字。请务必结合【这段文字的具体剧情】，以${currentDiscussContact.name}的身份发表看法、吐槽或回应。不要只说空话，要显得你也读了这段内容。)
`;
        messagesPayload.push({role: "system", content: currentReadingPrompt});
    }

    // 3. 注入世界书/世界设定/人设 (保持不变)
    // ... 世界书 ...
    const worldbookContext = gatherWorldbookContext();
    if (worldbookContext) messagesPayload.push({role: "system", content: worldbookContext});

    // ... 世界设定 ...
    if (currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world) {
            let worldSettingText = `[当前世界设定]\n世界名称：${world.name}\n${world.description || ''}`;
            messagesPayload.push({role: "system", content: worldSettingText});
        }
    }

    // ... 角色设定 (合并处理) ...
    let characterInfo = `[你的角色设定]\n姓名：${currentDiscussContact.name}\n`;
    if (currentDiscussContact.status) characterInfo += `设定：${currentDiscussContact.status}\n`;
    if (currentDiscussContact.personality) characterInfo += `性格：${currentDiscussContact.personality}\n`;
    if (currentDiscussContact.boundMasks) {
        currentDiscussContact.boundMasks.forEach(maskId => {
            const mask = masksData.find(m => m.id === maskId);
            if (mask) characterInfo += `\n[${mask.name}]: ${mask.content}`;
        });
    }
    messagesPayload.push({role: "system", content: characterInfo});

    // 4. 用户设定
    if (userProfile.persona) {
        messagesPayload.push({role: "system", content: `[用户设定]\n${userProfile.persona}`});
    }

    // 5. 处理用户发送的消息 (引用+评论)
    let finalUserText = userMsgObj.text;
    if (userMsgObj.quote) {
        // 在讨论模式下，我们强调用户是指着具体的某句话
        finalUserText = `(指着文中这一句) "${userMsgObj.quote.text}"\n\n我说：${userMsgObj.text}`;
    }

    if (isInit) {
        messagesPayload.push({
            role: "system",
            content: `(Action: 这是一个新的讨论话题。请直接针对用户引用的那句话以及当前章节发生的剧情进行互动。)`
        });
    }

    messagesPayload.push({role: "user", content: finalUserText});

    // --- 发起请求 ---
    try {
        const result = await callApi(messagesPayload);
        const el = document.getElementById(loadingId);
        if (el) el.remove();

        if (result.success) {
            let rawReply = result.message;
            // 清洗
            rawReply = rawReply.replace(/^```json|```$/g, '').trim();
            try {
                const parsed = JSON.parse(rawReply);
                if (parsed.reply) rawReply = parsed.reply;
            } catch (e) {
            }

            // 保存
            saveFunc(contactId, {sender: 'contact', text: rawReply, timestamp: Date.now()});

            // 渲染
            const segments = rawReply.split('---').filter(s => s.trim() !== '');
            if (segments.length > 0) {
                for (const seg of segments) {
                    appendDiscussBubble(seg.trim(), 'contact');
                    await new Promise(r => setTimeout(r, 600));
                }
            } else {
                appendDiscussBubble(rawReply, 'contact');
            }
        } else {
            appendDiscussBubble(`(连接失败: ${result.message})`, 'system');
        }
    } catch (err) {
        console.error(err);
        const el = document.getElementById(loadingId);
        if (el) el.remove();
        alert("网络请求出错");
    }
}


/**
 * 4. 核心逻辑：处理发送、保存、AI回复、弹窗渲染 (增强版：带人设和世界书)
 */
async function handleDiscussSend(text, isInit) {
    if (!currentDiscussContact) return;

    const contactId = currentDiscussContact.id;
    // 判断是密友还是普通联系人，决定用哪个保存函数
    const isSweetheart = sweetheartContactsData.some(c => c.id === contactId) || currentDiscussContact.type === 'sweetheart';
    const activeSaveFunc = isSweetheart ? saveSweetheartMessage : saveMessage;

    // === A. 用户消息处理 ===

    // 1. 保存到 LocalStorage (实现同步)
    const userMsgObj = {sender: 'user', text: text};
    // 如果是初始消息（剧情引用），我们可以把引用部分存为quote，或者作为普通文本，这里作为普通文本处理更简单
    activeSaveFunc(contactId, userMsgObj);

    // 2. 渲染到悬浮窗 (创建临时的DOM)
    appendDiscussBubble(text, 'user');

    // === B. AI 回复处理 ===

    // 显示“对方正在输入”
    const loadingId = 'discuss-loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.color = '#999';
    loadingDiv.style.fontSize = '12px';
    loadingDiv.style.marginTop = '10px';
    loadingDiv.textContent = `${currentDiscussContact.name} 正在输入...`;
    document.getElementById('discussMessages').appendChild(loadingDiv);
    document.getElementById('discussMessages').scrollTop = document.getElementById('discussMessages').scrollHeight;

    // --- ⬇️⬇️⬇️ 核心修改：构建完整的上下文 Prompt ⬇️⬇️⬇️ ---

    const messagesPayload = [];

    // 1. 发送真人聊天风格指令 (确保像正常聊天)
    messagesPayload.push({role: "system", content: AI_REALCHAT_SYSTEM_PROMPT});

    // 2. 发送世界书上下文 (Lore)
    // 我们需要手动收集该角色绑定的世界书，因为 gatherWorldbookContext 依赖全局变量
    const relevantWorldbookIds = new Set();
    // 添加内置全局设定
    relevantWorldbookIds.add(GLOBAL_WORLDBOOK_ID);
    // 添加角色绑定的
    if (currentDiscussContact.boundWorldbooks) {
        currentDiscussContact.boundWorldbooks.forEach(id => relevantWorldbookIds.add(id));
    }
    // 添加当前世界绑定的
    if (currentWorldId) {
        const world = worldsData.find(w => w.id === currentWorldId);
        if (world && world.worldbooks) {
            world.worldbooks.forEach(id => relevantWorldbookIds.add(id));
        }
    }
    // 组装文本
    const contextEntries = [];
    relevantWorldbookIds.forEach(id => {
        const entry = worldbookData.find(wb => wb.id === id);
        if (entry && entry.content) {
            contextEntries.push(`### ${entry.title}\n${entry.content}`);
        }
    });
    if (contextEntries.length > 0) {
        messagesPayload.push({
            role: "system",
            content: "[背景设定/世界观 (Bot必须遵守)]\n---\n" + contextEntries.join('\n\n') + "\n---"
        });
    }

    // 3. 发送角色基本人设 (Persona)
    let characterSetting = `[你的角色设定]\n姓名：${currentDiscussContact.name}\n`;
    if (currentDiscussContact.status) characterSetting += `基础设定：${currentDiscussContact.status}\n`;
    if (currentDiscussContact.personality) characterSetting += `性格：${currentDiscussContact.personality}\n`;
    if (currentDiscussContact.relationship) characterSetting += `与用户的关系：${currentDiscussContact.relationship}\n`;
    messagesPayload.push({role: "system", content: characterSetting});

    // 4. 发送绑定的面具 (Masks) - 这是详细人设的关键
    if (currentDiscussContact.boundMasks && currentDiscussContact.boundMasks.length > 0) {
        let maskContent = '[你的详细人设/面具]\n';
        currentDiscussContact.boundMasks.forEach(maskId => {
            const mask = masksData.find(m => m.id === maskId);
            if (mask) {
                maskContent += `### ${mask.name}\n${mask.content}\n\n`;
            }
        });
        messagesPayload.push({role: "system", content: maskContent});
    }

    // 5. 发送用户设定 (User Persona)
    if (userProfile.persona) {
        messagesPayload.push({
            role: "system",
            content: `[用户(我)的设定]\n姓名：${userProfile.name}\n${userProfile.persona}`
        });
    }

    // 6. 如果是初始剧情讨论，添加一个特殊的引导语
    if (isInit) {
        const guidePrompt = `(系统提示：用户正在与你分享一段小说剧情。请保持你的人设性格（${currentDiscussContact.name}），用自然的口语发表看法或吐槽，就像朋友聊天一样。不要像AI助手那样做阅读理解分析。)`;
        messagesPayload.push({role: "system", content: guidePrompt});
    }

    // 7. 添加用户的当前消息
    messagesPayload.push({role: "user", content: text});

    // --- ⬆️⬆️⬆️ 构建结束 ⬆️⬆️⬆️ ---

    try {
        const result = await callApi(messagesPayload);

        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        if (result.success) {
            let replyText = result.message;

            // 尝试解析可能的 JSON (针对密友模式) 或清理 Markdown
            if (isSweetheart) {
                try {
                    // 如果AI返回了JSON格式，尝试提取reply字段
                    const parsed = JSON.parse(replyText);
                    if (parsed.reply) replyText = parsed.reply;
                } catch (e) {
                    // 忽略JSON错误，视为普通文本
                }
            }
            // 清理可能存在的 ```json 等标记
            replyText = replyText.replace(/^```json|```$/g, '').trim();

            // 4. 保存 AI 回复
            const aiMsgObj = {sender: 'contact', text: replyText};
            activeSaveFunc(contactId, aiMsgObj);

            // 5. 渲染 (处理 --- 分段)
            const segments = replyText.split('---').filter(s => s.trim());
            if (segments.length > 0) {
                for (const seg of segments) {
                    appendDiscussBubble(seg.trim(), 'contact');
                    // 简单的打字机延迟效果
                    await new Promise(r => setTimeout(r, 300));
                }
            } else {
                appendDiscussBubble(replyText, 'contact');
            }

        } else {
            // 这里换成不那么突兀的气泡报错
            appendDiscussBubble(`(发送失败: ${result.message})`, 'system');
        }

    } catch (err) {
        console.error(err);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        alert("网络请求出错");
    }
}

// 5. 辅助：在悬浮窗内渲染气泡 (增强版：支持引用样式和历史记录)
/* script.js - 修改 appendDiscussBubble 函数 */

/**
 * [优化 Markdown 版] 渲染单条讨论消息
 */
function appendDiscussBubble(messageData) {
    const container = document.getElementById('discussMessages');

    // 数据归一化 (兼容旧格式传参)
    let msg = messageData;
    if (typeof messageData === 'string') {
        msg = {sender: 'contact', text: messageData}; // 默认为对方
        // 如果有第二个参数
        if (arguments.length > 1) msg.sender = arguments[1];
    }

    const row = document.createElement('div');
    row.className = `message-row ${msg.sender === 'user' ? 'sent' : 'received'}`;

    // 1. 头像逻辑
    let avatarSrc = '💬';
    if (msg.sender === 'user') {
        avatarSrc = userProfile.avatar || '👤';
    } else {
        avatarSrc = currentDiscussContact.avatar || '💬';
    }

    const isUrl = avatarSrc.includes('http') || avatarSrc.includes('data:');
    const avatarHtml = isUrl
        ? `<img src="${avatarSrc}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="initials">${avatarSrc}</div>`;

    // 2. 内容气泡
    let contentHtml = '';

    // 处理引用样式 (引用部分保持纯文本或简单转义)
    if (msg.quote) {
        contentHtml += `
            <div class="quoted-message-wrapper" style="font-size:12px; opacity:0.8; margin-bottom:6px;">
                <strong style="color:inherit;">${escapeHTML(msg.quote.senderName)}</strong>
                <div style="margin-top:2px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; opacity: 0.9;">
                    ${escapeHTML(msg.quote.text)}
                </div>
            </div>
        `;
    }

    // 🔥🔥🔥 核心修改：使用 Markdown 解析器处理主文本 🔥🔥🔥
    const rawText = msg.text || '';
    // 如果文本包含 <img (图片)，则不进行 Markdown 解析，直接显示 HTML (或者根据你的需求处理)
    // 假设讨论中主要是文字，我们进行解析：
    const renderedText = parseSimpleMarkdown(rawText);

    // 将解析后的 HTML 放入带有 markdown-content 类的容器中
    contentHtml += `<div class="markdown-content">${renderedText}</div>`;

    // 组装 HTML
    row.innerHTML = `
        <div class="message-chat-avatar" style="width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0; background:#eee;">
            ${avatarHtml}
        </div>
        <div class="message-content" style="max-width:85%;"> <!-- 稍微调宽一点方便显示代码/列表 -->
            <div class="chat-bubble" style="padding:10px 14px; font-size:14px; ${msg.sender === 'user' ? 'background:#0A84FF;color:white;' : 'background:white;color:#333;border:1px solid #eee;'}">
                ${contentHtml}
            </div>
        </div>
    `;

    container.appendChild(row);

    // 滚动底部
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });
}


/**
 * [轻量级 Markdown 解析器]
 * 专为聊天气泡设计，处理常用的格式：标题、列表、粗体、引用、代码块
 * @param {string} text - 原始 Markdown 文本
 * @returns {string} - 解析后的 HTML 字符串
 */
function parseSimpleMarkdown(text) {
    if (!text) return '';

    // 1. 安全转义 (防XSS) - 先转义基本字符，但在后续正则处理中要小心
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // 2. 保护代码块 (避免代码块内部的内容被格式化)
    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
        codeBlocks.push(code); // 保存代码内容
        return `___CODE_BLOCK_${codeBlocks.length - 1}___`; // 占位符
    });

    const inlineCodes = [];
    html = html.replace(/`([^`]+)`/g, (match, code) => {
        inlineCodes.push(code);
        return `___INLINE_CODE_${inlineCodes.length - 1}___`;
    });

    // 3. 处理标题 (# H1 - ### H3) -> 转换为 <strong> 或 h3 (避免气泡内字太大)
    html = html.replace(/^(#{1,3})\s+(.*)$/gm, (match, hashes, content) => {
        return `<h3>${content}</h3>`;
    });

    // 4. 处理粗体 (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 5. 处理斜体 (*text*)
    html = html.replace(/(^|[^\*])\*([^\*]+)\*(?=$|[^\*])/g, '$1<em>$2</em>');

    // 6. 处理引用 (> text)
    html = html.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');

    // 7. 处理无序列表 (- item 或 * item)
    // 技巧：先将每一行列表项转为 <li>，然后再用正则把没被包裹的相邻 <li> 包裹进 <ul>
    html = html.replace(/^\s*[\-\*]\s+(.*)$/gm, '<li>$1</li>');
    // 将连续的 li 包裹在 ul 中 (简单实现：匹配连续的 li 标签)
    html = html.replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/gs, '<ul>$1</ul>');

    // 8. 处理有序列表 (1. item)
    html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>');
    // 注意：这里简单地将有序列表也转为了 li，如果 <ul> 和 <ol> 重叠可能会有样式小瑕疵，
    // 但在聊天中通常能接受。为了区分，可以用不同的替换逻辑包裹 <ol>，这里从简：
    // 如果上一行已经是 <ul>...</ul>，这里的有序 li 会被独立。为简单起见，暂且让 CSS 统一处理 li。
    // 若要严格区分，需更复杂的解析器。

    // 9. 处理普通换行：将剩余的换行符转化为 <br>
    // 注意：ul, blockquote, h3 等块级元素后的换行可以去掉，避免间距过大
    html = html.replace(/<\/ul>\s*\n/g, '</ul>');
    html = html.replace(/<\/blockquote>\s*\n/g, '</blockquote>');
    html = html.replace(/<\/h3>\s*\n/g, '</h3>');
    html = html.replace(/\n/g, '<br>');

    // 10. 恢复代码块
    html = html.replace(/___INLINE_CODE_(\d+)___/g, (match, index) => {
        return `<code>${inlineCodes[index]}</code>`;
    });
    html = html.replace(/___CODE_BLOCK_(\d+)___/g, (match, index) => {
        return `<pre><code>${codeBlocks[index]}</code></pre>`;
    });

    return html;
}


/* =========================================
   💰 小猫记账本核心逻辑 (AI 增强版 - 带持久化记忆)
   ========================================= */
let ledgerData = []; // 存储账单数据 (交易明细)
let ledgerChatHistory = []; // ✨ 新增：存储聊天对话记录
let isLedgerListMode = false;
let isLedgerAiMode = false;
// ✨✨ AI 记账专用提示词 (兼容版) ✨✨
const LEDGER_AI_PROMPT = `
你是一个专业的记账助手。请分析图片中的账单或交易记录。
【核心指令】
1. **必须返回纯 JSON 格式**。不要使用 Markdown 表格，不要使用 \`\`\`json 包裹。
2. **严禁输出 markdown 代码块**。
3. 直接返回 JSON 对象。
【JSON 格式要求】
{
  "reply": "简短的回复 (例如: 识别成功！)",
  "items": [
    {"desc": "商品或交易名称", "amount": 12.50},
    {"desc": "另一项", "amount": -5.00}
  ]
}
注意：支出金额请自动转为负数，收入为正数。
`;

// 1. 初始化与打开/关闭
function openLedger() {
    loadLedgerData();
    document.getElementById('ledgerPage').classList.add('show');
    renderLedgerStats();
    updateLedgerDate();

    // ✨ 新增：渲染历史聊天记录
    renderLedgerChatHistory();
}

function closeLedger() {
    document.getElementById('ledgerPage').classList.remove('show');
}

// 2. 切换视图模式 (对话 vs 列表)
function toggleLedgerMode() {
    isLedgerListMode = !isLedgerListMode;
    const chatArea = document.getElementById('ledgerChatMode');
    const listArea = document.getElementById('ledgerListMode');
    const toggleBtn = document.querySelector('.ledger-toggle-mode');

    if (isLedgerListMode) {
        chatArea.classList.add('hidden');
        listArea.classList.remove('hidden');
        toggleBtn.textContent = '切换记账 💬';
        renderLedgerList();
    } else {
        chatArea.classList.remove('hidden');
        listArea.classList.add('hidden');
        toggleBtn.textContent = '切换列表 📝';
        // 切换回聊天时滚动到底部
        const list = document.getElementById('ledgerChatList');
        if (list) list.scrollTop = list.scrollHeight;
    }
}

// 切换 AI 记账模式
function toggleLedgerAiMode() {
    isLedgerAiMode = !isLedgerAiMode;

    // 更新 UI
    const switchEl = document.querySelector('.ledger-ai-switch');
    const inputBar = document.querySelector('.ledger-input-bar');
    const inputField = document.getElementById('ledgerInput');

    if (isLedgerAiMode) {
        switchEl.classList.add('active');
        inputBar.classList.add('ai-active');
        inputField.placeholder = "✨ AI模式：发送“今晚吃火锅300”试试...";
        showSuccessModal('AI 记账开启', '发送文字或图片，小猫帮你识别！', 1500);
    } else {
        switchEl.classList.remove('active');
        inputBar.classList.remove('ai-active');
        inputField.placeholder = "例如：喝奶茶 25";
    }
}

// 3. 数据持久化 (包含账单和聊天记录)
function loadLedgerData() {
    try {
        // 加载账单明细
        const savedLedger = localStorage.getItem('phoneLedgerData');
        if (savedLedger) ledgerData = JSON.parse(savedLedger);

        // ✨ 加载聊天记录
        const savedHistory = localStorage.getItem('phoneLedgerChatHistory');
        if (savedHistory) ledgerChatHistory = JSON.parse(savedHistory);
        else ledgerChatHistory = [];

    } catch (e) {
        console.error('Ledger load error', e);
    }
}

function saveLedgerData() {
    localStorage.setItem('phoneLedgerData', JSON.stringify(ledgerData));
    renderLedgerStats();
}

// ✨ 新增：保存聊天记录
function saveLedgerChatHistory() {
    // 限制历史记录数量，防止无限增长（例如保留最近100条）
    if (ledgerChatHistory.length > 100) {
        ledgerChatHistory = ledgerChatHistory.slice(-100);
    }
    localStorage.setItem('phoneLedgerChatHistory', JSON.stringify(ledgerChatHistory));
}

// ✨ 新增：渲染历史记录
function renderLedgerChatHistory() {
    const list = document.getElementById('ledgerChatList');
    // 保留系统欢迎语
    list.innerHTML = '<div class="ledger-system-msg">喵~ 发送“项目 金额”或者上传小票照片，我帮你记账哦！💰</div>';

    ledgerChatHistory.forEach(msg => {
        // 第4个参数 false 表示不重复保存到历史
        addLedgerBubble(msg.content, msg.type, msg.id, false);
    });

    // 滚动到底部
    setTimeout(() => {
        list.scrollTop = list.scrollHeight;
    }, 50);
}

// 4. 更新顶部统计
function renderLedgerStats() {
    let income = 0;
    let expense = 0;
    ledgerData.forEach(item => {
        if (item.amount > 0) income += item.amount;
        else expense += Math.abs(item.amount);
    });

    document.getElementById('statIncome').textContent = income.toFixed(2);
    document.getElementById('statExpense').textContent = expense.toFixed(2);
    document.getElementById('statBalance').textContent = (income - expense).toFixed(2);
}

function updateLedgerDate() {
    const now = new Date();
    document.getElementById('ledgerCurrentMonth').textContent = `${now.getMonth() + 1}月`;
}

// 5. 发送记账消息 (已修改：添加保存逻辑)
async function sendLedgerMessage() {
    const input = document.getElementById('ledgerInput');
    const text = input.value.trim();
    if (!text) return;

    // A. 用户消息上屏 (true 表示保存到历史)
    addLedgerBubble(text, 'user', null, true);
    input.value = '';

    // === 判断是否为 AI 模式 ===
    if (isLedgerAiMode) {
        // AI 模式逻辑

        const loadingId = 'loading-' + Date.now();
        // Loading消息不需要保存到历史
        addLedgerBubble("小猫正在疯狂计算中... 🧮", 'ai', loadingId, false);

        try {
            const messages = [
                {role: "system", content: LEDGER_AI_PROMPT},
                {role: "user", content: text}
            ];

            const result = await callApi(messages);
            document.getElementById(loadingId)?.remove();

            if (!result.success) {
                addLedgerBubble(`出错了喵：${result.message}`, 'ai', null, true);
                return;
            }

            let aiData;
            try {
                const jsonMatch = result.message.match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : result.message;
                aiData = JSON.parse(jsonStr);
            } catch (e) {
                console.error("AI JSON解析失败", e);
                addLedgerBubble("算不过来了... (AI返回格式错误)", 'ai', null, true);
                return;
            }

            const record = {
                id: Date.now(),
                desc: aiData.desc || "未知项",
                amount: parseFloat(aiData.amount),
                date: Date.now(),
                type: parseFloat(aiData.amount) > 0 ? 'income' : 'expense'
            };

            ledgerData.unshift(record);
            saveLedgerData();

            const amountStr = Math.abs(record.amount).toFixed(2);
            const sign = record.amount > 0 ? '+' : '-';
            const finalReply = `${aiData.reply}\n\n✅ 已记账：${record.desc} ${sign}${amountStr}`;

            addLedgerBubble(finalReply, 'ai', null, true);

        } catch (err) {
            document.getElementById(loadingId)?.remove();
            addLedgerBubble("连接断开了... 😿", 'ai', null, true);
            console.error(err);
        }

    } else {
        // 🛠️ 原生简单逻辑
        const numMatch = text.match(/(-?\d+(\.\d+)?)/g);

        if (numMatch) {
            const amountStr = numMatch[numMatch.length - 1];
            let amount = parseFloat(amountStr);
            let desc = text.replace(amountStr, '').trim();
            if (!desc) desc = "一般支出";

            let type = 'expense';
            if (text.includes('收入') || text.includes('赚') || text.includes('工资')) {
                type = 'income';
                amount = Math.abs(amount);
            } else {
                type = 'expense';
                amount = -Math.abs(amount);
            }

            await new Promise(r => setTimeout(r, 600));

            const record = {id: Date.now(), desc, amount, date: Date.now(), type};
            ledgerData.unshift(record);
            saveLedgerData();

            const reply = `记下来啦！📝\n【${desc}】 ${type === 'income' ? '收入' : '支出'} ${Math.abs(amount)}元`;
            addLedgerBubble(reply, 'ai', null, true);

        } else {
            await new Promise(r => setTimeout(r, 600));
            addLedgerBubble("唔...我没看懂金额，请说“奶茶 20”这样的格式哦~", 'ai', null, true);
        }
    }
}

// 6. 发送图片记账 (AI 识别更新 + 持久化修复)
function triggerLedgerImage() {
    if (!isLedgerAiMode) {
        showSuccessModal('功能受限', '只有 AI 记账模式才可以识别图片哦~ 📷', 2000);
        return;
    }
    document.getElementById('ledgerMsgImageInput').click();
}

/**
 * 强制解析 JSON (容错处理)
 */
function forceParseJson(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        // 尝试提取 JSON 部分
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (err) {
                return null;
            }
        }
        return null;
    }
}

/**
 * 清洗 AI 返回的文本
 */
function cleanAiResponseText(text) {
    let cleaned = text;
    // 1. 去除 think 标签 (如果是深度思考模型)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
    // 2. 去除 markdown 代码块标记
    cleaned = cleaned.replace(/```json/gi, "").replace(/```/g, "");
    return cleaned.trim();
}

/**
 * 📊 Markdown 表格解析器 (备用方案)
 * 当 AI 不听话返回表格时，用这个函数提取数据
 */
function parseMarkdownTableToItems(text) {
    const items = [];
    const lines = text.split('\n');

    for (const line of lines) {
        // 必须包含竖线，且不能是分割线 (---|---)
        if (!line.includes('|') || line.includes('---')) continue;

        // 分割列并去空
        const cols = line.split('|').map(s => s.trim()).filter(s => s);

        // 简单的启发式逻辑：寻找看起来像金额的列
        // 通常表格里：日期 | 描述 | 金额 | 备注
        // 我们尝试在列中寻找数字
        let amount = null;
        let desc = null;

        for (const col of cols) {
            // 尝试匹配金额 (支持 -13.50, +18.00, 10.00)
            // 排除单纯的日期 (2025年...)
            if (/^[-+]?\d+(\.\d{1,2})?$/.test(col)) {
                amount = parseFloat(col);
            } else if (!col.includes('2025') && !col.includes(':') && col.length > 1) {
                // 如果不是日期也不是时间，且长度大于1，可能是描述
                // 优先保留最长的文本作为描述
                if (!desc || col.length > desc.length) {
                    desc = col;
                }
            }
        }

        if (amount !== null && desc) {
            items.push({desc: desc, amount: amount});
        }
    }
    return items;
}


async function handleLedgerImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 1. 生成预览
    const previewUrl = URL.createObjectURL(file);
    const previewHtml = `<img src="${previewUrl}" style="max-width: 150px; border-radius: 12px; display: block;" alt="账单图片">`;
    addLedgerBubble(previewHtml, 'user', null, false);

    event.target.value = '';


    const loadingId = 'img-loading-' + Date.now();
    addLedgerBubble("正在分析账单... (可能会有点慢)", 'ai', loadingId, false);

    try {
        // 2. 存图
        const imgId = await ImageDB.save(file);
        const dbHtml = `<img src="db-image://${imgId}" style="max-width: 150px; border-radius: 12px; display: block;" alt="账单图片">`;
        ledgerChatHistory.push({content: dbHtml, type: 'user', id: Date.now()});
        saveLedgerChatHistory();

        // 3. 读取并发送
        const base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });

        const messages = [
            {role: "system", content: LEDGER_AI_PROMPT},
            {
                role: "user",
                content: [
                    {type: "text", text: "识别这张账单。"},
                    {type: "image_url", image_url: {url: base64Data}}
                ]
            }
        ];

        const result = await callApi(messages);
        document.getElementById(loadingId)?.remove();

        if (!result.success) {
            addLedgerBubble(`连接失败：${result.message}`, 'ai', null, true);
            return;
        }

        console.log("🐱 AI原始回复:", result.message);

        // --- 核心修改：双保险解析逻辑 ---
// 步骤 A: 清洗数据
        const cleanText = cleanAiResponseText(result.message);
        console.log("🧹 清洗后文本:", cleanText);
        let items = [];
        let replyMsg = "识别完成！";
// 步骤 B: 尝试解析 JSON (优先)
        const jsonData = forceParseJson(cleanText);
        if (jsonData && jsonData.items && jsonData.items.length > 0) {
            // 方案 1: JSON 解析成功
            items = jsonData.items;
            replyMsg = jsonData.reply || "识别成功";
            console.log("✅ JSON解析模式成功");
        } else {
            // 方案 2: JSON 失败，启用表格解析模式 (针对你截图中的情况)
            console.warn("⚠️ JSON解析失败，尝试表格解析模式...");
            const tableItems = parseMarkdownTableToItems(cleanText);

            if (tableItems.length > 0) {
                items = tableItems;
                replyMsg = "虽然不是标准格式，但我看懂账单啦！(表格模式)";
                console.log("✅ 表格解析模式成功", items);
            }
        }
// 步骤 C: 结果处理
        if (items.length === 0) {
            // 只有当两种方法都失败时，才显示错误
            addLedgerBubble(`看不懂这个格式喵... (解析失败)\nAI回复片段: ${cleanText.substring(0, 100)}...`, 'ai', null, true);
            return;
        }
// 步骤 D: 记账入库 (保持原有逻辑)
        let totalIncome = 0;
        let totalExpense = 0;
        let detailsStr = "";
        items.forEach(item => {
            const amount = parseFloat(item.amount);
            if (isNaN(amount)) return;
            const desc = item.desc || "未知项";
            // 自动修正类型：负数为支出，正数为收入
            const type = amount > 0 ? 'income' : 'expense';
            if (amount > 0) totalIncome += amount;
            else totalExpense += Math.abs(amount);
            const record = {
                id: Date.now() + Math.random(),
                desc: desc,
                amount: amount,
                type: type,
                date: Date.now(),
                imgId: imgId // 关联图片ID
            };
            ledgerData.unshift(record);
            const sign = amount > 0 ? '+' : '';
            detailsStr += `\n🔹 ${desc} ${sign}${amount}`;
        });
        saveLedgerData(); // 更新界面统计
        let summary = "\n\n📊 本次识别统计:";
        if (totalIncome > 0) summary += `\n收入: +${totalIncome.toFixed(2)}`;
        if (totalExpense > 0) summary += `\n支出: -${totalExpense.toFixed(2)}`;
        addLedgerBubble(`${replyMsg}${detailsStr}${summary}`, 'ai', null, true);

    } catch (e) {
        document.getElementById(loadingId)?.remove();
        console.error(e);
        addLedgerBubble(`处理出错了：${e.message}`, 'ai', null, true);
    }
}


/**
 * 辅助：添加气泡 (已修改：集成保存逻辑和图片加载)
 * @param {string} content 内容
 * @param {string} type 'user' 或 'ai'
 * @param {string} id 可选ID
 * @param {boolean} shouldSave 是否保存到历史记录 (默认 false，防止重复保存)
 */
function addLedgerBubble(content, type, id = null, shouldSave = false) {
    const list = document.getElementById('ledgerChatList');
    const div = document.createElement('div');

    div.className = `ledger-msg ${type}`;

    if (typeof content === 'string' && content.includes('<img')) {
        div.innerHTML = content;
        div.style.background = 'transparent';
        div.style.padding = '0';
        div.style.boxShadow = 'none';
        div.classList.add('image-bubble');

        // ✨ 如果是 db-image，则加载它
        const img = div.querySelector('img');
        if (img && img.src.startsWith('db-image://')) {
            loadRealImage(img);
        }
    } else {
        div.textContent = content;
    }

    if (id) div.id = id;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;

    // ✨ 执行保存
    if (shouldSave) {
        ledgerChatHistory.push({
            content: content,
            type: type,
            id: id || Date.now(),
            timestamp: Date.now()
        });
        saveLedgerChatHistory();
    }
}

// 7. 渲染明细列表 (保持不变)
function renderLedgerList() {
    const container = document.getElementById('ledgerListContainer');
    container.innerHTML = '';

    if (ledgerData.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">暂无账单记录</div>';
        return;
    }

    ledgerData.forEach(item => {
        const row = document.createElement('div');
        row.className = 'ledger-record-item';

        const dateStr = new Date(item.date).toLocaleDateString();
        const icon = item.amount > 0 ? '💰' : '💸';
        const amountClass = item.amount > 0 ? 'income' : 'expense';
        const amountSign = item.amount > 0 ? '+' : '';

        row.innerHTML = `
            <div class="record-icon">${icon}</div>
            <div class="record-info">
                <div class="record-title">${item.desc}</div>
                <div class="record-date">${dateStr}</div>
            </div>
            <div class="record-amount ${amountClass}">${amountSign}${item.amount.toFixed(2)}</div>
            <div class="record-delete" onclick="deleteLedgerItem(${item.id})">×</div>
        `;
        container.appendChild(row);
    });
}

function deleteLedgerItem(id) {
    if (confirm('确定删除这条账单吗？')) {
        ledgerData = ledgerData.filter(i => i.id !== id);
        saveLedgerData();
        renderLedgerList();
    }
}


function initializeApp() {
    // ▼▼▼ 新增：监听 iframe 高度调整消息 ▼▼▼
    window.addEventListener('message', function (event) {
        // 安全检查：确保消息类型正确
        if (event.data && event.data.type === 'iframe-resize') {
            const newHeight = event.data.height;

            // 在所有渲染的 iframe 中找到发送消息的那一个
            const iframes = document.querySelectorAll('.render-iframe');
            for (let iframe of iframes) {
                // iframe.contentWindow 就是消息源 event.source
                if (iframe.contentWindow === event.source) {
                    // 加上一点缓冲像素(20px)，防止出现滚动条
                    const finalHeight = (newHeight + 20) + 'px';

                    // 设置 iframe 高度
                    iframe.style.height = finalHeight;

                    // 同时也设置父容器 bubble 的高度（如果 CSS 设置了 flex，这一步可能自动完成，但显式设置更保险）
                    if (iframe.parentElement) {
                        iframe.parentElement.style.height = finalHeight;
                    }
                    break; // 找到后退出循环
                }
            }
        }
    });
    /* script.js 中的 initializeApp 函数内部 */

    window.addEventListener('message', function (event) {
        // 安全检查：确保消息类型正确
        if (event.data && event.data.type === 'iframe-resize') {
            let newHeight = event.data.height;

            // 🔥 关键修复：设置一个理智的高度上限 (比如 600px)
            // 防止 resize 循环导致的数值爆炸
            if (newHeight > 600) {
                newHeight = 600;
            }

            // 在所有渲染的 iframe 中找到发送消息的那一个
            const iframes = document.querySelectorAll('.render-iframe');
            for (let iframe of iframes) {
                if (iframe.contentWindow === event.source) {
                    // 加上一点缓冲像素(10px)
                    const finalHeight = (newHeight + 10) + 'px';

                    // 设置 iframe 高度
                    iframe.style.height = finalHeight;

                    // 同时也设置父容器 bubble 的高度
                    if (iframe.parentElement) {
                        iframe.parentElement.style.height = finalHeight;
                    }
                    break;
                }
            }
        }
    });

    // ▼▼▼ 在这里粘贴全局错误处理代码 ▼▼▼
    window.addEventListener('error', (event) => {
        console.error('捕获到未处理的全局错误:', event.error);
        // 使用您已有的 showErrorModal 函数来显示友好的错误提示
        showErrorModal(
            '哎呀，出错了！',
            '应用遇到一个未知问题，部分功能可能无法使用。建议刷新页面重试。',
            5000 // 显示5秒
        );
        // 在开发阶段，你可以在这里阻止默认的浏览器错误提示
        // event.preventDefault();
    });
    window.addEventListener('unhandledrejection', (event) => {
        console.error('捕获到未处理的Promise拒绝:', event.reason);
        showErrorModal(
            '操作失败',
            '一个异步操作失败了，请检查网络连接或API设置后重试。',
            5000
        );
        // event.preventDefault();
    });
    const chatInput = document.getElementById('chatInput');
    const chatInputArea = document.querySelector('.chat-input-area');
    if (!chatInput || !chatInputArea) {
        console.error('❌ 关键元素未找到，请检查HTML结构');
        return;
    }


    // ▼▼▼ 新增：检查并初始化内置世界书 ▼▼▼
    // 确保数据已加载
    if (!worldbookData) loadWorldbookData();

    // 检查是否存在这个固定的内置世界书
    const builtinExists = worldbookData.find(wb => wb.id === GLOBAL_WORLDBOOK_ID);

    if (!builtinExists) {
        console.log("正在初始化内置世界书...");
        const builtinEntry = {
            id: GLOBAL_WORLDBOOK_ID,
            title: DEFAULT_LORE_TITLE,
            content: DEFAULT_LORE_CONTENT,
            group: 'worldview', // 归类为世界观
            category: 'uncategorized',
            timestamp: Date.now()
        };
        // 添加到数组
        worldbookData.unshift(builtinEntry); // 放在最前面
        // 保存到本地存储
        saveWorldbookToStorage();
    }
    // ▲▲▲ 新增结束 ▲▲▲


    // 【新增代码】在应用程序初始化时，立即应用全屏设置
    const savedFullscreenSettingOnLoad = localStorage.getItem('fullscreenEnabled') === 'true';
    applyFullscreenSetting(savedFullscreenSettingOnLoad);

    chatInputArea.classList.remove('has-text');
    loadWorldsData();
    currentWorldId = localStorage.getItem('currentWorldId');
    updateBattery();
    loadLocationSettings();
    loadUserProfile();
    loadWorldbookData();
    loadCategoriesData();
    loadSweetheartChatBackground();
    loadSavedBubbleStyles(); // <<< 加载已应用的气泡样式
    setupCategorySelector();
    updateCategoryOptions();
    updateWorldbookCategorySelector();
    setupAttachmentMenu();
    setupStyleSelector();
    setupLivePreviewListeners(); // <<< 设置实时预览
    applyChatStyle(localStorage.getItem('chatMessageStyle') || 'bubble');
    loadChatBackground();
    loadGlobalConfig();
    loadMasksData();
    updateChatModeButton();
    setupSummarizeButton();
    setupTestButton();
    updateTestButtonState(); // 初始化测试按钮状态
    loadSweetheartAvatarSetting();
    initAvatarToggle();
    setupSweetheartReplyModeSelector();


    // ▼▼▼ 新增：密友聊天显示头像功能初始化 ▼▼▼
    const showAvatarsToggle = document.getElementById('showAvatarsToggle');
    if (showAvatarsToggle) {
        // 从 localStorage 加载设置，默认为 false
        globalConfig.showAvatarsInSweetheartChat = localStorage.getItem('showAvatarsInSweetheartChat') === 'true';
        showAvatarsToggle.checked = globalConfig.showAvatarsInSweetheartChat;
        // 添加事件监听器
        showAvatarsToggle.addEventListener('change', function () {
            toggleSweetheartChatAvatars(this.checked);
        });
        // 首次加载应用此设置
        applySweetheartChatAvatarsSetting(globalConfig.showAvatarsInSweetheartChat);
    }

    // ===== 第六步：加载联系人数据 =====
    const savedContacts = localStorage.getItem('phoneContactsData');
    if (savedContacts) {
        try {
            contactsData = JSON.parse(savedContacts);
            console.log('✅ 成功加载联系人列表');
        } catch (e) {
            console.error('❌ 解析联系人数据失败:', e);
        }
    }

    const savedSweetheartContacts = localStorage.getItem('phoneSweetheartContactsData');
    if (savedSweetheartContacts) {
        try {
            sweetheartContactsData = JSON.parse(savedSweetheartContacts);
            console.log('✅ 成功加载密友列表');
        } catch (e) {
            console.error('❌ 解析密友数据失败:', e);
        }
    } else {
        // 如果是首次使用，保存默认密友列表
        saveSweetheartContacts();
        console.log('✅ 已初始化默认密友列表');
    }

    const savedLibraryOnlyContacts = localStorage.getItem('phoneLibraryOnlyContactsData');
    if (savedLibraryOnlyContacts) {
        try {
            libraryOnlyContactsData = JSON.parse(savedLibraryOnlyContacts);
            console.log('✅ 成功加载仅库中的联系人列表');
        } catch (e) {
            console.error('❌ 解析仅库中的联系人数据失败:', e);
        }
    }

    // ===== 第七步：绑定聊天输入框事件（现在是安全的）=====
    chatInput.addEventListener('input', function () {
        if (this.value.trim().length > 0) {
            chatInputArea.classList.add('has-text');
        } else {
            chatInputArea.classList.remove('has-text');
        }
    });

    // ===== 第八步：初始化其他开关和设置 =====
    const codeScrollToggle = document.getElementById('codeScrollToggle');
    if (codeScrollToggle) {
        const savedScrollSetting = localStorage.getItem('codeScrollEnabled') === 'true';
        codeScrollToggle.checked = savedScrollSetting;
        applyCodeScrollSetting(savedScrollSetting);

        codeScrollToggle.addEventListener('change', function () {
            applyCodeScrollSetting(this.checked);
            localStorage.setItem('codeScrollEnabled', this.checked);
        });
    }

    // 在普通聊天消息操作菜单的事件监听中添加
    const actionSheet = document.getElementById('messageActionSheet');
    if (actionSheet) {
        actionSheet.addEventListener('click', function (event) {
            const button = event.target.closest('.action-option');
            if (!button) return;
            const {contactId, index} = actionSheet.dataset;
            const messageIndex = parseInt(index, 10);
            if (contactId === undefined || isNaN(messageIndex)) {
                hideMessageActionSheet();
                return;
            }
            switch (button.id) {
                case 'deleteMessageBtn':
                    deleteMessage(contactId, messageIndex);
                    break;
                case 'copyMessageBtn':
                    copyMessage(contactId, messageIndex);
                    break;
                case 'regenerateMessageBtn':
                    regenerateAiResponse(contactId, messageIndex);
                    break;
                case 'quoteMessageBtn':
                    quoteMessage(contactId, messageIndex);
                    break;
                // ✅ 新增这个 case
                case 'readAloudNormalBtn':
                    // 调用修改后的函数，传入必要参数
                    playTtsMessage(
                        chatHistory[contactId][messageIndex].sender,
                        contactId,
                        messageIndex,
                        false // isSweetheart = false
                    );
                    hideMessageActionSheet(); // 朗读后隐藏菜单
                    break;
                case 'multiSelectNormalBtn': // ✅ 新增
                    enterNormalMultiSelectMode();
                    break;
            }
            if (button.id !== 'regenerateMessageBtn') {
                hideMessageActionSheet();
            }
        });
    }

    // 在密友聊天消息操作菜单的事件监听中添加
    const sweetheartActionSheet = document.getElementById('sweetheartMessageActionSheet');
    if (sweetheartActionSheet) {
        sweetheartActionSheet.addEventListener('click', function (event) {
            const button = event.target.closest('.action-option');
            if (!button) return;

            const {contactId, index} = sweetheartActionSheet.dataset;
            const messageIndex = parseInt(index, 10);

            if (contactId === undefined || isNaN(messageIndex)) {
                hideSweetheartMessageActionSheet();
                return;
            }

            switch (button.id) {
                case 'sweetheartDeleteMessageBtn':
                    deleteSweetheartMessage(contactId, messageIndex);
                    break;
                case 'sweetheartCopyMessageBtn':
                    copySweetheartMessage(contactId, messageIndex);
                    break;
                case 'sweetheartRegenerateMessageBtn':
                    regenerateSweetheartAiResponse(contactId, messageIndex);
                    break;
                case 'sweetheartQuoteMessageBtn':
                    quoteSweetheartMessage(contactId, messageIndex);
                    break;
                // ✅ 新增这个 case
                case 'readAloudSweetheartBtn':
                    // 调用修改后的函数，同样传入参数
                    playTtsMessage(
                        JSON.parse(localStorage.getItem('phoneSweetheartChatHistory') || '{}')[contactId][messageIndex].sender,
                        contactId,
                        messageIndex,
                        true // isSweetheart = true
                    );
                    hideSweetheartMessageActionSheet(); // 朗读后隐藏菜单
                    break;
                case 'multiSelectSweetheartBtn': // ✅ 新增
                    enterSweetheartMultiSelectMode();
                    break;
            }

            if (button.id !== 'sweetheartRegenerateMessageBtn') {
                hideSweetheartMessageActionSheet();
            }
        });
    }

    // ===== 强制修复：初始化时确保书架和阅读器是隐藏的 =====
    const shelfPage = document.getElementById('novelShelfPage');
    const readerPage = document.getElementById('novelReaderPage');

    if (shelfPage) {
        shelfPage.classList.remove('show'); // 移除显示类
        // 这一步是为了防止浏览器缓存了 transform 状态
        shelfPage.style.transform = '';
    }

    if (readerPage) {
        readerPage.classList.remove('show');
        readerPage.style.transform = '';
    }

    // ===== 初始化悬浮球和布局 =====
    initializeFloatingBall();
    initializeLayout();

    setTimeout(loadCatWidgetData, 500); // 延迟加载，确保DOM已渲染

    const savedSweetheartReplyMode = localStorage.getItem('sweetheartReplyMode');
    if (savedSweetheartReplyMode) {
        globalConfig.sweetheartReplyMode = savedSweetheartReplyMode;
    }
    console.log(`✅ 已加载密友聊天回复模式: ${globalConfig.sweetheartReplyMode}`);
    // ===== 初始化密友聊天回复模式选择器并应用UI =====
    setupSweetheartReplyModeSelector(); // 设置监听器在页面加载时
    updateSweetheartReplyModeUI(globalConfig.sweetheartReplyMode); // 应用UI的初始状态

    // ✅ 新增：初始化密友聊天输入框
    setupSweetheartChatInput();

    setupSweetheartAttachmentMenu();

    // ===== 密友聊天 - 记忆轮数设置 =====
    const decreaseBtn = document.getElementById('decreaseMemoryRounds');
    const increaseBtn = document.getElementById('increaseMemoryRounds');
    const memoryInput = document.getElementById('memoryRoundsInput');
    const updateMemoryRounds = (newValue) => {
        if (!currentSweetheartChatContact) return;

        let value = parseInt(newValue, 10);
        const min = parseInt(memoryInput.min, 10);
        const max = parseInt(memoryInput.max, 10);

        // 确保数值在有效范围内
        if (isNaN(value)) value = 10; // 如果输入无效则重置为默认值
        value = Math.max(min, Math.min(max, value));

        memoryInput.value = value;

        // 保存到当前联系人对象并持久化
        currentSweetheartChatContact.memoryRounds = value;
        saveSweetheartContacts();
    };
    if (decreaseBtn) {
        decreaseBtn.addEventListener('click', () => {
            updateMemoryRounds(parseInt(memoryInput.value, 10) - 1);
        });
    }
    if (increaseBtn) {
        increaseBtn.addEventListener('click', () => {
            updateMemoryRounds(parseInt(memoryInput.value, 10) + 1);
        });
    }
    if (memoryInput) {
        memoryInput.addEventListener('change', () => {
            updateMemoryRounds(memoryInput.value);
        });
    }
    // 新增：全局点击事件，用于收回已滑开的联系人项
    document.addEventListener('click', (e) => {
        // 检查点击的目标是否在任何一个滑动容器内部
        if (!e.target.closest('.contact-item-wrapper, .sweetheart-item-wrapper')) {
            // 如果不在，则关闭所有已滑开的项
            document.querySelectorAll('.is-swiped').forEach(swipedItem => {
                swipedItem.classList.remove('is-swiped');
            });
        }
    });
    // ===== 普通聊天 - 记忆轮数设置 =====
    const decreaseNormalBtn = document.getElementById('decreaseNormalMemoryRounds');
    const increaseNormalBtn = document.getElementById('increaseNormalMemoryRounds');
    const normalMemoryInput = document.getElementById('normalMemoryRoundsInput');

    const updateNormalMemoryRounds = (newValue) => {
        if (!currentChatContact) return;

        let value = parseInt(newValue, 10);
        const min = parseInt(normalMemoryInput.min, 10);
        const max = parseInt(normalMemoryInput.max, 10);

        if (isNaN(value)) value = 10;
        value = Math.max(min, Math.min(max, value));

        normalMemoryInput.value = value;

        // 保存到当前联系人对象
        currentChatContact.memoryRounds = value;

        // 持久化到localStorage
        const index = contactsData.findIndex(c => c.id === currentChatContact.id);
        if (index !== -1) {
            contactsData[index].memoryRounds = value;
            localStorage.setItem('phoneContactsData', JSON.stringify(contactsData));
        }
    };

    if (decreaseNormalBtn) {
        decreaseNormalBtn.addEventListener('click', () => {
            updateNormalMemoryRounds(parseInt(normalMemoryInput.value, 10) - 1);
        });
    }

    if (increaseNormalBtn) {
        increaseNormalBtn.addEventListener('click', () => {
            updateNormalMemoryRounds(parseInt(normalMemoryInput.value, 10) + 1);
        });
    }

    if (normalMemoryInput) {
        normalMemoryInput.addEventListener('change', () => {
            updateNormalMemoryRounds(normalMemoryInput.value);
        });
    }

    // 联系人库头像上传监听 (安全修复版)
    const libAvatarInput = document.getElementById('library-avatar-input');
    if (libAvatarInput) {
        libAvatarInput.addEventListener('change', function (event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const preview = document.getElementById('library-avatar-preview');
                    if (preview) preview.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    } else {
        console.warn("未找到 library-avatar-input 元素，请检查 index.html");
    }


    updateSweetheartChatInputAreaButtons();

    console.log('%c🎉 应用初始化完成！', 'color: #667eea; font-size: 16px; font-weight: bold;');
    // 新增：加载小猫组件数据

}


initializeApp();


