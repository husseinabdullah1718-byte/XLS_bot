const deco = require("../../utils/decorations");
const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

module.exports.config = {
    title: "ترفيه",
    release: "2.2.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "ألعاب جماعية: أعلام، شخصيات، عكس كلمات، تجميع، تفكيك. أول من يجيب يفوز بجوائز مالية.",
    section: "الــعــاب",
    syntax: "ترفيه [الأمر الفرعي]",
    delay: 2,
};


const GAMES_DB = {
    FLAGS: [
        { image: "https://i.pinimg.com/originals/6f/a0/39/6fa0398e640e5545d94106c2c42d2ff8.jpg", answer: "العراق" },
        { image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Flag_of_Brazil.svg/256px-Flag_of_Brazil.svg.png", answer: "البرازيل" },
        { image: "https://i.pinimg.com/originals/66/38/a1/6638a104725f4fc592c1b832644182cc.jpg", answer: "فلسطين" },
        { image: "https://i.pinimg.com/originals/f9/47/0e/f9470ea33ff6fbf794b0b8bb00a5ccb4.jpg", answer: "المغرب" },
        { image: "https://i.pinimg.com/originals/2d/a2/6e/2da26e58efd5f32fe2e33b9654907ab5.gif", answer: "الصومال" }
    ],
    CHARACTERS: [
        { image: "https://i.imgur.com/yrEx6fs.jpg", answer: "كورومي" },
        { image: "https://i.imgur.com/cAFukZB.jpg", answer: "الينا" },
        { image: "https://i.pinimg.com/236x/63/c7/47/63c7474adaab4e36525611da528a20bd.jpg", answer: "فوليت" },
        { image: "https://i.pinimg.com/236x/b3/cd/6a/b3cd6a25d9e3451d68628b75da6b2d9e.jpg", answer: "ليفاي" }
    ],
    WORDS: ["حاسوب", "برمجة", "ذكاء", "إبداع", "مغامرة", "سعادة", "نجاح", "صداقة", "حب", "أمل", "شجاعة", "حكمة", "عدالة", "سلام"]
};


if (!Zote.client.activeGames) Zote.client.activeGames = new Map();

module.exports.ZOTERun = async ({ api, event, args, userData, user }) => {
    const { threadID, messageID, senderID } = event;
    const subCommand = args[0]?.toLowerCase();

    if (!user || !user.isRegistered) {
        return api.sendMessage(deco.error("يجب عليك التسجيل أولاً!"), threadID, messageID);
    }

    
    if (subCommand === "أعلام" || subCommand === "اعلام") {
        const game = GAMES_DB.FLAGS[Math.floor(Math.random() * GAMES_DB.FLAGS.length)];
        const reward = 500;
        
        const imgPath = path.join(__dirname, "cache", `flag_${threadID}.png`);
        const response = await axios.get(game.image, { responseType: "arraybuffer" });
        await fs.outputFile(imgPath, Buffer.from(response.data));

        Zote.client.activeGames.set(threadID, { answer: game.answer, reward, type: "أعلام" });

        return api.sendMessage({
            body: deco.titlePremium("🌍 خمن علم الدولة") + "\n\n" + deco.lineStar(`الجائزة: 💵 ${reward}$`) + "\n" + deco.line("أول من يكتب اسم الدولة يفوز!"),
            attachment: fs.createReadStream(imgPath)
        }, threadID, () => fs.unlinkSync(imgPath), messageID);
    }

    
    if (subCommand === "شخصيات") {
        const game = GAMES_DB.CHARACTERS[Math.floor(Math.random() * GAMES_DB.CHARACTERS.length)];
        const reward = 700;
        
        const imgPath = path.join(__dirname, "cache", `char_${threadID}.png`);
        const response = await axios.get(game.image, { responseType: "arraybuffer" });
        await fs.outputFile(imgPath, Buffer.from(response.data));

        Zote.client.activeGames.set(threadID, { answer: game.answer, reward, type: "شخصيات" });

        return api.sendMessage({
            body: deco.titlePremium("🎭 خمن اسم الشخصية") + "\n\n" + deco.lineStar(`الجائزة: 💵 ${reward}$`) + "\n" + deco.line("أول من يكتب اسم الشخصية يفوز!"),
            attachment: fs.createReadStream(imgPath)
        }, threadID, () => fs.unlinkSync(imgPath), messageID);
    }

    
    if (subCommand === "عكس") {
        const word = GAMES_DB.WORDS[Math.floor(Math.random() * GAMES_DB.WORDS.length)];
        const reversed = word.split("").reverse().join("");
        const reward = 300;

        Zote.client.activeGames.set(threadID, { answer: word, reward, type: "عكس" });

        return api.sendMessage(deco.titlePremium("🔄 عكس الكلمات") + "\n\n" + deco.lineStar(`الكلمة المعكوسة: ${reversed}`) + "\n" + deco.lineStar(`الجائزة: 💵 ${reward}$`) + "\n" + deco.line("أول من يكتب الكلمة الصحيحة يفوز!"), threadID, messageID);
    }

    
    if (subCommand === "تفكيك") {
        const word = GAMES_DB.WORDS[Math.floor(Math.random() * GAMES_DB.WORDS.length)];
        const reward = 300;

        Zote.client.activeGames.set(threadID, { answer: word.split("").join(" "), reward, type: "تفكيك" });

        return api.sendMessage(deco.titlePremium("✂️ تفكيك الكلمات") + "\n\n" + deco.lineStar(`الكلمة: ${word}`) + "\n" + deco.lineStar(`الجائزة: 💵 ${reward}$`) + "\n" + deco.line("أول من يكتب الكلمة مفككة (بين كل حرف مسافة) يفوز!"), threadID, messageID);
    }

    
    if (subCommand === "تجميع") {
        const word = GAMES_DB.WORDS[Math.floor(Math.random() * GAMES_DB.WORDS.length)];
        const disassembled = word.split("").join(" ");
        const reward = 300;

        Zote.client.activeGames.set(threadID, { answer: word, reward, type: "تجميع" });

        return api.sendMessage(deco.titlePremium("🧩 تجميع الكلمات") + "\n\n" + deco.lineStar(`الكلمة المفككة: ${disassembled}`) + "\n" + deco.lineStar(`الجائزة: 💵 ${reward}$`) + "\n" + deco.line("أول من يكتب الكلمة مجمعة يفوز!"), threadID, messageID);
    }

    
    let help = deco.titlePremium("🎮 ألعاب ترفيه جماعية") + "\n\n";
    help += deco.box(`
ترفيه أعلام     - خمن علم الدولة
ترفيه شخصيات   - خمن اسم الشخصية
ترفيه عكس      - اعكس الكلمة المعروضة
ترفيه تفكيك    - فكك الكلمة (ح ر و ف)
ترفيه تجميع    - جمع الحروف المبعثرة
    `) + "\n" + deco.line("أول من يجاوب في الجروب يحصل على الجائزة! 💰");

    return api.sendMessage(help, threadID, messageID);
};


module.exports.ZOTEEvent = async function({ api, event, userData }) {
    const { threadID, senderID, body, messageID } = event;
    if (!body || !Zote.client.activeGames.has(threadID)) return;

    const game = Zote.client.activeGames.get(threadID);
    if (body.toLowerCase() === game.answer.toLowerCase()) {
        const user = await userData.get(senderID);
        if (!user) return;

        user.money += game.reward;
        await userData.set(senderID, { money: user.money });
        Zote.client.activeGames.delete(threadID);

        return api.sendMessage(deco.success(`🎉 أحسنت يا ${user.name}! إجابتك صحيحة.\n💰 لقد فزت بـ 💵 ${game.reward}$`), threadID, messageID);
    }
};
