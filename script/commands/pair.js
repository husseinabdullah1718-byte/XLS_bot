const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const Canvas = require('canvas');

module.exports.config = {
    title: 'زوجني',
    aliases: ['اقتران', 'زوجيني'],
    release: '2.2',
    clearance: 0,
    author: "Hakim Tracks × Zote",
    summary: 'اقتران عشوائي مع صور بروفايل مربعة بدون إطار',
    section: 'الــعــاب',
    syntax: "",
    delay: 10,
};

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const CACHE_DIR = path.join(__dirname, 'cache');
const BG_CANDIDATES = ['pair_bg.png', 'pair_bg.jpg', 'pair_bg.jpeg', 'pair_bg.webp'];

function findBackground() {
    for (const name of BG_CANDIDATES) {
        const p = path.join(ASSETS_DIR, name);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

async function fetchAvatar(user) {
    const urls = [];
    if (user && user.thumbSrc) urls.push(user.thumbSrc);
    if (user && user.id) urls.push(`https://graph.facebook.com/${user.id}/picture?width=600&height=600`);
    for (const url of urls) {
        try {
            const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            if (res.data && res.data.byteLength > 500) return Buffer.from(res.data);
        } catch (e) { /* جرّب التالي */ }
    }
    return null;
}

// ✅ بروفايل مربع بدون إطار — فقط الصورة مربعة
function drawSquareAvatar(ctx, img, x, y, size, fallbackName) {
    // x و y هما مركز المربع
    const half = size / 2;
    const left = x - half;
    const top  = y - half;

    ctx.save();    if (img) {
        // قص مربع من وسط الصورة لو كانت مستطيلة (عشان ما تنstretch)
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, left, top, size, size);
    } else {
        // احتياطي لو فشل تحميل البروفايل
        ctx.fillStyle = '#f6c9d4';
        ctx.fillRect(left, top, size, size);
        ctx.fillStyle = '#a12639';
        ctx.font = `bold ${Math.round(size * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((fallbackName || '؟').trim().charAt(0), x, y);
    }
    ctx.restore();
}

async function buildPairImage(bgPath, av1Buf, av2Buf, name1, name2, percent, outPath) {
    const bg = await Canvas.loadImage(bgPath);
    const canvas = Canvas.createCanvas(bg.width, bg.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bg, 0, 0, bg.width, bg.height);

    const W = bg.width, H = bg.height;
    const size = Math.round(H * 0.26);      // حجم المربع (كان r للدائرة)
    const cy = Math.round(H * 0.40);
    const x1 = Math.round(W * 0.26);
    const x2 = Math.round(W * 0.78);

    let img1 = null, img2 = null;
    if (av1Buf) img1 = await Canvas.loadImage(av1Buf);
    if (av2Buf) img2 = await Canvas.loadImage(av2Buf);

    drawSquareAvatar(ctx, img1, x1, cy, size, name1);
    drawSquareAvatar(ctx, img2, x2, cy, size, name2);

    // نسبة التوافق تحت الصور
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d6336c';
    ctx.font = `bold ${Math.round(H * 0.058)}px sans-serif`;
    ctx.fillText(`نسبة التوافق: ${percent}%`, Math.round(W * 0.52), Math.round(H * 0.80));

    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    return outPath;
}

module.exports.ZOTERun = async ({ api, event }) => {    const { threadID, messageID, senderID } = event;
    const botID = api.getCurrentUserID();
    const outputPath = path.join(CACHE_DIR, `pair_${senderID}_${Date.now()}.png`);
    fs.ensureDirSync(CACHE_DIR);

    try { api.setMessageReaction('😘', messageID, () => {}, true); } catch (e) {}

    try {
        const bgPath = findBackground();
        if (!bgPath) {
            return api.sendMessage(
                '❌ ما لقيت صورة الخلفية!\nاحفظها داخل مجلد assets في جذر البوت باسم pair_bg.png',
                threadID, messageID
            );
        }

        const threadInfo = await api.getThreadInfo(threadID);
        const users = threadInfo.userInfo || [];
        const myData = users.find(u => u.id === senderID);

        if (!myData || !myData.gender) return api.sendMessage('❌ جنسك غير محدد', threadID, messageID);

        const myGender = String(myData.gender).toUpperCase();
        let matchCandidates = [];

        if (myGender === 'MALE') {
            matchCandidates = users.filter(u => u.gender === 'FEMALE' && u.id !== senderID && u.id !== botID);
        } else if (myGender === 'FEMALE') {
            matchCandidates = users.filter(u => u.gender === 'MALE' && u.id !== senderID && u.id !== botID);
        } else {
            matchCandidates = users.filter(u => u.id !== senderID && u.id !== botID);
        }

        if (matchCandidates.length === 0) {
            return api.sendMessage('❌ لا يوجد مرشحين', threadID, messageID);
        }

        const selectedMatch = matchCandidates[Math.floor(Math.random() * matchCandidates.length)];
        const [av1, av2] = await Promise.all([fetchAvatar(myData), fetchAvatar(selectedMatch)]);

        const name1 = myData.name || 'User';
        const name2 = selectedMatch.name || 'Partner';
        const percentage = Math.floor(Math.random() * 100) + 1;

        await buildPairImage(bgPath, av1, av2, name1, name2, percentage, outputPath);

        api.sendMessage({
            body: `💞 مبروك للمظط الكيوتات\n• ${name1}\n• ${name2}\n\nنسبة توافقكم 🫂: ${percentage}%`,
            attachment: fs.createReadStream(outputPath)
        }, threadID, () => {            try { api.setMessageReaction('✅', messageID, () => {}, true); } catch (e) {}
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }, messageID);
    } catch (err) {
        try { api.setMessageReaction('❌', messageID, () => {}, true); } catch (e) {}
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        api.sendMessage('❌ خطأ: ' + err.message, threadID, messageID);
    }
};