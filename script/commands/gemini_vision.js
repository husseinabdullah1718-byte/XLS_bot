const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    title: "تحليل",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "تحليل الصور باستخدام جيمني (بالرد على صورة)",
    section: "زكـــــــاء",
    syntax: "رؤية [سؤالك] (بالرد على صورة)",
    delay: 5,
};

const getBaseUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.ZOTERun = async function({ api, event, args }) {
    const { threadID, messageID, type, messageReply } = event;
    const deco = require("../../utils/decorations");

    let imgUrl = "";
    if (type === "message_reply" && messageReply.attachments.length > 0 && (messageReply.attachments[0].type === "photo" || messageReply.attachments[0].type === "sticker")) {
        imgUrl = messageReply.attachments[0].url;
    } else {
        return api.sendMessage(deco.error("يرجى الرد على صورة."), threadID, messageID);
    }

    const prompt = args.join(" ") || "ماذا يوجد في هذه الصورة؟";

    api.setMessageReaction("👁️", messageID, threadID, () => {}, true);

    try {
        const baseUrl = await getBaseUrl();
        const requestBody = {
            prompt: prompt,
            image_url: imgUrl
        };

        const response = await axios.post(`${baseUrl}/api/gemini`, requestBody, {
            headers: { 
                "Content-Type": "application/json",
                "author": "MahMUD"
            }
        });

        const result = response.data.response || "لم أستطع تحليل الصورة.";

        api.setMessageReaction("✅", messageID, threadID, () => {}, true);
        return api.sendMessage(result, threadID, messageID);

    } catch (error) {
        console.error(error);
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage(deco.error("حدث خطأ أثناء تحليل الصورة."), threadID, messageID);
    }
};
