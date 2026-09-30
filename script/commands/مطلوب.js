const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    title: "مطلوب",
    release: "1.0.0",
    clearance: 0,
    author: "Hakim Tracks",
    summary: "إنشاء بوستر مطلوب مع صورة الشخص",
    section: "الــعــاب",
    syntax: "مطلوب [منشن/رد]",
    delay: 5,
};

module.exports.ZOTERun = async function ({ api, event, args }) {
    const { threadID, messageID, senderID, mentions, messageReply } = event;
    
    // تحديد الهدف: الرد أولاً، ثم المنشن، وأخيراً المستخدم نفسه إذا لم يوجد شيء
    let targetID = messageReply ? messageReply.senderID : (Object.keys(mentions).length > 0 ? Object.keys(mentions)[0] : senderID);

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    const pathCache = path.join(cacheDir, `wanted_${targetID}.png`);
    
    try {
        const avatarURL = `https://graph.facebook.com/${targetID}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
        const templateURL = "https://i.postimg.cc/vmFqjkw8/467471884-1091680152417037-7359182676446817237-n.jpg";

        const [avatar, template] = await Promise.all([
            loadImage(avatarURL).catch(() => null),
            loadImage(templateURL)
        ]);

        if (!avatar) {
            return api.sendMessage("『 ❌ 』تعذر جلب صورة الحساب (قد يكون الحساب مقفلاً).", threadID, messageID);
        }

        const canvas = createCanvas(template.width, template.height);
        const ctx = canvas.getContext('2d');
        
        // رسم القالب الأساسي
        ctx.drawImage(template, 0, 0, canvas.width, canvas.height);

        // حساب أبعاد ومكان الصورة الشخصية
        const imgSize = canvas.width / 2;
        const x = (canvas.width / 2) - (imgSize / 2);
        const y = (canvas.height / 2) - (imgSize / 2) - 25;

        // رسم إطار أبيض خلف الصورة الشخصية
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(x - 4, y - 4, imgSize + 8, imgSize + 8);
        
        // رسم الصورة الشخصية
        ctx.drawImage(avatar, x, y, imgSize, imgSize);

        // حفظ الصورة وإرسالها
        const buffer = canvas.toBuffer("image/png");
        fs.writeFileSync(pathCache, buffer);

        return api.sendMessage({
            body: "🏴‍☠️ مطلوب حياً أو ميتاً!",
            attachment: fs.createReadStream(pathCache)
        }, threadID, () => {
            // حذف الملف المؤقت بعد الإرسال لتوفير المساحة
            try {
                fs.unlinkSync(pathCache);
            } catch (err) {
                console.error("خطأ أثناء حذف ملف الكاش:", err);
            }
        }, messageID);

    } catch (error) {
        console.error("Error in مطلوب command:", error);
        api.sendMessage("حدث خطأ غير متوقع أثناء إنشاء الصورة.", threadID, messageID);
    }
};