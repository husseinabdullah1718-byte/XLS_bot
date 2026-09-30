// ============================================================
//  dmGuard.js — بيانات حارس الرسائل الفردية (الخاصة)
//  البوت مخصص لمجموعات ماسنجر فقط. عند وصول رسالة خاصة فردية:
//  - أول مرة من نفس الشخص: يُرسَل تنبيه ثم تُحذف المحادثة.
//  - أي مرة لاحقة من نفس الشخص: تُحذف المحادثة بصمت بدون أي رد جديد.
//  كل حالة تُسجَّل في سجل نشاط يُحتفَظ به لآخر 24 ساعة فقط.
// ============================================================

const mongoose = require('mongoose');
const config = require('../config.json');

const instanceID = config.ADMINBOT && config.ADMINBOT[0] ? config.ADMINBOT[0] : 'default';

// -------------------- من سبق إشعاره --------------------
const dmContactSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    userID: { type: String, required: true },
    notified_at: { type: Number, default: () => Date.now() },
});
dmContactSchema.index({ instanceID: 1, userID: 1 }, { unique: true });
const DmContact = mongoose.models.DmContact || mongoose.model('DmContact', dmContactSchema);

// -------------------- سجل النشاط (آخر 24 ساعة) --------------------
const dmActivitySchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    userID: { type: String, required: true },
    action: { type: String, required: true }, // 'notified_and_deleted' | 'deleted_silent'
    at: { type: Number, default: () => Date.now(), index: true },
});
const DmActivity = mongoose.models.DmActivity || mongoose.model('DmActivity', dmActivitySchema);

module.exports = {
    wasNotified: async (userID) => {
        try {
            return !!(await DmContact.findOne({ instanceID, userID: String(userID) }));
        } catch (e) {
            return false;
        }
    },

    markNotified: async (userID) => {
        try {
            await DmContact.findOneAndUpdate(
                { instanceID, userID: String(userID) },
                { $setOnInsert: { notified_at: Date.now() } },
                { upsert: true }
            );
        } catch (e) {}
    },

    logActivity: async (userID, action) => {
        try {
            await DmActivity.create({ instanceID, userID: String(userID), action });
        } catch (e) {}
    },

    getRecentActivity: async (hours = 24) => {
        const since = Date.now() - hours * 60 * 60 * 1000;
        try {
            return await DmActivity.find({ instanceID, at: { $gte: since } }).sort({ at: -1 }).lean();
        } catch (e) {
            return [];
        }
    },

    // يحذف سجلات النشاط الأقدم من 24 ساعة حتى لا تتراكم الكولكشن بلا حدود
    pruneOldActivity: async (hours = 24) => {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        try {
            await DmActivity.deleteMany({ instanceID, at: { $lt: cutoff } });
        } catch (e) {}
    },
};
