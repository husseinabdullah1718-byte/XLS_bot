const axios = require("axios");

module.exports.config = {
    title: "شخصيات",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "لعبة تخمين شخصيات الأنمي من خلال الصور",
    section: "الــعــاب",
    syntax: ".شخصيات",
    delay: 5,
};

const questions = [
    { image: "https://i.imgur.com/yrEx6fs.jpg", answer: "كورومي" },
    { image: "https://i.pinimg.com/236x/63/c7/47/63c7474adaab4e36525611da528a20bd.jpg", answer: "فوليت" },
    { image: "https://i.pinimg.com/236x/b3/cd/6a/b3cd6a25d9e3451d68628b75da6b2d9e.jpg", answer: "ليفاي" },
    { image: "https://i.imgur.com/Lda2oA0.jpg", answer: "غوجو" },
    { image: "https://i.imgur.com/5B033fl.jpg", answer: "ناروتو" },
    { image: "https://i.imgur.com/1b42r3S.jpg", answer: "لوفي" }
    
];

module.exports.ZOTEReply = async function ({ api, event, ZOTEReply }) {
    const { body, threadID, messageID, senderID } = event;
    if (ZOTEReply.author !== senderID) return;

    if (body.toLowerCase() === ZOTEReply.answer.toLowerCase()) {
        api.unsendMessage(ZOTEReply.messageID);
        api.sendMessage(`✅ إجابة صحيحة! الشخصية هي: ${ZOTEReply.answer}`, threadID, messageID);
    } else {
        api.sendMessage(`❌ إجابة خاطئة، حاول مرة أخرى!`, threadID, messageID);
    }
};

module.exports.ZOTERun = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const question = questions[Math.floor(Math.random() * questions.length)];

    const msg = {
        body: "❓ من هي هذه الشخصية؟\nلديك 30 ثانية للإجابة!",
        attachment: await axios.get(question.image, { responseType: "stream" }).then(res => res.data)
    };

    api.sendMessage(msg, threadID, (err, info) => {
        if (err) return console.error(err);
        Zote.client.ZOTEReply.push({
            name: this.config.title,
            messageID: info.messageID,
            author: senderID,
            answer: question.answer
        });
    }, messageID);
};
