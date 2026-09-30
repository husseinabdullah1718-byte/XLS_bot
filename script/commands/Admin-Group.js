const axios = require('axios');
const mongoose = require('mongoose');
const protectionData = require('../../database/protectionData.js');
const groupLock = require('../../database/groupLock.js');

// ═══════════════════════════════════════════
//   إعدادات ثابتة
// ═══════════════════════════════════════════
const DEV_ID     = "61570903885125";

// ═══════════════════════════════════════════
//   الاتصال بـ MongoDB
//   ملاحظة: الاتصال الفعلي يتم مرة واحدة فقط من index.js
//   باستخدام config.MONGO_URI. هذا الملف لا يفتح اتصالاً
//   منفصلاً حتى لا يتعارض مع الاتصال الأساسي (نفس اتصال
//   mongoose الافتراضي يُستخدم تلقائيًا في كل الملفات).
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
//   Schema & Model للسجل
// ═══════════════════════════════════════════
const logSchema = new mongoose.Schema({
    threadID:   { type: String, required: true, index: true },
    senderID:   { type: String, required: true },
    senderName: { type: String, default: "مجهول" },
    action:     { type: String, required: true },
    target:     { type: String, default: null },
    extra:      { type: String, default: "" },
    time:       { type: Date,   default: Date.now },
}, { versionKey: false });

// نتجنب إعادة تعريف الموديل عند إعادة تحميل الملف
const GroupLog = mongoose.models.GroupLog || mongoose.model("GroupLog", logSchema);

// ═══════════════════════════════════════════
//   دوال السجل
// ═══════════════════════════════════════════

/** يحفظ حدثاً جديداً في MongoDB */
async function addLog(threadID, senderID, senderName, action, target = null, extra = "") {
    if (mongoose.connection.readyState !== 1) {
        console.warn("[ Admin-Group ] ⚠️ لا يوجد اتصال نشط بقاعدة البيانات الآن، تم تجاهل حفظ هذا الحدث.");
        return;
    }
    try {
        await GroupLog.create({ threadID, senderID, senderName, action, target, extra });
    } catch (err) {
        console.error("[ GroupLog ] ✘ فشل حفظ الحدث:", err.message);
    }
}

/** يجلب آخر N حدث للمجموعة */
async function getLogs(threadID, limit = 20) {
    try {
        return await GroupLog.find({ threadID })
            .sort({ time: -1 })
            .limit(limit)
            .lean();
    } catch {
        return [];
    }
}

/** يمسح جميع سجلات مجموعة معينة */
async function clearLogs(threadID) {
    try {
        const result = await GroupLog.deleteMany({ threadID });
        return result.deletedCount || 0;
    } catch {
        return 0;
    }
}

/** يجلب العدد الكلي للسجلات */
async function countLogs(threadID) {
    try {
        return await GroupLog.countDocuments({ threadID });
    } catch {
        return 0;
    }
}

// ═══════════════════════════════════════════
//   دوال مساعدة
// ═══════════════════════════════════════════

/** يجلب اسم المستخدم بأمان */
async function getSafeName(api, userID) {
    try {
        const info = await api.getUserInfo(userID);
        return info[userID]?.name || userID;
    } catch {
        return userID;
    }
}

/** يستخرج الهدف من المنشن أو الرد أو المعرف */
// إن كان "حماية الأدمن" مفعّلة والهدف أدمن حاليًا والمرسل ليس المالك:
// يمنع تنفيذ الإجراء وينزع صلاحية الأدمن من المرسل نفسه كعقاب، ويعيد true
// (على المستدعي عدم متابعة تنفيذ الإجراء الأصلي في هذه الحالة).
async function blockIfPeerAdminAttack(api, threadID, senderID, senderName, targetID) {
    if (senderID === DEV_ID) return false;

    const record = await protectionData.get(threadID);
    if (!record?.enabled?.admin) return false;

    let isTargetAdmin = false;
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        isTargetAdmin = (threadInfo.adminIDs || []).some((a) => a.id === targetID);
    } catch (e) {
        return false; // تعذّر التحقق، لا نمنع الإجراء احتياطًا لتفادي حظر كاذب
    }
    if (!isTargetAdmin) return false;

    try { await api.changeAdminStatus(threadID, senderID, false); } catch (e) {}

    const set = new Set(record.knownAdmins || []);
    set.delete(String(senderID));
    record.knownAdmins = [...set];
    await protectionData.save(record);

    await api.sendMessage(
        `⛔ لا يمكن لأدمن استهداف أدمن آخر. تم نزع صلاحية الأدمن من ${senderName} كعقاب على المحاولة.`,
        threadID
    );
    return true;
}

async function resolveTarget(api, args, mentions, messageReply, argOffset = 1) {
    let targetID   = null;
    let targetName = "العضو";

    if (Object.keys(mentions).length > 0) {
        targetID   = Object.keys(mentions)[0];
        targetName = mentions[targetID]?.replace?.(/^@/, "") || "العضو";
    } else if (messageReply?.senderID) {
        targetID   = messageReply.senderID;
        targetName = await getSafeName(api, targetID);
    } else if (args[argOffset] && !isNaN(args[argOffset])) {
        targetID   = args[argOffset];
        targetName = await getSafeName(api, targetID);
    }

    return { targetID, targetName };
}

// ═══════════════════════════════════════════
//   إعدادات الأمر
// ═══════════════════════════════════════════
module.exports.config = {
    title:   "مجموعة",
    aliases: ["group"],
    release: "3.0.0",
    clearance: 1,
    author:  "ZOTE Tracks",
    summary: "إدارة المجموعة (متاح لأدمن المجموعة ومالك البوت، عدا بان/قفل/فتح فهي خاصة بالمطوّر فقط) مع سجل أحداث دائم في MongoDB",
    section: "الادمــــن",
    syntax:  "مجموعة [صورة|اسم|ايموجي|طرد|اضافة|ارفع|ازالة|عرض|كنية|كنية-الكل|بان|نوبان|محظورين|قفل|فتح|سجل|مسح-سجل]",
    delay:   5,
};

// ═══════════════════════════════════════════
//   الدالة الرئيسية
// ═══════════════════════════════════════════
// يتحقق هل البوت نفسه أدمن بهذه المجموعة فعليًا — قبل أي إجراء يتطلب
// صلاحية أدمن حقيقية (طرد/ترقية/تنزيل)، لتفادي رسالة نجاح مضلّلة في
// حال فشل الإجراء صامتًا لأن البوت أصلًا مو أدمن.
async function isBotAdmin(api, threadID) {
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        const botID = api.getCurrentUserID();
        return (threadInfo.adminIDs || []).some((a) => a.id === botID);
    } catch (e) {
        return false; // فشل التحقق نفسه ⇐ لا نفترض الصلاحية احتياطًا
    }
}

module.exports.ZOTERun = async function({ api, event, args, userData }) {
    const { threadID, messageID, senderID, mentions, messageReply } = event;
    const subCommand = args[0]?.toLowerCase?.()?.trim();

    const senderName = await getSafeName(api, senderID);

    // ══════════════════════════════════════
    //  بان — حظر عضو
    // ══════════════════════════════════════
    if (subCommand === "بان" || subCommand === "ban") {
        if (senderID !== DEV_ID)
            return api.sendMessage("⛔ أمر (بان) هنا خاص بمطوّر البوت فقط.", threadID, messageID);

        const { targetID, targetName } = await resolveTarget(api, args, mentions, messageReply);

        if (!targetID)
            return api.sendMessage("◆ منشن العضو أو رد على رسالته أو اكتب معرفه لحظره", threadID, messageID);
        if (targetID === api.getCurrentUserID())
            return api.sendMessage("✘ لا يمكن حظر البوت نفسه", threadID, messageID);
        if (targetID === DEV_ID)
            return api.sendMessage("✘ لا يمكن حظر مالك البوت", threadID, messageID);

        if (await userData.isLocallyBanned(targetID, threadID))
            return api.sendMessage(`◆ ${targetName} محظور بالفعل في هذه المجموعة`, threadID, messageID);

        // بقية النص بعد تحديد الهدف (منشن/رد/معرف)
        const rest = args
            .slice(Object.keys(mentions).length > 0 ? 1 : (messageReply?.senderID ? 1 : 2))
            .join(" ")
            .replace(new RegExp(`@${targetName}`, 'g'), "")
            .trim();

        // آخر رقم في النص يُعتبر المدة بالدقائق (0 أو عدم الكتابة = حظر دائم)
        const restParts = rest.split(/\s+/).filter(Boolean);
        let durationMinutes = 0;
        if (restParts.length && /^\d+$/.test(restParts[restParts.length - 1])) {
            durationMinutes = parseInt(restParts.pop(), 10);
        }
        const reason = restParts.join(" ") || "لا يوجد سبب";

        await userData.localBan(targetID, threadID, senderID, reason, durationMinutes);

        const durationText = durationMinutes > 0 ? `${durationMinutes} دقيقة` : "دائم";
        api.sendMessage(
            `الشخص المحظور: ${targetName}\nالسبب: ${reason}\nالمدة: ${durationText}`,
            threadID, messageID
        );

        await addLog(threadID, senderID, senderName, "حظر", targetName, `السبب: ${reason} | المدة: ${durationText}`);
        return;
    }

    // ══════════════════════════════════════
    //  نوبان — إلغاء حظر
    // ══════════════════════════════════════
    if (subCommand === "نوبان" || subCommand === "unban") {
        const { targetID, targetName } = await resolveTarget(api, args, mentions, messageReply);

        if (!targetID)
            return api.sendMessage("◆ منشن العضو أو اكتب معرفه لإلغاء حظره", threadID, messageID);
        if (!(await userData.isLocallyBanned(targetID, threadID)))
            return api.sendMessage(`◆ ${targetName} غير محظور في هذه المجموعة`, threadID, messageID);

        await userData.localUnban(targetID, threadID);
        api.sendMessage(`✔ تم إلغاء حظر ${targetName}، بإمكانه استخدام أوامر البوت مجددًا`, threadID, messageID);

        await addLog(threadID, senderID, senderName, "إلغاء حظر", targetName);
        return;
    }

    // ══════════════════════════════════════
    //  قفل — منع أي عضو جديد من الانضمام للمجموعة
    // ══════════════════════════════════════
    if (subCommand === "قفل" || subCommand === "lock") {
        if (senderID !== DEV_ID)
            return api.sendMessage("⛔ أمر (قفل) هنا خاص بمطوّر البوت فقط.", threadID, messageID);

        if (await groupLock.isLocked(threadID))
            return api.sendMessage("◆ هذه المجموعة مقفلة أصلًا.", threadID, messageID);

        await groupLock.lock(threadID, senderID);
        api.sendMessage(
            "🔒 تم قفل المجموعة — أي عضو يُضاف من الآن (عدا مالك البوت) سيُطرد تلقائيًا فور انضمامه.",
            threadID, messageID
        );

        await addLog(threadID, senderID, senderName, "قفل المجموعة");
        return;
    }

    // ══════════════════════════════════════
    //  فتح — إلغاء قفل المجموعة
    // ══════════════════════════════════════
    if (subCommand === "فتح" || subCommand === "unlock") {
        if (senderID !== DEV_ID)
            return api.sendMessage("⛔ أمر (فتح) هنا خاص بمطوّر البوت فقط.", threadID, messageID);

        if (!(await groupLock.isLocked(threadID)))
            return api.sendMessage("◆ هذه المجموعة غير مقفلة أصلًا.", threadID, messageID);

        await groupLock.unlock(threadID);
        api.sendMessage("🔓 تم فتح المجموعة — الانضمام الطبيعي شغّال من جديد.", threadID, messageID);

        await addLog(threadID, senderID, senderName, "فتح المجموعة");
        return;
    }

    // ══════════════════════════════════════
    //  محظورين — قائمة المحظورين
    // ══════════════════════════════════════
    if (subCommand === "محظورين" || subCommand === "banned") {
        const bannedList = await userData.getLocalBannedList(threadID);

        if (!bannedList || bannedList.length === 0)
            return api.sendMessage("◆ لا يوجد أعضاء محظورون في هذه المجموعة", threadID, messageID);

        let msg = `● قائمة المحظورين (${bannedList.length})\n◇━━━━━━━━━━━━━◇\n\n`;

        for (let i = 0; i < bannedList.length; i++) {
            const ban      = bannedList[i];
            const userName = await getSafeName(api, ban.user_id);
            const date     = ban.banned_at
                ? new Date(ban.banned_at).toLocaleString('ar-SA')
                : "غير محدد";
            msg += `${i + 1}. ${userName}\n`;
            msg += `   ◆ معرف: ${ban.user_id}\n`;
            msg += `   ■ السبب: ${ban.reason || "لا يوجد"}\n`;
            msg += `   ● التاريخ: ${date}\n\n`;
        }

        msg += `◆ لإلغاء الحظر: مجموعة نوبان [معرف أو @منشن]`;
        api.sendMessage(msg, threadID, messageID);
        return;
    }

    // ══════════════════════════════════════
    //  صورة — تغيير صورة المجموعة
    // ══════════════════════════════════════
    if (subCommand === "صورة" || subCommand === "avatar" || subCommand === "image") {
        let imageUrl = null;

        if (messageReply?.attachments?.length > 0) {
            const att = messageReply.attachments[0];
            if (att.type === "photo" || att.type === "animated_image") imageUrl = att.url;
        }
        if (!imageUrl && event.attachments?.length > 0 && event.attachments[0].type === "photo") {
            imageUrl = event.attachments[0].url;
        }

        if (!imageUrl)
            return api.sendMessage("◆ رد على صورة لتغيير صورة المجموعة", threadID, messageID);

        try {
            const stream = (await axios({ url: imageUrl, responseType: 'stream', timeout: 10000 })).data;
            await api.changeGroupImage(stream, threadID);
            api.sendMessage("✔ تم تغيير صورة المجموعة بنجاح", threadID, messageID);
            await addLog(threadID, senderID, senderName, "تغيير الصورة");
        } catch (e) {
            api.sendMessage(`✘ فشل تغيير الصورة: ${e.message}`, threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  اسم — تغيير اسم المجموعة
    // ══════════════════════════════════════
    if (subCommand === "اسم" || subCommand === "name") {
        const newName = args.slice(1).join(" ").trim();
        if (!newName)
            return api.sendMessage("◆ اكتب الاسم الجديد بعد الأمر", threadID, messageID);

        try {
            await api.setTitle(newName, threadID);
            api.sendMessage(`✔ تم تغيير اسم المجموعة إلى: ${newName}`, threadID, messageID);
            await addLog(threadID, senderID, senderName, "تغيير الاسم", null, `الاسم الجديد: ${newName}`);
        } catch {
            api.sendMessage("✘ فشل تغيير الاسم", threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  ايموجي — تغيير إيموجي المجموعة
    // ══════════════════════════════════════
    if (subCommand === "ايموجي" || subCommand === "emoji") {
        const newEmoji = args[1];
        if (!newEmoji)
            return api.sendMessage("◆ اكتب الإيموجي بعد الأمر\nمثال: مجموعة ايموجي 🤖", threadID, messageID);

        try {
            await api.changeThreadEmoji(newEmoji, threadID);
            api.sendMessage(`✔ تم تغيير إيموجي المجموعة إلى: ${newEmoji}`, threadID, messageID);
            await addLog(threadID, senderID, senderName, "تغيير الإيموجي", null, `الإيموجي: ${newEmoji}`);
        } catch {
            api.sendMessage("✘ فشل تغيير الإيموجي", threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  طرد — إخراج عضو من المجموعة
    // ══════════════════════════════════════
    if (subCommand === "طرد" || subCommand === "kick") {
        const { targetID, targetName } = await resolveTarget(api, args, mentions, messageReply);

        if (!targetID)
            return api.sendMessage("◆ منشن العضو أو رد على رسالته أو اكتب معرفه", threadID, messageID);
        if (targetID === api.getCurrentUserID())
            return api.sendMessage("✘ لا يمكنك طرد البوت", threadID, messageID);
        if (await blockIfPeerAdminAttack(api, threadID, senderID, senderName, targetID)) return;
        if (!(await isBotAdmin(api, threadID)))
            return api.sendMessage("✘ البوت نفسه ليس أدمن بهذه المجموعة، فما يقدر يطرد أحد. رفّعه أدمن أولًا.", threadID, messageID);

        try {
            await api.removeUserFromGroup(targetID, threadID);
            api.sendMessage(`● تم طرد ${targetName} من المجموعة`, threadID, messageID);
            await addLog(threadID, senderID, senderName, "طرد", targetName);
        } catch {
            api.sendMessage("✘ فشل الطرد، تأكد من صلاحيات البوت", threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  اضافة — إضافة عضو للمجموعة
    // ══════════════════════════════════════
    if (subCommand === "اضافة" || subCommand === "add") {
        const { targetID, targetName } = await resolveTarget(api, args, mentions, messageReply);

        if (!targetID)
            return api.sendMessage("◆ اكتب معرف المستخدم أو منشنه", threadID, messageID);

        try {
            await api.addUserToGroup(targetID, threadID);
            api.sendMessage(`✔ تم إضافة ${targetName} بنجاح`, threadID, messageID);
            await addLog(threadID, senderID, senderName, "إضافة عضو", targetName);
        } catch {
            api.sendMessage("✘ فشل الإضافة، تأكد من المعرف أو رابط الصداقة", threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  ارفع — ترقية عضو إلى أدمن
    // ══════════════════════════════════════
    if (subCommand === "ارفع" || subCommand === "promote") {
        const { targetID, targetName } = await resolveTarget(api, args, mentions, messageReply);

        if (!targetID)
            return api.sendMessage("◆ منشن العضو أو رد على رسالته أو اكتب معرفه", threadID, messageID);
        if (!(await isBotAdmin(api, threadID)))
            return api.sendMessage("✘ البوت نفسه ليس أدمن بهذه المجموعة، فما يقدر يرفّع حد لأدمن. رفّعه أدمن أولًا.", threadID, messageID);

        try {
            await api.changeAdminStatus(threadID, targetID, true);
            api.sendMessage(`✔ تم رفع ${targetName} إلى أدمن`, threadID, messageID);
            await addLog(threadID, senderID, senderName, "ترقية إلى أدمن", targetName);

            // نُحدّث knownAdmins مباشرة هنا ولا نعتمد فقط على حدث log:thread-admins
            // المرتد من فيسبوك، لأن selfListen:false في الإعدادات يمنع على الأغلب
            // وصول أحداث الإجراءات التي يقوم بها البوت نفسه إلى مستمعه الخاص.
            try {
                const record = await protectionData.getOrCreate(threadID);
                if (record) {
                    const set = new Set(record.knownAdmins || []);
                    set.add(String(targetID));
                    record.knownAdmins = [...set];
                    await protectionData.save(record);
                }
            } catch (e) {}
        } catch {
            api.sendMessage("✘ فشل الترقية", threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  ازالة — تنزيل أدمن
    // ══════════════════════════════════════
    if (subCommand === "ازالة" || subCommand === "demote") {
        const { targetID, targetName } = await resolveTarget(api, args, mentions, messageReply);

        if (!targetID)
            return api.sendMessage("◆ منشن العضو أو رد على رسالته أو اكتب معرفه", threadID, messageID);
        if (await blockIfPeerAdminAttack(api, threadID, senderID, senderName, targetID)) return;
        if (!(await isBotAdmin(api, threadID)))
            return api.sendMessage("✘ البوت نفسه ليس أدمن بهذه المجموعة، فما يقدر ينزّل حد من الأدمن. رفّعه أدمن أولًا.", threadID, messageID);

        try {
            await api.changeAdminStatus(threadID, targetID, false);
            api.sendMessage(`● تم تنزيل ${targetName} من الأدمن`, threadID, messageID);
            await addLog(threadID, senderID, senderName, "تنزيل من الأدمن", targetName);

            try {
                const record = await protectionData.getOrCreate(threadID);
                if (record) {
                    const set = new Set(record.knownAdmins || []);
                    set.delete(String(targetID));
                    record.knownAdmins = [...set];
                    await protectionData.save(record);
                }
            } catch (e) {}
        } catch {
            api.sendMessage("✘ فشل التنزيل", threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  عرض — معلومات المجموعة
    // ══════════════════════════════════════
    if (subCommand === "عرض" || subCommand === "info") {
        try {
            const threadInfo  = await api.getThreadInfo(threadID);
            const bannedCount = (await userData.getLocalBannedList(threadID))?.length || 0;
            const logsCount   = await countLogs(threadID);

            const msg =
`■━━━━━[ معلومات المجموعة ]━━━━━■
│  الاسم: ${threadInfo.name || "بدون اسم"}
│  المعرف: ${threadID}
│  الأعضاء: ${threadInfo.participantIDs?.length || 0}
│  الأدمن: ${threadInfo.adminIDs?.length || 0}
│  المحظورون: ${bannedCount}
│  سجل الأحداث: ${logsCount} حدث (MongoDB)${threadInfo.emoji ? `\n│  الإيموجي: ${threadInfo.emoji}` : ""}
□━━━━━━━━━━━━━━━━━━━━━━━━━━━━□`;

            api.sendMessage(msg, threadID, messageID);
        } catch {
            api.sendMessage("✘ فشل جلب معلومات المجموعة", threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  كنية — تغيير كنية عضو واحد
    // ══════════════════════════════════════
    if (subCommand === "كنية" || subCommand === "nick") {
        let targetID = null;
        let nickname = "";

        if (Object.keys(mentions).length > 0) {
            targetID = Object.keys(mentions)[0];
            nickname = args.slice(1).join(" ").replace(new RegExp(`@${mentions[targetID]}`, 'g'), "").trim();
        } else if (messageReply?.senderID) {
            targetID = messageReply.senderID;
            nickname = args.slice(1).join(" ").trim();
        } else if (args[1] && !isNaN(args[1])) {
            targetID = args[1];
            nickname = args.slice(2).join(" ").trim();
        } else {
            targetID = senderID;
            nickname = args.slice(1).join(" ").trim();
        }

        if (!targetID)
            return api.sendMessage("◆ منشن العضو أو اكتب معرفه", threadID, messageID);

        try {
            await api.changeNickname(nickname, threadID, targetID);
            const targetName = await getSafeName(api, targetID);
            api.sendMessage(
                `✔ ${nickname
                    ? `تم تغيير كنية ${targetName} إلى: ${nickname}`
                    : `تم حذف كنية ${targetName}`}`,
                threadID, messageID
            );
            await addLog(
                threadID, senderID, senderName,
                "تغيير الكنية", targetName,
                nickname ? `إلى: ${nickname}` : "حذف الكنية"
            );
        } catch {
            api.sendMessage("✘ فشل تغيير الكنية", threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  كنية-الكل — للمطور فقط
    // ══════════════════════════════════════
    if (subCommand === "كنية-الكل" || subCommand === "nickall") {
        if (senderID !== DEV_ID)
            return api.sendMessage("⛔ هذا الأمر خاص بالمطور فقط ولا يمكن استخدامه من قِبل غيره", threadID, messageID);

        const pattern = args.slice(1).join(" ").trim();
        if (!pattern)
            return api.sendMessage(
                "◆ اكتب نمط الكنية بعد الأمر\nمثال: مجموعة كنية-الكل ٭ [جنس] ✗ [اسم] ٭\n• كلمة 'اسم' تُستبدل باسم العضو\n• كلمة 'جنس' تُستبدل بـ (مواطن/مواطنة)",
                threadID, messageID
            );

        try {
            const threadInfo = await api.getThreadInfo(threadID);
            const members    = threadInfo.userInfo;
            if (!members || members.length === 0)
                return api.sendMessage("✘ لا يوجد أعضاء لتغيير كنيتهم", threadID, messageID);

            api.sendMessage(`◆ جاري تغيير كنية ${members.length} عضو...`, threadID);

            let successCount = 0;
            let failCount    = 0;

            for (const member of members) {
                let newNickname = pattern;
                const firstName  = member.firstName || member.name?.split(" ")[0] || "عضو";
                const genderTerm = (member.gender === 1 || member.gender === "FEMALE") ? "مواطنة" : "مواطن";
                newNickname = newNickname.replace(/اسم/g, firstName).replace(/جنس/g, genderTerm);

                try {
                    await api.changeNickname(newNickname, threadID, member.id);
                    successCount++;
                    await new Promise(r => setTimeout(r, 500));
                } catch {
                    failCount++;
                }
            }

            api.sendMessage(
                `✔ اكتملت العملية\n◆ نجح: ${successCount}\n◆ فشل: ${failCount}\n◆ الإجمالي: ${members.length}`,
                threadID, messageID
            );
            await addLog(threadID, senderID, senderName, "كنية الكل", null, `النمط: ${pattern} | نجح: ${successCount}`);
        } catch (err) {
            api.sendMessage(`✘ فشل تنفيذ الأمر الجماعي: ${err.message}`, threadID, messageID);
        }
        return;
    }

    // ══════════════════════════════════════
    //  سجل — عرض سجل الأحداث من MongoDB
    // ══════════════════════════════════════
    if (subCommand === "سجل" || subCommand === "log") {
        const logs  = await getLogs(threadID, 20);
        const total = await countLogs(threadID);

        if (!logs || logs.length === 0)
            return api.sendMessage("◆ لا توجد أحداث مسجّلة في هذه المجموعة بعد", threadID, messageID);

        // الأحداث تأتي من الأحدث للأقدم، نعكس للعرض الزمني الصحيح
        const ordered = logs.reverse();

        let msg = `📋 سجل المجموعة\n◇ آخر ${ordered.length} من أصل ${total} حدث\n◇━━━━━━━━━━━━━━━━◇\n\n`;

        for (let i = 0; i < ordered.length; i++) {
            const log  = ordered[i];
            const time = new Date(log.time).toLocaleString('ar-SA');
            msg += `${i + 1}. [${time}]\n`;
            msg += `   ◆ المنفذ: ${log.senderName}`;
            if (log.senderID) msg += ` (${log.senderID})`;
            msg += `\n   ■ الإجراء: ${log.action}`;
            if (log.target) msg += ` ← ${log.target}`;
            if (log.extra)  msg += `\n   ● تفاصيل: ${log.extra}`;
            msg += "\n\n";
        }

        msg += `◆ لمسح السجل كاملاً: مجموعة مسح-سجل`;
        api.sendMessage(msg, threadID, messageID);
        return;
    }

    // ══════════════════════════════════════
    //  مسح-سجل — مسح السجل من MongoDB
    // ══════════════════════════════════════
    if (subCommand === "مسح-سجل" || subCommand === "clearlog") {
        const total = await countLogs(threadID);

        if (total === 0)
            return api.sendMessage("◆ السجل فارغ بالفعل", threadID, messageID);

        const deleted = await clearLogs(threadID);
        api.sendMessage(
            `✔ تم مسح السجل بنجاح من قاعدة البيانات\n◆ عدد الأحداث المحذوفة: ${deleted}`,
            threadID, messageID
        );
        // حدث المسح نفسه يُسجَّل كبداية جديدة
        await addLog(threadID, senderID, senderName, "مسح السجل", null, `تم حذف ${deleted} حدث`);
        return;
    }

    // ══════════════════════════════════════
    //  قائمة الأوامر
    // ══════════════════════════════════════
    const helpMsg =
`◆━━━━━[ إدارة المجموعة ]━━━━━◆
│
│ ■ صورة — تغيير الصورة (رد على صورة)
│ ■ اسم [الاسم] — تغيير اسم المجموعة
│ ■ ايموجي [الإيموجي] — تغيير الإيموجي
│ ■ طرد [@|رد|معرف] — طرد عضو
│ ■ اضافة [@|معرف] — إضافة عضو
│ ■ ارفع [@|رد|معرف] — ترقية إلى أدمن
│ ■ ازالة [@|رد|معرف] — تنزيل من الأدمن
│ ■ عرض — معلومات المجموعة
│ ■ كنية [@|رد|معرف] [الكنية] — كنية عضو
│ ■ بان [@|رد|معرف] [سبب] [مدة بالدقائق] — حظر عضو (0 = دائم)
│ ■ نوبان [@|معرف] — إلغاء الحظر
│ ■ محظورين — قائمة المحظورين
│ ■ سجل — عرض سجل الأحداث (MongoDB)
│ ■ مسح-سجل — مسح السجل كاملاً
│
│ 🔒 كنية-الكل [نمط] — للمطور فقط
│
│ ◆ مثال الكنية الجماعية:
│ مجموعة كنية-الكل ٭ [جنس] ✗ [اسم] ٭
│
◆━━━━━━━━━━━━━━━━━━━━━━━━━━◆`;

    api.sendMessage(helpMsg, threadID, messageID);
};
