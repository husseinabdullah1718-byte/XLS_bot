/**
 * أمر: اغاني — بحث وتحميل صوت (mp3) من يوتيوب بالاسم مباشرة، بدون أي علامات
 * -------------------------------------------------------------
 * .اغاني [اسم الأغنية]     مثال: .اغاني Lofi Mood
 *
 * أمر مستقل منفصل عن "اغنية" (الذي يحتاج علامة -a/-v/-i)، هذا مخصص فقط
 * لحالة استخدام واحدة: اكتب اسم الأغنية وبترجعلك mp3 مباشرة. يعتمد على
 * نفس خدمة API الخارجية المستخدمة بأوامر "اغنية"/"تحميل"/"بنترست".
 */

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: "اغاني",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "اكتب اسم الأغنية وترجعلك mp3 مباشرة (بحث وتحميل صوت من يوتيوب)",
    section: "عـــامـة",
    syntax: "اغاني [اسم الأغنية]",
    delay: 10,
};

function ensureCacheDir() {
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    return cacheDir;
}

const MIN_VALID_FILE_SIZE = 15 * 1024; // 15KB — أقل من هذا شبه مؤكد صفحة خطأ مو ملف حقيقي

function cleanupFile(filePath) {
    if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) { /* تجاهل */ }
    }
}

module.exports.ZOTERun = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;

    const query = args.join(" ").trim();
    if (!query) {
        return api.sendMessage("يرجى كتابة اسم الأغنية.\nمثال: .اغاني Lofi Mood", threadID, messageID);
    }

    api.setMessageReaction("🔎", messageID, threadID, () => {}, true);

    try {
        const apiUrl = await baseApiUrl();
        const res = await axios.get(`${apiUrl}/api/ytb/search?q=${encodeURIComponent(query)}`);
        const results = (res.data.results || []).slice(0, 6);

        if (results.length === 0) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`⭕ لم أجد أي نتيجة لـ "${query}"`, threadID, messageID);
        }

        let msg = "";
        const attachments = [];
        const cacheDir = ensureCacheDir();

        for (let i = 0; i < results.length; i++) {
            msg += `${i + 1}. ${results[i].title}\nالمدة: ${results[i].time}\n\n`;
            const thumbPath = path.join(cacheDir, `thumb_${senderID}_${Date.now()}_${i}.jpg`);
            const thumbRes = await axios.get(results[i].thumbnail, { responseType: "arraybuffer" });
            fs.writeFileSync(thumbPath, Buffer.from(thumbRes.data));
            attachments.push(fs.createReadStream(thumbPath));
        }

        return api.sendMessage({
            body: `${msg}↩ رد على هذه الرسالة برقم الأغنية اللي تريدها`,
            attachment: attachments
        }, threadID, (err, info) => {
            attachments.forEach((stream) => { if (fs.existsSync(stream.path)) fs.unlinkSync(stream.path); });
            if (err) return;
            Zote.client.ZOTEReply.push({
                name: this.config.title,
                messageID: info.messageID,
                author: senderID,
                results,
                apiUrl
            });
        }, messageID);

    } catch (e) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage(`❌ حدث خطأ: ${e.message}`, threadID, messageID);
    }
};

module.exports.ZOTEReply = async function ({ event, api, ZOTEReply }) {
    const { results, apiUrl, author } = ZOTEReply;
    if (event.senderID !== author) return;

    const choice = parseInt(event.body);
    if (isNaN(choice) || choice <= 0 || choice > results.length) {
        return api.unsendMessage(ZOTEReply.messageID);
    }

    const videoID = results[choice - 1].id;
    api.unsendMessage(ZOTEReply.messageID);
    api.setMessageReaction("⌛", event.messageID, event.threadID, () => {}, true);

    await handleDownload(api, event.threadID, event.messageID, videoID, apiUrl);
};

async function handleDownload(api, threadID, messageID, videoID, apiUrl) {
    const cacheDir = ensureCacheDir();
    const filePath = path.join(cacheDir, `yt_${Date.now()}.mp3`);

    try {
        const res = await axios.get(`${apiUrl}/api/ytb/get?id=${videoID}&type=audio`);
        const { title, downloadLink } = res.data.data || {};

        if (!downloadLink) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage("❌ تعذّر الحصول على رابط تحميل لهذه الأغنية (قد تكون مقيّدة أو محذوفة).", threadID, messageID);
        }

        api.sendMessage(`⬇ جاري تحميل الأغنية: "${title}"`, threadID, messageID);

        const response = await axios({ url: downloadLink, method: "GET", responseType: "stream" });

        const contentType = String(response.headers["content-type"] || "");
        if (contentType.includes("text/html") || contentType.includes("application/json")) {
            response.data.destroy();
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage("❌ رابط هذه الأغنية غير صالح حاليًا من مزوّد الخدمة، جرّب أغنية ثانية.", threadID, messageID);
        }

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        writer.on("finish", () => {
            const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

            if (!stats || stats.size < MIN_VALID_FILE_SIZE) {
                cleanupFile(filePath);
                api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                return api.sendMessage("❌ الملف الناتج غير صالح، جرّب أغنية ثانية.", threadID, messageID);
            }

            api.sendMessage({
                body: `✅ تم التحميل بنجاح: ${title}`,
                attachment: fs.createReadStream(filePath)
            }, threadID, (err) => {
                cleanupFile(filePath);
                if (err) {
                    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                    return api.sendMessage("❌ فشل إرسال الملف عبر ماسنجر.", threadID, messageID);
                }
                api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            }, messageID);
        });

        writer.on("error", () => {
            cleanupFile(filePath);
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            api.sendMessage("❌ فشل حفظ الملف بعد التحميل.", threadID, messageID);
        });

    } catch (e) {
        cleanupFile(filePath);
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        api.sendMessage("❌ فشل التحميل، حاول مرة أخرى لاحقًا.", threadID, messageID);
    }
}
