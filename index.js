// ============================================================
//  ZOTE-BOT — نقطة الدخول الرئيسية
//  كود مفتوح بالكامل، بدون أي تعتيم أو اتصال خفي بأي طرف ثالث.
// ============================================================

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const mongoose = require('mongoose');
const express = require('express');
const login = require('@dongdev/fca-unofficial');
const axios = require('axios');

const config = require('./config.json');
const logger = require('./utils/logger.js');
const { handleEvent } = require('./handle/messageHandler.js');
const { startBackupSchedule } = require('./utils/backupJob.js');

// ------------------------------------------------------------
// 0) شبكة أمان عامة — بدون هذا، أي Promise مرفوضة بدون معالجة
//    (نسيان await/.catch في أي مكان من ~44 ملف أوامر) تُسقط العملية
//    بأكملها فورًا على Node 18 (هذا سلوك افتراضي في Node منذ الإصدار 15).
//    هذا على الأرجح السبب الرئيسي لأي توقف/تعطل "مفاجئ" غير مرتبط
//    بالكوكيز أو الجلسة.
// ------------------------------------------------------------
// ------------------------------------------------------------
// 0.5) تنبيه استباقي — لو تكررت الأخطاء غير المعالجة بفترة قصيرة،
//      هذا مؤشر محتمل إن الجلسة بدأت تتدهور قبل ما تموت كليًا.
//      نرسل تحذير لصاحب البوت مباشرة (طالما لسا نقدر نرسل رسائل).
// ------------------------------------------------------------
let recentErrorTimestamps = [];
const ERROR_ALERT_THRESHOLD = 5;      // عدد أخطاء
const ERROR_ALERT_WINDOW_MS = 10 * 60 * 1000;  // خلال ١٠ دقايق
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;      // لا نكرر التنبيه أكثر من مرة بالساعة
let lastAlertSentAt = 0;

async function maybeAlertOwner() {
    const now = Date.now();
    recentErrorTimestamps.push(now);
    recentErrorTimestamps = recentErrorTimestamps.filter((t) => now - t < ERROR_ALERT_WINDOW_MS);

    if (recentErrorTimestamps.length < ERROR_ALERT_THRESHOLD) return;
    if (now - lastAlertSentAt < ALERT_COOLDOWN_MS) return;

    const alertUrl = config.BOT_B_ALERT_URL;
    if (!alertUrl) return; // غير مضبوط بعد — تجاوز صامت

    lastAlertSentAt = now;
    try {
        await axios.post(alertUrl, {
            secret: config.ALERT_SECRET,
            message: `صار ${recentErrorTimestamps.length} أخطاء غير معالجة خلال آخر 10 دقايق ببوت A. ` +
                `ممكن الجلسة بدأت تتدهور — جهّز appstate جديد عبر بوت الاستعادة لو استمر الوضع.`,
        }, { timeout: 10000 });
    } catch (e) {
        logger.error('✘ فشل إرسال التنبيه عبر بوت الاستعادة (تحقق من BOT_B_ALERT_URL وإن بوت B شغّال):', e.message);
    }
}

process.on('unhandledRejection', (reason) => {
    logger.error('✘ Promise مرفوضة بدون معالجة (unhandledRejection) — تم تجاهلها ومتابعة العمل:');
    console.error(reason);
    maybeAlertOwner().catch(() => {});
});

process.on('uncaughtException', (err) => {
    logger.error('✘ خطأ غير متوقع (uncaughtException):');
    console.error(err);
    // نخرج بأمان بدل الاستمرار في حالة قد تكون غير مستقرة؛ start.js
    // سيعيد تشغيل العملية خلال ثوانٍ فيبقى التعطل غير ملحوظ تقريبًا.
    process.exit(1);
});

// ------------------------------------------------------------
// 1) كائن الحالة العام Zote.client
//    (نفس الواجهة التي تتوقعها ملفات الأوامر: config.title / ZOTERun ...)
// ------------------------------------------------------------
global.Zote = {
    client: {
        commands: new Map(),      // كل الأوامر، مفهرسة بالاسم (title) وبالأسماء المستعارة
        events: new Map(),        // أحداث المجموعة (انضمام، مغادرة...)
        ZOTEReply: [],           // قائمة انتظار الردود التفاعلية
        ZOTEReaction: [],        // قائمة انتظار تفاعلات الإيموجي
        activeGames: new Map(),
        activeRaids: new Map(),
        config,
    },
};

// ------------------------------------------------------------
// 2) تحميل الأوامر من script/commands
// ------------------------------------------------------------
function loadCommands() {
    const dir = path.join(__dirname, 'script', 'commands');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    let loaded = 0;

    for (const file of files) {
        try {
            delete require.cache[require.resolve(path.join(dir, file))];
            const command = require(path.join(dir, file));
            if (!command.config || !command.ZOTERun) {
                logger.warn(`[تحميل] تم تجاهل ${file} (لا يحتوي على config أو ZOTERun)`);
                continue;
            }
            const title = command.config.title?.toLowerCase();
            if (!title) continue;

            Zote.client.commands.set(title, command);
            if (Array.isArray(command.config.aliases)) {
                for (const alias of command.config.aliases) {
                    Zote.client.commands.set(alias.toLowerCase(), command);
                }
            }
            loaded++;
        } catch (e) {
            logger.warn(`[تحميل] فشل تحميل ${file}: ${e.message}`);
        }
    }
    logger.info(`✔ تم تحميل ${loaded} أمر بنجاح.`);
}

// ------------------------------------------------------------
// 3) تحميل الأحداث من script/events
// ------------------------------------------------------------
function loadEvents() {
    const dir = path.join(__dirname, 'script', 'events');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    let loaded = 0;

    for (const file of files) {
        try {
            delete require.cache[require.resolve(path.join(dir, file))];
            const evt = require(path.join(dir, file));
            if (!evt.ZOTEEvent) continue;
            Zote.client.events.set(file, evt);
            loaded++;
        } catch (e) {
            logger.warn(`[تحميل] فشل تحميل حدث ${file}: ${e.message}`);
        }
    }
    logger.info(`✔ تم تحميل ${loaded} ملف أحداث بنجاح.`);
}

// ------------------------------------------------------------
// 4) الاتصال بقاعدة بيانات MongoDB Atlas
// ------------------------------------------------------------
async function connectDB() {
    if (!config.MONGO_URI || config.MONGO_URI.startsWith('ضع_')) {
        logger.warn('⚠️ لم يتم ضبط MONGO_URI في config.json — البيانات (اقتصاد، حماية، حظر...) لن تُحفظ بشكل دائم.');
        return;
    }

    // نسجّل هذا المستمع قبل الاتصال: إن انقطع الاتصال لاحقًا أثناء التشغيل
    // (وليس عند الإقلاع)، نريد تسجيل الخطأ بدل تركه بلا معالج إطلاقًا.
    mongoose.connection.on('error', (e) => {
        logger.warn(`✘ خطأ في اتصال MongoDB: ${e.message}`);
    });

    try {
        await mongoose.connect(config.MONGO_URI);
        logger.info('✔ تم الاتصال بقاعدة بيانات MongoDB Atlas.');
    } catch (e) {
        logger.warn(`✘ فشل الاتصال بقاعدة البيانات: ${e.message}`);
    }
}

// ------------------------------------------------------------
// 5) خادم بسيط لإبقاء البوت مستيقظًا على Render (health check)
//    + "self-ping" دوري حتى لا يُنيّم Render الخدمة المجانية بعد
//    فترة من عدم وصول أي طلب HTTP (هذا سبب شائع لتوقف البوت
//    فجأة رغم أن الكوكيز نفسها سليمة).
// ------------------------------------------------------------
function startKeepAliveServer() {
    const app = express();
    app.get('/', (req, res) => res.send('ZOTE-BOT is running.'));
    const port = process.env.PORT || 3000;
    app.listen(port, () => logger.info(`✔ خادم keep-alive يعمل على المنفذ ${port}`));

    // إن كانت الخدمة تعمل فعليًا على Render فسيوفر تلقائيًا هذا المتغيّر
    const externalUrl = process.env.RENDER_EXTERNAL_URL;
    if (externalUrl) {
        const https = require('https');
        setInterval(() => {
            https.get(externalUrl, (res) => {
                res.resume(); // تفريغ الاستجابة بدون تخزينها
            }).on('error', () => {
                // نتجاهل أخطاء الـ ping نفسها، الهدف فقط إبقاء الخدمة نشطة
            });
        }, 10 * 60 * 1000); // كل 10 دقائق
        logger.info(`✔ تفعيل self-ping كل 10 دقائق على ${externalUrl} لمنع نوم الخدمة.`);
    }
}

// ------------------------------------------------------------
// 6) تنظيف دوري لقوائم الردود/التفاعلات التفاعلية
//    بعض ملفات الأوامر (مثل ai.js وguess.js وpinterests.js) تضيف عناصر
//    إلى Zote.client.ZOTEReply / ZOTEReaction لكن لا تحذفها بعد
//    استعمالها. بدون هذا التنظيف، تكبر هذه القوائم بلا حدود مع طول
//    مدة تشغيل البوت (تسرب ذاكرة تدريجي)، وتُبطئ كل رسالة رد/تفاعل
//    (فحص خطي على كل القائمة)، وقد تؤدي في النهاية لنفاد الذاكرة
//    وتوقف مفاجئ على استضافات محدودة الموارد مثل Render.
// ------------------------------------------------------------
function startQueueCleanup() {
    const MAX_ENTRIES = 300;
    setInterval(() => {
        const now = Date.now();
        for (const key of ['ZOTEReply', 'ZOTEReaction']) {
            const list = Zote.client[key];
            if (!Array.isArray(list)) continue;

            // أولًا: نحذف أي عنصر انتهت صلاحيته صراحة (إن كان يملك expiresAt)
            for (let i = list.length - 1; i >= 0; i--) {
                if (list[i]?.expiresAt && now > list[i].expiresAt) list.splice(i, 1);
            }
            // ثانيًا: حد أقصى احتياطي — نُبقي فقط أحدث العناصر مهما كان السبب
            if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
        }
    }, 15 * 60 * 1000); // كل 15 دقيقة
}

// ------------------------------------------------------------
// 7) تسجيل الدخول وربط مستمع الأحداث
// ------------------------------------------------------------
function startBot() {
    const appStatePath = path.join(__dirname, 'appstate.json');
    if (!fs.existsSync(appStatePath)) {
        logger.warn('✘ appstate.json غير موجود. أنشئه أولًا (جلسة فيسبوك صالحة) قبل تشغيل البوت.');
        process.exit(1);
    }

    const appState = JSON.parse(fs.readFileSync(appStatePath, 'utf8'));

    // userAgent: يُفضّل ضبطه في config.json ليطابق نفس المتصفح/الجهاز
    // الذي استُخرجت منه الكوكيز (مثلاً متصفح Kiwi على أندرويد).
    // اختلاف الـ userAgent عن الجهاز الذي أُنشئت منه الجلسة هو أحد أشهر
    // أسباب رفض فيسبوك للجلسة بعد وقت قصير من الاستخدام.
    const fcaOptions = { ...(config.fcaOptions || {}) };
    if (!fcaOptions.userAgent) {
        logger.warn('⚠️ لم يتم ضبط userAgent في config.json. يُفضّل إضافته ليطابق متصفح Kiwi الذي استخرجت منه الكوكيز (راجع الشرح المرفق).');
    }

    login({ appState }, fcaOptions, (err, api) => {
        if (err) {
            // نطبع تفاصيل الخطأ كاملة (وليس فقط message) لأن أخطاء الجلسة
            // (checkpoint / login approval / رفض الكوكيز) تظهر تفاصيلها
            // الحقيقية داخل الكائن error وليس رسالة مختصرة.
            logger.error('✘ فشل تسجيل الدخول. تفاصيل الخطأ الكاملة:');
            try {
                console.error(JSON.stringify(err, null, 2));
            } catch (_) {
                console.error(err);
            }

            if (err.error === 'checkpoint_282' || err.error === 'checkpoint_956' || err.checkpoint) {
                logger.warn('🔒 فيسبوك وضع الحساب في "Checkpoint" (تحقق أمني). يجب فتح الحساب يدويًا من متصفح ثم استخراج كوكيز جديدة.');
            }

            logger.warn('⏳ انتظار 60 ثانية قبل الخروج (لتفادي محاولات دخول متكررة سريعة قد تزيد حظر الحساب من فيسبوك)...');
            return setTimeout(() => process.exit(1), 60000);
        }

        logger.info(chalk.green(`✔ تم تسجيل الدخول بنجاح. البوت يعمل الآن (المالك فقط: ${config.ADMINBOT[0]})`));
        global.CURRENT_API = api; // للتنبيه الاستباقي (راجع أعلى الملف)

        // حفظ تلقائي دوري لملف appstate.json بالكوكيز المُحدَّثة.
        // فيسبوك يُدوّر (rotate) بعض قيم الجلسة أثناء الاستخدام، وإن لم
        // تُحفظ القيم الجديدة على القرص فسيستمر البوت بالعمل في الذاكرة
        // لكن أي إعادة تشغيل (حتى تلقائية بسبب سقوط الاتصال) ستستعمل
        // كوكيز قديمة ⇐ قد تُرفض الجلسة بسرعة.
        if (typeof api.enableAutoSaveAppState === 'function') {
            api.enableAutoSaveAppState({
                filePath: appStatePath,
                interval: 5 * 60 * 1000, // كل 5 دقائق
            });
        }

        api.listenMqtt((err, event) => {
            if (err) {
                logger.error('✘ خطأ في الاستماع (MQTT). تفاصيل الخطأ الكاملة:');
                try {
                    console.error(JSON.stringify(err, null, 2));
                } catch (_) {
                    console.error(err);
                }
                logger.warn('⏳ إعادة تشغيل البوت خلال 10 ثوانٍ لاستعادة الاتصال...');
                return setTimeout(() => process.exit(1), 10000);
            }
            handleEvent({ api, event, config }).catch((e) => {
                logger.warn(`✘ خطأ أثناء معالجة الحدث: ${e.message}`);
            });
        });
    });
}

// ------------------------------------------------------------
// التشغيل
// ------------------------------------------------------------
(async () => {
    global.BOT_START_TIME = Date.now();
    loadCommands();
    loadEvents();
    await connectDB();
    startKeepAliveServer();
    startBackupSchedule();
    startQueueCleanup();
    startBot();
})();
