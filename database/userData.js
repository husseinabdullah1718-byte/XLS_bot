const mongoose = require('mongoose');
const config = require('../config.json');

const instanceID = config.ADMINBOT && config.ADMINBOT[0] ? config.ADMINBOT[0] : 'default';

// -------------------- User schema --------------------
const userSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    userID: { type: String, required: true },
    name: { type: String, default: 'عضو' },
    isRegistered: { type: Boolean, default: true }, // البوت خاص بمالك واحد فقط، فالتسجيل تلقائي
    money: { type: Number, default: 0 },
    economy: { type: mongoose.Schema.Types.Mixed, default: {} },
    farm: { type: mongoose.Schema.Types.Mixed, default: {} },
    dungeon: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, minimize: false });

userSchema.index({ instanceID: 1, userID: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

// المخطط الحالي لا يحتوي حقل username إطلاقًا، لكن نسخة قديمة من المشروع
// أنشأت فهرسًا فريدًا (unique index) باسم username_1 على نفس الكولكشن (Zotebot.users).
// أي مستخدم جديد الآن يُحفظ بدون username ⇐ MongoDB يعامله كـ null، وبما أن
// الفهرس فريد فإن أول مستخدم جديد فقط ينجح وكل من بعده يفشل بخطأ E11000.
// هذا الفهرس غير مستخدم أصلاً في الكود الحالي، لذا نحذفه تلقائيًا مرة واحدة
// عند كل إقلاع (العملية آمنة تمامًا: لا تؤثر على أي بيانات، فقط تحذف فهرسًا قديمًا).
function dropLegacyUsernameIndex() {
    User.collection.indexes()
        .then((indexes) => {
            if (indexes.some((i) => i.name === 'username_1')) {
                return User.collection.dropIndex('username_1').then(() => {
                    console.log('[userData] ✔ تم حذف الفهرس القديم غير المستخدم (username_1) من كولكشن users.');
                });
            }
        })
        .catch(() => {}); // لا بأس إن كان الفهرس غير موجود أصلاً أو الاتصال لم يجهز بعد
}
if (mongoose.connection.readyState === 1) {
    dropLegacyUsernameIndex();
} else {
    mongoose.connection.once('open', dropLegacyUsernameIndex);
}

// -------------------- Local ban schema (per group) --------------------
const banSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    threadID: { type: String, required: true },
    user_id: { type: String, required: true },
    reason: { type: String, default: 'لا يوجد سبب' },
    banned_by: { type: String },
    banned_at: { type: Number, default: () => Date.now() },
    duration_minutes: { type: Number, default: 0 }, // 0 = حظر دائم (بدون انتهاء)
});

banSchema.index({ instanceID: 1, threadID: 1, user_id: 1 }, { unique: true });

const LocalBan = mongoose.model('LocalBan', banSchema);

module.exports = {
    /**
     * يجلب بيانات مستخدم، وينشئها تلقائيًا إذا لم تكن موجودة.
     */
    get: async (userID, extra = {}) => {
        try {
            let doc = await User.findOne({ instanceID, userID: String(userID) });
            if (!doc) {
                doc = new User({ instanceID, userID: String(userID), ...extra });
                await doc.save();
            }
            return doc.toObject();
        } catch (e) {
            console.error('[userData.get] خطأ:', e.message);
            return { userID: String(userID), isRegistered: true, money: 0, economy: {}, farm: {}, dungeon: {} };
        }
    },

    /**
     * يحدّث (merge) حقول مستخدم معيّن.
     */
    set: async (userID, patch = {}) => {
        try {
            const doc = await User.findOneAndUpdate(
                { instanceID, userID: String(userID) },
                { $set: patch },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            return doc ? doc.toObject() : null;
        } catch (e) {
            console.error('[userData.set] خطأ:', e.message);
            return null;
        }
    },

    // ---------- حظر محلي داخل مجموعة معيّنة ----------
    isLocallyBanned: async (userID, threadID) => {
        try {
            const ban = await LocalBan.findOne({ instanceID, threadID: String(threadID), user_id: String(userID) });
            if (!ban) return false;

            // إن كان الحظر مؤقتًا (duration_minutes > 0) وانتهت مدته، يُفك تلقائيًا
            if (ban.duration_minutes > 0) {
                const expiresAt = ban.banned_at + ban.duration_minutes * 60 * 1000;
                if (Date.now() >= expiresAt) {
                    await LocalBan.deleteOne({ _id: ban._id });
                    return false;
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    },

    localBan: async (userID, threadID, bannedBy, reason, durationMinutes = 0) => {
        try {
            await LocalBan.findOneAndUpdate(
                { instanceID, threadID: String(threadID), user_id: String(userID) },
                { $set: { reason: reason || 'لا يوجد سبب', banned_by: bannedBy, banned_at: Date.now(), duration_minutes: Number(durationMinutes) || 0 } },
                { upsert: true }
            );
            return true;
        } catch (e) {
            console.error('[userData.localBan] خطأ:', e.message);
            return false;
        }
    },

    localUnban: async (userID, threadID) => {
        try {
            await LocalBan.deleteOne({ instanceID, threadID: String(threadID), user_id: String(userID) });
            return true;
        } catch (e) {
            return false;
        }
    },

    getLocalBannedList: async (threadID) => {
        try {
            const list = await LocalBan.find({ instanceID, threadID: String(threadID) }).lean();
            return list;
        } catch (e) {
            return [];
        }
    },
};
