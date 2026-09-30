// ============================================================
//  أمر: صحة   (تشخيص سريع لحالة البوت — خاص بمالك البوت)
//  يعرض: مدة التشغيل، حالة اتصال MongoDB، آخر حدث/رسالة وصلت فعليًا،
//  عدد المجموعات، استهلاك الذاكرة — بدون فتح لوغات Render.
// ============================================================

const mongoose = require('mongoose');
const moment = require('moment-timezone');

const OWNER_ID = "61551379444881";

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const parts = [];
    if (days) parts.push(`${days}ي`);
    if (hours) parts.push(`${hours}س`);
    parts.push(`${mins}د`);
    return parts.join(' ');
}

function getThreadListAsync(api, limit = 100, tags = ['INBOX']) {
    return new Promise((resolve) => {
        try {
            api.getThreadList(limit, null, tags, (err, list) => resolve(err ? [] : list));
        } catch (e) {
            resolve([]);
        }
    });
}

module.exports.config = {
    title: "صحة",
    release: "1.0",
    clearance: 2,
    author: "ZOTE Tracks",
    summary: "تشخيص سريع لحالة البوت (تشغيل، قاعدة البيانات، آخر نشاط، ذاكرة)",
    section: "إدارة البوت",
    syntax: ".صحة",
    delay: 0,
};

module.exports.ZOTERun = async function ({ api, event }) {
    const { senderID, threadID, messageID } = event;
    if (senderID !== OWNER_ID) return api.sendMessage("❌ هذا الأمر خاص بمالك البوت فقط.", threadID, messageID);

    // حالة MongoDB: 0=غير متصل 1=متصل 2=يتصل 3=يفصل
    const dbStates = { 0: '✘ غير متصل', 1: '✔ متصل', 2: '… يتصل', 3: '… يفصل' };
    const dbState = dbStates[mongoose.connection.readyState] || 'غير معروف';

    const uptimeMs = process.uptime() * 1000;
    const mem = process.memoryUsage();
    const memMB = (mem.rss / 1024 / 1024).toFixed(1);

    const lastEvent = global.LAST_EVENT_AT
        ? `${formatDuration(Date.now() - global.LAST_EVENT_AT)} مضت (${moment(global.LAST_EVENT_AT).tz('Africa/Cairo').format('HH:mm')})`
        : 'لا يوجد بعد منذ الإقلاع';

    const groups = await getThreadListAsync(api, 100, ['INBOX']);
    const myID = api.getCurrentUserID();
    const realGroupCount = groups.filter((t) => t.isGroup && Array.isArray(t.participantIDs) && t.participantIDs.includes(myID)).length;

    const body =
        `◆━━━━[ صحة البوت ]━━━━◆\n\n` +
        `⏱ مدة التشغيل: ${formatDuration(uptimeMs)}\n` +
        `🗄 قاعدة البيانات: ${dbState}\n` +
        `📡 آخر حدث وصل: ${lastEvent}\n` +
        `👥 عدد المجموعات: ${realGroupCount}\n` +
        `⚙️ عدد الأوامر المحمّلة: ${Zote.client.commands.size}\n` +
        `💾 الذاكرة المستخدمة: ${memMB} MB\n\n` +
        `○━━━━━━━━━━━━━━━━━━━━━━○`;

    return api.sendMessage(body, threadID, messageID);
};
