// ============================================================
//  groupData.js — بيانات إدارة البوت على مستوى المطوّر
//  (حظر مجموعات، حظر عام لمستخدمين، تشغيل/إيقاف البوت، طلبات الصداقة المعلّقة)
//  كل هذا خاص بأمر "ادارة" فقط، منفصل تمامًا عن حظر "مجموعة" المحلي.
// ============================================================

const mongoose = require('mongoose');
const config = require('../config.json');

const instanceID = config.ADMINBOT && config.ADMINBOT[0] ? config.ADMINBOT[0] : 'default';

// -------------------- حظر مجموعة كاملة --------------------
const bannedGroupSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    threadID: { type: String, required: true },
    reason: { type: String, default: 'لا يوجد سبب' },
    banned_by: { type: String },
    banned_at: { type: Number, default: () => Date.now() },
});
bannedGroupSchema.index({ instanceID: 1, threadID: 1 }, { unique: true });
const BannedGroup = mongoose.models.BannedGroup || mongoose.model('BannedGroup', bannedGroupSchema);

// -------------------- حظر عام لمستخدم (في كل المجموعات) --------------------
const globalBanSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    user_id: { type: String, required: true },
    reason: { type: String, default: 'لا يوجد سبب' },
    banned_by: { type: String },
    banned_at: { type: Number, default: () => Date.now() },
});
globalBanSchema.index({ instanceID: 1, user_id: 1 }, { unique: true });
const GlobalBan = mongoose.models.GlobalBan || mongoose.model('GlobalBan', globalBanSchema);

// -------------------- إعدادات البوت (تشغيل/إيقاف، تأخير الردود) --------------------
const botSettingsSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    delayEnabled: { type: Boolean, default: false },
});
const BotSettings = mongoose.models.BotSettings || mongoose.model('BotSettings', botSettingsSchema);

// -------------------- طلبات صداقة معلّقة (تُجمع من أحداث MQTT الواردة) --------------------
const friendRequestSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    user_id: { type: String, required: true },
    received_at: { type: Number, default: () => Date.now() },
});
friendRequestSchema.index({ instanceID: 1, user_id: 1 }, { unique: true });
const PendingFriendRequest = mongoose.models.PendingFriendRequest || mongoose.model('PendingFriendRequest', friendRequestSchema);

module.exports = {
    // ---------- حظر مجموعة كاملة ----------
    isGroupBanned: async (threadID) => {
        try {
            const g = await BannedGroup.findOne({ instanceID, threadID: String(threadID) });
            return !!g;
        } catch (e) {
            return false;
        }
    },
    banGroup: async (threadID, bannedBy, reason) => {
        await BannedGroup.findOneAndUpdate(
            { instanceID, threadID: String(threadID) },
            { $set: { reason: reason || 'لا يوجد سبب', banned_by: bannedBy, banned_at: Date.now() } },
            { upsert: true }
        );
    },
    unbanGroup: async (threadID) => {
        await BannedGroup.deleteOne({ instanceID, threadID: String(threadID) });
    },
    getBannedGroups: async () => {
        return BannedGroup.find({ instanceID }).lean();
    },

    // ---------- حظر عام لمستخدم ----------
    isGloballyBanned: async (userID) => {
        try {
            const b = await GlobalBan.findOne({ instanceID, user_id: String(userID) });
            return !!b;
        } catch (e) {
            return false;
        }
    },
    globalBan: async (userID, bannedBy, reason) => {
        await GlobalBan.findOneAndUpdate(
            { instanceID, user_id: String(userID) },
            { $set: { reason: reason || 'لا يوجد سبب', banned_by: bannedBy, banned_at: Date.now() } },
            { upsert: true }
        );
    },
    globalUnban: async (userID) => {
        await GlobalBan.deleteOne({ instanceID, user_id: String(userID) });
    },

    // ---------- تشغيل/إيقاف البوت ----------
    isBotEnabled: async () => {
        try {
            const s = await BotSettings.findOne({ instanceID });
            return !s || s.enabled !== false; // افتراضيًا: مفعّل
        } catch (e) {
            return true; // في حال فشل الاتصال بقاعدة البيانات، لا نوقف البوت احتياطًا
        }
    },
    setBotEnabled: async (enabled) => {
        await BotSettings.findOneAndUpdate(
            { instanceID },
            { $set: { enabled: !!enabled } },
            { upsert: true }
        );
    },

    // ---------- تأخير الردود (رسالة واحدة كل 10 ثوانٍ، على كل المجموعات) ----------
    isDelayEnabled: async () => {
        try {
            const s = await BotSettings.findOne({ instanceID });
            return !!s?.delayEnabled; // افتراضيًا: غير مفعّل
        } catch (e) {
            return false;
        }
    },
    setDelayEnabled: async (enabled) => {
        await BotSettings.findOneAndUpdate(
            { instanceID },
            { $set: { delayEnabled: !!enabled } },
            { upsert: true }
        );
    },

    // ---------- طلبات الصداقة المعلّقة ----------
    addPendingFriendRequest: async (userID) => {
        try {
            await PendingFriendRequest.findOneAndUpdate(
                { instanceID, user_id: String(userID) },
                { $setOnInsert: { received_at: Date.now() } },
                { upsert: true }
            );
        } catch (e) {}
    },
    removePendingFriendRequest: async (userID) => {
        try {
            await PendingFriendRequest.deleteOne({ instanceID, user_id: String(userID) });
        } catch (e) {}
    },
    getPendingFriendRequests: async () => {
        return PendingFriendRequest.find({ instanceID }).sort({ received_at: 1 }).lean();
    },
};
