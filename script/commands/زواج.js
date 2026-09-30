/**
 * أمر: زواج — نظام زواج/طلاق تفاعلي بين أعضاء المجموعة (للتسلية فقط)
 * -------------------------------------------------------------
 * .زواج (بالرد على رسالة الشخص)   → إرسال طلب زواج له
 * .زواج طلاق                      → الطلاق من الشريك الحالي
 * .زواج حالة                      → عرض حالتك الحالية (متزوج/أعزب)
 *
 * عند إرسال الطلب، يرد البوت برسالة والشخص المستهدف فقط يقدر يرد عليها
 * بكلمة "قبول" أو "رفض" (نفس أسلوب ZOTEReply المستخدم بأمر اغنية).
 */

const deco = require("../../utils/decorations");
const userData = require("../../database/userData");

module.exports.config = {
    title: "زواج",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "نظام زواج وطلاق تفاعلي بين الأعضاء (للتسلية فقط)",
    section: "عـــامـة",
    syntax: "زواج [طلاق|حالة] — أو رد على رسالة شخص بـ .زواج لطلب الزواج منه",
    delay: 5,
};

async function getSafeName(api, userID) {
    try {
        const info = await api.getUserInfo(userID);
        return info?.[userID]?.name || "عضو";
    } catch (e) {
        return "عضو";
    }
}

module.exports.ZOTERun = async function ({ api, event, args, user }) {
    const { threadID, messageID, senderID, messageReply } = event;
    const sub = (args[0] || "").toLowerCase();

    // -------------------- حالة --------------------
    if (sub === "حالة" || sub === "status") {
        const marriage = user?.marriage;
        if (!marriage || !marriage.partnerID) {
            return api.sendMessage(deco.line("أنت أعزب حاليًا 💔"), threadID, messageID);
        }
        const since = new Date(marriage.since).toLocaleDateString("ar-EG");
        return api.sendMessage(
            deco.line(`أنت متزوج من ${marriage.partnerName} 💍\nمنذ: ${since}`),
            threadID, messageID
        );
    }

    // -------------------- طلاق --------------------
    if (sub === "طلاق" || sub === "divorce") {
        const marriage = user?.marriage;
        if (!marriage || !marriage.partnerID) {
            return api.sendMessage(deco.error("أنت لست متزوجًا أصلاً!"), threadID, messageID);
        }
        const partnerID = marriage.partnerID;
        const partnerName = marriage.partnerName;

        await userData.set(senderID, { marriage: {} });
        await userData.set(partnerID, { marriage: {} });

        return api.sendMessage(
            deco.line(`💔 تم الطلاق بينك وبين ${partnerName}.`),
            threadID, messageID
        );
    }

    // -------------------- طلب زواج (رد على رسالة الشخص) --------------------
    if (!messageReply || !messageReply.senderID) {
        return api.sendMessage(
            "• طريقة الاستخدام:\n" +
            ".زواج (بالرد على رسالة الشخص) : لطلب الزواج منه\n" +
            ".زواج طلاق : للانفصال عن شريكك الحالي\n" +
            ".زواج حالة : لعرض حالتك",
            threadID, messageID
        );
    }

    const targetID = messageReply.senderID;

    if (targetID === senderID) {
        return api.sendMessage(deco.error("ما بتقدر تتزوج حالك 😂"), threadID, messageID);
    }
    if (targetID === api.getCurrentUserID()) {
        return api.sendMessage(deco.error("البوت مش متاح للزواج 🤖"), threadID, messageID);
    }

    if (user?.marriage?.partnerID) {
        return api.sendMessage(deco.error("أنت متزوج أصلاً! اعمل .زواج طلاق أول."), threadID, messageID);
    }

    const targetUser = await userData.get(targetID);
    if (targetUser?.marriage?.partnerID) {
        return api.sendMessage(deco.error("هذا الشخص متزوج أصلاً!"), threadID, messageID);
    }

    const proposerName = await getSafeName(api, senderID);
    const targetName = await getSafeName(api, targetID);

    return api.sendMessage(
        deco.line(`💍 ${proposerName} طلب/طلبت الزواج من ${targetName}!\n\n` +
            `يا ${targetName}، رد على هذه الرسالة بكلمة "قبول" أو "رفض".`),
        threadID,
        (err, info) => {
            if (err) return;
            Zote.client.ZOTEReply.push({
                name: this.config.title,
                messageID: info.messageID,
                author: targetID, // فقط الشخص المطلوب زواجه يقدر يرد
                proposerID: senderID,
                proposerName,
                targetName,
            });
        },
        messageID
    );
};

module.exports.ZOTEReply = async function ({ event, api, ZOTEReply }) {
    const { threadID, messageID, senderID, body } = event;
    const { author, proposerID, proposerName, targetName } = ZOTEReply;

    if (senderID !== author) return; // بس الشخص المطلوب يقدر يرد

    const answer = (body || "").trim();

    if (answer === "قبول" || answer.toLowerCase() === "accept") {
        // تأكيد عدم وجود زواج سابق لأي الطرفين لحظة القبول (تحسبًا لتغيّر الحالة بالفترة الفاصلة)
        const proposer = await userData.get(proposerID);
        const target = await userData.get(senderID);

        if (proposer?.marriage?.partnerID || target?.marriage?.partnerID) {
            return api.sendMessage(deco.error("للأسف أحد الطرفين أصبح متزوجًا بالفترة الفاصلة، الطلب أُلغي."), threadID, messageID);
        }

        const now = Date.now();
        await userData.set(proposerID, { marriage: { partnerID: senderID, partnerName: targetName, since: now } });
        await userData.set(senderID, { marriage: { partnerID: proposerID, partnerName: proposerName, since: now } });

        return api.sendMessage(deco.line(`🎉 مبروك! ${proposerName} و ${targetName} أصبحا زوجين رسميًا 💍`), threadID, messageID);
    }

    if (answer === "رفض" || answer.toLowerCase() === "reject") {
        return api.sendMessage(deco.line(`💔 ${targetName} رفض/رفضت طلب الزواج.`), threadID, messageID);
    }

    // أي رد آخر يُتجاهل بصمت (ما نطفّي الميزة، ممكن يكون الشخص يحكي شي ثاني)
};
