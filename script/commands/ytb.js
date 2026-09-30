/**
 * أمر: اغنية — بحث وتحميل فيديو/صوت من يوتيوب عبر اسم أو رابط (API خارجي)
 * -------------------------------------------------------------
 * يختلف عن أمر "يوتيوب" (الذي يشغّل yt-dlp محليًا على السيرفر ومعطّل حاليًا
 * على Render بسبب حجب يوتيوب لعناوين IP الخاصة به) — هذا الأمر يعتمد على
 * نفس خدمة API الخارجية المستخدمة في "تحميل" و"بنترست"، وبالتالي غير
 * متأثر بمشكلة حجب Render. يضيف ميزتين غير متوفرتين في أي أمر آخر:
 * البحث بالاسم (وليس فقط رابط مباشر) واستخراج الصوت فقط (mp3).
 *
 * ملاحظة: يعتمد على خدمة طرف ثالث (mahmudx7/HINATA) قد تتوقف أو تتغيّر
 * بدون إشعار، تمامًا مثل أمري "تحميل" و"بنترست".
 */

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: "اغنية",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "بحث وتحميل فيديو أو صوت من يوتيوب بالاسم أو الرابط، أو عرض معلومات الفيديو",
    section: "عـــامـة",
    syntax: "اغنية -v/-a/-i [اسم الاغنية أو رابط يوتيوب]",
    delay: 10,
};

const YT_LINK_REGEX = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})(?:\S+)?$/;

function ensureCacheDir() {
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    return cacheDir;
}

module.exports.ZOTERun = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    let type;

    switch (args[0]) {
        case "-v": case "video": type = "video"; break;
        case "-a": case "-s": case "audio": type = "audio"; break;
        case "-i": case "info": type = "info"; break;
        default:
            return api.sendMessage(
                "• طريقة الاستخدام:\n" +
                ".اغنية -v [اسم/رابط] : تحميل فيديو\n" +
                ".اغنية -a [اسم/رابط] : تحميل صوت (mp3)\n" +
                ".اغنية -i [اسم/رابط] : عرض معلومات الفيديو\n\n" +
                "مثال: .اغنية -a Lofi Mood",
                threadID, messageID
            );
    }

    const input = args.slice(1).join(" ");
    if (!input) return api.sendMessage("يرجى كتابة اسم الاغنية أو رابط يوتيوب.", threadID, messageID);

    try {
        const apiUrl = await baseApiUrl();

        if (YT_LINK_REGEX.test(input)) {
            const videoID = input.match(YT_LINK_REGEX)[1];
            api.setMessageReaction("⌛", messageID, threadID, () => {}, true);
            if (type === "info") return fetchInfo(api, threadID, messageID, videoID, apiUrl);
            return handleDownload(api, threadID, messageID, videoID, type, apiUrl);
        }

        api.setMessageReaction("🔎", messageID, threadID, () => {}, true);
        const res = await axios.get(`${apiUrl}/api/ytb/search?q=${encodeURIComponent(input)}`);
        const results = (res.data.results || []).slice(0, 6);
        if (results.length === 0) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`⭕ لم أجد أي نتيجة لـ "${input}"`, threadID, messageID);
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
            body: `${msg}↩ رد على هذه الرسالة برقم النتيجة التي تريدها`,
            attachment: attachments
        }, threadID, (err, info) => {
            attachments.forEach((stream) => { if (fs.existsSync(stream.path)) fs.unlinkSync(stream.path); });
            if (err) return;
            Zote.client.ZOTEReply.push({
                name: this.config.title,
                messageID: info.messageID,
                author: senderID,
                results,
                type,
                apiUrl
            });
        }, messageID);

    } catch (e) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage(`❌ حدث خطأ: ${e.message}`, threadID, messageID);
    }
};

module.exports.ZOTEReply = async function ({ event, api, ZOTEReply }) {
    const { results, type, apiUrl, author } = ZOTEReply;
    if (event.senderID !== author) return;

    const choice = parseInt(event.body);
    if (isNaN(choice) || choice <= 0 || choice > results.length) {
        return api.unsendMessage(ZOTEReply.messageID);
    }

    const videoID = results[choice - 1].id;
    api.unsendMessage(ZOTEReply.messageID);
    api.setMessageReaction("⌛", event.messageID, event.threadID, () => {}, true);

    if (type === "info") return fetchInfo(api, event.threadID, event.messageID, videoID, apiUrl);
    await handleDownload(api, event.threadID, event.messageID, videoID, type, apiUrl);
};

// أصغر حجم منطقي لملف حقيقي — أقل من هذا شبه مؤكد إنه صفحة خطأ/رابط معطوب مو وسائط فعلية
const MIN_VALID_FILE_SIZE = 15 * 1024; // 15KB
// سقف تقريبي لمرفقات ماسنجر (القيمة الشائعة ~25MB) — نستخدمه كتحذير احترازي فقط، مو رقم مضمون 100%
const SOFT_MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB

function cleanupFile(filePath) {
    if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
    }
}

async function handleDownload(api, threadID, messageID, videoID, type, apiUrl) {
    const format = type === "audio" ? "mp3" : "mp4";
    const cacheDir = ensureCacheDir();
    const filePath = path.join(cacheDir, `yt_${Date.now()}.${format}`);

    try {
        const res = await axios.get(`${apiUrl}/api/ytb/get?id=${videoID}&type=${type}`);
        const { title, downloadLink } = res.data.data || {};

        if (!downloadLink) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage("❌ تعذّر الحصول على رابط تحميل لهذا الفيديو (قد يكون مقيّدًا أو محذوفًا أو خاصًا).", threadID, messageID);
        }

        api.sendMessage(`⬇ جاري تحميل الـ${type === "audio" ? "صوت" : "فيديو"}: "${title}"`, threadID, messageID);

        const response = await axios({ url: downloadLink, method: "GET", responseType: "stream" });

        // بعض الفيديوهات يرجع لها مزوّد الـ API رابط معطوب فيرد صفحة HTML أو JSON بدل الوسائط الفعلية
        // هذا هو السبب الأشيع لظهور "success 0/1 item(s)" أو "no metadata/ids" بلوق فيسبوك عند الإرسال
        const contentType = String(response.headers["content-type"] || "");
        if (contentType.includes("text/html") || contentType.includes("application/json")) {
            response.data.destroy();
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage("❌ رابط هذا الفيديو غير صالح حاليًا من مزوّد الخدمة، جرّب فيديو آخر أو أعد المحاولة لاحقًا.", threadID, messageID);
        }

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        writer.on("finish", () => {
            const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

            if (!stats || stats.size < MIN_VALID_FILE_SIZE) {
                cleanupFile(filePath);
                api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                return api.sendMessage("❌ الملف الناتج غير صالح (رابط معطوب من مزوّد الخدمة)، جرّب فيديو آخر.", threadID, messageID);
            }

            if (stats.size > SOFT_MAX_ATTACHMENT_SIZE) {
                cleanupFile(filePath);
                api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                return api.sendMessage(
                    `❌ حجم الملف (${(stats.size / 1024 / 1024).toFixed(1)}MB) على الأغلب أكبر من سقف مرفقات ماسنجر تقريبًا.\nجرّب وضع الصوت (-a) بدل الفيديو، أو فيديو أقصر.`,
                    threadID, messageID
                );
            }

            api.sendMessage({
                body: `✅ تم التحميل بنجاح: ${title}`,
                attachment: fs.createReadStream(filePath)
            }, threadID, (err) => {
                cleanupFile(filePath);
                if (err) {
                    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                    return api.sendMessage("❌ فشل إرسال الملف عبر ماسنجر (رفضه فيسبوك لهذا الفيديو تحديدًا)، جرّب فيديو آخر.", threadID, messageID);
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

async function fetchInfo(api, threadID, messageID, videoID, apiUrl) {
    const cacheDir = ensureCacheDir();
    try {
        const res = await axios.get(`${apiUrl}/api/ytb/details?id=${videoID}`);
        const d = res.data.details;
        const msg = `💠 العنوان: ${d.title}\n` +
            `🏪 القناة: ${d.channel}\n` +
            `👥 المشتركين: ${d.subCount || "غير متاح"}\n` +
            `⏱ المدة: ${d.duration_raw || d.duration}\n` +
            `👀 المشاهدات: ${d.view_count}\n` +
            `👍 الإعجابات: ${d.like_count || "غير متاح"}\n` +
            `🆙 تاريخ الرفع: ${d.upload_date || "غير متاح"}\n` +
            `🔗 الرابط: ${d.webpage_url}`;

        const thumbPath = path.join(cacheDir, `info_${videoID}_${Date.now()}.jpg`);
        const thumbRes = await axios.get(d.thumbnail, { responseType: "arraybuffer" });
        fs.writeFileSync(thumbPath, Buffer.from(thumbRes.data));

        api.sendMessage({ body: msg, attachment: fs.createReadStream(thumbPath) },
            threadID, () => {
                api.setMessageReaction("✅", messageID, threadID, () => {}, true);
                if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
            }, messageID);
    } catch (e) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        api.sendMessage("❌ تعذر جلب معلومات هذا الفيديو.", threadID, messageID);
    }
}
