// ============================================================
//  أمر: تجربة   (خاص بمالك البوت فقط — clearance: 2)
//  اختبار ذاتي شامل: يستدعي كل أمر محمّل في البوت (وكل أمر فرعي مذكور
//  صراحة داخل حقل syntax الخاص به، إن أمكن استخراجه تلقائيًا)، ويرصد
//  أي أمر يتعطل (يرمي خطأ) عند التنفيذ.
//
//  مهم جدًا: لحماية مجموعاتك ومستخدميك الحقيقيين أثناء الاختبار، كل
//  استدعاءات فيسبوك ذات الأثر الفعلي (حظر/طرد/مغادرة/تغيير صورة أو بايو
//  البوت/بث جماعي...) تُعترَض ولا تُنفَّذ فعليًا — فقط يُسجَّل أنها
//  "استُدعيت"، ثم تُرجَع نتيجة وهمية ناجحة حتى يكمل كود الأمر مساره
//  الطبيعي دون أن يتضرر أي شيء حقيقي. عمليات قاعدة البيانات (مثل نظام
//  الاقتصاد) تُترك كما هي لأنها ليست إجراءات مدمّرة تجاه فيسبوك.
// ============================================================

const OWNER_ID = "61551379444881";
const PER_CALL_TIMEOUT_MS = 8000;
const MAX_SUBCOMMANDS_PER_TEST = 15;

// طرق fca التي قد تُحدث أثرًا فعليًا وحقيقيًا على فيسبوك/المجموعات —
// هذه فقط تُحاكى ولا تُنفَّذ أثناء الاختبار
const MOCKED_METHODS = new Set([
    'sendMessage', 'unsendMessage', 'removeUserFromGroup', 'addUserToGroup',
    'changeAdminStatus', 'changeGroupImage', 'changeNickname', 'setTitle',
    'createPoll', 'deleteThread', 'changeArchivedStatus', 'muteThread',
    'handleMessageRequest', 'changeAvatar', 'changeBio', 'changeBlockedStatus',
    'handleFriendRequest', 'unfriend', 'setPostReaction', 'createNewGroup',
    'createThemeAI', 'changeThreadColor', 'changeThreadEmoji', 'logout',
]);

// كلمات شائعة داخل الأقواس في syntax لكنها ليست أوامر فرعية حقيقية
// (نص توضيحي/عنصر نائب وليس خيارًا من قائمة)
const PLACEHOLDER_WORDS = new Set([
    'منشن', 'رد', 'ايدي', 'uid', 'اسم', 'نص', 'رسالة', 'رسالتك', 'سبب',
    'مدة', 'رقم', 'وصف', 'صورة',
]);

function createSandboxApi(realApi, calls) {
    return new Proxy(realApi, {
        get(target, prop) {
            if (typeof prop === 'string' && MOCKED_METHODS.has(prop)) {
                return (...args) => {
                    calls.push(prop);
                    return Promise.resolve({ mocked: true });
                };
            }
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

// استخراج تقريبي (best-effort) لأسماء الأوامر الفرعية من نص syntax الخاص
// بالأمر. يعتمد فقط على أقواس تحتوي فاصلًا (| أو /) يدل على قائمة خيارات
// حقيقية؛ نص بلا فاصل (مثل "[رسالتك]") يُتجاهل لأنه غالبًا عنصر نائب.
function extractSubcommands(syntaxText) {
    if (!syntaxText || typeof syntaxText !== 'string') return [];
    const brackets = syntaxText.match(/\[([^\]]+)\]/g) || [];
    const tokens = new Set();
    for (const b of brackets) {
        const inner = b.slice(1, -1);
        if (!/[|/]/.test(inner)) continue;
        inner.split(/[|/]/).forEach((t) => {
            const clean = t.trim();
            if (clean && !clean.includes(' ') && clean.length <= 20 && !PLACEHOLDER_WORDS.has(clean)) {
                tokens.add(clean);
            }
        });
    }
    return [...tokens].slice(0, MAX_SUBCOMMANDS_PER_TEST);
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`⏱️ تجاوز الوقت المسموح (${ms / 1000} ث)`)), ms)),
    ]);
}

module.exports.config = {
    title:   "تجربة",
    release: "1.0.0",
    clearance: 2, // خاص بمالك البوت فقط
    author:  "ZOTE Tracks",
    summary: "اختبار ذاتي آمن لكل أوامر البوت دفعة واحدة (بدون تنفيذ فعلي لأي إجراء مدمّر)",
    section: "الادمــــن",
    syntax:  "تجربة",
    delay:   5,
};

// كلمات أوامر فرعية تُنفَّذ فورًا بلا أي وسيط إضافي وتُحدث تغييرًا حقيقيًا
// واسع الأثر (على البوت كاملًا أو مجموعة بأكملها، وليس فقط حساب المطوّر
// الشخصي) — هذه لا تُختبَر فعليًا أبدًا مهما كان الأمر الذي تنتمي إليه.
// (اكتُشفت الحاجة لهذه القائمة بعد حادثة فعلية: اختبار "ايقاف" عطّل
// استجابة البوت الحقيقية للجميع عدا المطوّر، واختبار "مسح-سجل" محا سجل
// حماية مجموعة حقيقي، لأن كليهما لا يتطلب أي وسيط إضافي ليعمل.)
const UNSAFE_SUBCOMMANDS = new Set([
    'تشغيل', 'ايقاف', 'إيقاف', 'مسح-سجل', 'مسح', 'حذف', 'تصفير', 'reset', 'clearlog',
]);

module.exports.ZOTERun = async function ({ api, event, userData, config }) {
    const { threadID, messageID, senderID } = event;

    if (senderID !== OWNER_ID) return; // حماية إضافية، رغم أن clearance:2 يكفي أصلًا

    const uniqueCommands = [...new Set(Zote.client.commands.values())]
        .filter((c) => c.config?.title && c.config.title !== "تجربة");

    await api.sendMessage(
        `⏳ جاري اختبار ${uniqueCommands.length} أمر (بدون تنفيذ أي إجراء فعلي مدمّر)... قد يستغرق هذا دقيقة أو أكثر.`,
        threadID, messageID
    );

    // نجلب بيانات مستخدم حقيقية (نفس ما يحصل عليه أي أمر عند تشغيله فعليًا)
    let user = null;
    try { user = await userData.get(senderID, { name: 'المطوّر' }); } catch (e) {}

    const results = [];

    for (const cmd of uniqueCommands) {
        const title = cmd.config.title;
        const calls = [];
        const sandboxApi = createSandboxApi(api, calls);
        const subcommands = extractSubcommands(cmd.config.syntax);
        const argSets = subcommands.length ? subcommands.map((s) => [s]) : [[]];

        const errors = [];
        let skipped = 0;
        for (const args of argSets) {
            if (UNSAFE_SUBCOMMANDS.has(args[0])) {
                skipped++;
                continue;
            }

            const fakeEvent = {
                threadID, messageID, senderID,
                body: `.${title} ${args.join(' ')}`.trim(),
                mentions: {},
                attachments: [],
                messageReply: null,
                isGroup: true,
                type: 'message',
            };

            try {
                if (typeof cmd.ZOTERun !== 'function') throw new Error('ZOTERun غير موجود أو ليس دالة');
                await withTimeout(
                    cmd.ZOTERun({ api: sandboxApi, event: fakeEvent, args, userData, config, user }),
                    PER_CALL_TIMEOUT_MS
                );
            } catch (e) {
                errors.push(`[${args[0] || 'بدون وسائط'}] ${e.message || e}`);
            }
        }

        results.push({ title, tested: argSets.length - skipped, skipped, errors, mockedCalls: calls.length });
        await new Promise((r) => setTimeout(r, 300)); // تهدئة بسيطة بين كل أمر وآخر لتفادي تقييد أي API خارجي مشترك (imgur/pinimg وغيرها)
    }

    const failed = results.filter((r) => r.errors.length > 0);
    const passed = results.filter((r) => r.errors.length === 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

    let report = `◆━━━━[ نتيجة اختبار الأوامر ]━━━━◆\n`;
    report += `■ الإجمالي: ${results.length} | ✔ نجح: ${passed.length} | ✘ به أخطاء: ${failed.length}\n`;
    if (totalSkipped) report += `■ تم تخطي ${totalSkipped} أمر فرعي حساس/غير قابل للتراجع (لم يُختبَر فعليًا)\n`;
    report += `\n`;

    if (failed.length) {
        report += `الأوامر التي واجهت خطأ:\n`;
        for (const f of failed) {
            report += `\n• ${f.title} (${f.errors.length}/${f.tested} فشل):\n`;
            for (const err of f.errors.slice(0, 3)) report += `   - ${err}\n`;
            if (f.errors.length > 3) report += `   ... و ${f.errors.length - 3} أخطاء أخرى\n`;
        }
    } else {
        report += `✔ كل الأوامر عملت بدون أي خطأ في المسار المُختبَر.`;
    }

    return api.sendMessage(report.trim(), threadID, messageID);
};
