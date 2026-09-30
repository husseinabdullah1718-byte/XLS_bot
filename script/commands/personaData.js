// ============================================================
//  personaData.js — حالة "شخصية الذكاء الاصطناعي" التفاعلية لكل مجموعة
//  (أمر .شخصية / .شخصية توقف) — منفصل تمامًا عن أمر "ai" الفردي.
// ============================================================

const mongoose = require('mongoose');
const config = require('../config.json');

const instanceID = config.ADMINBOT && config.ADMINBOT[0] ? config.ADMINBOT[0] : 'default';

const personaSchema = new mongoose.Schema({
    instanceID: { type: String, required: true, index: true },
    threadID: { type: String, required: true },
    active: { type: Boolean, default: false },
    startedBy: { type: String, default: null },
    startedAt: { type: Number, default: null },
}, { timestamps: true });

personaSchema.index({ instanceID: 1, threadID: 1 }, { unique: true });

const Persona = mongoose.models.Persona || mongoose.model('Persona', personaSchema);

module.exports = {
    isActive: async (threadID) => {
        try {
            const doc = await Persona.findOne({ instanceID, threadID: String(threadID) });
            return !!doc?.active;
        } catch (e) {
            return false;
        }
    },

    activate: async (threadID, startedBy) => {
        try {
            await Persona.findOneAndUpdate(
                { instanceID, threadID: String(threadID) },
                { $set: { active: true, startedBy, startedAt: Date.now() } },
                { upsert: true }
            );
            return true;
        } catch (e) {
            console.error('[personaData.activate] خطأ:', e.message);
            return false;
        }
    },

    deactivate: async (threadID) => {
        try {
            await Persona.findOneAndUpdate(
                { instanceID, threadID: String(threadID) },
                { $set: { active: false } },
                { upsert: true }
            );
            return true;
        } catch (e) {
            console.error('[personaData.deactivate] خطأ:', e.message);
            return false;
        }
    },
};
