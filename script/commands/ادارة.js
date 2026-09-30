// ============================================================
//  أمر: ادارة   (خاص بمالك البوت/المطوّر فقط — clearance: 2)
//  إدارة إعدادات البوت على مستوى كل المجموعات (وليس مجموعة واحدة):
//  قائمة المجموعات، حظر مجموعات/مستخدمين بشكل عام، طلبات الصداقة،
//  إشعارات جماعية، صورة/بايو البوت، تشغيل/إيقاف، إحصائيات.
//  كل البيانات (حظر المجموعات، الحظر العام، تشغيل/إيقاف، طلبات
//  الصداقة المعلّقة) مخزّنة بشكل دائم في MongoDB عبر database/groupData.js
// ============================================================

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const groupData = require('../../database/groupData.js');

const OWNER_ID = "61551379444881";
const REPLY_TTL_MS = 30 * 60 * 1000; // صلاحية قائمة "لاست" للرد عليها: 30 دقيقة

// -------------------- أدوات مساعدة --------------------

function getSafeName(api, userID) {
    return api.getUserInfo(userID)
        .then((info) => info?.[userID]?.name || 'مستخدم')
        .catch(() => 'مستخدم');
}

function getThreadListAsync(api, limit = 100, tags = ['INBOX']) {
    return new Promise((resolve) => {
        try {
            api.getThreadList(limit, null, tags, (err, list) => {
                if (err) return resolve([]);
                resolve(Array.isArray(list) ? list : []);
            });
        } catch (e) {
            resolve([]);
        }
    });
}

function extractNumbers(text) {
    return (text.match(/\d+/g) || []).map((n) => parseInt(n, 10));
}

// ═══════════════════════════════════════════
//   إعدادات الأمر
// ═══════════════════════════════════════════
module.exports.config = {
    title:   "ادارة",
    release: "1.0.0",
    clearance: 2, // خاص بمالك البوت فقط
    author:  "ZOTE Tracks",
    summary: "لوحة إدارة البوت الكاملة عبر كل المجموعات (خاص بالمطوّر)",
    section: "الادمــــن",
    syntax:  "ادارة [لاست|بان|نوبان|بان-جروب|نوبان-جروب|غادر|طلبات|طلبات-صداقة|اشعار|اشعار-محدد|بروفايل-بوت|بايو_بوت|تشغيل|ايقاف|احصائيات]",
    delay:   3,
};

const MENU_TEXT =
`◆━━━━[ اوامر الادارة ]━━━━◆

- ادارة لاست - عرض المجموعات والتحكم بها
- ادارة بان [ايدي|@منشن|رد] [سبب] - بان مستخدم
- ادارة نوبان [ايدي|@منشن|رد] - الغاء حظر مستخدم
- ادارة بان-جروب [ايدي] - حظر مجموعة
- ادارة نوبان-جروب [ايدي] - الغاء حظر مجموعة
- ادارة غادر [ايدي اختياري] - مغادرة مجموعة (بدون ايدي = المجموعة الحالية)
- ادارة طلبات - عرض طلبات المجموعات
- ادارة طلبات-صداقة - عرض طلبات الصداقة
- ادارة اشعار [رسالة] - ارسال اشعار لجميع المجموعات
- ادارة اشعار-محدد [رسالة] - ارسال اشعار لمجموعة واحدة تختارها
- ادارة بروفايل-بوت - تغيير صورة البوت
- ادارة بايو_بوت - تغيير بايو البوت
- ادارة تشغيل/ايقاف - تشغيل/ايقاف البوت
- ادارة احصائيات - عرض احصائيات البوت

○━━━━━━━━━━━━━━━━━━━━━━○`;

// ═══════════════════════════════════════════
//   التنفيذ
// ═══════════════════════════════════════════
module.exports.ZOTERun = async function ({ api, event, args, config }) {
    const { threadID, messageID, senderID, mentions, messageReply } = event;
    const subCommand = args[0]?.toLowerCase?.()?.trim();

    if (!subCommand) {
        return api.sendMessage(MENU_TEXT, threadID, messageID);
    }

    // ────────────────────────────────────
    //  لاست — عرض كل المجموعات مع أرقام تفاعلية
    // ────────────────────────────────────
    if (subCommand === "لاست") {
        const myID = api.getCurrentUserID();
        const threads = await getThreadListAsync(api, 100, ['INBOX']);
        // نعرض فقط المجموعات التي البوت عضو فيها فعليًا الآن (وليس كل محادثة
        // موجودة في السجل، لأن بعضها قد يكون البوت غادرها أو طُرد منها سابقًا)
        const groups = threads.filter((t) =>
            t.isGroup && Array.isArray(t.participantIDs) && t.participantIDs.includes(myID)
        );

        if (!groups.length)
            return api.sendMessage("◆ البوت غير موجود في أي مجموعة حاليًا.", threadID, messageID);

        const RLM = '\u200F'; // علامة اتجاه من اليمين لليسار: تمنع أسماء المجموعات
                               // اللاتينية/الرمزية من قلب اتجاه السطر بصريًا

        let body = "";
        const numbered = [];
        groups.forEach((g, i) => {
            const idx = i + 1;
            const name = g.name || "بدون اسم";
            const count = Array.isArray(g.participantIDs) ? g.participantIDs.length : 0;
            numbered.push({ index: idx, threadID: g.threadID, name });
            body += `${RLM}${idx}- ${name}\n${RLM}عدد الأعضاء : ${count}\n\n`;
        });

        body += `${RLM}○━━━━━━━━━━━━━━━━━━━━━━○\n` +
            `${RLM}◆ رُد على هذه الرسالة بأحد الأوامر التالية مع ذكر رقم/أرقام المجموعة:\n` +
            `${RLM}   غادر (1/2/4)\n` +
            `${RLM}   بان (1/2/4)\n` +
            `${RLM}   نوبان (1/2/4)\n` +
            `${RLM}   ضيفني (1/2/4)\n` +
            `${RLM}   زيارة (1/2/4) — متاح للجميع للانضمام إلى المجموعة`;

        const sent = await api.sendMessage(body.trim(), threadID, messageID);
        Zote.client.ZOTEReply.push({
            messageID: sent.messageID,
            name: 'ادارة',
            kind: 'group-list',
            groups: numbered,
            expiresAt: Date.now() + REPLY_TTL_MS,
        });
        return;
    }

    // ────────────────────────────────────
    //  بان / نوبان — حظر عام لمستخدم من كل المجموعات
    // ────────────────────────────────────
    if (subCommand === "بان") {
        let targetID = null, targetName = "المستخدم";
        if (Object.keys(mentions).length > 0) {
            targetID = Object.keys(mentions)[0];
            targetName = mentions[targetID]?.replace?.(/^@/, "") || "المستخدم";
        } else if (messageReply?.senderID) {
            targetID = messageReply.senderID;
            targetName = await getSafeName(api, targetID);
        } else if (args[1] && !isNaN(args[1])) {
            targetID = args[1];
            targetName = await getSafeName(api, targetID);
        }

        if (!targetID)
            return api.sendMessage("◆ منشن العضو أو رد على رسالته أو اكتب معرفه لحظره عامًا", threadID, messageID);
        if (targetID === api.getCurrentUserID())
            return api.sendMessage("✘ لا يمكن حظر البوت نفسه", threadID, messageID);
        if (targetID === OWNER_ID)
            return api.sendMessage("✘ لا يمكن حظر مالك البوت", threadID, messageID);

        const reason = args
            .slice(Object.keys(mentions).length > 0 || messageReply?.senderID ? 1 : 2)
            .join(" ")
            .replace(new RegExp(`@${targetName}`, 'g'), "")
            .trim() || "لا يوجد سبب";

        await groupData.globalBan(targetID, senderID, reason);
        return api.sendMessage(`الشخص المحظور : ${targetName}\nالسبب : ${reason}\nالنطاق : جميع المجموعات`, threadID, messageID);
    }

    if (subCommand === "نوبان") {
        let targetID = null, targetName = "المستخدم";
        if (Object.keys(mentions).length > 0) {
            targetID = Object.keys(mentions)[0];
            targetName = mentions[targetID]?.replace?.(/^@/, "") || "المستخدم";
        } else if (messageReply?.senderID) {
            targetID = messageReply.senderID;
            targetName = await getSafeName(api, targetID);
        } else if (args[1] && !isNaN(args[1])) {
            targetID = args[1];
            targetName = await getSafeName(api, targetID);
        }

        if (!targetID)
            return api.sendMessage("◆ منشن العضو أو رد على رسالته أو اكتب معرفه لإلغاء حظره", threadID, messageID);

        if (!(await groupData.isGloballyBanned(targetID)))
            return api.sendMessage(`◆ ${targetName} غير محظور عامًا`, threadID, messageID);

        await groupData.globalUnban(targetID);
        return api.sendMessage(`✔ تم إلغاء الحظر العام عن ${targetName}`, threadID, messageID);
    }

    // ────────────────────────────────────
    //  بان-جروب / نوبان-جروب
    // ────────────────────────────────────
    if (subCommand === "بان-جروب") {
        const targetThread = args[1];
        if (!targetThread || isNaN(targetThread))
            return api.sendMessage("◆ اكتب: ادارة بان-جروب [ايدي المجموعة]", threadID, messageID);

        const reason = args.slice(2).join(" ").trim() || "لا يوجد سبب";
        await groupData.banGroup(targetThread, senderID, reason);
        try { await api.removeUserFromGroup(api.getCurrentUserID(), targetThread); } catch (e) {}
        return api.sendMessage(`✔ تم حظر المجموعة (${targetThread})\nالسبب : ${reason}`, threadID, messageID);
    }

    if (subCommand === "نوبان-جروب") {
        const targetThread = args[1];
        if (!targetThread || isNaN(targetThread))
            return api.sendMessage("◆ اكتب: ادارة نوبان-جروب [ايدي المجموعة]", threadID, messageID);

        if (!(await groupData.isGroupBanned(targetThread)))
            return api.sendMessage("◆ هذه المجموعة غير محظورة", threadID, messageID);

        await groupData.unbanGroup(targetThread);
        return api.sendMessage(`✔ تم إلغاء حظر المجموعة (${targetThread})`, threadID, messageID);
    }

    // ────────────────────────────────────
    //  غادر — مغادرة مجموعة مباشرة عبر الايدي
    // ────────────────────────────────────
    if (subCommand === "غادر") {
        const explicitTarget = args[1] && !isNaN(args[1]) ? args[1] : null;
        const targetThread = explicitTarget || threadID;
        const leavingCurrent = !explicitTarget;

        try {
            // لو رح نغادر مجموعتنا الحالية، لازم نرسل التأكيد قبل المغادرة —
            // بعدها ما رح نقدر نوصل أي رسالة لنفس المجموعة.
            if (leavingCurrent) {
                await api.sendMessage("✔ البوت يغادر هذه المجموعة الآن...", threadID, messageID);
            }
            await api.removeUserFromGroup(api.getCurrentUserID(), targetThread);
            if (!leavingCurrent) {
                return api.sendMessage(`✔ تمت مغادرة المجموعة (${targetThread})`, threadID, messageID);
            }
        } catch (e) {
            return api.sendMessage(`✘ تعذّرت مغادرة المجموعة: ${e.message || e}`, threadID, messageID);
        }
    }

    // ────────────────────────────────────
    //  طلبات — طلبات مراسلة عامة فقط (قسم "PENDING")، بخلاف أمر طلبات.js
    //  المنفصل الذي يعرض أيضًا القسم المصفّى/غير المهم "OTHER"
    // ────────────────────────────────────
    if (subCommand === "طلبات") {
        const pendingThreads = await getThreadListAsync(api, 50, ['PENDING']);
        if (!pendingThreads.length)
            return api.sendMessage("◆ لا توجد طلبات مراسلة جديدة حاليًا.", threadID, messageID);

        const RLM = '\u200F';
        let body = `${RLM}◆━━━━[ طلبات المراسلة ]━━━━◆\n\n`;
        const numbered = [];
        for (let i = 0; i < pendingThreads.length; i++) {
            const t = pendingThreads[i];
            const idx = i + 1;
            let name = t.name;
            if (!name && !t.isGroup) {
                const otherID = (t.participantIDs || []).find((id) => id !== api.getCurrentUserID());
                name = otherID ? await getSafeName(api, otherID) : null;
            }
            name = name || 'غير معروف';
            numbered.push({ index: idx, threadID: t.threadID, name });
            body += `${RLM}${idx}- ${name}\n`;
        }
        body += `\n${RLM}○━━━━━━━━━━━━━━━━━━━━━━○\n` +
            `${RLM}◆ رُد على هذه الرسالة بـ:\n` +
            `${RLM}   قبول (1/2/4)\n` +
            `${RLM}   رفض (1/2/4)`;

        const sent = await api.sendMessage(body.trim(), threadID, messageID);
        Zote.client.ZOTEReply.push({
            messageID: sent.messageID,
            name: 'ادارة',
            kind: 'message-requests',
            requests: numbered,
            expiresAt: Date.now() + REPLY_TTL_MS,
        });
        return;
    }

    // ────────────────────────────────────
    //  طلبات-صداقة — طلبات صداقة معلّقة (تُجمع تلقائيًا من أحداث فيسبوك الواردة)
    // ────────────────────────────────────
    if (subCommand === "طلبات-صداقة") {
        const pending = await groupData.getPendingFriendRequests();
        if (!pending.length)
            return api.sendMessage("◆ لا توجد طلبات صداقة معلّقة مسجّلة حاليًا.\n(يتم تسجيل الطلبات تلقائيًا فور وصولها فقط، وليس بأثر رجعي)", threadID, messageID);

        let body = "◆━━━━[ طلبات الصداقة ]━━━━◆\n\n";
        const numbered = [];
        for (let i = 0; i < pending.length; i++) {
            const idx = i + 1;
            const name = await getSafeName(api, pending[i].user_id);
            numbered.push({ index: idx, userID: pending[i].user_id, name });
            body += `${idx}- ${name}\n`;
        }
        body += `\n○━━━━━━━━━━━━━━━━━━━━━━○\n` +
            `◆ رُد على هذه الرسالة بـ:\n` +
            `   قبول (1/2/4)\n` +
            `   رفض (1/2/4)`;

        const sent = await api.sendMessage(body.trim(), threadID, messageID);
        Zote.client.ZOTEReply.push({
            messageID: sent.messageID,
            name: 'ادارة',
            kind: 'friend-requests',
            requests: numbered,
            expiresAt: Date.now() + REPLY_TTL_MS,
        });
        return;
    }

    // ────────────────────────────────────
    //  اشعار — بث رسالة لكل المجموعات
    // ────────────────────────────────────
    if (subCommand === "اشعار") {
        const text = args.slice(1).join(" ").trim();
        if (!text)
            return api.sendMessage("◆ اكتب: ادارة اشعار [نص الرسالة]", threadID, messageID);

        const myID = api.getCurrentUserID();
        const threads = await getThreadListAsync(api, 100, ['INBOX']);
        const groups = threads.filter((t) =>
            t.isGroup && Array.isArray(t.participantIDs) && t.participantIDs.includes(myID)
        );

        let sentCount = 0, failCount = 0;
        for (const g of groups) {
            try {
                await api.sendMessage(`📢 إشعار من إدارة البوت:\n\n${text}`, g.threadID);
                sentCount++;
            } catch (e) {
                failCount++;
            }
            await new Promise((r) => setTimeout(r, 1200)); // تهدئة بين الرسائل لتفادي تقييد فيسبوك
        }
        return api.sendMessage(`✔ تم الإرسال إلى ${sentCount} مجموعة${failCount ? ` (فشل الإرسال إلى ${failCount})` : ""}.`, threadID);
    }

    // ────────────────────────────────────
    //  اشعار-محدد — بث رسالة لمجموعة واحدة تختارها من قائمة مرقّمة
    // ────────────────────────────────────
    if (subCommand === "اشعار-محدد") {
        const text = args.slice(1).join(" ").trim();
        if (!text)
            return api.sendMessage("◆ اكتب: ادارة اشعار-محدد [نص الرسالة]", threadID, messageID);

        const myID = api.getCurrentUserID();
        const threads = await getThreadListAsync(api, 100, ['INBOX']);
        // نفس فكرة "لاست": نتحقق فعليًا إن البوت عضو بالمجموعة حاليًا قبل عرضها،
        // حتى لا تظهر مجموعات قديمة غادرها البوت أو طُرد منها.
        const groups = threads.filter((t) =>
            t.isGroup && Array.isArray(t.participantIDs) && t.participantIDs.includes(myID)
        );

        if (!groups.length)
            return api.sendMessage("◆ البوت غير موجود في أي مجموعة حاليًا.", threadID, messageID);

        const RLM = '\u200F';
        let body = `${RLM}◆ اختر رقم المجموعة اللي تبي ترسلها الرسالة التالية:\n${RLM}"${text}"\n\n`;
        const numbered = [];
        groups.forEach((g, i) => {
            const idx = i + 1;
            const name = g.name || "بدون اسم";
            const count = Array.isArray(g.participantIDs) ? g.participantIDs.length : 0;
            numbered.push({ index: idx, threadID: g.threadID, name });
            body += `${RLM}${idx}- ${name}\n${RLM}عدد الأعضاء : ${count}\n\n`;
        });
        body += `${RLM}○━━━━━━━━━━━━━━━━━━━━━━○\n${RLM}◆ رُد على هذه الرسالة برقم واحد فقط.`;

        const sent = await api.sendMessage(body.trim(), threadID, messageID);
        Zote.client.ZOTEReply.push({
            messageID: sent.messageID,
            name: 'ادارة',
            kind: 'group-list-notify',
            groups: numbered,
            message: text,
            expiresAt: Date.now() + REPLY_TTL_MS,
        });
        return;
    }

    // ────────────────────────────────────
    //  بروفايل-بوت — تغيير صورة حساب البوت (بالرد على صورة)
    // ────────────────────────────────────
    if (subCommand === "بروفايل-بوت") {
        const photo = messageReply?.attachments?.find((a) => a.type === 'photo' || a.type === 'sticker');
        if (!photo?.url)
            return api.sendMessage("◆ رُد على صورة بهذا الأمر لتعيينها صورة حساب البوت.", threadID, messageID);

        let tmpPath = null;
        try {
            const res = await axios.get(photo.url, { responseType: 'arraybuffer' });
            const tmpDir = path.join(__dirname, 'tmp');
            fs.ensureDirSync(tmpDir);
            tmpPath = path.join(tmpDir, `avatar_${Date.now()}.jpg`);
            await fs.writeFile(tmpPath, Buffer.from(res.data));

            await api.changeAvatar(fs.createReadStream(tmpPath));
            return api.sendMessage("✔ تم تغيير صورة البوت بنجاح.", threadID, messageID);
        } catch (e) {
            return api.sendMessage(`✘ فشل تغيير صورة البوت: ${e.message || e}`, threadID, messageID);
        } finally {
            if (tmpPath) fs.remove(tmpPath).catch(() => {});
        }
    }

    // ────────────────────────────────────
    //  بايو_بوت — تغيير بايو حساب البوت
    // ────────────────────────────────────
    if (subCommand === "بايو_بوت") {
        const bio = args.slice(1).join(" ").trim();
        if (!bio)
            return api.sendMessage("◆ اكتب: ادارة بايو_بوت [النص الجديد]", threadID, messageID);
        try {
            await api.changeBio(bio);
            return api.sendMessage("✔ تم تغيير بايو البوت بنجاح.", threadID, messageID);
        } catch (e) {
            return api.sendMessage(`✘ فشل تغيير البايو: ${e.message || e}`, threadID, messageID);
        }
    }

    // ────────────────────────────────────
    //  تشغيل / ايقاف — تشغيل أو إيقاف البوت بالكامل مؤقتًا
    // ────────────────────────────────────
    if (subCommand === "تشغيل") {
        await groupData.setBotEnabled(true);
        return api.sendMessage("✔ تم تشغيل البوت. سيستجيب الآن لجميع الأعضاء.", threadID, messageID);
    }
    if (subCommand === "ايقاف") {
        await groupData.setBotEnabled(false);
        return api.sendMessage("⏸ تم إيقاف البوت مؤقتًا. لن يستجيب لأحد سواك حتى تكتب \"ادارة تشغيل\".", threadID, messageID);
    }

    // ────────────────────────────────────
    //  احصائيات
    // ────────────────────────────────────
    if (subCommand === "احصائيات") {
        const myID = api.getCurrentUserID();
        const threads = await getThreadListAsync(api, 100, ['INBOX']);
        const groupsCount = threads.filter((t) =>
            t.isGroup && Array.isArray(t.participantIDs) && t.participantIDs.includes(myID)
        ).length;
        const bannedGroups = await groupData.getBannedGroups();
        const botEnabled = await groupData.isBotEnabled();
        const dbState = mongoose.connection.readyState === 1 ? "متصلة ✔" : "غير متصلة ✘";

        let usersCount = "غير متوفر";
        try {
            if (mongoose.models.User) usersCount = await mongoose.models.User.countDocuments();
        } catch (e) {}

        let uptime = "غير متوفر";
        if (global.BOT_START_TIME) {
            const diffMin = Math.floor((Date.now() - global.BOT_START_TIME) / 60000);
            const h = Math.floor(diffMin / 60), m = diffMin % 60;
            uptime = `${h} ساعة و ${m} دقيقة`;
        }

        const msg =
`◆━━━━[ إحصائيات البوت ]━━━━◆
■ عدد المجموعات: ${groupsCount}
■ عدد المستخدمين المسجّلين: ${usersCount}
■ عدد المجموعات المحظورة: ${bannedGroups.length}
■ عدد الأوامر المحمّلة: ${Zote.client.commands.size}
■ حالة قاعدة البيانات: ${dbState}
■ حالة البوت: ${botEnabled ? "يعمل ✔" : "متوقف ⏸"}
■ مدة التشغيل: ${uptime}
○━━━━━━━━━━━━━━━━━━━━━━○`;
        return api.sendMessage(msg, threadID, messageID);
    }

    return api.sendMessage(MENU_TEXT, threadID, messageID);
};

// ═══════════════════════════════════════════
//   الردود التفاعلية (لاست / طلبات-صداقة)
// ═══════════════════════════════════════════
module.exports.ZOTEReply = async function ({ api, event, ZOTEReply, config }) {
    const { threadID, senderID } = event;

    const isOwner = Array.isArray(config?.ADMINBOT) ? config.ADMINBOT.includes(senderID) : senderID === OWNER_ID;

    // القائمة أحادية الاستخدام (بالنسبة لأوامر المالك): تُحذف من قائمة الانتظار
    // فور التعامل معها حتى لا تتراكم في الذاكرة أو يُعاد استعمالها بعد فوات الأوان.
    // ملاحظة: "زيارة" لا تحذف القائمة، لأنها مصمَّمة ليستعملها عدة أشخاص من نفس الرسالة.
    const removeFromQueue = () => {
        const idx = Zote.client.ZOTEReply.findIndex((h) => h.messageID === ZOTEReply.messageID);
        if (idx !== -1) Zote.client.ZOTEReply.splice(idx, 1);
    };

    const body = (event.body || "").trim();
    const numbers = extractNumbers(body);
    const action = body.split(/\s+/)[0];

    if (ZOTEReply.kind === 'group-list' && action === "زيارة") {
        // متاح للجميع: يضيف الشخص الذي ردّ (أيًا كان) إلى المجموعات التي اختارها بالرقم
        if (Date.now() > (ZOTEReply.expiresAt || 0) || !numbers.length) return;

        const results = [];
        for (const n of numbers) {
            const g = ZOTEReply.groups.find((x) => x.index === n);
            if (!g) { results.push(`${n}- غير موجود في القائمة`); continue; }
            try {
                await api.addUserToGroup(senderID, g.threadID);
                results.push(`${n}- ✔ تمت إضافتك إلى "${g.name}"`);
            } catch (e) {
                results.push(`${n}- ✘ فشل: ${e.message || e}`);
            }
        }
        return api.sendMessage(results.join("\n"), threadID);
    }

    // كل ما يلي (غادر/بان/نوبان/ضيفني وطلبات الصداقة) خاص بمالك البوت فقط
    if (!isOwner) return;

    if (Date.now() > (ZOTEReply.expiresAt || 0)) {
        removeFromQueue();
        return api.sendMessage("◆ انتهت صلاحية هذه القائمة، أعد تنفيذ الأمر من جديد.", threadID);
    }

    if (ZOTEReply.kind === 'group-list-notify') {
        if (!numbers.length) return;
        const g = ZOTEReply.groups.find((x) => x.index === numbers[0]);
        removeFromQueue();
        if (!g) return api.sendMessage("◆ رقم غير موجود بالقائمة.", threadID);

        try {
            await api.sendMessage(`📢 إشعار من إدارة البوت:\n\n${ZOTEReply.message}`, g.threadID);
            return api.sendMessage(`✔ تم إرسال الرسالة إلى "${g.name}".`, threadID);
        } catch (e) {
            return api.sendMessage(`✘ فشل الإرسال إلى "${g.name}": ${e.message || e}`, threadID);
        }
    }

    if (ZOTEReply.kind === 'group-list') {
        if (!["غادر", "بان", "نوبان", "ضيفني"].includes(action) || !numbers.length) return;

        const results = [];
        for (const n of numbers) {
            const g = ZOTEReply.groups.find((x) => x.index === n);
            if (!g) { results.push(`${n}- غير موجود في القائمة`); continue; }

            try {
                if (action === "غادر") {
                    await api.removeUserFromGroup(api.getCurrentUserID(), g.threadID);
                    results.push(`${n}- ✔ تمت مغادرة "${g.name}"`);
                } else if (action === "بان") {
                    await groupData.banGroup(g.threadID, senderID, "عبر قائمة لاست");
                    try { await api.removeUserFromGroup(api.getCurrentUserID(), g.threadID); } catch (e) {}
                    results.push(`${n}- ✔ تم حظر "${g.name}"`);
                } else if (action === "نوبان") {
                    await groupData.unbanGroup(g.threadID);
                    results.push(`${n}- ✔ تم إلغاء حظر "${g.name}"`);
                } else if (action === "ضيفني") {
                    await api.addUserToGroup(senderID, g.threadID);
                    results.push(`${n}- ✔ تمت إضافتك إلى "${g.name}"`);
                }
            } catch (e) {
                results.push(`${n}- ✘ فشل: ${e.message || e}`);
            }
        }
        removeFromQueue();
        return api.sendMessage(results.join("\n"), threadID);
    }

    if (ZOTEReply.kind === 'friend-requests') {
        if (!["قبول", "رفض"].includes(action) || !numbers.length) return;

        const results = [];
        for (const n of numbers) {
            const r = ZOTEReply.requests.find((x) => x.index === n);
            if (!r) { results.push(`${n}- غير موجود في القائمة`); continue; }

            try {
                await api.handleFriendRequest(r.userID, action === "قبول");
                await groupData.removePendingFriendRequest(r.userID);
                results.push(`${n}- ✔ ${action === "قبول" ? "تم القبول" : "تم الرفض"}: ${r.name}`);
            } catch (e) {
                results.push(`${n}- ✘ فشل: ${e.message || e}`);
            }
        }
        removeFromQueue();
        return api.sendMessage(results.join("\n"), threadID);
    }

    if (ZOTEReply.kind === 'message-requests') {
        if (!["قبول", "رفض"].includes(action) || !numbers.length) return;

        const results = [];
        for (const n of numbers) {
            const r = ZOTEReply.requests.find((x) => x.index === n);
            if (!r) { results.push(`${n}- غير موجود في القائمة`); continue; }

            try {
                await api.handleMessageRequest(r.threadID, action === "قبول");
                results.push(`${n}- ✔ ${action === "قبول" ? "تم القبول" : "تم الرفض"}: ${r.name}`);
            } catch (e) {
                results.push(`${n}- ✘ فشل: ${e.message || e}`);
            }
        }
        removeFromQueue();
        return api.sendMessage(results.join("\n"), threadID);
    }
};
