const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

/* ================================================================
   🔐 إعدادات المطور - لا يغيرها إلا أنت
   ================================================================ */
const DEVELOPER_ID = 'add your id profile Facebook';  // ✅ الـ ID حقك فقط

/* ================================================================
   🌐  إعدادات Rule34.xxx API (ثابتة - لا تعديل)
   ================================================================ */
const SITE_CONFIG = {
    urlTemplate: "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&tags={{query}}&limit={{limit}}&user_id={{userid}}&api_key={{key}}",
    auth: "query",
    responsePath: "",
    imageField: "file_url",
    userId: "add your id Rule34"
};

const API_KEY = "add your Rule34 Key";

// 💾 تخزين البحوث النشطة
const activeSearches = new Map();
const processedReactions = new Set();

function getByPath(obj, pathStr) {
    if (!pathStr) return obj;
    return pathStr.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/* ================================================================
   🔐 دالة التحقق من المطور
   ================================================================ */
function isDeveloper(senderID) {
    return String(senderID) === DEVELOPER_ID;
}

/* ================================================================
    منطق الجلب من Rule34
   ================================================================ */
async function fetchImages(query, limit = 100) {
    const safeQuery = query.replace(/[^\w\s-]/g, ' ').trim();
    
    if (!safeQuery) return [];

    let url = SITE_CONFIG.urlTemplate
        .replace('{{query}}', encodeURIComponent(safeQuery))
        .replace('{{limit}}', limit)
        .replace('{{key}}', API_KEY)        .replace('{{userid}}', SITE_CONFIG.userId);

    try {
        const res = await axios.get(url, {
            timeout: 20000,
            headers: { 'Accept': 'application/json' }
        });

        let list = Array.isArray(res.data) ? res.data : [];
        
        if (list.length === 0) return [];

        const validExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm'];
        
        list = list.map(item => {
            if (!item || typeof item !== 'object') return null;
            const fileUrl = item.file_url || item.sample_url || item.preview_url;
            if (!fileUrl || typeof fileUrl !== 'string') return null;
            const urlWithoutParams = fileUrl.split('?')[0];
            const ext = urlWithoutParams.split('.').pop().toLowerCase();
            if (validExts.includes(ext)) return fileUrl;
            return null;
        }).filter(Boolean);

        return [...new Set(list)];

    } catch (error) {
        console.error(`[رول] خطأ في جلب الصور:`, error.message);
        return [];
    }
}

/* ================================================================
    تحميل متوازي سريع
   ================================================================ */
async function downloadAll(urls, cacheDir) {
    const savedPaths = [];
    const CHUNK = 6;
    
    for (let i = 0; i < urls.length; i += CHUNK) {
        const chunk = urls.slice(i, i + CHUNK);
        const results = await Promise.allSettled(chunk.map(async (imgUrl, idx) => {
            try {
                const urlWithoutParams = imgUrl.split('?')[0];
                const ext = urlWithoutParams.split('.').pop().toLowerCase() || 'jpg';
                const fileName = `r34_${Date.now()}_${i + idx}.${ext}`;
                const imgPath = path.join(cacheDir, fileName);
                
                const imgRes = await axios.get(imgUrl, {
                    responseType: 'arraybuffer',                    timeout: 30000,
                    maxContentLength: 50 * 1024 * 1024,
                    headers: { 'Accept': '*/*' }
                });
                
                fs.writeFileSync(imgPath, imgRes.data);
                return imgPath;
            } catch (err) {
                console.error('[رول] فشل تنزيل:', imgUrl.slice(0, 50), err.message);
                return null;
            }
        }));
        
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) savedPaths.push(r.value);
        }
    }
    return savedPaths;
}

function getCacheDir() {
    const cacheDir = path.join(__dirname, 'cache', 'rule34');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    return cacheDir;
}

function cleanFiles(paths) {
    setTimeout(() => {
        for (const p of paths) {
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
        }
    }, 60000);
}

/* ================================================================
   👍 معالج اللايك - للمطور فقط
   ================================================================ */
async function onLike({ api, event, threadID, senderID }) {
    // 🔐 التحقق من المطور أولاً
    if (!isDeveloper(senderID)) return;

    const reaction = event.reaction || event.emoji || '';
    if (reaction !== '👍') return;

    const userID = event.userID || event.senderID;
    const reactedMessageID = String(event.messageID);

    const guardKey = `${threadID}_${reactedMessageID}_${userID}`;
    if (processedReactions.has(guardKey)) return;
    processedReactions.add(guardKey);    setTimeout(() => processedReactions.delete(guardKey), 5000);

    const searchKey = `${threadID}_${senderID}`;
    const info = activeSearches.get(searchKey);
    
    if (!info) return;

    if (info.botMessageIDs.size > 0 && !info.botMessageIDs.has(reactedMessageID)) return;

    const nextBatch = info.allImages.slice(info.offset, info.offset + info.displayCount);
    
    if (nextBatch.length === 0) {
        api.sendMessage(`📭 خلصت صور بحث "${info.query}"!`, threadID);
        return;
    }

    info.offset += nextBatch.length;

    try {
        api.setMessageReaction('', event.messageID, () => {}, true);
        
        const paths = await downloadAll(nextBatch, getCacheDir());
        
        if (paths.length === 0) {
            api.setMessageReaction('', event.messageID, () => {}, true);
            return api.sendMessage('❌ فشل تحميل المزيد', threadID);
        }

        const sent = await api.sendMessage({
            body: `📸 المزيد (${paths.length}) - بحث "${info.query}"\n👍 لايك للمزيد!`,
            attachment: paths.map(p => fs.createReadStream(p))
        }, threadID);

        if (sent && sent.messageID) info.botMessageIDs.add(String(sent.messageID));
        cleanFiles(paths);
        api.setMessageReaction('✅', event.messageID, () => {}, true);

    } catch (e) {
        console.error('[رول] خطأ في جلب المزيد:', e.message);
        api.setMessageReaction('❌', event.messageID, () => {}, true);
    }
}

module.exports.config = {
    title: 'رول',
    release: '3.0',
    clearance: 2,  // 🔐 للمطور فقط
    author: "Ali hsan",
    summary: 'بحث وتحميل صور/فيديوهات من Rule34.xxx - للمطور فقط',
    section: 'Rule34',    syntax: 'رول [كلمة بحث] - [عدد]',
    delay: 10,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
    const { threadID, messageID, senderID } = event;

    // 🔐 التحقق من المطور - أول شيء
    if (!isDeveloper(senderID)) {
        // تجاهل الطلب بصمت أو أرسل رسالة عامة
        // return api.sendMessage('❌ هذا الأمر للمطور فقط', threadID, messageID);
        return; // الأفضل تجاهل بصمت
    }

    // معالجة اللايك
    if (event.type === 'message_reaction' || event.reaction || event.emoji === '👍') {
        return onLike({ api, event, threadID, senderID });
    }

    const queryAndLength = args.join(' ').split('-').map(s => s.trim());
    const keySearch = queryAndLength[0];
    const countInput = queryAndLength[1];
    const displayCount = countInput ? Math.min(parseInt(countInput), 20) : 6;

    if (!keySearch) {
        return api.sendMessage(
            '🔍 الاستخدام: رول [كلمة بحث] - [عدد]\n' +
            'أمثلة:\n' +
            '• رول naruto\n' +
            '• رول anime video - 5\n' +
            '👍 لايك للمزيد',
            threadID, messageID
        );
    }

    api.setMessageReaction('⏳', messageID, () => {}, true);

    try {
        const fetchLimit = 100;
        let allImages = await fetchImages(keySearch, fetchLimit);

        if (!allImages || allImages.length === 0) {
            api.setMessageReaction('❌', messageID, () => {}, true);
            return api.sendMessage(`❌ لا توجد نتائج لـ "${keySearch}"`, threadID, messageID);
        }

        allImages = Array.from(new Set(allImages));
        const imagesToShow = allImages.slice(0, displayCount);

        if (imagesToShow.length === 0) {            api.setMessageReaction('❌', messageID, () => {}, true);
            return api.sendMessage('❌ لا توجد صور كافية', threadID, messageID);
        }

        // حفظ البحث للـ لايك
        activeSearches.set(`${threadID}_${senderID}`, {
            query: keySearch,
            allImages: allImages,
            displayCount: displayCount,
            offset: imagesToShow.length,
            botMessageIDs: new Set(),
            timestamp: Date.now()
        });

        const paths = await downloadAll(imagesToShow, getCacheDir());

        if (paths.length === 0) {
            api.setMessageReaction('❌', messageID, () => {}, true);
            return api.sendMessage('❌ فشل تحميل الصور', threadID, messageID);
        }

        const sent = await api.sendMessage({
            body: `📸 رول34 (${paths.length}) - "${keySearch}"\n👍 لايك للمزيد!`,
            attachment: paths.map(p => fs.createReadStream(p))
        }, threadID, messageID);

        const info = activeSearches.get(`${threadID}_${senderID}`);
        if (info && sent && sent.messageID) {
            info.botMessageIDs.add(String(sent.messageID));
        }

        cleanFiles(paths);
        api.setMessageReaction('✅', messageID, () => {}, true);

    } catch (error) {
        console.error('[رول] Error:', error);
        api.setMessageReaction('❌', messageID, () => {}, true);
        api.sendMessage('❌ خطأ: ' + error.message, threadID, messageID);
    }
};

module.exports.ZOTEReaction = async ({ api, event, ZOTEReaction }) => {
    // معالجة احتياطية للايك
    console.log('[رول] ZOTEReaction called');
};

// 🧹 تنظيف البحوث القديمة
setInterval(() => {
    const now = Date.now();
    for (const [key, info] of activeSearches.entries()) {        if (now - info.timestamp > 30 * 60 * 1000) {
            activeSearches.delete(key);
        }
    }
}, 5 * 60 * 1000);
