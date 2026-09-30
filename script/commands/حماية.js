// ============================================================
//  أمر: حماية  —  نظام حماية شامل بواجهة احترافية
//  (كود نظيف بالكامل، بدون أي تشفير/eval)
//
//  القائمة الرئيسية: .حماية
//  تفعيل/إيقاف بالأرقام: .حماية 1 3 8
//  سماح لعضو (منشن/رد/uid): .حماية سماح [uid]
//  إزالة السماح: .حماية منع [uid]
//  قائمة المسموح لهم: .حماية قائمة
//  سجل آخر الأحداث: .حماية سجل   |   مسح السجل: .حماية مسح
//  تحذيرات عضو: .حماية تحذيرات [uid]   |   فك تحذيراته: .حماية فك [uid]
//
//  ملاحظة: واجهة فيسبوك غير الرسمية لا تسمح للبوت بحذف رسائل
//  أرسلها أعضاء آخرون، لذلك عند مخالفة نصّية (رابط/سبام/محتوى غير
//  لائق) يتم تحذير العضو ثم طرده تلقائيًا عند بلوغ حد التحذيرات.
// ============================================================

const axios = require('axios');
const protectionData = require('../../database/protectionData.js');
const config = require('../../config.json');

const OWNER_ID = (config.ADMINBOT && config.ADMINBOT[0]) || null;
const WARN_THRESHOLD = 3; // عدد التحذيرات قبل الطرد التلقائي

module.exports.config = {
    title: 'حماية',
    release: '3.0.0',
    clearance: 1,
    author: 'ZOTE Tracks',
    summary: 'نظام حماية شامل للمجموعة: تغييرات المجموعة، الروابط، السبام، المنشن، والمحتوى غير اللائق',
    section: 'الإشراف',
    syntax: 'حماية [أرقام الحماية] | سماح | منع | قائمة | سجل | مسح | تحديث | تحذيرات [uid] | فك [uid]',
    delay: 2,
};

// -------------------- خريطة أنواع الحماية (بنفس ترتيب الواجهة المطلوبة) --------------------
const LIST = {
    1: 'photo',
    2: 'name',
    3: 'add',
    4: 'admin',
    5: 'nickname',
    6: 'leave',
    7: 'bot',
    8: 'link',
    9: 'spam',
    10: 'mention',
    11: 'emoji',
    12: 'color',
    13: 'offensive',
};
const LABELS = {
    photo: 'حماية الصورة',
    name: 'حماية الاسم',
    add: 'حماية الإضافة',
    admin: 'حماية الأدمن',
    nickname: 'حماية الكنية',
    leave: 'حماية المغادرة',
    bot: 'حماية البوتات',
    link: 'حماية الروابط',
    spam: 'حماية السبام',
    mention: 'حماية المنشن',
    emoji: 'حماية الرمز التعبيري',
    color: 'حماية اللون',
    offensive: 'حماية المحتوى غير اللائق',
};

// رسائل احترافية عند رصد مخالفة (بدون أي إهانة أو سخرية)
const VIOLATION_MESSAGES = {
    photo: '🖼️ تم رصد تغيير غير مصرّح به لصورة المجموعة، وتمت إعادتها.',
    name: '📝 تم رصد تغيير غير مصرّح به لاسم المجموعة، وتمت إعادته.',
    add: '👤 تمت إزالة عضو/أعضاء أضافهم شخص غير مصرّح له بذلك.',
    admin: '🛡️ تم رصد تغيير في صلاحيات الإشراف من قِبل شخص غير مصرّح له.',
    nickname: '🔤 تم رصد تغيير غير مصرّح به لكنية أحد الأعضاء، وتمت إعادتها.',
    leave: '♻️ تم رصد إخراج عضو من قِبل شخص غير مصرّح له.',
    bot: '🤖 تم رصد إضافة حساب يُشتبه أنه بوت، وتمت إزالته.',
    link: '🔗 هذه المجموعة لا تسمح بمشاركة الروابط.',
    spam: '📵 يُرجى تجنّب إرسال رسائل متكررة خلال وقت قصير.',
    mention: '📢 يُرجى تجنّب المنشن الجماعي المزعج.',
    emoji: '🙂 تم رصد تغيير غير مصرّح به للرمز التعبيري، وتمت إعادته.',
    color: '🎨 تم رصد تغيير غير مصرّح به للون المحادثة، وتمت إعادته.',
    offensive: '🚫 تم رصد محتوى غير لائق في هذه الرسالة.',
};

function light(v) {
    return v ? '🟢' : '🔴';
}

// يجلب قائمة المحادثات بشكل آمن يدعم الأنماط المختلفة لمكتبات fca
function getThreadListSafe(api, limit, tags) {
    return new Promise((resolve, reject) => {
        try {
            const maybePromise = api.getThreadList(limit, null, tags, (err, list) => {
                if (err) return reject(err);
                resolve(list || []);
            });
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then((list) => resolve(list || [])).catch(reject);
            }
        } catch (e) {
            reject(e);
        }
    });
}

// -------------------- أدوات مساعدة --------------------
async function isExempt(api, threadID, userID, record) {
    if (OWNER_ID && String(userID) === String(OWNER_ID)) return true;
    if (record?.whitelist?.includes(String(userID))) return true;
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        return (threadInfo.adminIDs || []).some((a) => String(a.id) === String(userID));
    } catch (e) {
        return false;
    }
}

async function safeName(api, userID) {
    try {
        const info = await api.getUserInfo(userID);
        return info?.[userID]?.name || String(userID);
    } catch (e) {
        return String(userID);
    }
}

// يستخرج uid من منشن، أو من رد على رسالة، أو من args مباشرة
function extractTargetID(event, args, argIndex) {
    if (event.mentions && Object.keys(event.mentions).length > 0) {
        return Object.keys(event.mentions)[0];
    }
    if (event.messageReply?.senderID) {
        return String(event.messageReply.senderID);
    }
    if (args[argIndex]) return args[argIndex];
    return null;
}

// -------------------- تنفيذ العقوبة (تحذير ثم طرد تلقائي) --------------------
// يُستخدم من هذا الملف (moderateMessage) ومن script/events/events.js
async function punishMember({ api, threadID, userID, key }) {
    if (OWNER_ID && String(userID) === String(OWNER_ID)) return;

    const record = await protectionData.getOrCreate(threadID);
    if (record?.whitelist?.includes(String(userID))) return;

    const name = await safeName(api, userID);
    const label = LABELS[key] || key;
    const violationText = VIOLATION_MESSAGES[key] || `⚠️ تم رصد مخالفة: ${label}`;

    await protectionData.addLog(threadID, `${label} — بواسطة ${userID}`);
    const count = await protectionData.addWarn(threadID, userID);
    if (count === null) return;

    if (count >= WARN_THRESHOLD) {
        try {
            await api.removeUserFromGroup(userID, threadID);
            await api.sendMessage(
                `${violationText}\n\n❌ تم إخراج ${name} من المجموعة تلقائيًا بعد بلوغ الحد الأقصى للتحذيرات (${count}/${WARN_THRESHOLD}).`,
                threadID
            );
            await protectionData.resetWarn(threadID, userID);
        } catch (e) {
            await api.sendMessage(
                `${violationText}\n\n⚠️ ${name} بلغ الحد الأقصى للتحذيرات، لكن تعذّر إخراجه تلقائيًا (تأكد أن البوت أدمن في المجموعة).`,
                threadID
            );
        }
    } else {
        await api.sendMessage(`${violationText}\n\n⚠️ تحذير رقم ${count}/${WARN_THRESHOLD} لـ ${name}.`, threadID);
    }
}
module.exports.punishMember = punishMember;

// -------------------- الأمر الرئيسي --------------------
module.exports.ZOTERun = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;

    let threadInfo = {};
    try {
        threadInfo = await api.getThreadInfo(threadID);
    } catch (e) {}

    const record = await protectionData.getOrCreate(threadID, threadInfo);
    if (!record) return api.sendMessage('❌ تعذّر الوصول لقاعدة البيانات حاليًا.', threadID, messageID);

    const enabled = record.enabled;
    const sub = (args[0] || '').trim();

    // -------- القائمة الرئيسية --------
    if (!sub) {
        const menu = Object.entries(LIST)
            .map(([num, key]) => `${light(enabled[key])} ${num}- ${LABELS[key]}`)
            .join('\n');

        return api.sendMessage(
            `『 نظام الحماية 』\n\n${menu}\n\n` +
            '✦ أوامر إضافية:\n' +
            'حماية سماح [منشن/رد/uid]\n' +
            'حماية منع [منشن/رد/uid]\n' +
            'حماية قائمة — عرض المسموح لهم\n' +
            'حماية سجل — آخر الأحداث\n' +
            'حماية مسح — مسح السجل\n' +
            'حماية تحديث — تحديث بيانات (اسم/صورة/لون/رمز) كل المجموعات [للمالك فقط]\n' +
            'حماية تحذيرات [uid] — عدد تحذيرات عضو\n' +
            'حماية فك [uid] — إلغاء تحذيرات عضو\n\n' +
            '✦ مثال تفعيل عدة أنواع دفعة واحدة:\n' +
            'حماية 1 3 8',
            threadID,
            messageID
        );
    }

    // -------- سجل الأحداث --------
    if (sub === 'سجل') {
        const logs = record.logs || [];
        if (!logs.length) return api.sendMessage('📭 لا يوجد أي سجل بعد.', threadID, messageID);
        const text = logs
            .slice(-15)
            .map((l, i) => `${i + 1}- ${l.text}\n   🕒 ${new Date(l.time).toLocaleString('ar-EG')}`)
            .join('\n');
        return api.sendMessage(`🗂️ آخر ${Math.min(15, logs.length)} حدث:\n\n${text}`, threadID, messageID);
    }

    if (sub === 'مسح') {
        await protectionData.clearLogs(threadID);
        return api.sendMessage('✅ تم مسح السجل.', threadID, messageID);
    }

    // -------- تحديث بيانات كل المجموعات (خاص بالمالك) --------
    if (sub === 'تحديث') {
        if (senderID !== OWNER_ID) {
            return api.sendMessage('❌ هذا الأمر (تحديث كل المجموعات) مخصص لمالك البوت فقط.', threadID, messageID);
        }

        await api.sendMessage(
            '⏳ جاري تحديث بيانات كل المجموعات (الاسم، الصورة، اللون، الرمز التعبيري)...\nقد يستغرق هذا بعض الوقت حسب عدد المجموعات.',
            threadID,
            messageID
        );

        let groupThreads = [];
        try {
            const list = await getThreadListSafe(api, 100, ['INBOX']);
            groupThreads = (list || []).filter((t) => t.isGroup || t.threadType === 2);
        } catch (e) {
            console.error('[حماية] خطأ في جلب قائمة المجموعات للتحديث:', e.message);
            return api.sendMessage('❌ تعذّر جلب قائمة المجموعات حاليًا.', threadID, messageID);
        }

        let updated = 0;
        let failed = 0;
        for (const g of groupThreads) {
            try {
                const info = await api.getThreadInfo(g.threadID);
                const rec = await protectionData.getOrCreate(g.threadID, info);
                if (rec) {
                    rec.oldName = info.threadName || rec.oldName;
                    rec.oldEmoji = info.emoji || rec.oldEmoji;
                    rec.oldColor = info.threadTheme?.id ?? rec.oldColor;
                    rec.oldImage = info.imageSrc || rec.oldImage;
                    rec.knownAdmins = (info.adminIDs || []).map((a) => a.id);
                    await protectionData.save(rec);
                }
                updated++;
            } catch (e) {
                failed++;
            }
            // تأخير بسيط بين كل مجموعة والتالية لتفادي إرهاق حساب فيسبوك بطلبات متتالية
            await new Promise((r) => setTimeout(r, 700));
        }

        return api.sendMessage(
            `✅ تم تحديث بيانات ${updated} مجموعة.` +
            (failed ? `\n⚠️ تعذّر تحديث ${failed} مجموعة (تأكد أن البوت مازال عضوًا فيها).` : ''),
            threadID,
            messageID
        );
    }

    // -------- التحذيرات --------
    if (sub === 'تحذيرات') {
        const targetID = extractTargetID(event, args, 1);
        if (!targetID) return api.sendMessage('❌ منشن العضو، أو رد على رسالته، أو اكتب الـ uid.', threadID, messageID);
        const count = record.warns.get(String(targetID)) || 0;
        const name = await safeName(api, targetID);
        return api.sendMessage(`⚠️ تحذيرات ${name}: ${count}/${WARN_THRESHOLD}`, threadID, messageID);
    }

    if (sub === 'فك') {
        const targetID = extractTargetID(event, args, 1);
        if (!targetID) return api.sendMessage('❌ منشن العضو، أو رد على رسالته، أو اكتب الـ uid.', threadID, messageID);
        await protectionData.resetWarn(threadID, targetID);
        const name = await safeName(api, targetID);
        return api.sendMessage(`✅ تم إلغاء تحذيرات ${name}.`, threadID, messageID);
    }

    // -------- القائمة البيضاء --------
    if (sub === 'سماح' || sub === 'منع') {
        const targetID = extractTargetID(event, args, 1);
        if (!targetID) return api.sendMessage('❌ منشن العضو، أو رد على رسالته، أو اكتب الـ uid.', threadID, messageID);

        if (sub === 'سماح') {
            if (!record.whitelist.includes(String(targetID))) record.whitelist.push(String(targetID));
        } else {
            record.whitelist = record.whitelist.filter((id) => id !== String(targetID));
        }
        await protectionData.save(record);
        const name = await safeName(api, targetID);
        return api.sendMessage(
            sub === 'سماح' ? `✅ تم السماح لـ ${name} بتجاوز الحماية.` : `✅ تم إلغاء السماح لـ ${name}.`,
            threadID,
            messageID
        );
    }

    if (sub === 'قائمة') {
        if (!record.whitelist.length) return api.sendMessage('📋 قائمة المسموح لهم فارغة حاليًا.', threadID, messageID);
        const lines = await Promise.all(
            record.whitelist.map(async (id, i) => `${i + 1}- ${await safeName(api, id)}\n   🆔 ${id}`)
        );
        return api.sendMessage(
            `📋 قائمة المسموح لهم (${lines.length}):\n\n${lines.join('\n\n')}`,
            threadID,
            messageID
        );
    }

    // -------- تفعيل/إيقاف بالأرقام (يقبل عدة أرقام دفعة واحدة) --------
    const nums = args.map((a) => parseInt(a, 10)).filter((n) => LIST[n]);
    if (!nums.length) {
        return api.sendMessage('❌ استخدم أرقامًا صحيحة من القائمة، مثال: حماية 1 3 8\nاكتب "حماية" وحدها لعرض القائمة الكاملة.', threadID, messageID);
    }

    const changes = [];
    for (const num of nums) {
        const key = LIST[num];
        enabled[key] = !enabled[key];
        changes.push(`${light(enabled[key])} ${LABELS[key]}`);
    }
    record.markModified('enabled');
    await protectionData.save(record);

    return api.sendMessage(`✅ تم تحديث الحماية:\n\n${changes.join('\n')}`, threadID, messageID);
};

// ============================================================
//  محرك مراقبة الرسائل (يُستدعى من messageHandler.js لكل رسالة عادية)
// ============================================================

const recordCache = new Map();
async function getCachedRecord(threadID) {
    const cached = recordCache.get(threadID);
    if (cached && cached.expiresAt > Date.now()) return cached.record;
    const record = await protectionData.getOrCreate(threadID);
    if (record) recordCache.set(threadID, { record, expiresAt: Date.now() + 15000 });
    return record;
}

const spamTracker = new Map();
function isSpamming(threadID, senderID) {
    const key = `${threadID}:${senderID}`;
    const now = Date.now();
    const list = (spamTracker.get(key) || []).filter((t) => now - t < 8000);
    list.push(now);
    spamTracker.set(key, list);
    return list.length >= 5;
}

const LINK_REGEX = /https?:\/\/|www\.|\.com\b|\.net\b|\.org\b|t\.me\/|bit\.ly\//i;

// ═══════════════════════════════════════════
//   حد أقصى مشترك لطلبات Gemini بالدقيقة (مشترك مع
//   احترام.js عبر utils/geminiLimiter.js لتفادي 429)
// ═══════════════════════════════════════════
const { canCallGeminiNow } = require('../../utils/geminiLimiter.js');

// ═══════════════════════════════════════════
//   فلتر محلي سريع (بدون أي طلب شبكة): يتجاهل
//   الرسائل القصيرة/العادية التي لا تحتاج فحص AI،
//   فيقلل عدد الطلبات الفعلية لـ Gemini بشكل كبير.
// ═══════════════════════════════════════════
const OBVIOUS_CLEAN_REGEX = /^[\p{L}\p{N}\s؟?!.,،؛:_\-()"'@#٪%+]{1,3}$|^(ok|okay|تمام|حسنا|حسناً|شكرا|شكراً|مرحبا|هلا|سلام|نعم|لا|👍|🙏|❤️|😂|😊)$/iu;

async function checkOffensiveWithGemini(text) {
    if (!config.GEMINI_KEY || config.GEMINI_KEY.includes('ضع_مفتاح')) return false;
    if (OBVIOUS_CLEAN_REGEX.test(text.trim())) return false;

    if (!canCallGeminiNow()) {
        // تجاوزنا الحد المسموح به بالدقيقة، نتخطى الفحص لهذه الرسالة
        // بدل تكرار خطأ 429 على فيسبوك/جوجل.
        return false;
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${config.GEMINI_KEY}`;
        const prompt =
            'صنّف النص التالي فقط: هل يحتوي على سب أو إهانة أو تحرش أو خطاب كراهية؟ ' +
            'أجب بكلمة واحدة فقط بدون أي شرح: "نعم" أو "لا".\n' +
            `النص: """${text}"""`;
        const res = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] }, { timeout: 8000 });
        const answer = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return /نعم/.test(answer.trim());
    } catch (e) {
        if (e.response?.status === 429) {
            console.warn('[حماية] ⚠️ تجاوزنا حد طلبات Gemini المجانية بالدقيقة/اليوم، تم تجاهل هذا الفحص مؤقتاً.');
        } else {
            console.error('[حماية] خطأ في فحص Gemini (تحقق من اسم الموديل/الرابط الحالي في وثائق Gemini):', e.message);
        }
        return false;
    }
}

module.exports.moderateMessage = async function ({ api, event }) {
    try {
        if (event.type !== 'message' && event.type !== 'message_reply') return;
        const { threadID, senderID, body } = event;
        if (!threadID || !senderID || !body) return;

        const record = await getCachedRecord(threadID);
        if (!record) return;

        const anyEnabled = record.enabled.link || record.enabled.spam || record.enabled.mention || record.enabled.offensive;
        if (!anyEnabled) return;

        const exempt = await isExempt(api, threadID, senderID, record);
        if (exempt) return;

        if (record.enabled.link && LINK_REGEX.test(body)) {
            return punishMember({ api, threadID, userID: senderID, key: 'link' });
        }
        if (record.enabled.spam && isSpamming(threadID, senderID)) {
            return punishMember({ api, threadID, userID: senderID, key: 'spam' });
        }
        if (record.enabled.mention && event.mentions && Object.keys(event.mentions).length >= 5) {
            return punishMember({ api, threadID, userID: senderID, key: 'mention' });
        }
        if (record.enabled.offensive && body.trim().length > 1) {
            const offensive = await checkOffensiveWithGemini(body);
            if (offensive) return punishMember({ api, threadID, userID: senderID, key: 'offensive' });
        }
    } catch (e) {
        console.error('[حماية] خطأ في moderateMessage:', e.message);
    }
};
