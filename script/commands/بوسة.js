const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { loadImage, createCanvas } = require("canvas");

module.exports.config = {
    title: "بوسة",
    release: "1.1",
    clearance: 0,
    author: "Hakim Tracks",
    summary: "دمج صورتين داخل قالب بوسة ❤️",
    section: "الــعــاب",
    syntax: "بوسة [منشن أو رد]",
    delay: 3,
};

module.exports.ZOTERun = async function ({ api, event, args }) {
    const { senderID, messageReply, mentions, threadID, messageID } = event;
    let targetID;

    if (messageReply && messageReply.senderID !== senderID) {
        targetID = messageReply.senderID;
    } else if (mentions && Object.keys(mentions).length > 0) {
        targetID = Object.keys(mentions)[0];
    } else {
        return api.sendMessage("👥︙ لازم تعمل منشن أو ترد على شخص!", threadID, messageID);
    }

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    async function getAvatarUrl(userID) {
        try {
            const user = await axios.post(`https://www.facebook.com/api/graphql/`, null, {
                params: {
                    doc_id: "5341536295888250",
                    variables: JSON.stringify({ height: 400, scale: 1, userID, width: 400 })
                }
            });
            return user.data.data.profile.profile_picture.uri;
        } catch (err) {
            // صورة بديلة في حال فشل جلب الصورة الشخصية (حساب مقفل أو خطأ في الشبكة)
            return "https://i.ibb.co/bBSpr5v/143086968-2856368904622192-1959732218791162458-n.png";
        }
    }

    try {
        const avatarURL1 = await getAvatarUrl(senderID);        const avatarURL2 = await getAvatarUrl(targetID);
        const baseURL = "https://i.postimg.cc/3xXSfwLC/b67185ef51e95c164937feb591a23f4c.jpg";

        const img1Path = path.join(cacheDir, `${senderID}.jpg`);
        const img2Path = path.join(cacheDir, `${targetID}.jpg`);
        const basePath = path.join(cacheDir, `kiss_base.jpg`);
        const outputPath = path.join(cacheDir, `kiss_${senderID}_${targetID}.png`);

        const downloadImage = async (url, filepath) => {
            const res = await axios.get(url, { responseType: "arraybuffer" });
            fs.writeFileSync(filepath, Buffer.from(res.data, "binary"));
        };

        await Promise.all([
            downloadImage(avatarURL1, img1Path),
            downloadImage(avatarURL2, img2Path),
            downloadImage(baseURL, basePath)
        ]);

        const [baseImg, avatar1, avatar2] = await Promise.all([
            loadImage(basePath),
            loadImage(img1Path),
            loadImage(img2Path)
        ]);

        const canvas = createCanvas(baseImg.width, baseImg.height);
        const ctx = canvas.getContext("2d");

        // رسم الخلفية
        ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

        const imgSize = 160;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        const pos1 = { x: centerX - imgSize - 45, y: centerY - imgSize / 1 - 10 };
        const pos2 = { x: centerX + 40, y: centerY - imgSize / 4 };

        // رسم الصورة الأولى بشكل دائري
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos1.x + imgSize / 2, pos1.y + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar1, pos1.x, pos1.y, imgSize, imgSize);
        ctx.restore();

        // رسم الصورة الثانية بشكل دائري
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos2.x + imgSize / 2, pos2.y + imgSize / 2, imgSize / 2, 0, Math.PI * 2);        ctx.clip();
        ctx.drawImage(avatar2, pos2.x, pos2.y, imgSize, imgSize);
        ctx.restore();

        fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));

        // جلب أسماء المستخدمين
        const info = await api.getUserInfo([senderID, targetID]);
        const nameSender = info[senderID]?.name || "شخص";
        const nameTarget = info[targetID]?.name || "زول";

        // إرسال النتيجة وتنظيف الملفات المؤقتة
        api.sendMessage({
            body: `💋︙ قام ${nameSender} ببوسة ${nameTarget}!`,
            attachment: fs.createReadStream(outputPath)
        }, threadID, () => {
            // تنظيف الملفات بعد الإرسال بنجاح
            try {
                fs.unlinkSync(img1Path);
                fs.unlinkSync(img2Path);
                fs.unlinkSync(basePath);
                fs.unlinkSync(outputPath);
            } catch (err) {
                console.error("خطأ أثناء حذف ملفات الكاش:", err);
            }
        }, messageID);

    } catch (error) {
        console.error("Error in بوسة command:", error);
        api.sendMessage("حدث خطأ غير متوقع أثناء إنشاء الصورة. يرجى المحاولة لاحقاً.", threadID, messageID);
    }
};