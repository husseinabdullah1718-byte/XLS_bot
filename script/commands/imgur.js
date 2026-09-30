const axios = require("axios");

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: "رفع",
    release: "1.8",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "تحويل أي صورة أو فيديو إلى رابط Imgur",
    section: "عـــامـة",
    syntax: "imgur (رد على صورة أو فيديو)",
    delay: 10,
};

module.exports.ZOTERun = async function({ api, event }) {
    const { threadID, messageID, messageReply } = event;

    if (!messageReply || !messageReply.attachments || !messageReply.attachments.length) {
        return api.sendMessage("⚠️ رد على صورة أو فيديو لتحويله إلى رابط", threadID, messageID);
    }

    try {
        api.setMessageReaction("⏳", messageID, threadID, () => {}, true);

        const attachmentUrl = messageReply.attachments[0].url;
        const baseUrl = await baseApiUrl();
        
        const response = await axios.get(`${baseUrl}/api/imgur`, {
            params: { url: attachmentUrl }
        });

        const replyLink = response.data.link || "لم يتم استلام رابط";
        api.setMessageReaction("✅", messageID, threadID, () => {}, true);

        return api.sendMessage(replyLink, threadID, messageID);

    } catch (err) {
        console.error("Imgur Error:", err);
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        const errorMsg = err.response?.data?.error || err.message;
        return api.sendMessage(`❌ خطأ: ${errorMsg}`, threadID, messageID);
    }
};