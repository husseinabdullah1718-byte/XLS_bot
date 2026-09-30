const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");


const baseApiUrl = async () => {
    try {
        const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
        return base.data.mahmud;
    } catch (e) {
        console.error("خطأ في جلب base API URL:", e);
        return "https://api.mahmud.repl.co"; 
    }
};

module.exports.config = {
    title: "تيكتوك",
    release: "1.7",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "بحث وتحميل فيديوهات تيك توك المعدلة (edits)",
    section: "عـــامـة",
    syntax: "tiktok <كلمة البحث>",
    delay: 5,
};

module.exports.ZOTERun = async function ({ api, event, args }) {
    const keyword = args.join(" ");
    if (!keyword) {
        return api.sendMessage(
            "عزيزي، ما الذي تريد البحث عنه؟ 🔍\nمثال: تيكتوك naruto",
            event.threadID,
            event.messageID
        );
    }

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);
    const videoPath = path.join(cacheDir, `tiktok_${Date.now()}.mp4`);

    try {
        
        if (api.setMessageReaction) {
            api.setMessageReaction("⌛", event.messageID, event.threadID, () => {}, true);
        }

        const apiUrl = await baseApiUrl();
        const response = await axios({
            method: "GET",
            url: `${apiUrl}/api/tiksr`,
            params: { sr: keyword },
            responseType: "stream",
        });

        const writer = fs.createWriteStream(videoPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        const stats = fs.statSync(videoPath);
        if (stats.size > 25 * 1024 * 1024) { 
            fs.unlinkSync(videoPath);
            if (api.setMessageReaction) {
                api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
            }
            return api.sendMessage(
                "الفيديو كبير جداً (أكثر من 25 ميجابايت). جرب كلمة بحث أخرى!",
                event.threadID,
                event.messageID
            );
        }

        await api.sendMessage(
            {
                body: `• نتيجة البحث \n ${keyword}`,
                attachment: fs.createReadStream(videoPath),
            },
            event.threadID,
            () => {
                
                fs.unlink(videoPath, (err) => {
                    if (err) console.error("خطأ في حذف الملف:", err);
                });
                if (api.setMessageReaction) {
                    api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);
                }
            }
        );
    } catch (error) {
        console.error("TikTok Error:", error);
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (api.setMessageReaction) {
            api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
        }
        api.sendMessage(
            `حدث خطأ أثناء البحث: ${error.message}`,
            event.threadID,
            event.messageID
        );
    }
};