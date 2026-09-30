const axios = require('axios');

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: 'برومبت',
    release: '1.7',
    clearance: 0,
    author: "ZOTE Tracks",
    summary: 'إنشاء وصف مفصل من صورة',
    section: 'زكـــــــاء',
    syntax: '[رد على صورة]',
    delay: 5,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
    const { threadID, messageID } = event;

    if (event.type !== 'message_reply' || !event.messageReply.attachments || event.messageReply.attachments[0]?.type !== 'photo') {
        return api.sendMessage('❌ يرجى الرد على صورة', threadID, messageID);
    }

    const prompt = args.join(' ') || 'Describe this image in detail. ';
    const imageUrl = event.messageReply.attachments[0].url;

    api.setMessageReaction('⏳', messageID, threadID, () => {}, true);

    try {
        const baseUrl = await baseApiUrl();
        const apiUrl = `${baseUrl}/api/prompt`;

        const response = await axios.post(apiUrl, {
            imageUrl,
            prompt
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        const replyText = response.data.response || response.data.error || 'لا يوجد رد';
        api.sendMessage(replyText, threadID, messageID);
        api.setMessageReaction('🪽', messageID, threadID, () => {}, true);
    } catch (err) {
        api.setMessageReaction('❌', messageID, threadID, () => {}, true);
        api.sendMessage('❌ خطأ: ' + err.message, threadID, messageID);
    }
};