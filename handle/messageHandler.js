// ============================================================
//  توجيه الرسائل والأحداث
//  نظام الصلاحيات (clearance) المحدد في إعدادات كل أمر:
//    0 = يستخدمه أي عضو في المجموعة
//    1 = أدمن المجموعة على فيسبوك، أو مالك البوت
//    2 = مالك البوت فقط (config.ADMINBOT)
// ============================================================

const userData = require('../database/userData.js');
const groupData = require('../database/groupData.js');
const dmGuard = require('../database/dmGuard.js');
const deletionLog = require('../database/deletionLog.js');
const protectionCmd = require('../script/commands/حماية.js');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const cooldowns = new Map(); // key: `${userID}:${title}` -> timestamp
const threadNameCache = new Map(); // threadID -> { name, ts }

// مجلد مؤقت لتنزيل المرفقات قبل إعادة رفعها في البث الفوري
const FORWARD_TMP_DIR = path.join(__dirname, 'tmp_forward');
fs.ensureDirSync(FORWARD_TMP_DIR);

// يخمّن امتداد الملف من نوع المرفق عند تعذّر استخراجه من الرابط
function guessExt(type) {
    switch (type) {
        case 'photo':
        case 'sticker':
            return '.jpg';
        case 'video':
        case 'animated_image':
            return '.mp4';
        case 'audio':
            return '.mp3';
        default:
            return '.dat';
    }
}

// يجلب اسم المجموعة مع تخزين مؤقت في الذاكرة (10 دقائق) لتفادي طلبات متكررة
async function getThreadNameCached(api, threadID) {
    const cached = threadNameCache.get(threadID);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.name;
    try {
        const info = await api.getThreadInfo(threadID);
        const name = info?.threadName || info?.name || 'مجموعة بدون اسم';
        threadNameCache.set(threadID, { name, ts: Date.now() });
        return name;
    } catch (e) {
        return 'مجموعة بدون اسم';
    }
}

// يجلب اسم المرسل بأمان (لا يوقف تنفيذ البوت في حال فشل الطلب)
async function safeGetName(api, userID) {
    try {
        const info = await api.getUserInfo(userID);
        return info?.[userID]?.name || 'عضو';
    } catch (e) {
        return 'عضو';
    }
}

function parseArgs(body, prefix) {
    let text = body.trim();
    if (prefix && text.startsWith(prefix)) {
        text = text.slice(prefix.length);
    }
    const args = text.trim().split(/\s+/).filter(Boolean);
    return args;
}

function findCommand(args) {
    // نحاول أطول تطابق ممكن أولاً (بعض عناوين الأوامر تحتوي على كلمتين)
    for (let len = Math.min(args.length, 3); len >= 1; len--) {
        const name = args.slice(0, len).join(' ').toLowerCase();
        if (Zote.client.commands.has(name)) {
            return { command: Zote.client.commands.get(name), rest: args.slice(len) };
        }
    }
    return null;
}

// هل هذا الشخص هو مالك البوت (أي ايدي موجود في config.ADMINBOT)؟
function isOwner(senderID, config) {
    return Array.isArray(config.ADMINBOT) && config.ADMINBOT.includes(senderID);
}

// هل هذا الشخص أدمن في مجموعة الفيسبوك (threadID)؟
async function isThreadAdmin(api, threadID, senderID) {
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        return (threadInfo.adminIDs || []).some((a) => a.id === senderID);
    } catch (e) {
        return false; // في حال فشل الطلب، لا نمنح الصلاحية احتياطًا
    }
}

// يتحقق هل يملك المرسل صلاحية كافية لتشغيل أمر بمستوى clearance معيّن
async function hasClearance({ api, event, config, clearance }) {
    if (!clearance || clearance <= 0) return true; // 0: مسموح للجميع
    if (isOwner(event.senderID, config)) return true; // مالك البوت يملك كل الصلاحيات دائمًا
    if (clearance === 1) return isThreadAdmin(api, event.threadID, event.senderID); // 1: أدمن المجموعة
    return false; // 2 وما فوق: مالك البوت فقط
}

async function handleEvent({ api, event, config }) {
    global.LAST_EVENT_AT = Date.now(); // لأمر "صحة" — آخر حدث/رسالة وصلت فعليًا

    // ------------------------------------------------------------
    // مجموعة محظورة بالكامل من طرف المطوّر (.ادارة بان-جروب) — البوت يغادرها فورًا
    // ويتجاهل أي حدث/رسالة قادمة منها
    // ------------------------------------------------------------
    if (event.threadID) {
        try {
            if (await groupData.isGroupBanned(event.threadID)) {
                try { await api.removeUserFromGroup(api.getCurrentUserID(), event.threadID); } catch (e) {}
                return;
            }
        } catch (e) {
            console.error('[ادارة] خطأ أثناء التحقق من حظر المجموعة:', e.message);
        }
    }

    // ------------------------------------------------------------
    // تشغيل/إيقاف البوت (.ادارة تشغيل / .ادارة ايقاف) — عند الإيقاف، يتوقف البوت
    // عن أي استجابة لأي شخص عدا مالك البوت (حتى يستطيع إعادة تشغيله)
    // ------------------------------------------------------------
    try {
        const enabled = await groupData.isBotEnabled();
        const senderID = event.senderID || event.author;
        if (!enabled && !isOwner(senderID, config)) return;
    } catch (e) {
        console.error('[ادارة] خطأ أثناء التحقق من حالة تشغيل البوت:', e.message);
    }

    // ------------------------------------------------------------
    // رسائل خاصة فردية (وليست من مجموعة): هذا البوت مخصص لمجموعات ماسنجر
    // فقط. أول رسالة من شخص ما (غير مالك البوت): يُرسَل تنبيه ثم تُحذف
    // المحادثة. أي رسالة لاحقة من نفس الشخص: تُحذف صامتة بدون أي رد جديد.
    // مالك البوت مستثنى بالكامل من هذا الحظر — رسائله الخاصة تتابع مسارها
    // الطبيعي بالأسفل (تنفيذ أوامر، ردود، إلخ) تمامًا كأنها من مجموعة.
    // كل حالة حظر تُسجَّل في سجل نشاط يُعرض عبر أمر "انا" (آخر 24 ساعة فقط).
    // ------------------------------------------------------------
    if ((event.type === 'message' || event.type === 'message_reply') && event.isGroup === false) {
        const senderID = event.senderID;
        if (senderID && senderID !== api.getCurrentUserID() && !isOwner(senderID, config)) {
            try {
                const alreadyNotified = await dmGuard.wasNotified(senderID);
                if (!alreadyNotified) {
                    await api.sendMessage(
                        "هذا البوت مخصص للاستخدام داخل مجموعات ماسنجر فقط، وليس للاستخدام الفردي. لن يتم الرد على الرسائل الخاصة.",
                        event.threadID
                    );
                    await dmGuard.markNotified(senderID);
                    await dmGuard.logActivity(senderID, 'notified_and_deleted');
                } else {
                    await dmGuard.logActivity(senderID, 'deleted_silent');
                }
                try { await api.deleteThread(event.threadID); } catch (e) {}
            } catch (e) {
                console.error('[حارس الرسائل الفردية] خطأ:', e.message);
            }
            return;
        }
        // مالك البوت (أو رسالة من البوت نفسه): لا حظر — تابع التنفيذ الطبيعي بالأسفل
    }

    // ------------------------------------------------------------
    // طلب صداقة وارد/مُلغى — يُخزَّن لعرضه لاحقًا عبر "ادارة طلبات-صداقة"
    // ------------------------------------------------------------
    if (event.type === 'friend_request_received') {
        groupData.addPendingFriendRequest(event.actorFbId).catch(() => {});
        return;
    }
    if (event.type === 'friend_request_cancel') {
        groupData.removePendingFriendRequest(event.actorFbId).catch(() => {});
        return;
    }

    // ------------------------------------------------------------
    // أحداث المجموعة (انضمام، مغادرة، تغيير ادمن...) — تُعالَج دائمًا لكل الأعضاء
    // ------------------------------------------------------------
    if (event.type === 'event') {
        for (const [, evtModule] of Zote.client.events) {
            try {
                await evtModule.ZOTEEvent({ api, event });
            } catch (e) {
                console.error('[حدث] خطأ:', e.message);
            }
        }
        return;
    }

    // ------------------------------------------------------------
    // حذف رسالة (unsend) — يُفعَّل فقط إذا كان نظام "تسجيل" مفعّلاً في المجموعة
    // ------------------------------------------------------------
    if (event.type === 'message_unsend') {
        try {
            const enabled = await deletionLog.isEnabled(event.threadID);
            if (enabled) {
                const deletedDoc = await deletionLog.markDeletedAndGet(event.threadID, event.messageID);
                if (deletedDoc) {
                    const preview = deletedDoc.body
                        ? `«${deletedDoc.body}»`
                        : (deletedDoc.attachments?.length ? '[صورة/مرفق]' : '(بدون نص)');
                    const alertMsg =
                        `🗑️ ${deletedDoc.senderName} قام بحذف رسالة:\n${preview}`;
                    await api.sendMessage(alertMsg, event.threadID);
                }
            }
        } catch (e) {
            console.error('[تسجيل] خطأ أثناء معالجة حدث الحذف:', e.message);
        }
        return;
    }

    // ------------------------------------------------------------
    // تفاعل بإيموجي على رسالة سابقة من البوت (Zote.client.ZOTEReaction)
    // ------------------------------------------------------------
    if (event.type === 'message_reaction') {
        const idx = Zote.client.ZOTEReaction.findIndex((h) => h.messageID === event.messageID);
        if (idx === -1) return;
        const pending = Zote.client.ZOTEReaction[idx];
        const command = Zote.client.commands.get(pending.name?.toLowerCase());
        if (command && command.ZOTEReaction) {
            try {
                await command.ZOTEReaction({ api, event, ZOTEReaction: pending });
            } catch (e) {
                console.error('[تفاعل] خطأ:', e.message);
            }
        }
        return;
    }

    // ------------------------------------------------------------
    // رد على رسالة سابقة من البوت (Zote.client.ZOTEReply) — ألعاب، محادثة AI...
    // ------------------------------------------------------------
    if (event.type === 'message_reply') {
        const idx = Zote.client.ZOTEReply.findIndex((h) => h.messageID === event.messageReply?.messageID);
        if (idx !== -1) {
            const pending = Zote.client.ZOTEReply[idx];
            const command = Zote.client.commands.get(pending.name?.toLowerCase());
            if (command && command.ZOTEReply) {
                try {
                    const user = await userData.get(event.senderID, { name: 'عضو' });
                    await command.ZOTEReply({ api, event, ZOTEReply: pending, userData, config, user });
                } catch (e) {
                    console.error('[رد] خطأ:', e.message);
                }
                return;
            }
        }
        // إذا لم يوجد رد معلّق مطابق، تابع كأنها رسالة عادية (قد تحتوي على أمر)
    }

    // ------------------------------------------------------------
    // رسالة عادية: تحقق من البادئة (prefix) ونفّذ الأمر المطابق
    // ------------------------------------------------------------
    if (event.type === 'message' || event.type === 'message_reply') {
        // تخزين مؤقت (48 ساعة) لغرض كشف الحذف فقط — إن كان مفعّلاً في هذه المجموعة
        if (event.messageID && event.senderID) {
            deletionLog.isEnabled(event.threadID).then(async (enabled) => {
                if (!enabled) return;
                const senderName = await safeGetName(api, event.senderID);
                const attachments = Array.isArray(event.attachments)
                    ? event.attachments.map((a) => ({ type: a.type, url: a.url })).filter((a) => a.url)
                    : [];
                await deletionLog.cacheMessage({
                    threadID: event.threadID,
                    messageID: event.messageID,
                    senderID: event.senderID,
                    senderName,
                    body: event.body || '',
                    attachments,
                });

                // بث فوري (إن كان مفعّلاً): إرسال الرسالة الجديدة فور وصولها للمجموعات المختارة
                try {
                    const targets = await deletionLog.getLiveForwardTargets();
                    if (targets.length && !targets.includes(String(event.threadID))) {
                        const groupName = await getThreadNameCached(api, event.threadID);
                        const textPart = event.body ? `«${event.body}»` : '';

                        // إذا كانت هناك رسالة نصية (أو لا يوجد أي مرفق)، أرسل نص البث أولًا
                        if (textPart || !attachments.length) {
                            const attachNote = attachments.length
                                ? `\n[${attachments.length} مرفق: ${attachments.map((a) => a.type).join(', ')}]`
                                : '';
                            const liveMsg = `📡 [${groupName}]\n👤 ${senderName}:\n${textPart || '(بدون نص)'}${attachNote}`;
                            for (const targetID of targets) {
                                api.sendMessage(liveMsg, targetID).catch((e) =>
                                    console.error('[تسجيل] خطأ في إرسال البث الفوري:', e.message)
                                );
                            }
                        }

                        // إعادة توجيه المرفقات فعليًا (صور/فيديوهات/ملفات صوتية) — تنزيل ثم إعادة رفع،
                        // لأن إرسال رابط المرفق كنص لا يُظهره كصورة/فيديو حقيقي داخل ماسنجر
                        if (attachments.length) {
                            for (const attachment of attachments) {
                                if (!attachment.url) continue;
                                let tmpPath = null;
                                try {
                                    const res = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                                    const ext = path.extname(new URL(attachment.url).pathname) || guessExt(attachment.type);
                                    tmpPath = path.join(FORWARD_TMP_DIR, `fwd_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
                                    await fs.writeFile(tmpPath, Buffer.from(res.data));

                                    for (const targetID of targets) {
                                        await api.sendMessage(
                                            { body: `📡 [${groupName}] 👤 ${senderName} — [${attachment.type || 'مرفق'}]`, attachment: fs.createReadStream(tmpPath) },
                                            targetID
                                        ).catch((e) => console.error('[تسجيل] خطأ في إرسال المرفق:', e.message));
                                    }
                                } catch (e) {
                                    console.error('[تسجيل] خطأ في تنزيل/إعادة رفع المرفق:', e.message);
                                } finally {
                                    if (tmpPath) fs.remove(tmpPath).catch(() => {});
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('[تسجيل] خطأ في البث الفوري:', e.message);
                }
            }).catch((e) => console.error('[تسجيل] خطأ في التخزين المؤقت:', e.message));
        }

        const body = event.body || '';
        if (!body.trim()) return;

        // فحص الحماية (روابط/سبام/منشن/محتوى مسيء) — يعمل بغض النظر عن البادئة
        protectionCmd.moderateMessage({ api, event }).catch((e) =>
            console.error('[حماية] خطأ في moderateMessage:', e.message)
        );

        const prefix = config.PREFIX || '';
        if (prefix && !body.startsWith(prefix)) return;

        const args = parseArgs(body, prefix);
        if (args.length === 0) return;

        const found = findCommand(args);
        if (!found) return;

        // العضو المحظور محليًا في هذه المجموعة (.مجموعة بان) أو المحظور عامًا
        // من كل المجموعات (.ادارة بان) يُتجاهل تمامًا: لا يُنفَّذ له أي أمر.
        if (await userData.isLocallyBanned(event.senderID, event.threadID)) return;
        if (await groupData.isGloballyBanned(event.senderID)) return;

        const { command, rest } = found;
        const { title, clearance = 0, delay = 0 } = command.config;

        // التحقق من صلاحية تشغيل هذا الأمر (انظر شرح clearance في أعلى الملف)
        const allowed = await hasClearance({ api, event, config, clearance });
        if (!allowed) {
            const msg = clearance >= 2
                ? '❌ هذا الأمر مخصص لمالك البوت فقط.'
                : '❌ هذا الأمر مخصص لأدمن المجموعة أو مالك البوت فقط.';
            return api.sendMessage(msg, event.threadID, event.messageID);
        }

        // تبريد (cooldown) لكل مستخدم/أمر
        const key = `${event.senderID}:${title}`;
        const now = Date.now();
        const last = cooldowns.get(key) || 0;
        if (now - last < delay * 1000) {
            const remaining = ((delay * 1000 - (now - last)) / 1000).toFixed(1);
            return api.sendMessage(`⏳ انتظر ${remaining} ثانية قبل استخدام هذا الأمر مرة أخرى.`, event.threadID, event.messageID);
        }
        cooldowns.set(key, now);

        try {
            const user = await userData.get(event.senderID, { name: 'عضو' });
            await command.ZOTERun({ api, event, args: rest, userData, config, user });
        } catch (e) {
            console.error(`[أمر: ${title}] خطأ:`, e);
            api.sendMessage(`✘ حدث خطأ أثناء تنفيذ الأمر "${title}".`, event.threadID, event.messageID).catch(() => {});
        }
    }
}

module.exports = { handleEvent };

