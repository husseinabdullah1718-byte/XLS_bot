// ============================================================
//  أمر: انا   (خاص بمالك البوت فقط — clearance: 2)
//  يعرض سجل آخر 24 ساعة من "حارس الرسائل الفردية": كل شخص راسل البوت
//  بشكل فردي (خاص) بدل مجموعة، وهل أُرسل له تنبيه وحُذفت محادثته، أو
//  حُذفت بصمت لأنه سبق تنبيهه من قبل.
//  الحماية الفعلية (الرد + الحذف التلقائي) تعمل تلقائيًا من داخل
//  handle/messageHandler.js على كل رسالة خاصة واردة، بدون الحاجة لكتابة
//  هذا الأمر إطلاقًا — هذا الأمر فقط لعرض التقرير.
// ============================================================

const dmGuard = require('../../database/dmGuard.js');

module.exports.config = {
    title:   "انا",
    release: "1.0.0",
    clearance: 2, // خاص بمالك البوت فقط
    author:  "ZOTE Tracks",
    summary: "تقرير آخر 24 ساعة من حماية الرسائل الفردية (تنبيه/حذف المحادثات الخاصة)",
    section: "الادمــــن",
    syntax:  "انا",
    delay:   3,
};

module.exports.ZOTERun = async function ({ api, event }) {
    const { threadID, messageID } = event;

    await dmGuard.pruneOldActivity(24);
    const activity = await dmGuard.getRecentActivity(24);

    if (!activity.length) {
        return api.sendMessage(
            "◆ لا يوجد أي نشاط مسجَّل لحارس الرسائل الفردية خلال آخر 24 ساعة.",
            threadID, messageID
        );
    }

    const RLM = '\u200F';
    const notifiedCount = activity.filter((a) => a.action === 'notified_and_deleted').length;
    const silentCount = activity.filter((a) => a.action === 'deleted_silent').length;
    const uniqueUsers = new Set(activity.map((a) => a.userID)).size;

    let report = `${RLM}◆━━━━[ حارس الرسائل الفردية — 24 ساعة ]━━━━◆\n`;
    report += `${RLM}■ الإجمالي: ${activity.length} | أشخاص فريدون: ${uniqueUsers}\n`;
    report += `${RLM}■ تنبيه + حذف (أول تواصل): ${notifiedCount}\n`;
    report += `${RLM}■ حذف صامت (تواصل متكرر): ${silentCount}\n\n`;

    const shown = activity.slice(0, 20);
    for (const entry of shown) {
        let name = 'مستخدم';
        try {
            const info = await api.getUserInfo(entry.userID);
            name = info?.[entry.userID]?.name || 'مستخدم';
        } catch (e) {}
        const minutesAgo = Math.floor((Date.now() - entry.at) / 60000);
        const actionText = entry.action === 'notified_and_deleted' ? 'تنبيه + حذف' : 'حذف صامت';
        report += `${RLM}• ${name} — ${actionText} (منذ ${minutesAgo} د)\n`;
    }
    if (activity.length > shown.length) {
        report += `${RLM}\n... و ${activity.length - shown.length} حالة أخرى`;
    }

    return api.sendMessage(report.trim(), threadID, messageID);
};
