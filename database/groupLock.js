// ============================================================
//  database/groupLock.js
//  تخزين المجموعات "المقفلة" — أي مجموعة هنا، أي عضو يُضاف لها
//  (غير مالك البوت) يُطرد تلقائيًا فور انضمامه (راجع
//  script/events/events.js). يُدار عبر أمر "مجموعة قفل/فتح".
// ============================================================

const mongoose = require('mongoose');
const config = require('../config.json');

const instanceID = config.ADMINBOT && config.ADMINBOT[0] ? config.ADMINBOT[0] : 'default';

const lockSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    threadID: { type: String, required: true },
    locked_by: { type: String },
    locked_at: { type: Number, default: () => Date.now() },
});
lockSchema.index({ instanceID: 1, threadID: 1 }, { unique: true });

const GroupLock = mongoose.models.GroupLock || mongoose.model('GroupLock', lockSchema);

module.exports = {
    isLocked: async (threadID) => {
        try {
            return !!(await GroupLock.findOne({ instanceID, threadID: String(threadID) }));
        } catch (e) {
            console.error('[قفل-المجموعة] خطأ بالتحقق:', e.message);
            return false;
        }
    },
    lock: async (threadID, by) => {
        await GroupLock.findOneAndUpdate(
            { instanceID, threadID: String(threadID) },
            { $set: { locked_by: by, locked_at: Date.now() } },
            { upsert: true }
        );
    },
    unlock: async (threadID) => {
        await GroupLock.deleteOne({ instanceID, threadID: String(threadID) });
    },
};
