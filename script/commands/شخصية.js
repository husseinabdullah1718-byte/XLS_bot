/**
 * أمر: شخصية — شخصية ذكاء اصطناعي تتفاعل تلقائيًا مع كل رسائل المجموعة
 * -------------------------------------------------------------
 * .شخصية        → تفعيل الشخصية بهذه المجموعة (تبدأ ترد على كل رسالة عادية)
 * .شخصية توقف   → إيقاف الشخصية بهذه المجموعة
 *
 * يختلف عن أمر "ai": ذاك يحتاج نداءه صراحة (.ai أو رد على رسالته)، بينما
 * هذا بمجرد تفعيله يرد تلقائيًا على أي رسالة عادية بالمجموعة (بدون بادئة)
 * إلى أن يُوقَف صراحة. التفعيل/الإيقاف مقصور على أدمن المجموعة أو مالك
 * البوت (clearance 1) لأنه يؤثر على كل أعضاء المجموعة وعلى استهلاك الـ API.
 *
 * الاعتماد: نفس مفتاح Gemini المستخدم بأمر "ai" (config.GEMINI_KEY).
 */

const axios = require("axios");
const deco = require("../../utils/decorations");
const personaData = require("../../database/personaData");

module.exports.config = {
    title: "شخصية",
    release: "1.0.0",
    clearance: 1,
    author: "ZOTE Tracks",
    summary: "تفعيل/إيقاف شخصية بنت أنمي (ميساكي) ترد تلقائيًا على رسائل المجموعة",
    section: "زكـــــــاء",
    syntax: "شخصية [توقف]",
    delay: 2,
};

// ---------- محادثة قصيرة لكل مجموعة (بالذاكرة فقط) ----------
const threadContexts = new Map(); // threadID -> [{role, parts}]
const MAX_CONTEXT_TURNS = 8;

// ---------- تبريد بسيط لكل مجموعة كي لا تُستهلك API لكل رسالة فورًا ----------
const threadCooldowns = new Map(); // threadID -> timestamp آخر رد
const MIN_REPLY_GAP_MS = 3000;

const SYSTEM_PROMPT = `
أنتِ "ميساكي"، بنت أنمي مرحة وخفيفة الظل، عضوة بمجموعة ماسنجر وتتفاعلين مع باقي
الأعضاء بشكل طبيعي وعفوي مثل أي بنت بمجموعة أصدقاء. تتحدثين باللهجة العربية
العامية البسيطة وبصيغة المؤنث دائمًا (أنا سويت، أنا حابة، أنا شايفة...لا
تستخدمي أبدًا صيغة المذكر عن نفسك)، بردود قصيرة (سطر أو سطرين عادة)، وبأسلوب
صديقة بالمجموعة وليس مساعدة رسمية. بإمكانك استخدام تعابير وإيموجيز بأسلوب
بنات الأنمي الكيوت أحيانًا (زي ايهي، هيهي، إيموجيز ✨🌸) بدون مبالغة أو تكرار
بكل رسالة. لا تذكري أنك نموذج ذكاء اصطناعي أو تتحدثي عن كونك "بوت" إلا إذا
سُئلتِ مباشرة. تفاعلي مع اسم الشخص المرسل أحيانًا، ولا تكرري نفس الأسلوب بكل رد.
`.trim();

async function getPersonaReply(threadID, userName, userMessage, apiKey) {
    let context = threadContexts.get(threadID) || [];
    context.push({ role: "user", parts: [{ text: `${userName}: ${userMessage}` }] });
    if (context.length > MAX_CONTEXT_TURNS) context = context.slice(-MAX_CONTEXT_TURNS);

    const fullConversation = [
        { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "تمام، فهمت الأسلوب المطلوب." }] },
        ...context,
    ];

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        { contents: fullConversation },
        { headers: { "Content-Type": "application/json" } }
    );

    if (!response.data.candidates || !response.data.candidates[0]?.content) {
        throw new Error("استجابة غير صالحة من API");
    }

    const reply = response.data.candidates[0].content.parts[0].text;
    context.push({ role: "model", parts: [{ text: reply }] });
    threadContexts.set(threadID, context);
    return reply;
}

// -------------------- تفعيل / إيقاف --------------------
module.exports.ZOTERun = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const sub = (args[0] || "").toLowerCase();

    if (sub === "توقف" || sub === "stop") {
        await personaData.deactivate(threadID);
        threadContexts.delete(threadID);
        return api.sendMessage(deco.line("تم إيقاف الشخصية التفاعلية بهذه المجموعة."), threadID, messageID);
    }

    const already = await personaData.isActive(threadID);
    if (already) {
        return api.sendMessage(deco.error("الشخصية مفعّلة أصلاً بهذه المجموعة. اكتب \".شخصية توقف\" لإيقافها."), threadID, messageID);
    }

    await personaData.activate(threadID, senderID);
    return api.sendMessage(
        deco.line("تم تفعيل الشخصية 👧✨\nأنا ميساكي، راح أرد تلقائيًا على رسائل الأعضاء بهذه المجموعة.\nلإيقافها: \".شخصية توقف\""),
        threadID, messageID
    );
};

// -------------------- الاستجابة التلقائية لرسائل المجموعة --------------------
// تُستدعى من messageHandler.js لكل رسالة عادية (بدون بادئة) قبل تجاهلها.
// ترجع true إذا "استهلكت" الرسالة (الشخصية ردت)، أو false لتتابع المعالجة الطبيعية.
module.exports.ZOTEPersonaHandle = async function ({ api, event, config }) {
    const { threadID, senderID, body } = event;
    if (!body || !body.trim()) return false;

    const active = await personaData.isActive(threadID);
    if (!active) return false;

    const now = Date.now();
    const lastReply = threadCooldowns.get(threadID) || 0;
    if (now - lastReply < MIN_REPLY_GAP_MS) return false; // تجاهل صامت لتجنب إغراق الـ API

    const apiKey = config.GEMINI_KEY;
    if (!apiKey || apiKey === "Gemini_API_Optional") return false; // ما فيه مفتاح مضبوط

    let userName = "عضو";
    try {
        const info = await api.getUserInfo(senderID);
        userName = info?.[senderID]?.name || "عضو";
    } catch (e) { /* تجاهل */ }

    try {
        const reply = await getPersonaReply(threadID, userName, body, apiKey);
        threadCooldowns.set(threadID, now);
        await api.sendMessage(reply, threadID);
        return true;
    } catch (e) {
        console.error("[شخصية] خطأ أثناء توليد الرد:", e.response ? JSON.stringify(e.response.data) : e.message);
        threadCooldowns.set(threadID, now); // نمنع إعادة المحاولة الفورية حتى لو فشلت
        return false;
    }
};
