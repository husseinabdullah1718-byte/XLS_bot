const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const protectionData = require('../../database/protectionData.js');

// نُسجّل خطًا عربيًا مُضمَّنًا مع المشروع صراحة، حتى لا يعتمد رسم نص
// الترحيب على وجود خط عربي مثبَّت على نظام الاستضافة (Render قد لا
// يملك خطوطًا عربية افتراضيًا، فيظهر النص متقطعًا أو فارغًا بدون هذا).
try {
    registerFont(path.join(__dirname, '../../assets/fonts/NotoSansArabic.ttf'), {
        family: 'Noto Sans Arabic',
        weight: 'bold',
    });
} catch (e) {
    console.error('[ترحيب] تعذّر تحميل خط الترحيب العربي:', e.message);
}
const config = require('../../config.json');
const protectionCmd = require('../commands/حماية.js');
const groupLock = require('../../database/groupLock.js');

const OWNER_ID = (config.ADMINBOT && config.ADMINBOT[0]) || null;

// هل هذا الشخص أدمن بالمجموعة، أو مالك البوت، أو ضمن القائمة البيضاء؟
async function isExempt(api, threadID, userID, record) {
    if (userID === api.getCurrentUserID()) return true; // البوت نفسه معفى دائمًا (طرد عبر أوامر البوت = طرد شرعي)
    if (OWNER_ID && userID === OWNER_ID) return true;
    if (record?.whitelist?.includes(String(userID))) return true;
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        return (threadInfo.adminIDs || []).some((a) => a.id === userID);
    } catch (e) {
        return false;
    }
}

module.exports.config = {
    name: "احداث",
    version: "2.1.0", 
    hasPermssion: 1,
    credits: "Rako San",
    description: "إرسال رسالة ترحيب مع صورة عند انضمام عضو جديد، وإشعارات للأحداث الأخرى.",
    commandCategory: "الادمــــن",
    usages: "on/off",
    cooldowns: 5,
};

module.exports.ZOTEEvent = async function({ api, event }) {
    const { logMessageType, logMessageData, author, threadID } = event;
    const botID = api.getCurrentUserID();

    if (author === botID) return;

    try {
        switch (logMessageType) {
            case "log:subscribe":
                if (logMessageData.addedParticipants.some(p => p.userFbId === botID)) {
                    try {
                        await api.changeNickname(`❴ . ❵ • ℳ𝒾𝓇𝓇ℴ𝓇 ℬℴ𝓉`, threadID, botID);
                    } catch (e) {
                        console.error("فشل تغيير الكنية:", e);
                    }
                    api.sendMessage("عمتكم وصلت •-•", threadID);
                    return;
                }

                // قفل المجموعة (مجموعة قفل): يمنع أي إضافة عدا من مالك البوت —
                // له أولوية على كل الفحوصات التالية (بوت مزيّف / حماية الإضافة)
                {
                    const locked = await groupLock.isLocked(threadID);
                    if (locked && String(author) !== String(OWNER_ID)) {
                        // نتحقق فعليًا إن البوت أدمن هنا قبل الادعاء بأي حماية —
                        // بدونه الطرد يفشل صامتًا والرسالة تكذب بقولها "تمت الإزالة".
                        const threadInfo = await api.getThreadInfo(threadID).catch(() => null);
                        const botIsAdmin = threadInfo && (threadInfo.adminIDs || []).some((a) => a.id === botID);

                        if (!botIsAdmin) {
                            api.sendMessage('⚠️ هذه المجموعة مقفلة، بس البوت نفسه مو أدمن هنا فما يقدر يطرد العضو المُضاف فعليًا. رفّع البوت أدمن حتى يشتغل القفل فعلًا.', threadID);
                            return;
                        }

                        let removed = 0;
                        for (const participant of logMessageData.addedParticipants) {
                            try {
                                await api.removeUserFromGroup(participant.userFbId, threadID);
                                removed++;
                            } catch (e) {
                                console.error('[قفل-المجموعة] تعذّر طرد عضو مُضاف لمجموعة مقفلة:', e.message);
                            }
                        }
                        if (removed === logMessageData.addedParticipants.length) {
                            api.sendMessage('🔒 هذه المجموعة مقفلة — تمت إزالة العضو المُضاف تلقائيًا.', threadID);
                        } else {
                            api.sendMessage(`⚠️ هذه المجموعة مقفلة، بس نجح الطرد لـ ${removed} من ${logMessageData.addedParticipants.length} فقط — تحقّق يدويًا.`, threadID);
                        }
                        return;
                    }
                }

                // حماية البوتات: إزالة أي حساب مُضاف يبدو أنه بوت (بالاسم)
                {
                    const record = await protectionData.getOrCreate(threadID);
                    if (record?.enabled?.bot) {
                        const botNameHints = ['bot', 'بوت', 'chatbot', 'gpt', 'openai'];
                        let removedAny = false;
                        for (const participant of logMessageData.addedParticipants) {
                            const name = (participant.fullName || '').toLowerCase();
                            if (botNameHints.some((h) => name.includes(h))) {
                                try {
                                    await api.removeUserFromGroup(participant.userFbId, threadID);
                                    removedAny = true;
                                } catch (e) {}
                            }
                        }
                        if (removedAny) {
                            await protectionCmd.punishMember({ api, threadID, userID: author, key: 'bot' });
                            return;
                        }
                    }
                }

                // حماية الإضافة: إذا كان مفعّلاً ولم يكن المضيف أدمن/مالك/بالقائمة البيضاء، يُطرد المُضافون
                {
                    const record = await protectionData.getOrCreate(threadID);
                    if (record?.enabled?.add) {
                        const authorExempt = await isExempt(api, threadID, author, record);
                        if (!authorExempt) {
                            for (const participant of logMessageData.addedParticipants) {
                                try {
                                    await api.removeUserFromGroup(participant.userFbId, threadID);
                                } catch (e) {
                                    console.error('[حماية] تعذّر طرد عضو مُضاف بدون صلاحية:', e.message);
                                }
                            }
                            await protectionCmd.punishMember({ api, threadID, userID: author, key: 'add' });
                            return;
                        }
                    }
                }

                for (const participant of logMessageData.addedParticipants) {
                    const { userFbId, fullName } = participant;
                    const threadInfo = await api.getThreadInfo(threadID);

                    try {
                        const bgPath = path.join(__dirname, '../../assets/welcome-bg.jpg');
                        const avatarURL = `https://graph.facebook.com/${userFbId}/picture?width=720&height=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

                        const [background, avatar] = await Promise.all([
                            loadImage(bgPath),
                            loadImage(avatarURL).catch(() => null),
                        ]);

                        const W = 1280, H = 720; // نحجّم الخلفية (4K أصلاً) لحجم مناسب للإرسال في ماسنجر
                        const canvas = createCanvas(W, H);
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(background, 0, 0, W, H);

                        if (avatar) {
                            const cx = W / 2, cy = H / 2, r = 130; // صورة الحساب في منتصف الصورة تمامًا
                            ctx.save();
                            ctx.beginPath();
                            ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
                            ctx.fillStyle = '#ffffff';
                            ctx.fill();
                            ctx.beginPath();
                            ctx.arc(cx, cy, r, 0, Math.PI * 2);
                            ctx.closePath();
                            ctx.clip();
                            ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
                            ctx.restore();
                        }

                        // اسم العضو أسفل الصورة، بخط عريض وحدّ أسود لضمان وضوحه
                        ctx.textAlign = 'center';
                        ctx.font = 'bold 48px "Noto Sans Arabic"';
                        ctx.lineWidth = 6;
                        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                        ctx.strokeText(fullName, W / 2, H - 60);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(fullName, W / 2, H - 60);

                        const imagePath = path.join(__dirname, 'cache', `welcome-${userFbId}.png`);
                        fs.ensureDirSync(path.join(__dirname, 'cache'));
                        fs.writeFileSync(imagePath, canvas.toBuffer());

                        const msg = {
                            body: `أهلاً بك يا ${fullName} في المجموعة! 🌌\nأنت العضو رقم ${threadInfo.participantIDs.length}`,
                            attachment: fs.createReadStream(imagePath),
                        };
                        api.sendMessage(msg, threadID, () => fs.unlink(imagePath).catch(() => {}));
                    } catch (e) {
                        console.error('[ترحيب] تعذّر إنشاء صورة الترحيب:', e.message);
                        api.sendMessage(`أهلاً بك يا ${fullName} في المجموعة! 🌌`, threadID);
                    }
                }
                break;

            
            case "log:unsubscribe":
                const leftParticipantId = logMessageData.leftParticipantFbId;

                // طُرد البوت نفسه: لا يمكن التصرف داخل المجموعة، فقط إشعار المالك في الخاص
                if (leftParticipantId === botID) {
                    if (OWNER_ID) {
                        try {
                            const threadInfo = await api.getThreadInfo(threadID).catch(() => null);
                            const gName = threadInfo?.threadName || threadID;
                            api.sendMessage(`⚠️ تم إخراج البوت من المجموعة: ${gName}`, OWNER_ID);
                        } catch (e) {}
                    }
                    break;
                }

                // حماية الأدمن من أدمن آخر: إن كان المطرود أدمن معروفًا، والذي طرده
                // ليس المالك أو البوت، نعيده ونعيد له صلاحية الأدمن، وننزع صلاحية
                // الأدمن ممن طرده كعقاب — بغض النظر عن كون الطارد أدمن أيضًا
                // (خلافًا لحماية المغادرة العادية التي تُعفي أي أدمن).
                if (author && String(author) !== String(leftParticipantId)) {
                    const adminRecord = await protectionData.getOrCreate(threadID);
                    const wasKnownAdmin = (adminRecord?.knownAdmins || []).includes(String(leftParticipantId));
                    console.log(
                        `[حماية-أدمن][تشخيص] threadID=${threadID} المطرود=${leftParticipantId} الطارد=${author} ` +
                        `enabled.admin=${adminRecord?.enabled?.admin} wasKnownAdmin=${wasKnownAdmin} ` +
                        `knownAdmins=${JSON.stringify(adminRecord?.knownAdmins || [])}`
                    );
                    if (adminRecord?.enabled?.admin && wasKnownAdmin) {
                        const attackerExempt = (OWNER_ID && String(author) === String(OWNER_ID))
                            || String(author) === String(botID)
                            || (adminRecord.whitelist || []).includes(String(author));

                        if (!attackerExempt) {
                            let restored = false;
                            try {
                                await api.addUserToGroup(leftParticipantId, threadID);
                                await api.changeAdminStatus(threadID, leftParticipantId, true);
                                restored = true;
                            } catch (e) {
                                console.error('[حماية] تعذّر استعادة الأدمن المطرود:', e.message);
                            }
                            try { await api.changeAdminStatus(threadID, author, false); } catch (e) {}

                            const set = new Set(adminRecord.knownAdmins || []);
                            set.delete(String(author));
                            await protectionData.save(adminRecord);

                            const attackerName = await api.getUserInfo(author).then(i => i[author]?.name).catch(() => 'العضو');
                            api.sendMessage(
                                restored
                                    ? `♻️ تم طرد أدمن من طرف أدمن آخر — تمت إعادته وإعادة صلاحيته، ونُزعت صلاحية الأدمن من ${attackerName} كعقاب.`
                                    : `⚠️ نُزعت صلاحية الأدمن من ${attackerName}، لكن تعذّرت استعادة العضو المطرود تلقائيًا (قد تمنع إعدادات خصوصيته الإضافة الفورية).`,
                                threadID
                            );
                            break;
                        }
                    }
                }

                // حماية المغادرة: أي مغادرة طوعية تُعاد دائمًا بلا استثناء — حتى
                // لو كان المغادر أدمن أو مالك البوت نفسه. أما الطرد من طرف شخص آخر
                // فيُعاد صاحبه فقط إذا لم يكن الطارد جهة مصرّحة (بوت/أدمن/مالك).
                {
                    const record = await protectionData.getOrCreate(threadID);
                    if (record?.enabled?.leave) {
                        const selfLeft = !author || String(author) === String(leftParticipantId);

                        if (selfLeft) {
                            let restored = false;
                            try {
                                await api.addUserToGroup(leftParticipantId, threadID);
                                restored = true;
                            } catch (e) {
                                console.error('[حماية] تعذّر إعادة العضو المغادر:', e.message);
                            }
                            api.sendMessage(
                                restored
                                    ? '♻️ تمت إعادة العضو تلقائيًا. مغادرة المجموعة غير مسموحة إلا بطرد من الإدارة.'
                                    : '⚠️ تعذّر إعادة العضو تلقائيًا بعد مغادرته. قد يمنع فيسبوك الإضافة الفورية، أو تمنعها إعدادات خصوصيته. جرّب إضافته يدويًا لاحقًا إذا لزم الأمر.',
                                threadID
                            );
                            break;
                        }

                        // طُرد من طرف شخص آخر: نعيده فقط إن لم يكن الطارد جهة مصرّحة (بوت/أدمن/مالك)
                        const authorExempt = await isExempt(api, threadID, author, record);
                        if (!authorExempt) {
                            let restored = false;
                            try {
                                await api.addUserToGroup(leftParticipantId, threadID);
                                restored = true;
                            } catch (e) {
                                console.error('[حماية] تعذّر إعادة العضو المطرود:', e.message);
                            }
                            await protectionCmd.punishMember({ api, threadID, userID: author, key: 'leave' });
                            api.sendMessage(
                                restored
                                    ? '♻️ تمت إعادة العضو إلى المجموعة.'
                                    : '⚠️ تعذّر إعادة العضو تلقائيًا. قد يمنع فيسبوك الإضافة الفورية بعد الإزالة كإجراء أمني، أو أن إعدادات خصوصية العضو تمنع ذلك. جرّب إضافته يدويًا لاحقًا إذا لزم الأمر.',
                                threadID
                            );
                            break;
                        }
                        // وإلا: طرد شرعي من بوت/أدمن/مالك — لا نعيد العضو
                    }
                }

                try {
                    const userInfo = await api.getUserInfo(leftParticipantId);
                    const userName = userInfo[leftParticipantId].name;
                    api.sendMessage(`وداعًا ${userName}، لقد غادر/ت المجموعة.`, threadID);
                } catch (e) {
                    api.sendMessage("أحد الأعضاء غادر المجموعة.", threadID);
                }
                break;

            case "log:thread-admins":
                const targetID = logMessageData.TARGET_ID;
                const adminAction = logMessageData.ADMIN_EVENT;
                try {
                    const adminRecord = await protectionData.getOrCreate(threadID);
                    const userInfo = await api.getUserInfo(targetID);
                    const userName = userInfo[targetID].name;

                    if (adminAction === "add_admin") {
                        if (adminRecord) {
                            const set = new Set(adminRecord.knownAdmins || []);
                            set.add(String(targetID));
                            adminRecord.knownAdmins = [...set];
                            await protectionData.save(adminRecord);
                        }
                        if (adminRecord?.enabled?.admin) {
                            api.sendMessage(`◈ ¦ إشعار: تمت ترقية ${userName} ليصبح مشرفًا.`, threadID);
                        }
                        break;
                    }

                    if (adminAction === "remove_admin") {
                        if (adminRecord?.enabled?.admin) {
                            const removerExempt = await isExempt(api, threadID, author, adminRecord);
                            if (!removerExempt && String(author) !== String(targetID)) {
                                // أدمن حاول نزع صلاحية أدمن آخر: نعيد الصلاحية للضحية، وننزعها من المهاجم عقابًا
                                let restored = false;
                                try {
                                    await api.changeAdminStatus(threadID, targetID, true);
                                    restored = true;
                                } catch (e) {
                                    console.error('[حماية] تعذّر إعادة صلاحية الأدمن:', e.message);
                                }
                                try { await api.changeAdminStatus(threadID, author, false); } catch (e) {}

                                const set = new Set(adminRecord.knownAdmins || []);
                                set.delete(String(author));
                                adminRecord.knownAdmins = [...set];
                                await protectionData.save(adminRecord);

                                const attackerName = await api.getUserInfo(author).then(i => i[author]?.name).catch(() => 'العضو');
                                api.sendMessage(
                                    restored
                                        ? `♻️ تمت استعادة صلاحية الأدمن لـ ${userName}، وتم نزع صلاحية الأدمن من ${attackerName} كعقاب على محاولة نزعها عن أدمن آخر.`
                                        : `⚠️ تم نزع صلاحية الأدمن من ${attackerName}، لكن تعذّرت استعادة صلاحية ${userName} تلقائيًا.`,
                                    threadID
                                );
                                break;
                            }
                        }
                        if (adminRecord) {
                            const set = new Set(adminRecord.knownAdmins || []);
                            set.delete(String(targetID));
                            adminRecord.knownAdmins = [...set];
                            await protectionData.save(adminRecord);
                        }
                        if (adminRecord?.enabled?.admin) {
                            api.sendMessage(`◈ ¦ إشعار: تمت إزالة ${userName} من الإشراف.`, threadID);
                        }
                    }
                } catch (e) {
                    api.sendMessage("تم تحديث قائمة المشرفين.", threadID);
                }
                break;

            case "log:thread-name": {
                const record = await protectionData.get(threadID);
                if (record?.enabled?.name && record.oldName) {
                    const authorExempt = await isExempt(api, threadID, author, record);
                    if (!authorExempt) {
                        try { await api.setTitle(record.oldName, threadID); } catch (e) {}
                        await protectionCmd.punishMember({ api, threadID, userID: author, key: 'name' });
                        break;
                    }
                }
                if (record) {
                    record.oldName = logMessageData.name || record.oldName;
                    await protectionData.save(record);
                }
                break;
            }

            case "log:thread-icon": {
                const record = await protectionData.get(threadID);
                if (record?.enabled?.emoji && record.oldEmoji) {
                    const authorExempt = await isExempt(api, threadID, author, record);
                    if (!authorExempt) {
                        try { await api.changeThreadEmoji(record.oldEmoji, threadID); } catch (e) {}
                        await protectionCmd.punishMember({ api, threadID, userID: author, key: 'emoji' });
                        break;
                    }
                }
                if (record) {
                    record.oldEmoji = logMessageData.thread_icon || record.oldEmoji;
                    await protectionData.save(record);
                }
                break;
            }

            case "log:thread-color": {
                const record = await protectionData.get(threadID);
                const newColor = logMessageData.theme_color || logMessageData.new_theme_id || null;
                if (record?.enabled?.color && record.oldColor) {
                    const authorExempt = await isExempt(api, threadID, author, record);
                    if (!authorExempt) {
                        try { await api.changeThreadColor(record.oldColor, threadID); } catch (e) {}
                        await protectionCmd.punishMember({ api, threadID, userID: author, key: 'color' });
                        break;
                    }
                }
                if (record) {
                    record.oldColor = newColor || record.oldColor;
                    await protectionData.save(record);
                }
                break;
            }

            case "log:thread-image": {
                const record = await protectionData.get(threadID);
                if (record?.enabled?.photo && record.oldImage) {
                    const authorExempt = await isExempt(api, threadID, author, record);
                    if (!authorExempt) {
                        try {
                            const response = await axios.get(record.oldImage, { responseType: 'stream' });
                            await api.changeGroupImage(response.data, threadID);
                        } catch (e) {
                            console.error('[حماية] تعذّر إرجاع صورة المجموعة:', e.message);
                        }
                        await protectionCmd.punishMember({ api, threadID, userID: author, key: 'photo' });
                        break;
                    }
                }
                if (record) {
                    try {
                        const threadInfo = await api.getThreadInfo(threadID);
                        record.oldImage = threadInfo.imageSrc || record.oldImage;
                        await protectionData.save(record);
                    } catch (e) {}
                }
                break;
            }

            case "log:user-nickname": {
                const record = await protectionData.get(threadID);
                const targetUserID = logMessageData.participant_id;
                const newNickname = logMessageData.nickname || '';
                if (record?.enabled?.nickname) {
                    const authorExempt = await isExempt(api, threadID, author, record);
                    if (!authorExempt) {
                        const oldNick = record.nicknames?.get(String(targetUserID)) || '';
                        try { await api.changeNickname(oldNick, threadID, targetUserID); } catch (e) {}
                        await protectionCmd.punishMember({ api, threadID, userID: author, key: 'nickname' });
                        break;
                    }
                }
                if (record) {
                    record.nicknames.set(String(targetUserID), newNickname);
                    await protectionData.save(record);
                }
                break;
            }
        }
    } catch (error) {
        console.error("حدث خطأ في معالجة الحدث:", error);
    }
};

module.exports.ZOTERun = async function({ api, event }) {
    api.sendMessage("هذا الأمر يعمل تلقائيًا مع أحداث المجموعة. لا حاجة لتفعيله يدويًا.", event.threadID, event.messageID);
};
