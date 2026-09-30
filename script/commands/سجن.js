const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { loadImage, createCanvas } = require("canvas");

module.exports.config = {
    title: "سجن",
    release: "1.1",
    clearance: 0,
    author: "Hakim Tracks",
    summary: "سجن المستخدم داخل صورة قضبان شفافة",
    section: "عـــامـة",
    syntax: "سجن [منشن أو رد]",
    delay: 3,
};

module.exports.ZOTERun = async function ({ api, event, args }) {
    const { senderID, messageReply, mentions, threadID, messageID } = event;

    // تحديد الهدف: الرد أولاً، ثم المنشن، وأخيراً المستخدم نفسه إذا لم يوجد شيء
    let targetID = senderID;
    if (messageReply && messageReply.senderID !== senderID) {
        targetID = messageReply.senderID;
    } else if (mentions && Object.keys(mentions).length > 0) {
        targetID = Object.keys(mentions)[0];
    }

    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    try {
        async function getAvatarUrl(userID) {
            try {
                const user = await axios.post(`https://www.facebook.com/api/graphql/`, null, {
                    params: {
                        doc_id: "5341536295888250",
                        variables: JSON.stringify({ height: 512, scale: 1, userID, width: 512 })
                    }
                });
                return user.data.data.profile.profile_picture.uri;
            } catch (err) {
                // صورة بديلة في حال فشل جلب الصورة الشخصية
                return "https://i.ibb.co/bBSpr5v/143086968-2856368904622192-1959732218791162458-n.png";
            }
        }

        const avatarURL = await getAvatarUrl(targetID);
        const prisonURL = "https://i.postimg.cc/Hxx4pNj0/pngtree-prison-bars-isolated-on-transparent-png-image-5489739.png";
        const avatarPath = path.join(cacheDir, `${targetID}_avatar.png`);
        const prisonPath = path.join(cacheDir, "prison_overlay.png");
        const outputPath = path.join(cacheDir, `sjn_${targetID}.png`);

        const downloadImage = async (url, filepath) => {
            const res = await axios.get(url, { responseType: "arraybuffer" });
            fs.writeFileSync(filepath, Buffer.from(res.data, "binary"));
        };

        await Promise.all([
            downloadImage(avatarURL, avatarPath),
            downloadImage(prisonURL, prisonPath)
        ]);

        const [avatarImg, prisonImg] = await Promise.all([
            loadImage(avatarPath),
            loadImage(prisonPath)
        ]);

        const canvasSize = 512;
        const canvas = createCanvas(canvasSize, canvasSize);
        const ctx = canvas.getContext("2d");

        // رسم الصورة الشخصية
        ctx.drawImage(avatarImg, 0, 0, canvasSize, canvasSize);
        // رسم طبقة القضبان فوقها
        ctx.drawImage(prisonImg, 0, 0, canvasSize, canvasSize);

        fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));

        // جلب اسم المستخدم
        const info = await api.getUserInfo(targetID);
        const nameTarget = info[targetID]?.name || "زول";

        // إرسال النتيجة وتنظيف الملفات المؤقتة
        api.sendMessage({
            body: `🚔︙ تم سجن ${nameTarget} خلف القضبان!`,
            attachment: fs.createReadStream(outputPath)
        }, threadID, () => {
            // تنظيف الملفات بعد الإرسال بنجاح
            try {
                if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
                if (fs.existsSync(prisonPath)) fs.unlinkSync(prisonPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (err) {
                console.error("خطأ أثناء حذف ملفات الكاش:", err);
            }
        }, messageID);
    } catch (error) {
        console.error("Error in سجن command:", error);
        api.sendMessage("حدث خطأ غير متوقع أثناء إنشاء الصورة. يرجى المحاولة لاحقاً.", threadID, messageID);
    }
};