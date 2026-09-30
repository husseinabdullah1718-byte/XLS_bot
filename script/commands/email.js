const axios = require('axios');
const API_URL = 'https://api.mail.tm';


if (!global.tempMailSessions) global.tempMailSessions = new Map();

module.exports.config = {
    title: "بريد",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "إنشاء بريد مؤقت ومراقبة الرسائل",
    section: "عـــامـة",
    syntax: "بريد",
    delay: 5,
};

module.exports.ZOTERun = async function({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    
    
    if (global.tempMailSessions.has(threadID)) {
        return api.sendMessage("⚠️ لديك جلسة بريد مؤقت نشطة بالفعل في هذه المحادثة.\nاستخدم أمر 'ايقاف_بريد' لإيقافها.", threadID, messageID);
    }

    try {
        
        const domainsRes = await axios.get(`${API_URL}/domains`);
        const domain = domainsRes.data['hydra:member'][0].domain;

        
        const randomUser = `user_${Math.random().toString(36).substring(7)}`;
        const email = `${randomUser}@${domain}`;
        const password = 'Password123!';

        await axios.post(`${API_URL}/accounts`, { address: email, password: password });
        
        
        const tokenRes = await axios.post(`${API_URL}/token`, { address: email, password: password });
        const token = tokenRes.data.token;
        const config = { headers: { Authorization: `Bearer ${token}` } };

        
        api.sendMessage(`✅ تم إنشاء بريد مؤقت:\n📧 ${email}\n🔑 ${password}\n⏳ جاري مراقبة الرسائل الجديدة...`, threadID, messageID);

        
        const seenMessages = new Set();

        
        const intervalId = setInterval(async () => {
            try {
                const messagesRes = await axios.get(`${API_URL}/messages`, config);
                const messages = messagesRes.data['hydra:member'];

                for (const msg of messages) {
                    if (!seenMessages.has(msg.id)) {
                        seenMessages.add(msg.id);

                        
                        const detailRes = await axios.get(`${API_URL}/messages/${msg.id}`, config);
                        const data = detailRes.data;

                        
                        await api.sendMessage(
                            `📩 **رسالة جديدة**\n` +
                            `**من:** ${data.from.address}\n` +
                            `**الموضوع:** ${data.subject}\n` +
                            `**المحتوى:**\n${data.text || data.intro || '(بدون محتوى نصي)'}`,
                            threadID
                        );
                    }
                }
            } catch (err) {
                console.error(`خطأ في مراقبة البريد للمحادثة ${threadID}:`, err.message);
                
            }
        }, 5000);

        
        global.tempMailSessions.set(threadID, {
            email,
            password,
            token,
            config,
            intervalId,
            seenMessages,
            threadID,
            senderID
        });

        
        setTimeout(() => {
            stopSession(threadID, api, '⏰ انتهت مدة المراقبة (10 دقائق).');
        }, 10 * 60 * 1000);

    } catch (error) {
        console.error(error);
        api.sendMessage("❌ حدث خطأ أثناء إنشاء البريد المؤقت: " + (error.response?.data?.message || error.message), threadID, messageID);
    }
};


function stopSession(threadID, api, reason = null) {
    const session = global.tempMailSessions.get(threadID);
    if (session) {
        clearInterval(session.intervalId);
        global.tempMailSessions.delete(threadID);
        if (reason) {
            api.sendMessage(`🛑 تم إيقاف مراقبة البريد المؤقت.\nالسبب: ${reason}`, threadID);
        }
    }
}