const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: 'فلو',
    release: '1.7',
    clearance: 0,
    author: "ZOTE Tracks",
    summary: 'توليد صورة بنموذج Flux',
    section: 'زكـــــــاء',
    syntax: '[وصف]',
    delay: 15,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
    const { threadID, messageID } = event;
    const prompt = args.join(' ');
    if (!prompt) return api.sendMessage('❌ يرجى إدخال وصف', threadID, messageID);

    const cacheDir = path.join(__dirname, 'cache');
    const filePath = path.join(cacheDir, `flux_${Date.now()}.png`);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

    api.setMessageReaction('⏳', messageID, threadID, () => {}, true);
    const waitMsg = await api.sendMessage('⏳ جاري التوليد...', threadID, messageID);

    try {
        const seed = Math.floor(Math.random() * 1000000);
        const baseUrl = await baseApiUrl();
        const url = `${baseUrl}/api/gen?prompt=${encodeURIComponent(prompt)}&model=flux&seed=${seed}`;

        const response = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(filePath, Buffer.from(response.data));

        if (waitMsg.messageID) api.unsendMessage(waitMsg.messageID);
        api.setMessageReaction('✅', messageID, threadID, () => {}, true);

        api.sendMessage({
            body: '✅ تفضل تم التوليد',
            attachment: fs.createReadStream(filePath)
        }, threadID, () => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }, messageID);
    } catch (err) {
        api.setMessageReaction('❌', messageID, threadID, () => {}, true);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        api.sendMessage('❌ خطأ: ' + err.message, threadID, messageID);
    }
};