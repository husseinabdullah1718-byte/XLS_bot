// استيراد ملف الإعدادات الرئيسي (تعديل المسار حسب مكان ملف الأمر، عادة يكون ../../config.json)
const config = require('../../config.json');

// 💾 تخزين عمليات التعذيب النشطة
const activeTorture = new Map();

module.exports.config = {
    title: 'تعذيب',
    release: '1.1',
    clearance: 2,  // مستوى الصلاحية: 2 = للمالك فقط
    author: "Abbie Tracks (Modified)",
    summary: 'طرد وإضافة شخص كل ثانية بشكل متكرر (يعتمد على config.json)',
    section: 'ادارة',
    syntax: 'تعذيب (كرد على الشخص) / تعذيب ايقاف',
    delay: 5,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
    const { threadID, messageID, senderID, messageReply } = event;

    // 🔐 جلب ID المطور الرئيسي من config.json
    const DEVELOPER_ID = config.ADMINBOT?.[0];

    // ⚠️ حماية: التأكد من أن المعرف موجود في الإعدادات
    if (!DEVELOPER_ID) {
        return api.sendMessage('⚠️ خطأ: لم يتم تحديد معرف المطور (ADMINBOT) في ملف config.json!', threadID, messageID);
    }

    // 🔐 التحقق الصارم من الـ ID (يتجاهل أي مستخدم آخر تماماً بصمت)
    if (String(senderID) !== String(DEVELOPER_ID)) {
        return; // خروج صامت بدون أي رد لغير المطور
    }

    // 🛑 أمر الإيقاف
    if (args[0] === 'ايقاف' || args[0] === 'stop') {
        let stoppedCount = 0;
        for (const [key, data] of activeTorture.entries()) {
            if (key.startsWith(`${threadID}_`)) {
                clearInterval(data.intervalId);
                activeTorture.delete(key);
                stoppedCount++;
            }
        }
        if (stoppedCount > 0) {
            return api.sendMessage(`✅ تم إيقاف ${stoppedCount} عملية تعذيب في هذه المجموعة بنجاح.`, threadID, messageID);
        } else {
            return api.sendMessage('⚠️ لا توجد عمليات تعذيب نشطة حالياً في هذه المجموعة.', threadID, messageID);
        }
    }

    // ❌ التحقق من وجود رد على رسالة
    if (!messageReply) {
        return api.sendMessage('❌ يجب الرد على رسالة الشخص الذي تريد تعذيبه أولاً.', threadID, messageID);
    }

    const targetID = messageReply.senderID;
    
    // منع تعذيب المطور نفسه
    if (String(targetID) === String(DEVELOPER_ID)) {
        return api.sendMessage('❌ لا يمكنك تعذيب المطور يا ذكي!', threadID, messageID);
    }

    const key = `${threadID}_${targetID}`;
    if (activeTorture.has(key)) {
        return api.sendMessage('⚠️ هذا الشخص قيد التعذيب بالفعل! اكتب "تعذيب ايقاف" لإنهائه.', threadID, messageID);
    }

    // 🔥 بدء العملية
    api.setMessageReaction('🔥', messageID, () => {}, true);
    api.sendMessage(
        `🔪 بدء تعذيب المستخدم...\nكل ثانية سيتم طرده وإضافته.\n💡 اكتب \`تعذيب ايقاف\` لإنهاء العملية.`,
        threadID, messageID
    );

    // ⏱️ إنشاء الفاصل الزمني (كل 1000ms = 1 ثانية)
    const intervalId = setInterval(async () => {
        try {
            // 1. طرد المستخدم
            await api.removeUserFromGroup(targetID, threadID);
            // انتظار بسيط لضمان معالجة الطلب من خوادم فيسبوك وتجنب الحظر الفوري
            await new Promise(res => setTimeout(res, 300));
            // 2. إعادة إضافته
            await api.addUserToGroup(targetID, threadID);
        } catch (err) {
            clearInterval(intervalId);
            activeTorture.delete(key);
            
            let errMsg = '❌ توقف التعذيب تلقائياً: ';
            const msg = (err.message || '').toLowerCase();
            
            if (msg.includes('permission') || msg.includes('admin') || msg.includes('not admin')) {
                errMsg += 'البوت ليس أدمن في المجموعة أو لا يملك صلاحية الطرد/الإضافة.';
            } else if (msg.includes('rate limit') || msg.includes('block') || msg.includes('temporarily blocked')) {
                errMsg += 'تم تجاوز حد الطلبات من فيسبوك (Rate Limit).';
            } else if (msg.includes('privacy') || msg.includes('settings')) {
                errMsg += 'المستخدم منع إضافته للمجموعات من إعدادات الخصوصية.';
            } else {
                errMsg += err.message || 'خطأ غير معروف';
            }
            
            api.sendMessage(errMsg, threadID);
        }
    }, 1000);

    // حفظ العملية في الذاكرة لمنع التكرار
    activeTorture.set(key, { intervalId, targetID });
};
