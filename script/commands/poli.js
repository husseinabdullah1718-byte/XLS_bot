const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: 'توليد',
    release: '1.7',
    clearance: 0,
    author: "ZOTE Tracks",
    summary: 'توليد صور متعددة باستخدام الذكاء الاصطناعي',
    section: 'زكـــــــاء',
    syntax: '[وصف الصورة]',
    delay: 10,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
    const { threadID, messageID } = event;
    if (args.length === 0) return api.sendMessage('❌ يرجى إدخال وصف', threadID, messageID);

    const prompt = args.join(' ');
    const cacheDir = path.join(__dirname, 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

    api.sendMessage('⏳ جاري التوليد...', threadID, (err, info) => {
        if (err) return;
        const waitMsgID = info.messageID;
    }, messageID);

    try {
        const styles = ['ultra detailed', '4k resolution', 'realistic lighting', 'artstation', 'digital painting'];
        const imagePaths = [];

        for (let i = 0; i < 4; i++) {
            const enhancedPrompt = `${prompt}, ${styles[i % styles.length]}`;
            const response = await axios.post(`${await baseApiUrl()}/api/poli/generate`, {
                prompt: enhancedPrompt
            }, {
                responseType: 'arraybuffer'
            });

            const filePath = path.join(cacheDir, `generated_${Date.now()}_${i}.png`);
            fs.writeFileSync(filePath, response.data);
            imagePaths.push(filePath);
        }

        const attachments = imagePaths.map(p => fs.createReadStream(p));
        api.sendMessage({
            body: '✅ هذه الصور المُنشأة من وصفك:',
            attachment: attachments
        }, threadID, () => {
            
            for (const p of imagePaths) fs.unlinkSync(p);
        }, messageID);
    } catch (error) {
        api.sendMessage('❌ فشل التوليد: ' + error.message, threadID, messageID);
    }
};