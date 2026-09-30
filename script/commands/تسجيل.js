// ============================================================
//  أمر: تسجيل
//  نظام كشف الرسائل المحذوفة (Deletion Detector) — وليس أرشفة دائمة.
//
//  المبدأ:
//   - عند التفعيل، يُعلن البوت ذلك في المجموعة صراحة (شفافية).
//   - تُخزَّن الرسائل مؤقتًا (48 ساعة) فقط لغرض كشف الحذف السريع،
//     ثم تُمسح تلقائيًا من قاعدة البيانات (TTL).
//   - لا يوجد أمر يسحب "كل ما كتبه" شخص ما — فقط آخر رسالة محذوفة.
//
//  الاستخدام:
//   .تسجيل تشغيل      -> تفعيل الكشف في المجموعة (أدمن/مالك فقط)
//   .تسجيل ايقاف       -> إيقافه
//   .تسجيل تشغيل الكل -> تفعيل الكشف في كل مجموعات البوت دفعة واحدة (مالك البوت فقط)
//   .تسجيل ايقاف الكل  -> إيقافه في كل المجموعات دفعة واحدة (مالك البوت فقط)
//   (رد على شخص) .تسجيل اخر_حذف  -> عرض آخر رسالة محذوفة له خلال آخر 48 ساعة
//
//  ميزات إضافية (مالك البوت فقط — مراقبة عن بعد دون الدخول للمجموعة):
//   .تسجيل رسائل <ID المجموعة> [العدد]
//        -> يعرض آخر الرسائل المخزَّنة في تلك المجموعة (المرسل + الوقت + النص)
//           يعمل فقط إن كانت المجموعة قد فعّلت "تسجيل" مسبقًا (لأن التخزين
//           المؤقت لا يحدث أصلًا إلا في المجموعات المفعّلة).
//   .تسجيل المجموعات
//        -> يعرض كل المجموعات التي البوت عضو فيها، مع تمييز كل مجموعة:
//           مفعّلة ✅ أو غير مفعّلة ❌ لنظام التسجيل.
//   .تسجيل بث تشغيل  (تُكتب داخل المجموعة التي تريد استقبال البث فيها)
//        -> من الآن فصاعدًا، كل رسالة جديدة تُكتب في أي مجموعة مفعّل فيها
//           "تسجيل" سترسَل فورًا إلى هذه المجموعة (اسم المرسل + اسم مجموعته + النص).
//   .تسجيل بث ايقاف
//        -> إيقاف البث الفوري بالكامل.
// ============================================================

const deletionLog = require('../../database/deletionLog.js');

const OWNER_ID = '61570903885125';

module.exports.config = {
    title: 'تسجيل',
    release: '1.1.0',
    clearance: 1, // أدمن المجموعة أو مالك البوت فقط (للأوامر الأساسية)
    author: 'ZOTE Tracks',
    summary: 'تفعيل/إيقاف كشف الرسائل المحذوفة، عرض آخر رسالة محذوفة، ومراقبة رسائل/مجموعات عن بعد (للمالك)',
    section: 'الإشراف',
    syntax: 'تسجيل [تشغيل [الكل] | ايقاف [الكل] | اخر_حذف | رسائل | المجموعات | بث]',
    delay: 2,
};

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

// يبني سطر عرض رسالة واحدة: المرسل + الوقت + النص/المرفق (+ علامة حذف إن حُذفت)
function formatMessageLine(doc) {
    const when = doc.createdAt ? new Date(doc.createdAt).toLocaleString('ar-EG') : '';
    let content;
    if (doc.body) {
        content = `«${doc.body}»`;
    } else if (doc.attachments?.length) {
        content = `[${doc.attachments.length} مرفق/صورة]`;
    } else {
        content = '(بدون نص)';
    }
    const deletedTag = doc.deleted ? ' 🗑️ (محذوفة)' : '';
    return `👤 ${doc.senderName} — 🕒 ${when}${deletedTag}\n${content}`;
}

function formatDeleted(doc) {
    const when = doc.deletedAt ? new Date(doc.deletedAt).toLocaleString('ar-EG') : '';
    let content;
    if (doc.body) {
        content = `«${doc.body}»`;
    } else if (doc.attachments?.length) {
        content = `[${doc.attachments.length} مرفق/صورة]`;
    } else {
        content = '(رسالة بدون نص)';
    }
    return `🗑️ آخر رسالة محذوفة من ${doc.senderName}:\n${content}\n🕒 وقت الحذف: ${when}`;
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

// يجلب قائمة المجموعات التي البوت عضو فعلي فيها الآن (وليس فقط ما يظهر في getThreadList،
// لأن الأخيرة قد تُعيد مجموعات قديمة تم طرد البوت منها). يتحقق من كل مجموعة عبر participantIDs.
async function getRealGroupList(api) {
    let list;
    try {
        list = await getThreadListSafe(api, 100, ['INBOX']);
    } catch (e) {
        console.error('[تسجيل] خطأ في جلب قائمة المجموعات:', e.message);
        return null; // فشل جلب القائمة نفسها
    }

    const candidates = (list || []).filter((t) => t.isGroup || t.threadType === 2);
    const botID = api.getCurrentUserID();
    const groups = [];

    for (const t of candidates) {
        try {
            const info = await api.getThreadInfo(t.threadID);
            const stillMember = Array.isArray(info?.participantIDs) && info.participantIDs.includes(botID);
            if (stillMember) {
                groups.push({
                    threadID: t.threadID,
                    name: info.threadName || info.name || t.name || t.threadName || 'مجموعة بدون اسم',
                });
            }
            // إن لم يكن البوت ضمن الأعضاء، فقد طُرد منها ولا نعتبرها ضمن القائمة
        } catch (e) {
            // فشل جلب المعلومات غالبًا يعني أن البوت لم يعد يملك وصولًا لهذه المجموعة (طُرد منها)
        }
    }

    return groups;
}

module.exports.ZOTERun = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const sub = (args[0] || '').trim();

    if (sub === 'تشغيل') {
        // .تسجيل تشغيل الكل -> تفعيل النظام في كل مجموعات البوت دفعة واحدة (مالك البوت فقط)
        if ((args[1] || '').trim() === 'الكل') {
            if (event.senderID !== OWNER_ID) {
                return api.sendMessage('❌ التفعيل الجماعي مخصّص لمالك البوت فقط.', threadID, messageID);
            }

            const groups = await getRealGroupList(api);
            if (groups === null) {
                return api.sendMessage('❌ تعذّر جلب قائمة المجموعات حاليًا.', threadID, messageID);
            }
            if (!groups.length) {
                return api.sendMessage('📭 البوت غير موجود فعليًا في أي مجموعة حاليًا.', threadID, messageID);
            }

            const announcement =
                '⚠️ تنبيه للجميع: تم تفعيل نظام كشف الرسائل المحذوفة في هذه المجموعة.\n' +
                'سيتم حفظ الرسائل مؤقتًا (48 ساعة كحد أقصى) لغرض كشف الحذف فقط، ثم تُمسح تلقائيًا ونهائيًا. ' +
                'قد تُستخدم هذه البيانات أيضًا لإرسال نسخة فورية من الرسائل الجديدة إلى مالك البوت لأغراض الإشراف. ' +
                'هذا ليس أرشيفًا دائمًا لأي محادثة.';

            let success = 0;
            for (const g of groups) {
                const ok = await deletionLog.setEnabled(g.threadID, true);
                if (ok) {
                    success++;
                    api.sendMessage(announcement, g.threadID).catch(() => {});
                }
            }
            return api.sendMessage(`✅ تم تفعيل نظام "تسجيل" في ${success} من أصل ${groups.length} مجموعة.`, threadID, messageID);
        }

        const ok = await deletionLog.setEnabled(threadID, true);
        if (!ok) return api.sendMessage('❌ حدث خطأ أثناء التفعيل.', threadID, messageID);
        return api.sendMessage(
            '⚠️ تنبيه للجميع: تم تفعيل نظام كشف الرسائل المحذوفة في هذه المجموعة.\n' +
            'سيتم حفظ الرسائل مؤقتًا (48 ساعة كحد أقصى) لغرض كشف الحذف فقط، ثم تُمسح تلقائيًا ونهائيًا. ' +
            'قد تُستخدم هذه البيانات أيضًا لإرسال نسخة فورية من الرسائل الجديدة إلى مالك البوت لأغراض الإشراف. ' +
            'هذا ليس أرشيفًا دائمًا لأي محادثة.',
            threadID
        );
    }

    if (sub === 'ايقاف') {
        // .تسجيل ايقاف الكل -> إيقاف النظام في كل مجموعات البوت دفعة واحدة (مالك البوت فقط)
        if ((args[1] || '').trim() === 'الكل') {
            if (event.senderID !== OWNER_ID) {
                return api.sendMessage('❌ الإيقاف الجماعي مخصّص لمالك البوت فقط.', threadID, messageID);
            }

            const groups = await getRealGroupList(api);
            if (groups === null) {
                return api.sendMessage('❌ تعذّر جلب قائمة المجموعات حاليًا.', threadID, messageID);
            }
            if (!groups.length) {
                return api.sendMessage('📭 البوت غير موجود فعليًا في أي مجموعة حاليًا.', threadID, messageID);
            }

            let success = 0;
            for (const g of groups) {
                const ok = await deletionLog.setEnabled(g.threadID, false);
                if (ok) {
                    success++;
                    api.sendMessage('✅ تم إيقاف نظام كشف الرسائل المحذوفة في هذه المجموعة.', g.threadID).catch(() => {});
                }
            }
            return api.sendMessage(`✅ تم إيقاف نظام "تسجيل" في ${success} من أصل ${groups.length} مجموعة.`, threadID, messageID);
        }

        const ok = await deletionLog.setEnabled(threadID, false);
        if (!ok) return api.sendMessage('❌ حدث خطأ أثناء الإيقاف.', threadID, messageID);
        return api.sendMessage('✅ تم إيقاف نظام كشف الرسائل المحذوفة في هذه المجموعة.', threadID);
    }

    if (sub === 'اخر_حذف') {
        if (event.type !== 'message_reply' || !event.messageReply?.senderID) {
            return api.sendMessage(
                'ℹ️ استخدم هذا الأمر بالرد على رسالة الشخص الذي تريد معرفة آخر رسالة محذوفة له.\n' +
                'مثال: رد على إحدى رسائله واكتب: .تسجيل اخر_حذف',
                threadID,
                messageID
            );
        }

        const enabled = await deletionLog.isEnabled(threadID);
        if (!enabled) {
            return api.sendMessage('❌ نظام كشف الحذف غير مفعّل في هذه المجموعة حاليًا.', threadID, messageID);
        }

        const targetID = event.messageReply.senderID;
        const doc = await deletionLog.getLastDeletedBySender(threadID, targetID);
        if (!doc) {
            return api.sendMessage('ℹ️ لا توجد أي رسالة محذوفة مسجّلة لهذا الشخص خلال آخر 48 ساعة.', threadID, messageID);
        }
        return api.sendMessage(formatDeleted(doc), threadID, messageID);
    }

    // ---------------- رسائل: قائمة تفاعلية لاختيار مجموعة/مجموعات وعرض رسائلها ----------------
    if (sub === 'رسائل') {
        if (event.senderID !== OWNER_ID) {
            return api.sendMessage('❌ هذه الميزة مخصّصة لمالك البوت فقط.', threadID, messageID);
        }

        const secondArg = (args[1] || '').trim();

        // .تسجيل رسائل ايقاف  -> إلغاء أي قائمة معروضة حاليًا (تُكتب مباشرة، وليست ردًا)
        if (secondArg === 'ايقاف') {
            const idx = Zote.client.ZOTEReply.findIndex(
                (h) => h.name === this.config.title && h.author === OWNER_ID && h.kind === 'رسائل_قائمة'
            );
            if (idx === -1) {
                return api.sendMessage('ℹ️ لا توجد قائمة معروضة حاليًا لإلغائها.', threadID, messageID);
            }
            const pending = Zote.client.ZOTEReply[idx];
            Zote.client.ZOTEReply.splice(idx, 1);
            try {
                await api.unsendMessage(pending.messageID);
            } catch (e) {
                console.error('[تسجيل] تعذّر حذف رسالة القائمة عند الإلغاء:', e.message);
            }
            return api.sendMessage('✅ تم إيقاف عرض قائمة المجموعات وحذفها.', threadID, messageID);
        }

        // .تسجيل رسائل <ID المجموعة> [العدد]  -> وصول مباشر بدون قائمة (كما كان سابقًا)
        if (secondArg) {
            const targetThreadID = secondArg;
            const limit = parseInt(args[2], 10) || 20;

            const enabled = await deletionLog.isEnabled(targetThreadID);
            if (!enabled) {
                return api.sendMessage(
                    '❌ نظام "تسجيل" غير مفعّل في هذه المجموعة، لذلك لا توجد رسائل مخزَّنة لعرضها.',
                    threadID,
                    messageID
                );
            }

            const docs = await deletionLog.getRecentMessages(targetThreadID, limit);
            if (!docs || docs.length === 0) {
                return api.sendMessage('📭 لا توجد رسائل مخزَّنة حاليًا لهذه المجموعة.', threadID, messageID);
            }

            const ordered = docs.slice().reverse();
            let name = targetThreadID;
            try {
                const info = await api.getThreadInfo(targetThreadID);
                if (info?.threadName || info?.name) name = info.threadName || info.name;
            } catch (e) { /* نتجاهل */ }

            let body = `📋 آخر ${ordered.length} رسالة في مجموعة "${name}":\n\n`;
            body += ordered.map(formatMessageLine).join('\n\n');
            return api.sendMessage(body, threadID, messageID);
        }

        // .تسجيل رسائل  (بدون أي إضافة) -> عرض قائمة بكل المجموعات المفعّلة للاختيار منها بالرد
        const enabledIDs = await deletionLog.getEnabledThreadIDs();
        if (!enabledIDs.length) {
            return api.sendMessage('📭 لا توجد أي مجموعة مفعّل فيها نظام "تسجيل" حاليًا.', threadID, messageID);
        }

        const botIDForList = api.getCurrentUserID();
        const items = [];
        for (const tid of enabledIDs) {
            try {
                const info = await api.getThreadInfo(tid);
                const stillMember = Array.isArray(info?.participantIDs) && info.participantIDs.includes(botIDForList);
                if (!stillMember) continue; // البوت طُرد من هذه المجموعة، لا نعرضها
                const name = info.threadName || info.name || tid;
                items.push({ threadID: tid, name });
            } catch (e) {
                // تعذّر الوصول للمجموعة (غالبًا لأن البوت طُرد منها) — تُستبعد من القائمة
            }
        }

        if (!items.length) {
            return api.sendMessage('📭 لا توجد أي مجموعة (البوت عضو فيها فعليًا) مفعّل فيها نظام "تسجيل" حاليًا.', threadID, messageID);
        }
        items.forEach((it, i) => { it.index = i + 1; });

        let body = `📋 المجموعات المفعّل فيها "تسجيل" (${items.length}):\n\n`;
        items.forEach((it) => { body += `${it.index}) ${it.name}\n`; });
        body += '\nللرد: اكتب رقم المجموعة أو عدة أرقام مثل "1/2/4" أو نطاق "2-4" أو "الكل"، كرد على هذه الرسالة.';
        body += '\nأو اكتب ".تسجيل رسائل ايقاف" لإلغاء هذه القائمة دون اختيار.';

        api.sendMessage(body, threadID, (err, info) => {
            if (err) return console.error('[تسجيل] خطأ في إرسال قائمة المجموعات:', err.message);
            Zote.client.ZOTEReply.push({
                name: this.config.title,
                kind: 'رسائل_قائمة',
                messageID: info.messageID,
                author: senderID,
                items,
            });
        }, messageID);
        return;
    }

    // ---------------- المجموعات: عرض كل المجموعات وحالة التفعيل فيها ----------------
    if (sub === 'المجموعات' || sub === 'مجموعات') {
        if (event.senderID !== OWNER_ID) {
            return api.sendMessage('❌ هذه الميزة مخصّصة لمالك البوت فقط.', threadID, messageID);
        }

        const groups = await getRealGroupList(api);
        if (groups === null) {
            return api.sendMessage('❌ تعذّر جلب قائمة المجموعات حاليًا.', threadID, messageID);
        }
        if (groups.length === 0) {
            return api.sendMessage('📭 البوت غير موجود فعليًا في أي مجموعة حاليًا.', threadID, messageID);
        }

        const enabledIDs = new Set(await deletionLog.getEnabledThreadIDs());

        const enabledGroups = [];
        const disabledGroups = [];
        groups.forEach((t) => {
            const line = `${t.name} — ${t.threadID}`;
            if (enabledIDs.has(String(t.threadID))) enabledGroups.push(line);
            else disabledGroups.push(line);
        });

        let body = `📊 مجموعات البوت (${groups.length}):\n\n`;
        body += `✅ مفعّلة فيها "تسجيل" (${enabledGroups.length}):\n`;
        body += (enabledGroups.length ? enabledGroups.map((l, i) => `${i + 1}) ${l}`).join('\n') : '(لا شيء)') + '\n\n';
        body += `❌ غير مفعّلة (${disabledGroups.length}):\n`;
        body += (disabledGroups.length ? disabledGroups.map((l, i) => `${i + 1}) ${l}`).join('\n') : '(لا شيء)');

        return api.sendMessage(body, threadID, messageID);
    }

    // ---------------- بث: قائمة تفاعلية لاختيار المجموعات الوجهة للبث الفوري ----------------
    if (sub === 'بث') {
        if (event.senderID !== OWNER_ID) {
            return api.sendMessage('❌ هذه الميزة مخصّصة لمالك البوت فقط.', threadID, messageID);
        }

        const secondArg = (args[1] || '').trim();

        // .تسجيل بث ايقاف  -> إيقاف البث بالكامل (تُكتب مباشرة)
        if (secondArg === 'ايقاف') {
            const ok = await deletionLog.disableLiveForward();
            if (!ok) return api.sendMessage('❌ حدث خطأ أثناء إيقاف البث الفوري.', threadID, messageID);
            return api.sendMessage('✅ تم إيقاف البث الفوري بالكامل.', threadID, messageID);
        }

        // .تسجيل بث  (بدون أي إضافة) -> عرض قائمة بالمجموعات المفعّلة للاختيار
        const enabledIDs = await deletionLog.getEnabledThreadIDs();
        if (!enabledIDs.length) {
            return api.sendMessage('📭 لا توجد أي مجموعة مفعّل فيها نظام "تسجيل" حاليًا.', threadID, messageID);
        }

        const botID = api.getCurrentUserID();
        const items = [];
        for (const tid of enabledIDs) {
            try {
                const info = await api.getThreadInfo(tid);
                const stillMember = Array.isArray(info?.participantIDs) && info.participantIDs.includes(botID);
                if (!stillMember) continue; // البوت طُرد من هذه المجموعة، لا نعرضها
                const name = info.threadName || info.name || tid;
                items.push({ threadID: tid, name });
            } catch (e) {
                // تعذّر الوصول للمجموعة (غالبًا لأن البوت طُرد منها) — تُستبعد من القائمة
            }
        }

        if (!items.length) {
            return api.sendMessage('📭 لا توجد أي مجموعة (البوت عضو فيها فعليًا) مفعّل فيها نظام "تسجيل" حاليًا.', threadID, messageID);
        }
        items.forEach((it, i) => { it.index = i + 1; });

        let body = `📡 المجموعات المفعّل فيها "تسجيل" — اختر الوجهات (${items.length}):\n\n`;
        items.forEach((it) => { body += `${it.index}) ${it.name}\n`; });
        body += '\nللرد: اكتب رقم المجموعة أو عدة أرقام مثل "1/2/4" أو نطاق "2-4" أو "الكل".\n';
        body += 'سيتم توجيه كل رسالة جديدة لهذه المجموعات (مع الصور والفيديوهات).';
        body += '\nأو اكتب ".تسجيل بث ايقاف" لإلغاء البث بالكامل.';

        api.sendMessage(body, threadID, (err, info) => {
            if (err) return console.error('[تسجيل] خطأ في إرسال قائمة بث:', err.message);
            Zote.client.ZOTEReply.push({
                name: this.config.title,
                kind: 'بث_قائمة',
                messageID: info.messageID,
                author: senderID,
                items,
            });
        }, messageID);
        return;
    }

    return api.sendMessage(
        '📌 استخدام أمر تسجيل:\n' +
        '.تسجيل تشغيل — تفعيل كشف الرسائل المحذوفة\n' +
        '.تسجيل ايقاف — إيقافه\n' +
        '.تسجيل تشغيل الكل / .تسجيل ايقاف الكل — تفعيل/إيقاف في كل مجموعات البوت دفعة واحدة (مالك البوت فقط)\n' +
        '(رد على شخص) .تسجيل اخر_حذف — عرض آخر رسالة محذوفة له\n' +
        '.تسجيل رسائل [ID المجموعة] [العدد] — عرض رسائل مجموعة (مالك البوت فقط)\n' +
        '.تسجيل المجموعات — عرض كل المجموعات وحالة التفعيل فيها (مالك البوت فقط)\n' +
        '.تسجيل بث — اختر المجموعات الوجهة بالرد على الرسالة بأرقام (مالك البوت فقط)\n' +
        '.تسجيل بث ايقاف — إيقاف البث الفوري',
        threadID,
        messageID
    );
};

// -------------------- معالجة الرد على قائمة "رسائل" بالأرقام --------------------
module.exports.ZOTEReply = async function ({ api, event, ZOTEReply }) {
    const { body, threadID, messageID, senderID } = event;

    if (ZOTEReply.kind === 'رسائل_قائمة' && ZOTEReply.author === senderID && senderID === OWNER_ID) {
        const text = (body || '').trim();
        const selection = parseSelection(text, ZOTEReply.items.length);

        if (selection.length === 0) {
            return api.sendMessage(
                '❌ لم أفهم التحديد. أمثلة: "1"، "1/2/4"، "2-4"، "الكل".\n' +
                'أو اكتب ".تسجيل رسائل ايقاف" لإلغاء القائمة.',
                threadID,
                messageID
            );
        }

        const targets = ZOTEReply.items.filter((it) => selection.includes(it.index));

        for (const target of targets) {
            try {
                const docs = await deletionLog.getRecentMessages(target.threadID, 20);
                if (!docs || docs.length === 0) {
                    await api.sendMessage(`📭 لا توجد رسائل مخزَّنة حاليًا لمجموعة "${target.name}".`, threadID, messageID);
                    continue;
                }
                const ordered = docs.slice().reverse();
                let msgBody = `📋 آخر ${ordered.length} رسالة في مجموعة "${target.name}":\n\n`;
                msgBody += ordered.map(formatMessageLine).join('\n\n');
                await api.sendMessage(msgBody, threadID, messageID);
            } catch (e) {
                console.error('[تسجيل] خطأ في عرض رسائل مجموعة:', e.message);
                await api.sendMessage(`⚠️ حدث خطأ أثناء جلب رسائل مجموعة "${target.name}".`, threadID, messageID);
            }
        }

        // حذف رسالة القائمة الأصلية بعد إتمام العرض
        try {
            await api.unsendMessage(ZOTEReply.messageID);
        } catch (e) {
            console.error('[تسجيل] تعذّر حذف رسالة القائمة:', e.message);
        }

        // إزالة الطلب المعلّق من الذاكرة بعد الاستخدام
        const idx = Zote.client.ZOTEReply.findIndex((h) => h.messageID === ZOTEReply.messageID);
        if (idx !== -1) Zote.client.ZOTEReply.splice(idx, 1);
        return;
    }

    // ------------------- معالجة الرد على قائمة "بث" بالأرقام -------------------
    if (ZOTEReply.kind === 'بث_قائمة' && ZOTEReply.author === senderID && senderID === OWNER_ID) {
        const text = (body || '').trim();
        const selection = parseSelection(text, ZOTEReply.items.length);

        if (selection.length === 0) {
            return api.sendMessage(
                '❌ لم أفهم التحديد. أمثلة: "1"، "1/2/4"، "2-4"، "الكل".\n' +
                'أو اكتب ".تسجيل بث ايقاف" لإيقاف البث.',
                threadID,
                messageID
            );
        }

        const targets = ZOTEReply.items.filter((it) => selection.includes(it.index));
        const targetIDs = targets.map((t) => t.threadID);

        const ok = await deletionLog.setLiveForwardTargets(targetIDs);
        if (!ok) {
            return api.sendMessage('❌ حدث خطأ أثناء تفعيل البث الفوري.', threadID, messageID);
        }

        const confirmMsg = `✅ تم تفعيل البث الفوري للمجموعات (${targets.length}):\n\n${targets.map((t) => `• ${t.name}`).join('\n')}\n\nكل رسالة جديدة ستصل هنا فورًا (مع الصور والفيديوهات).`;
        await api.sendMessage(confirmMsg, threadID, messageID);

        // حذف رسالة القائمة الأصلية
        try {
            await api.unsendMessage(ZOTEReply.messageID);
        } catch (e) {
            console.error('[تسجيل] تعذّر حذف رسالة قائمة البث:', e.message);
        }

        // إزالة الطلب المعلّق من الذاكرة
        const idx = Zote.client.ZOTEReply.findIndex((h) => h.messageID === ZOTEReply.messageID);
        if (idx !== -1) Zote.client.ZOTEReply.splice(idx, 1);
        return;
    }
};
