// ============================================================
//  نظام كشف الرسائل المحذوفة (تسجيل.js)
//  - يخزّن الرسائل مؤقتًا (48 ساعة) فقط لغرض كشف الحذف
//  - يُحذف كل شيء تلقائيًا بعد انتهاء المدة (TTL index)
//  - لا يوجد أرشيف دائم لكل محادثة كل عضو
// ============================================================

const mongoose = require('mongoose');
const config = require('../config.json');

const instanceID = config.ADMINBOT && config.ADMINBOT[0] ? config.ADMINBOT[0] : 'default';

// مدة الاحتفاظ بالرسائل المؤقتة قبل حذفها تلقائيًا (بالثواني) = 48 ساعة
const RETENTION_SECONDS = 60 * 60 * 48;

// -------------------- إعدادات كل مجموعة (تشغيل/إيقاف) --------------------
const groupSettingSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    threadID: { type: String, required: true },
    enabled: { type: Boolean, default: false },
}, { timestamps: true });

groupSettingSchema.index({ instanceID: 1, threadID: 1 }, { unique: true });

const GroupSetting = mongoose.model('DeletionGroupSetting', groupSettingSchema);

// -------------------- الرسائل المؤقتة (تُمسح تلقائيًا بعد المدة) --------------------
const cachedMessageSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    threadID: { type: String, required: true, index: true },
    messageID: { type: String, required: true, index: true },
    senderID: { type: String, required: true },
    senderName: { type: String, default: 'عضو' },
    body: { type: String, default: '' },
    attachments: [{
        type: { type: String },
        url: { type: String },
    }],
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, expires: RETENTION_SECONDS },
});

cachedMessageSchema.index({ instanceID: 1, threadID: 1, messageID: 1 }, { unique: true });

const CachedMessage = mongoose.model('DeletionCachedMessage', cachedMessageSchema);

// -------------------- إعداد البث الفوري (توجيه الرسائل الجديدة لحظيًا لمجموعات مختارة) --------------------
const liveForwardSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, unique: true },
    destinationThreadIDs: [{ type: String }], // مصفوفة من معرّفات المجموعات الوجهة
    enabled: { type: Boolean, default: false },
}, { timestamps: true });

const LiveForward = mongoose.model('DeletionLiveForward', liveForwardSchema);

module.exports = {
    /** هل نظام الكشف مفعّل في هذه المجموعة؟ */
    isEnabled: async (threadID) => {
        try {
            const doc = await GroupSetting.findOne({ instanceID, threadID: String(threadID) });
            return !!(doc && doc.enabled);
        } catch (e) {
            console.error('[تسجيل] خطأ في التحقق من الحالة:', e.message);
            return false;
        }
    },

    /** تشغيل أو إيقاف النظام لمجموعة معيّنة */
    setEnabled: async (threadID, value) => {
        try {
            await GroupSetting.findOneAndUpdate(
                { instanceID, threadID: String(threadID) },
                { $set: { enabled: !!value } },
                { upsert: true }
            );
            return true;
        } catch (e) {
            console.error('[تسجيل] خطأ في تحديث الحالة:', e.message);
            return false;
        }
    },

    /** تخزين رسالة مؤقتًا (بغرض كشف الحذف فقط) */
    cacheMessage: async ({ threadID, messageID, senderID, senderName, body, attachments }) => {
        try {
            await CachedMessage.findOneAndUpdate(
                { instanceID, threadID: String(threadID), messageID: String(messageID) },
                {
                    $setOnInsert: {
                        instanceID,
                        threadID: String(threadID),
                        messageID: String(messageID),
                        senderID: String(senderID),
                        senderName: senderName || 'عضو',
                        body: body || '',
                        attachments: Array.isArray(attachments) ? attachments : [],
                        createdAt: new Date(),
                    },
                },
                { upsert: true }
            );
            return true;
        } catch (e) {
            console.error('[تسجيل] خطأ في تخزين الرسالة مؤقتًا:', e.message);
            return false;
        }
    },

    /** يُستدعى عند وصول حدث حذف (unsend)؛ يُعلّم الرسالة كمحذوفة ويُعيدها */
    markDeletedAndGet: async (threadID, messageID) => {
        try {
            const doc = await CachedMessage.findOneAndUpdate(
                { instanceID, threadID: String(threadID), messageID: String(messageID) },
                { $set: { deleted: true, deletedAt: new Date() } },
                { new: true }
            );
            return doc;
        } catch (e) {
            console.error('[تسجيل] خطأ في تعليم الرسالة كمحذوفة:', e.message);
            return null;
        }
    },

    /** يجلب آخر رسالة محذوفة لعضو معيّن داخل مجموعة معيّنة (خلال فترة الاحتفاظ) */
    getLastDeletedBySender: async (threadID, senderID) => {
        try {
            const doc = await CachedMessage.findOne({
                instanceID,
                threadID: String(threadID),
                senderID: String(senderID),
                deleted: true,
            }).sort({ deletedAt: -1 });
            return doc;
        } catch (e) {
            console.error('[تسجيل] خطأ في جلب آخر رسالة محذوفة:', e.message);
            return null;
        }
    },

    /** يجلب آخر الرسائل المخزّنة مؤقتًا في مجموعة معيّنة (الأحدث أولًا) — للمراقبة عن بعد */
    getRecentMessages: async (threadID, limit = 20) => {
        try {
            const docs = await CachedMessage.find({
                instanceID,
                threadID: String(threadID),
            }).sort({ createdAt: -1 }).limit(Math.min(Math.max(limit, 1), 100));
            return docs;
        } catch (e) {
            console.error('[تسجيل] خطأ في جلب الرسائل الأخيرة:', e.message);
            return [];
        }
    },

    /** يجلب قائمة معرّفات كل المجموعات التي فُعّل فيها نظام التسجيل حاليًا */
    getEnabledThreadIDs: async () => {
        try {
            const docs = await GroupSetting.find({ instanceID, enabled: true }, { threadID: 1, _id: 0 });
            return docs.map((d) => d.threadID);
        } catch (e) {
            console.error('[تسجيل] خطأ في جلب المجموعات المفعّلة:', e.message);
            return [];
        }
    },

    /** تفعيل البث الفوري: إرسال الرسائل الجديدة لهذه المجموعات (مصفوفة) */
    setLiveForwardTargets: async (threadIDs) => {
        try {
            const normalized = Array.isArray(threadIDs)
                ? threadIDs.map((id) => String(id))
                : [String(threadIDs)];
            await LiveForward.findOneAndUpdate(
                { instanceID },
                { $set: { destinationThreadIDs: normalized, enabled: true } },
                { upsert: true }
            );
            return true;
        } catch (e) {
            console.error('[تسجيل] خطأ في تفعيل البث الفوري:', e.message);
            return false;
        }
    },

    /** إيقاف البث الفوري بالكامل */
    disableLiveForward: async () => {
        try {
            await LiveForward.findOneAndUpdate(
                { instanceID },
                { $set: { enabled: false, destinationThreadIDs: [] } },
                { upsert: true }
            );
            return true;
        } catch (e) {
            console.error('[تسجيل] خطأ في إيقاف البث الفوري:', e.message);
            return false;
        }
    },

    /** يجلب قائمة المجموعات الوجهة الحالية (أو مصفوفة فارغة إن كان غير مفعّل) */
    getLiveForwardTargets: async () => {
        try {
            const doc = await LiveForward.findOne({ instanceID, enabled: true });
            return (doc && Array.isArray(doc.destinationThreadIDs)) ? doc.destinationThreadIDs : [];
        } catch (e) {
            console.error('[تسجيل] خطأ في جلب إعدادات البث الفوري:', e.message);
            return [];
        }
    },
};
