// ==============================
// نظام الاحترام - MongoDB + Gemini AI
// الإصدار 3.0.0
// ==============================

const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { canCallGeminiNow } = require("../../utils/geminiLimiter.js");

// ==============================
// المطور المحمي
// ==============================

const OWNER_ID = "61551379444881";

// ==============================
// الاتصال بـ MongoDB (نفس قاعدة الحماية)
// ==============================

// ملاحظة: الاتصال الفعلي بقاعدة البيانات يتم مرة واحدة فقط من
// index.js باستخدام config.MONGO_URI. هذا الملف لا يفتح اتصالاً
// منفصلاً (كان سابقًا يتصل برابط مكتوب يدويًا مختلف عن الرابط
// الأساسي، وهذا كان سبب خطأ "different connection strings").
// نكتفي هنا بالتحقق من وجود اتصال نشط واستخدام نفس اتصال
// mongoose الافتراضي المشترك بين كل الملفات.

let isConnected = false;

async function connectDB() {

    if (isConnected) return;

    if (mongoose.connection.readyState === 1) {
        isConnected = true;
        console.log("[احترام] ✅ يستخدم الاتصال المشترك بـ MongoDB");
        return;
    }

    console.warn("[احترام] ⚠️ لا يوجد اتصال نشط بقاعدة البيانات الآن.");
}

// ==============================
// نموذج البيانات
// ==============================

const respectSchema = new mongoose.Schema({

    threadID: { type: String, required: true, unique: true },

    enabled: { type: Boolean, default: false },

    // وضع الذكاء الاصطناعي (إضافي على الكلمات المحظورة)
    aiMode: { type: Boolean, default: true },

    warns: { type: Map, of: Number, default: {} },

    // المستخدمون المعفوون
    whitelist: { type: [String], default: [] }

}, { timestamps: true });

const RespectModel = mongoose.models.Respect ||
    mongoose.model("Respect", respectSchema);

// ==============================
// كاش في الذاكرة
// ==============================

const dbCache = {};

// ==============================
// قراءة بيانات المجموعة
// ==============================

async function getDoc(threadID) {

    if (
        dbCache[threadID] &&
        Date.now() - dbCache[threadID].time < 10000
    ) {
        return dbCache[threadID].data;
    }

    await connectDB();

    const doc = await RespectModel.findOne({ threadID });

    if (doc) {

        dbCache[threadID] = { data: doc, time: Date.now() };
    }

    return doc;
}

// ==============================
// إنشاء مجموعة جديدة
// ==============================

async function createDoc(threadID) {

    await connectDB();

    const doc = new RespectModel({ threadID });

    await doc.save();

    dbCache[threadID] = { data: doc, time: Date.now() };

    return doc;
}

// ==============================
// حفظ التغييرات
// ==============================

async function saveDoc(doc) {

    try {

        await doc.save();

        dbCache[doc.threadID] = {
            data: doc,
            time: Date.now()
        };

    } catch (e) {

        console.error("[احترام] خطأ في الحفظ:", e);
    }
}

// ==============================
// Gemini AI
// ==============================

let genAI = null;

function getAI() {

    if (genAI) return genAI;

    // جلب المفتاح من config
    try {

        const config = require("./config.json");
        const key = config.GEMINI_KEY;

        if (key && key !== "your_apikey") {

            genAI = new GoogleGenerativeAI(key);
        }

    } catch {}

    return genAI;
}

// ==============================
// فحص الرسالة بالذكاء الاصطناعي
// ==============================

async function checkWithAI(text) {

    try {

        const ai = getAI();

        if (!ai) return { offensive: false, reason: "" };

        if (!canCallGeminiNow()) {
            // تجاوزنا الحد المسموح به بالدقيقة (مشترك مع حماية.js)
            return { offensive: false, reason: "" };
        }

        const model = ai.getGenerativeModel({
            model: "gemini-3.5-flash"
        });

        const prompt =
`أنت نظام فلترة محتوى لمجموعة عربية. مهمتك تحديد إذا كانت الرسالة تحتوي على:
- سب أو شتم أو إهانة
- كلام فاحش أو إباحي
- عنصرية أو تمييز
- تهديد أو ترهيب

الرسالة: "${text}"

أجب فقط بصيغة JSON هكذا بدون أي نص إضافي:
{"offensive": true/false, "reason": "سبب قصير بالعربية أو فارغ"}`;

        const result = await model.generateContent(prompt);

        const response = result.response.text().trim();

        const clean = response
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const parsed = JSON.parse(clean);

        return {
            offensive: parsed.offensive === true,
            reason: parsed.reason || ""
        };

    } catch {

        return { offensive: false, reason: "" };
    }
}

// ==============================
// قائمة الكلمات المحظورة (احتياطية)
// ==============================

const badWords = [
    "حيوان", "كلب", "حمار", "قرد", "خنزير", "زبالة", "وسخ", "قذر",
    "حقير", "نذل", "واطي", "منحط", "تيس", "معفن", "مقرف", "سافل",
    "خرا", "قحبة", "شرموطة", "عاهرة", "ديوث", "خول", "لوطي",
    "منيوك", "عرص", "قواد", "ممحون", "كلب ابن كلب", "ابن الكلب",
    "ابن الحرام", "ابن الزنا", "يلعن امك", "يلعن ابو", "يلعن دينك",
    "كس امك", "طيز", "نيك", "انيكك", "زفت", "معرص", "منيك",
    "يا عرص", "يا خول", "يا كلب", "يا حمار", "يا غبي", "يا وسخ",
    "يا حقير", "يا قذر", "يا ابن الحرام", "يا ابن الزنا", "يا نذل",
    "يا منحط", "يا قحبة", "يا شرموطة", "يا ديوث", "يا لوطي",
    "يا متخلف", "يا معفن", "يا زبالة", "يا خرا", "زامل", "داشر",
    "هبيل", "خكري", "منسم", "هطف", "طرطور", "طافي", "معتوه",
    "لقيط", "سربوت", "كحبة", "زربة", "بهيم", "مقرود", "مفهي",
    "مسطول", "معطوب", "مهووس", "هبد", "طز", "يا تيس", "يا بهيم",
    "يا هبيلة", "يا هطف", "يا لقمة", "يا زامل", "يا داشر",
    "يا خروف", "يا طرطور", "يا مفهي", "يا مسطول", "يا منسم",
    "قضيب", "زبي", "زب", "كس", "مهبل", "مؤخرة", "ثدي", "بزولة",
    "بزازة", "مناك", "سكس", "اغتصاب", "تحرش", "شرج", "قذف",
    "اباحية", "اباحي", "fuck", "bitch", "asshole", "shit",
    "motherfucker", "dick", "pussy", "sex", "porn", "slut",
    "whore", "bastard", "faggot", "nigga", "nigger", "retard"
];

// ==============================
// فحص الكلمات المحظورة (سريع)
// ==============================

function checkBadWords(text) {

    const lower = text.toLowerCase();

    return badWords.some(w => lower.includes(w.toLowerCase()));
}

// ==============================
// مساعد عرض الحالة
// ==============================

function light(v) {

    return v ? "🟢" : "🔴";
}

// ==============================
// معلومات الأمر
// ==============================

module.exports.config = {

    title: "احترام",
    release: "3.0.0",
    clearance: 1,
    author: "ZOTE Tracks",
    summary: "منع السب والشتم بالذكاء الاصطناعي",
    section: "الادمــــن",
    syntax: "احترام",
    delay: 3
};

// ==============================
// أمر الاحترام
// ==============================

module.exports.ZOTERun = async function ({
    api,
    event,
    args
}) {

    const { threadID, senderID, messageID } = event;

    // الأمر للمطور فقط
    if (String(senderID) !== String(OWNER_ID)) {

        return api.sendMessage(
            "❌ هذا الأمر خاص بالمطور فقط",
            threadID,
            messageID
        );
    }

    let doc = await getDoc(threadID);

    if (!doc) {

        doc = await createDoc(threadID);
    }

    // عرض الحالة
    if (!args[0]) {

        return api.sendMessage(
`『 نظام الاحترام 3.0 』

${light(doc.enabled)} الحالة
${light(doc.aiMode)} الذكاء الاصطناعي

✦ الأوامر:
احترام تشغيل
احترام ايقاف
احترام ذكاء تشغيل
احترام ذكاء ايقاف
احترام سماح [uid]
احترام منع [uid]
احترام تحذيرات [uid]
احترام فك [uid]`,
            threadID,
            messageID
        );
    }

    const cmd = args[0];
    const uid = args[1];

    // تشغيل
    if (cmd === "تشغيل") {

        doc.enabled = true;
        await saveDoc(doc);

        return api.sendMessage(
            "🟢 تم تشغيل نظام الاحترام",
            threadID,
            messageID
        );
    }

    // إيقاف
    if (cmd === "ايقاف") {

        doc.enabled = false;
        await saveDoc(doc);

        return api.sendMessage(
            "🔴 تم إيقاف نظام الاحترام",
            threadID,
            messageID
        );
    }

    // تشغيل الذكاء الاصطناعي
    if (cmd === "ذكاء" && args[1] === "تشغيل") {

        doc.aiMode = true;
        await saveDoc(doc);

        return api.sendMessage(
            "🟢 تم تشغيل فحص الذكاء الاصطناعي",
            threadID,
            messageID
        );
    }

    // إيقاف الذكاء الاصطناعي
    if (cmd === "ذكاء" && args[1] === "ايقاف") {

        doc.aiMode = false;
        await saveDoc(doc);

        return api.sendMessage(
            "🔴 تم إيقاف فحص الذكاء الاصطناعي\n(سيستخدم قائمة الكلمات فقط)",
            threadID,
            messageID
        );
    }

    // سماح
    if (cmd === "سماح") {

        if (!uid) {

            return api.sendMessage(
                "❌ اكتب uid العضو",
                threadID,
                messageID
            );
        }

        if (!doc.whitelist.includes(String(uid))) {

            doc.whitelist.push(String(uid));
            await saveDoc(doc);
        }

        return api.sendMessage(
            "✅ تمت إضافة العضو للقائمة البيضاء",
            threadID,
            messageID
        );
    }

    // منع
    if (cmd === "منع") {

        if (!uid) {

            return api.sendMessage(
                "❌ اكتب uid العضو",
                threadID,
                messageID
            );
        }

        doc.whitelist = doc.whitelist.filter(
            x => String(x) !== String(uid)
        );

        await saveDoc(doc);

        return api.sendMessage(
            "✅ تمت إزالة العضو من القائمة البيضاء",
            threadID,
            messageID
        );
    }

    // عرض التحذيرات
    if (cmd === "تحذيرات") {

        if (!uid) {

            return api.sendMessage(
                "❌ اكتب uid العضو",
                threadID,
                messageID
            );
        }

        const warns = doc.warns.get(uid) || 0;

        return api.sendMessage(
            `⚠️ عدد تحذيرات ${uid}: ${warns}/3`,
            threadID,
            messageID
        );
    }

    // فك التحذيرات
    if (cmd === "فك") {

        if (!uid) {

            return api.sendMessage(
                "❌ اكتب uid العضو",
                threadID,
                messageID
            );
        }

        doc.warns.set(uid, 0);
        await saveDoc(doc);

        return api.sendMessage(
            "✅ تم فك تحذيرات العضو",
            threadID,
            messageID
        );
    }

    return api.sendMessage(
        "❌ أمر غير معروف، اكتب: احترام",
        threadID,
        messageID
    );
};

// ==============================
// نظام الأحداث
// ==============================

module.exports.ZOTEEvent = async function ({
    api,
    event
}) {

    try {

        const {
            threadID,
            senderID,
            body,
            messageID
        } = event;

        if (!body || !body.trim()) return;

        const doc = await getDoc(threadID);

        if (!doc) return;

        if (!doc.enabled) return;

        // حماية المطور
        if (String(senderID) === String(OWNER_ID)) return;

        // حماية القائمة البيضاء
        if (doc.whitelist.includes(String(senderID))) return;

        // حماية الأدمن
        const thread = await api.getThreadInfo(threadID);

        const isAdmin = thread.adminIDs.some(
            x => String(x.id) === String(senderID)
        );

        if (isAdmin) return;

        // ==============================
        // فحص المحتوى
        // المرحلة 1: قائمة الكلمات (سريعة)
        // المرحلة 2: Gemini AI (دقيقة)
        // ==============================

        let isOffensive = false;
        let detectionType = "";

        // فحص القائمة أولاً (أسرع)
        if (checkBadWords(body)) {

            isOffensive = true;
            detectionType = "قائمة الكلمات";
        }

        // فحص الذكاء الاصطناعي إذا لم تُكتشف بالقائمة
        if (!isOffensive && doc.aiMode) {

            const aiResult = await checkWithAI(body);

            if (aiResult.offensive) {

                isOffensive = true;
                detectionType = `الذكاء الاصطناعي${aiResult.reason ? ` (${aiResult.reason})` : ""}`;
            }
        }

        if (!isOffensive) return;

        // ==============================
        // إضافة التحذير
        // ==============================

        const currentWarn = doc.warns.get(senderID) || 0;
        const newWarn = currentWarn + 1;
        doc.warns.set(senderID, newWarn);

        await saveDoc(doc);

        // جلب اسم الشخص
        const userInfo = await api.getUserInfo(senderID);
        const name = userInfo[senderID]?.name || "مجهول";

        // ==============================
        // التحذير الأول
        // ==============================

        if (newWarn === 1) {

            return api.sendMessage(
                {
                    body:
`⚠️ يا ${name}

احترم الآخرين وحافظ على بيئة أخوية لطيفة 🙏
التحذير: 1/3`,
                    mentions: [{ tag: name, id: senderID }]
                },
                threadID,
                messageID
            );
        }

        // ==============================
        // التحذير الثاني
        // ==============================

        if (newWarn === 2) {

            return api.sendMessage(
                {
                    body:
`⚠️ يا ${name}

سبت مرة ثانية، المرة القادمة ستجد نفسك في الخارج 😤
التحذير: 2/3`,
                    mentions: [{ tag: name, id: senderID }]
                },
                threadID,
                messageID
            );
        }

        // ==============================
        // الطرد عند التحذير الثالث
        // ==============================

        if (newWarn >= 3) {

            await api.sendMessage(
                {
                    body:
`❌ يا ${name}

أنت وقح ومكانك ليس مع المحترمين 😒
تم طردك تلقائياً`,
                    mentions: [{ tag: name, id: senderID }]
                },
                threadID,
                messageID
            );

            try {

                await api.removeUserFromGroup(senderID, threadID);

            } catch {}

            // تصفير التحذيرات بعد الطرد
            doc.warns.set(senderID, 0);
            await saveDoc(doc);
        }

    } catch (err) {

        console.error("[احترام] خطأ:", err);
    }
};
