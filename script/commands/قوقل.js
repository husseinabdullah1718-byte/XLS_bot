/**
 * أمر: قوقل — بحث وجلب صور من Google Images (أي موقع مفهرس بقوقل، وليس مصدر واحد)
 * -------------------------------------------------------------
 * .قوقل [كلمة بحث] - [عدد]     مثال: .قوقل قطط - 10
 *
 * يعتمد على تحليل صفحة نتائج بحث صور قوقل مباشرة (بدون مفتاح API مدفوع)،
 * بنفس أسلوب أمر "بنترست" (تفاعل 👍 لجلب المزيد من نفس نتائج البحث).
 *
 * ⚠️ ملاحظة مهمة: هذا الأسلوب (تحليل صفحة النتائج مباشرة) قد يتوقف أو
 * يتغيّر بدون إشعار إذا غيّرت قوقل بنية صفحتها، أو إذا حظرت قوقل عنوان IP
 * السيرفر المستضيف للبوت بسبب الطلبات الآلية المتكررة (نفس المشكلة
 * المذكورة بملاحظة أمر "اغنية" بخصوص يوتيوب على Render). إذا توقف الأمر
 * عن العمل فجأة، هذا هو السبب الأرجح وليس عطلاً بالكود.
 */

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    title: "قوقل",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "بحث وجلب صور من Google Images بأي كلمة بحث",
    section: "عـــامـة",
    syntax: "قوقل [كلمة بحث] - [عدد] (مثال: قوقل قطط - 10)",
    delay: 8,
};

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
};

// يجلب روابط الصور الحقيقية (وليس الصور المصغّرة) من صفحة نتائج بحث صور قوقل.
// قوقل يضمّن الروابط الأصلية داخل بيانات JSON مطمورة بالصفحة تحت المفتاح "ou".
async function fetchGoogleImageLinks(query) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=ar`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const html = res.data;

    const matches = [...html.matchAll(/"ou":"(.*?)"/g)].map((m) =>
        m[1].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&").replace(/\\\//g, "/")
    );

    return Array.from(new Set(matches)); // إزالة التكرار
}

function ensureCacheDir() {
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    return cacheDir;
}

async function downloadImages(links, cacheDir, prefix) {
    const attachments = [];
    for (let i = 0; i < links.length; i++) {
        try {
            const imgRes = await axios.get(links[i], {
                responseType: "arraybuffer",
                headers: HEADERS,
                timeout: 10000,
            });
            const imgPath = path.join(cacheDir, `${prefix}_${Date.now()}_${i}.jpg`);
            await fs.outputFile(imgPath, imgRes.data);
            attachments.push(fs.createReadStream(imgPath));
        } catch (e) {
            // صورة واحدة فشلت (رابط منتهي/محجوب) — نتجاهلها ونكمل الباقي
        }
    }
    return attachments;
}

function cleanupAttachments(attachments) {
    for (const att of attachments) {
        if (fs.existsSync(att.path)) fs.unlinkSync(att.path);
    }
}

module.exports.ZOTERun = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;

    const parts = args.join(" ").split("-").map((s) => s.trim());
    const query = parts[0];
    const countInput = parts[1];
    const displayCount = countInput ? Math.min(Math.max(parseInt(countInput), 1), 20) : 6;

    if (!query) {
        return api.sendMessage(
            "• طريقة الاستخدام:\n.قوقل [كلمة بحث] - [عدد]\nمثال: .قوقل قطط - 10",
            threadID, messageID
        );
    }

    api.setMessageReaction("⏳", messageID, threadID, () => {}, true);

    try {
        const allLinks = await fetchGoogleImageLinks(query);

        if (allLinks.length === 0) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ ما لقيت أي صور لـ "${query}"، جرّب كلمة بحث ثانية.`, threadID, messageID);
        }

        const cacheDir = ensureCacheDir();
        const linksToShow = allLinks.slice(0, displayCount);
        const attachments = await downloadImages(linksToShow, cacheDir, "gimg");

        if (attachments.length === 0) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage("❌ لقيت روابط صور بس تعذّر تحميل أي وحدة منها، جرّب مرة ثانية.", threadID, messageID);
        }

        const msg = `✔ لقيت ${allLinks.length} صورة لـ "${query}"\nعرض ${attachments.length} منها\nتفاعل بـ 👍 لجلب المزيد`;

        api.sendMessage({ body: msg, attachment: attachments }, threadID, (err, info) => {
            cleanupAttachments(attachments);
            if (err) {
                api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                return;
            }
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            Zote.client.ZOTEReaction.push({
                name: module.exports.config.title,
                messageID: info.messageID,
                author: senderID,
                query,
                allLinks,
                startIndex: displayCount,
                displayCount,
            });
        }, messageID);

    } catch (e) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage(
            "❌ فشل البحث (قد تكون قوقل حظرت الطلبات الآلية مؤقتًا من هذا السيرفر). جرّب لاحقًا.",
            threadID, messageID
        );
    }
};

module.exports.ZOTEReaction = async function ({ api, event, ZOTEReaction }) {
    const { threadID, messageID, userID, reaction } = event;
    if (reaction !== "👍") return;
    if (userID !== ZOTEReaction.author) return;

    const { query, allLinks, startIndex, displayCount } = ZOTEReaction;
    const cacheDir = ensureCacheDir();

    api.setMessageReaction("⏳", messageID, threadID, () => {}, true);

    let links = allLinks;
    let newStart = startIndex;

    // إذا استهلكنا كل الروابط المخزّنة، نجيب دفعة جديدة بنفس كلمة البحث
    if (newStart >= links.length) {
        try {
            const fresh = await fetchGoogleImageLinks(query + " ");
            const merged = Array.from(new Set([...links, ...fresh]));
            links = merged;
        } catch (e) { /* نكمل بما هو متوفر لدينا */ }
    }

    const nextBatch = links.slice(newStart, newStart + displayCount);
    if (nextBatch.length === 0) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("❌ ما لقيت صور إضافية لهذا البحث.", threadID, messageID);
    }

    const attachments = await downloadImages(nextBatch, cacheDir, "gimg_more");
    if (attachments.length === 0) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("❌ تعذّر تحميل صور إضافية.", threadID, messageID);
    }

    api.sendMessage({
        body: `✔ ${attachments.length} صورة إضافية لـ "${query}"\nتفاعل بـ 👍 لجلب المزيد`,
        attachment: attachments
    }, threadID, (err, info) => {
        cleanupAttachments(attachments);
        if (err) return;
        api.setMessageReaction("✅", messageID, threadID, () => {}, true);
        Zote.client.ZOTEReaction.push({
            name: module.exports.config.title,
            messageID: info.messageID,
            author: userID,
            query,
            allLinks: links,
            startIndex: newStart + nextBatch.length,
            displayCount,
        });
    });
};
