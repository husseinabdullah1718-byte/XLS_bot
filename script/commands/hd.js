const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    title: "جودة",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "رفع جودة الصور لتصبح HD",
    section: "عـــامـة",
    syntax: "رفع_الجودة [بالرد على صورة]",
    delay: 10,
};

const getBaseUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.ZOTERun = async function({ api, event }) {
    const { threadID, messageID, type, messageReply } = event;
    const deco = require("../../utils/decorations");

    let imgUrl = "";
    if (type === "message_reply" && messageReply.attachments.length > 0 && (messageReply.attachments[0].type === "photo" || messageReply.attachments[0].type === "sticker")) {
        imgUrl = messageReply.attachments[0].url;
    } else {
        return api.sendMessage(deco.error("يرجى الرد على صورة لرفع جودتها."), threadID, messageID);
    }

    api.setMessageReaction("⏳", messageID, threadID, () => {}, true);

    try {
        const baseUrl = await getBaseUrl();
        const apiUrl = `${baseUrl}/api/hd/mahmud?imgUrl=${encodeURIComponent(imgUrl)}`;
        
        const res = await axios.get(apiUrl, { responseType: "arraybuffer" });
        const cacheDir = path.join(__dirname, "cache");
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        
        const imgPath = path.join(cacheDir, `hd_${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, Buffer.from(res.data));

        api.setMessageReaction("🪽", messageID, threadID, () => {}, true);

        return api.sendMessage({
            body: deco.titleGolden("تم رفع الجودة بنجاح! ✨"),
            attachment: fs.createReadStream(imgPath)
        }, threadID, (err, info) => {
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }, messageID);

    } catch (error) {
        console.error(error);
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage(deco.error("حدث خطأ أثناء معالجة الصورة."), threadID, messageID);
    }
};
