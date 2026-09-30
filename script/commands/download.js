const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    title: "تحميل",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "تحميل فيديوهات من تيك توك، فيسبوك، إنستغرام، يوتيوب، إكس",
    section: "عـــامـة",
    syntax: "تحميل [رابط الفيديو]",
    delay: 10,
};

const getBaseUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.ZOTERun = async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const deco = require("../../utils/decorations");

    const link = args[0];
    if (!link) return api.sendMessage(deco.error("يرجى وضع رابط الفيديو.\nمثال: .تحميل [رابط]"), threadID, messageID);

    const supportedSites = /https?:\/\/(www\.)?(vt\.tiktok\.com|tiktok\.com|facebook\.com|fb\.watch|instagram\.com|youtu\.be|youtube\.com|x\.com|twitter\.com|vm\.tiktok\.com)/gi;
    if (!supportedSites.test(link)) return api.sendMessage(deco.error("هذا الرابط غير مدعوم حالياً."), threadID, messageID);

    api.setMessageReaction("⏳", messageID, () => {}, true);

    try {
        const baseUrl = await getBaseUrl();
        const apiUrl = `${baseUrl}/api/download/video?link=${encodeURIComponent(link)}`;
        
        const cacheDir = path.join(__dirname, "cache");
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        
        const filePath = path.join(cacheDir, `download_${Date.now()}.mp4`);

        const response = await axios({
            method: 'get',
            url: apiUrl,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });

        fs.writeFileSync(filePath, Buffer.from(response.data));
        if (fs.statSync(filePath).size < 1000) throw new Error("فشل تحميل الفيديو.");

        api.setMessageReaction("✅", messageID, () => {}, true);

        return api.sendMessage({
            body: deco.titleGolden("تم التحميل بنجاح! ✨"),
            attachment: fs.createReadStream(filePath)
        }, threadID, (err, info) => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }, messageID);

    } catch (error) {
        console.error(error);
        api.setMessageReaction("❌", messageID, () => {}, true);
        return api.sendMessage(deco.error("حدث خطأ أثناء تحميل الفيديو."), threadID, messageID);
    }
};
