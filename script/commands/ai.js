const axios = require('axios');
const fs = require("fs-extra");
const path = require("path");

const conversationContexts = new Map();

async function getZoteResponse(userID, userName, userStats, userMessage, apiKey) {
    try {
        const systemPrompt = `
أنتِ "ميرور" (Zote)، فتاة ذكية، لطيفة، وكيوت جداً. 
تتحدثين باللغة العربية بلهجة ودودة ومحببة، وتستخدمين الرموز التعبيرية (Emojis) اللطيفة مثل (🙋‍♀️، 🤔، ✨، 🌚، 🤝).
أنتِ لستِ مجرد ذكاء اصطناعي، بل أنتِ رفيقة وصديقة للمستخدمين في هذا البوت.

بيانات المستخدم الذي تتحدثين معه الآن:
- الاسم: ${userName}
- المستوى الاقتصادي: ${userStats.economy?.level || 1}
- الرصيد: ${userStats.economy?.money || 0}$
- رتبة المغارة: ${userStats.dungeon?.rank || "E"}
- مستوى المغارة: ${userStats.dungeon?.level || 1}

لا تتحدثي عن بيانات المستخدم او عنك الا اذا طلب هو او لزم الامر، كلامك يكون ما كثير وما قليل كيوت و غيورة و تقيله في نمطك وما تتحدثي عن نفسك او تعرفي عنها الا لو لزم الامر `;

        let context = conversationContexts.get(userID) || [];
        
        context.push({
            role: "user",
            parts: [{ text: userMessage }]
        });

        if (context.length > 10) {
            context = context.slice(-10);
        }

        const fullConversation = [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: "فهمت! أنا ميرور الكيوت، رفيقتكم الجديدة. سأهتم بـ " + userName + " جيداً! ✨🌸" }] },
            ...context
        ];

        
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
            {
                contents: fullConversation
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.data.candidates || !response.data.candidates[0].content) {
            throw new Error("استجابة غير صالحة من API");
        }

        const ZoteResponse = response.data.candidates[0].content.parts[0].text;

        context.push({
            role: "model",
            parts: [{ text: ZoteResponse }]
        });

        conversationContexts.set(userID, context);
        return ZoteResponse;
    } catch (error) {
        console.error("خطأ في رد ميرور:", error.response ? JSON.stringify(error.response.data) : error.message);
        return "أوه.. يبدو أن رأسي يؤلمني قليلاً الآن 🌸.. هل يمكنك المحاولة لاحقاً؟ ✨";
    }
}


module.exports.ZOTEReply = async function({ api, event, ZOTEReply, userData, config }) {
    const { threadID, messageID, senderID, body } = event;

    if (senderID !== ZOTEReply.author) return;

    api.setMessageReaction("⏳", messageID, threadID, () => {}, true);

    const user = await userData.get(senderID);
    const apiKey = config.GEMINI_KEY;
    
    const response = await getZoteResponse(senderID, user.name, user, body, apiKey);

    return api.sendMessage(response, threadID, (err, info) => {
        if (err) return;
        Zote.client.ZOTEReply.push({
            name: module.exports.config.title,
            messageID: info.messageID,
            author: senderID
        });
    }, messageID);
};
module.exports.ZOTERun = async ({ api, event, args, user, userData, config }) => {
    const { threadID, messageID, senderID } = event;
    const deco = require("../../utils/decorations");

    if (!user || !user.isRegistered) {
        return api.sendMessage(
            deco.error("يجب عليك التسجيل أولاً لتتحدث معي! 🌸"),
            threadID,
            messageID
        );
    }

    const userMessage = args.join(" ");
    if (!userMessage) {
        return api.sendMessage("أهلاً بك! أنا ميرور الكيوت ✨.. هل تريد التحدث عن شيء ما؟ 🌸", threadID, messageID);
    }

    api.setMessageReaction("🌸", messageID, threadID, () => {}, true);

    const apiKey = config.GEMINI_KEY;
    const response = await getZoteResponse(senderID, user.name, user, userMessage, apiKey);

    return api.sendMessage(response, threadID, (err, info) => {
        if (err) return;
        Zote.client.ZOTEReply.push({
            name: module.exports.config.title,
            messageID: info.messageID,
            author: senderID
        });
    }, messageID);
};

module.exports.config = {
    title: "ميرور",
    release: "3.5.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "تحدث مع ميرور الكيوت",
    section: "زكـــــــاء",
    syntax: "ai [رسالتك]",
    delay: 2,
};
