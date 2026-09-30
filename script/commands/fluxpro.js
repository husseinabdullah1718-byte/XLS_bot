const axios = require('axios');

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: 'فلوكس',
    release: '1.7',
    clearance: 0,
    author: "ZOTE Tracks",
    summary: 'توليد صورة بنسبة أبعاد محددة عبر FluxPro',
    section: 'زكـــــــاء',
    syntax: '[وصف] --ratio 16:9',
    delay: 10,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
    const { threadID, messageID } = event;
    const fullArgs = args.join(' ');
    if (!fullArgs) return api.sendMessage('❌ يرجى إدخال وصف', threadID, messageID);

    let promptText, ratioValue = '1:1';
    if (fullArgs.includes('--ratio')) {
        const parts = fullArgs.split('--ratio').map(s => s.trim());
        promptText = parts[0];
        ratioValue = parts[1] || '1:1';
    } else {
        promptText = fullArgs;
    }

    api.setMessageReaction('⏳', messageID, threadID, () => {}, true);
    const startTime = Date.now();

    try {
        const base = await baseApiUrl();
        const response = await axios.get(`${base}/api/fluxpro`, {
            params: { prompt: promptText, ratio: ratioValue },
            responseType: 'stream',
            timeout: 120000
        });

        const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
        api.setMessageReaction('✅', messageID, threadID, () => {}, true);

        api.sendMessage({
            body: `✨ تم التوليد بنجاح\n━━━━━━━━━━━━━━\n• الوصف: ${promptText}\n• النسبة: ${ratioValue}\n• الوقت: ${timeTaken} ثانية`,
            attachment: response.data
        }, threadID, messageID);
    } catch (e) {
        api.setMessageReaction('❌', messageID, threadID, () => {}, true);
        api.sendMessage('❌ خطأ: ' + e.message, threadID, messageID);
    }
};