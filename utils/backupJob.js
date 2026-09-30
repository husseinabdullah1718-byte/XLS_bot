// ============================================================
//  utils/backupJob.js
//  نسخ احتياطي دوري (كل 6 ساعات) لإعدادات البوت المهمة — حماية
//  المجموعات، الحظر، القفل — لمستودع بوت الاستعادة B عبر GitHub.
//  حماية إضافية منفصلة عن appstate: لو انفقدت بيانات MongoDB (تلف/
//  حذف بالخطأ)، توجد نسخة خارجية حديثة يمكن الرجوع لها يدويًا.
//
//  لا يُنسخ: طلبات الصداقة المعلّقة ونشاط DM — بيانات لحظية متغيّرة
//  باستمرار، مو إعدادات فعلية يستاهل حفظها.
//
//  اختياري تمامًا: لو BACKUP_GITHUB_TOKEN غير مضبوط بمتغيرات البيئة،
//  runBackup() تتجاوز صامتة بدون أي تأثير على عمل البوت.
// ============================================================

const mongoose = require('mongoose');
const logger = require('./logger.js');
const backupRemote = require('./backupRemote.js');

const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // كل 6 ساعات
const BACKUP_PATH = 'backups/bot-a-settings.json';
const MODELS_TO_BACKUP = ['BannedGroup', 'GlobalBan', 'BotSettings', 'Protection', 'GroupLock'];

async function collectSnapshot() {
    const snapshot = { generatedAt: new Date().toISOString() };
    for (const name of MODELS_TO_BACKUP) {
        try {
            const Model = mongoose.models[name];
            snapshot[name] = Model ? await Model.find({}).lean() : [];
        } catch (e) {
            snapshot[name] = { error: e.message };
        }
    }
    return snapshot;
}

async function runBackup() {
    try {
        const snapshot = await collectSnapshot();
        const result = await backupRemote.pushBackup(BACKUP_PATH, snapshot);

        if (result.skipped) {
            global.LAST_BACKUP = { at: Date.now(), status: 'skipped', detail: 'BACKUP_GITHUB_TOKEN غير مضبوط' };
            return global.LAST_BACKUP;
        }

        logger.info(`✔ نسخة احتياطية أُرسلت لمستودع بوت الاستعادة (commit: ${(result.commitSha || '').slice(0, 7)}).`);
        global.LAST_BACKUP = { at: Date.now(), status: 'success', commitSha: result.commitSha };
        return global.LAST_BACKUP;
    } catch (e) {
        logger.warn(`⚠️ فشلت النسخة الاحتياطية الدورية: ${e.message}`);
        global.LAST_BACKUP = { at: Date.now(), status: 'error', detail: e.response?.data?.message || e.message };
        return global.LAST_BACKUP;
    }
}

/** تبدأ الجدولة: أول نسخة بعد 5 دقايق من الإقلاع، ثم كل 6 ساعات */
function startBackupSchedule() {
    setTimeout(() => {
        runBackup();
        setInterval(runBackup, BACKUP_INTERVAL_MS);
    }, 5 * 60 * 1000);
}

module.exports = { startBackupSchedule, runBackup };
