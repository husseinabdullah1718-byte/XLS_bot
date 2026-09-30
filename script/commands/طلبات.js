// ============================================================
//  أمر: طلبات   (خاص بمالك البوت فقط)
//  يعرض طلبات المراسلة (Message Requests) الخاصة بالمجموعات التي
//  تمت دعوة البوت إليها ولم يقبلها بعد، ويتيح قبول/رفض واحدة أو
//  أكثر بالرد على رسالة القائمة.
//
//  صيغ الرد المدعومة (بعد إرسال .طلبات):
//    قبول 1
//    قبول 1/2/4
//    قبول 2-4          (نطاق: يعني 2 و3 و4)
//    قبول الكل
//    رفض 1/3
//    رفض الكل
//
//  بعد تنفيذ الطلب، تُحذف رسالة القائمة الأصلية التي رد عليها المالك.
// ============================================================

const OWNER_ID = '61551379444881';

module.exports.config = {
    title: 'طلبات',
    release: '1.0.0',
    clearance: 2, // مالك البوت فقط (config.ADMINBOT)
    author: 'ZOTE Tracks',
    summary: 'عرض وإدارة طلبات مراسلة المجموعات المعلّقة (قبول/رفض)',
    section: 'إدارة البوت',
    syntax: 'طلبات',
    delay: 3,
};

// -------------------- أدوات مساعدة --------------------

// يغلّف getThreadList بشكل آمن يدعم الأنماط المختلفة لمكتبات fca
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

// يغلّف handleMessageRequest بشكل آمن
function handleRequestSafe(api, threadID, accept) {
    return new Promise((resolve, reject) => {
        try {
            const maybePromise = api.handleMessageRequest(threadID, accept, (err) => {
                if (err) return reject(err);
                resolve(true);
            });
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(() => resolve(true)).catch(reject);
            }
        } catch (e) {
            reject(e);
        }
    });
}

// يبني ملاحظة تنبيهية بسيطة (استرشادية فقط، ليست حكمًا قاطعًا)
function buildHint(thread) {
    const name = (thread.name || thread.threadName || '').trim();
    const snippet = (thread.snippet || thread.lastMessage || '').trim();
    const participantsCount =
        thread.participantIDs?.length ??
        thread.participants?.length ??
        thread.userInfo?.length ??
        null;

    const hints = [];
    if (!name && !snippet) hints.push('لا يوجد اسم أو رسالة ظاهرة');
    if (/https?:\/\/|bit\.ly|t\.me\//i.test(snippet)) hints.push('تحتوي رسالتها على رابط');
    if (participantsCount !== null && participantsCount <= 2) hints.push('عدد أعضاء قليل جدًا');

    if (hints.length === 0) return '✅ تبدو عادية';
    return `⚠️ يستحسن الانتباه: ${hints.join(' / ')}`;
}

// يحوّل نص التحديد ("1/2-4" أو "الكل") إلى مجموعة أرقام
function parseSelection(text, maxIndex) {
    const clean = text.trim();
    if (!clean) return [];
    if (clean === 'الكل' || clean === 'كل' || clean === 'all') {
        return Array.from({ length: maxIndex }, (_, i) => i + 1);
    }

    const tokens = clean.split(/[^\d-]+/).filter(Boolean);
    const result = new Set();
    for (const token of tokens) {
        const rangeMatch = token.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            let [a, b] = [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
            if (a > b) [a, b] = [b, a];
            for (let n = a; n <= b; n++) {
                if (n >= 1 && n <= maxIndex) result.add(n);
            }
        } else if (/^\d+$/.test(token)) {
            const n = parseInt(token, 10);
            if (n >= 1 && n <= maxIndex) result.add(n);
        }
    }
    return Array.from(result).sort((a, b) => a - b);
}

// -------------------- تنفيذ الأمر --------------------

module.exports.ZOTERun = async function ({ api, event }) {
    const { threadID, messageID, senderID } = event;

    if (senderID !== OWNER_ID) {
        return api.sendMessage('❌ هذا الأمر مخصص لمالك البوت فقط.', threadID, messageID);
    }

    // نجلب من الوسمين معًا: PENDING (طلبات عامة) وOTHER (طلبات مُصنّفة كغير مهمة/مشبوهة)
    // لأن فيسبوك يضع الطلبات "الاحتيالية أو غير المهمة" في تبويب منفصل (Filtered/Spam requests)
    // ولا يعيدها getThreadList عند طلب PENDING فقط.
    const TAGS_TO_FETCH = [
        { tag: 'PENDING', label: '📥 عام' },
        { tag: 'OTHER', label: '🗂️ غير مهم/مصفّى' },
    ];

    let combined = [];
    let anySucceeded = false;
    for (const { tag, label } of TAGS_TO_FETCH) {
        try {
            const partial = await getThreadListSafe(api, 50, [tag]);
            anySucceeded = true;
            (partial || []).forEach((t) => combined.push({ ...t, __category: label }));
        } catch (e) {
            console.error(`[طلبات] خطأ في جلب طلبات المراسلة (${tag}):`, e.message);
        }
    }

    if (!anySucceeded) {
        return api.sendMessage('❌ تعذّر جلب طلبات المراسلة حاليًا. تأكد أن مكتبة fca تدعم getThreadList.', threadID, messageID);
    }

    // إزالة التكرار في حال ظهر نفس الـ threadID في أكثر من وسم
    const seen = new Set();
    combined = combined.filter((t) => {
        if (seen.has(t.threadID)) return false;
        seen.add(t.threadID);
        return true;
    });

    const groupRequests = combined.filter((t) => t.isGroup || t.threadType === 2);

    if (groupRequests.length === 0) {
        return api.sendMessage('📭 لا توجد طلبات مراسلة معلّقة من مجموعات حاليًا (تم فحص تبويبي العام وغير المهم).', threadID, messageID);
    }

    const items = groupRequests.map((t, i) => ({
        index: i + 1,
        threadID: t.threadID,
        name: t.name || t.threadName || 'مجموعة بدون اسم',
    }));

    let body = `📨 طلبات مراسلة المجموعات المعلّقة (${items.length}):\n\n`;
    groupRequests.forEach((t, i) => {
        body += `${i + 1}) [${t.__category}] ${t.name || t.threadName || 'مجموعة بدون اسم'}\n${buildHint(t)}\n\n`;
    });
    body += 'للرد: اكتب "قبول 1/2" أو "رفض 3" أو "قبول الكل" أو "رفض الكل" كرد على هذه الرسالة.';

    api.sendMessage(body, threadID, (err, info) => {
        if (err) return console.error('[طلبات] خطأ في إرسال القائمة:', err.message);
        Zote.client.ZOTEReply.push({
            name: this.config.title,
            messageID: info.messageID,
            author: senderID,
            items,
        });
    }, messageID);
};

// -------------------- معالجة الرد (قبول/رفض) --------------------

module.exports.ZOTEReply = async function ({ api, event, ZOTEReply }) {
    const { body, threadID, messageID, senderID } = event;

    if (ZOTEReply.author !== senderID || senderID !== OWNER_ID) return;

    const text = (body || '').trim();
    const isAccept = text.startsWith('قبول');
    const isReject = text.startsWith('رفض');
    if (!isAccept && !isReject) return; // ليست ردًا متعلقًا بهذا الأمر

    const rest = text.replace(/^قبول|^رفض/, '').trim();
    const selection = parseSelection(rest, ZOTEReply.items.length);

    if (selection.length === 0) {
        return api.sendMessage(
            '❌ لم أفهم التحديد. أمثلة: "قبول 1/2"، "رفض 3"، "قبول الكل".',
            threadID,
            messageID
        );
    }

    const targets = ZOTEReply.items.filter((it) => selection.includes(it.index));
    const succeeded = [];
    const failed = [];

    for (const target of targets) {
        try {
            await handleRequestSafe(api, target.threadID, isAccept);
            succeeded.push(target);
        } catch (e) {
            failed.push({ ...target, error: e.message });
        }
    }

    let resultMsg = `${isAccept ? '✅ تم القبول' : '🚫 تم الرفض'} لـ ${succeeded.length} مجموعة:\n`;
    resultMsg += succeeded.map((t) => `- ${t.name}`).join('\n') || '(لا شيء)';
    if (failed.length > 0) {
        resultMsg += `\n\n⚠️ فشل في ${failed.length}:\n` + failed.map((t) => `- ${t.name} (${t.error})`).join('\n');
    }

    await api.sendMessage(resultMsg, threadID, messageID);

    // حذف رسالة القائمة الأصلية بعد إتمام العملية
    try {
        await api.unsendMessage(ZOTEReply.messageID);
    } catch (e) {
        console.error('[طلبات] تعذّر حذف رسالة القائمة:', e.message);
    }

    // إزالة الطلب المعلّق من الذاكرة بعد الاستخدام
    const idx = Zote.client.ZOTEReply.findIndex((h) => h.messageID === ZOTEReply.messageID);
    if (idx !== -1) Zote.client.ZOTEReply.splice(idx, 1);
};
