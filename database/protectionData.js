const mongoose = require('mongoose');
const config = require('../config.json');

const instanceID = config.ADMINBOT && config.ADMINBOT[0] ? config.ADMINBOT[0] : 'default';

const protectionSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    threadID: { type: String, required: true },
    enabled: {
        photo:    { type: Boolean, default: false },
        name:     { type: Boolean, default: false },
        add:      { type: Boolean, default: false },
        admin:    { type: Boolean, default: false },
        nickname: { type: Boolean, default: false },
        leave:    { type: Boolean, default: false },
        bot:      { type: Boolean, default: false },
        link:     { type: Boolean, default: false },
        spam:     { type: Boolean, default: false },
        mention:  { type: Boolean, default: false },
        emoji:    { type: Boolean, default: false },
        color:    { type: Boolean, default: false },
        offensive:{ type: Boolean, default: false }
    },
    warns:     { type: Map, of: Number, default: {} },
    whitelist: { type: [String], default: [] },
    knownAdmins: { type: [String], default: [] }, // آخر لقطة معروفة لقائمة الأدمنز، لحماية أدمن-ضد-أدمن
    nicknames: { type: Map, of: String, default: {} },
    logs: [{
        text: String,
        time: Number
    }],
    oldName:  { type: String, default: "Group" },
    oldEmoji: { type: String, default: "👍" },
    oldColor: { type: String, default: null },
    oldImage: { type: String, default: null }
}, { timestamps: true });

protectionSchema.index({ instanceID: 1, threadID: 1 }, { unique: true });

const Protection = mongoose.model('Protection', protectionSchema);

module.exports = {
    get: async (threadID) => {
        try {
            return await Protection.findOne({ instanceID, threadID: String(threadID) });
        } catch (e) {
            return null;
        }
    },
    create: async (threadID, info) => {
        try {
            const doc = new Protection({
                instanceID,
                threadID: String(threadID),
                oldName:  info.threadName || "Group",
                oldEmoji: info.emoji || "👍",
                oldColor: info.threadTheme?.id || null,
                oldImage: info.imageSrc || null
            });
            await doc.save();
            return doc;
        } catch (e) {
            console.error("[حماية] خطأ في إنشاء السجل:", e);
            return null;
        }
    },
    save: async (doc) => {
        try {
            await doc.save();
            return true;
        } catch (e) {
            console.error("[حماية] خطأ في الحفظ:", e);
            return false;
        }
    },

    // يجلب سجل المجموعة، وينشئه تلقائيًا إن لم يكن موجودًا
    getOrCreate: async (threadID, threadInfo = {}) => {
        try {
            let record = await Protection.findOne({ instanceID, threadID: String(threadID) });
            if (record) return record;
            record = new Protection({
                instanceID,
                threadID: String(threadID),
                oldName: threadInfo.threadName || 'Group',
                oldEmoji: threadInfo.emoji || '👍',
                oldColor: threadInfo.threadTheme?.id || null,
                oldImage: threadInfo.imageSrc || null,
            });
            await record.save();
            return record;
        } catch (e) {
            console.error('[حماية] خطأ في getOrCreate:', e.message);
            return null;
        }
    },

    // يزيد عدد التحذيرات لعضو معيّن ويعيد العدد الجديد
    addWarn: async (threadID, userID) => {
        try {
            const record = await module.exports.getOrCreate(threadID);
            if (!record) return null;
            const current = record.warns.get(String(userID)) || 0;
            const next = current + 1;
            record.warns.set(String(userID), next);
            await record.save();
            return next;
        } catch (e) {
            console.error('[حماية] خطأ في addWarn:', e.message);
            return null;
        }
    },

    resetWarn: async (threadID, userID) => {
        try {
            const record = await module.exports.getOrCreate(threadID);
            if (!record) return false;
            record.warns.delete(String(userID));
            await record.save();
            return true;
        } catch (e) {
            console.error('[حماية] خطأ في resetWarn:', e.message);
            return false;
        }
    },

    // يضيف سطرًا لسجل أحداث الحماية (آخر 100 حدث فقط)
    addLog: async (threadID, text) => {
        try {
            const record = await module.exports.getOrCreate(threadID);
            if (!record) return false;
            record.logs.push({ text, time: Date.now() });
            if (record.logs.length > 100) record.logs.shift();
            await record.save();
            return true;
        } catch (e) {
            console.error('[حماية] خطأ في addLog:', e.message);
            return false;
        }
    },

    clearLogs: async (threadID) => {
        try {
            const record = await module.exports.getOrCreate(threadID);
            if (!record) return false;
            record.logs = [];
            await record.save();
            return true;
        } catch (e) {
            console.error('[حماية] خطأ في clearLogs:', e.message);
            return false;
        }
    },
};
