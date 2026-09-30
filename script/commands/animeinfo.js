const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    title: "انمي",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "البحث عن معلومات أنمي",
    section: "عـــامـة",
    syntax: "انمي [اسم الأنمي]",
    delay: 5,
};

const getBaseUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.ZOTERun = async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const deco = require("../../utils/decorations");

    const animeName = args.join(" ");
    if (!animeName) return api.sendMessage(deco.error("يرجى إدخال اسم الأنمي.\nمثال: .انمي ناروتو"), threadID, messageID);

    api.setMessageReaction("🔍", messageID, threadID, () => {}, true);

    try {
        const baseUrl = await getBaseUrl();
        const url = `${baseUrl}/api/animeinfo?animeName=${encodeURIComponent(animeName)}`;
        
        const res = await axios.get(url);
        const { formatted_message, data } = res.data;

        if (!res.data || !data) return api.sendMessage(deco.error("لم يتم العثور على الأنمي المطلوب."), threadID, messageID);

        const imgRes = await axios.get(data.image_url, { responseType: "arraybuffer" });
        const cacheDir = path.join(__dirname, "cache");
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        
        const imgPath = path.join(cacheDir, `anime_${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, Buffer.from(imgRes.data));

        api.setMessageReaction("✅", messageID, threadID, () => {}, true);

        return api.sendMessage({
            body: formatted_message,
            attachment: fs.createReadStream(imgPath)
        }, threadID, (err, info) => {
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }, messageID);

    } catch (error) {
        console.error(error);
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage(deco.error("حدث خطأ أثناء جلب المعلومات."), threadID, messageID);
    }
};
