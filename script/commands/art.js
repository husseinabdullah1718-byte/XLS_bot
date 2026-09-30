const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: 'ارت',
    release: '1.7',
    clearance: 0,
    author: "ZOTE Tracks",
    summary: 'تحويل صورتك إلى أنماط فنية مختلفة (1-100)',
    section: 'زكـــــــاء',
    syntax: '[رقم النمط] (مع الرد على صورة) أو list لعرض الأنماط',
    delay: 10,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
    const { threadID, messageID } = event;
    const cacheDir = path.join(__dirname, 'cache');
    const cachePath = path.join(cacheDir, `art_${threadID}_${Date.now()}.png`);
    let waitMsgID = null;

    try {
        const baseUrl = await baseApiUrl();
        const apiEndpoint = `${baseUrl}/api/art`;

        
        if (args[0]?.toLowerCase() === 'list') {
            const res = await axios.get(`${apiEndpoint}/list`);
            const styles = res.data.styles;
            let text = '✅ | قائمة الأنماط الفنية المتاحة:\n\n';
            for (const key in styles) {
                text += `${key}: ${styles[key]}\n`;
            }
            return api.sendMessage(text, threadID, messageID);
        }

        
        const replied = event.messageReply?.attachments?.[0];
        if (!replied || replied.type !== 'photo') {
            return api.sendMessage('❌ يرجى الرد على صورة.', threadID, messageID);
        }

        
        const styleNum = parseInt(args[0] || '1');
        if (isNaN(styleNum) || styleNum < 1 || styleNum > 100) {
            return api.sendMessage('❌ رقم النمط يجب أن يكون بين 1 و 100.', threadID, messageID);
        }

        
        let styleName = 'غير معروف';
        try {
            const listRes = await axios.get(`${apiEndpoint}/list`);
            styleName = listRes.data.styles[styleNum] || 'نمط مخصص';
        } catch (e) {
            styleName = 'نمط فني';
        }

        api.setMessageReaction('⏳', messageID, threadID, () => {}, true);
        
        
        const waitMsg = await api.sendMessage(`🔄 | جاري تطبيق النمط الفني رقم ${styleNum} (${styleName})، يرجى الانتظار...`, threadID);
        waitMsgID = waitMsg.messageID;

        
        const imageUrl = encodeURIComponent(replied.url);
        const res = await axios({
            url: `${apiEndpoint}?imageUrl=${imageUrl}&style=${styleNum}`,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 180000
        });

        
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, Buffer.from(res.data, 'binary'));

        
        if (waitMsgID) api.unsendMessage(waitMsgID);

        
        api.sendMessage({
            body: `✅ | تم تطبيق النمط الفني بنجاح\n• رقم النمط: ${styleNum}\n• اسم النمط: ${styleName}`,
            attachment: fs.createReadStream(cachePath)
        }, threadID, (err) => {
            if (!err) api.setMessageReaction('🪽', messageID, threadID, () => {}, true);
            if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
        }, messageID);

    } catch (err) {
        if (waitMsgID) api.unsendMessage(waitMsgID);
        api.setMessageReaction('❌', messageID, threadID, () => {}, true);
        if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
        api.sendMessage('❌ خطأ: ' + (err.message || 'فشل الاتصال بالخادم'), threadID, messageID);
    }
};