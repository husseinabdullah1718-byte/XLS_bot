const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const baseApiUrl = async () => {
    const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
    return base.data.mahmud;
};

module.exports.config = {
    title: 'بنترست',
    release: '2.0',
    clearance: 0,
    author: "ZOTE Tracks",
    summary: 'بحث وتحميل صور من Pinterest مع إمكانية جلب المزيد',
    section: 'عـــامـة',
    syntax: '[كلمة بحث] - [عدد] (مثال: goku - 10)',
    delay: 10,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
    const { threadID, messageID } = event;
    const queryAndLength = args.join(' ').split('-').map(s => s.trim());
    const keySearch = queryAndLength[0];
    const countInput = queryAndLength[1];
    const displayCount = countInput ? Math.min(parseInt(countInput), 20) : 6;

    if (!keySearch) return api.sendMessage('✘ يرجى إدخال كلمة البحث', threadID, messageID);

    const cacheDir = path.join(__dirname, 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    api.setMessageReaction('⏳', messageID, threadID, () => {}, true);

    try {
        const apiUrl = await baseApiUrl();
        
        const limit = 30;
        const response = await axios.get(
            `${apiUrl}/api/pin/mahmud?query=${encodeURIComponent(keySearch)}&limit=${limit}`
        );

        let allImages = response.data.images;
        if (!allImages || allImages.length === 0) {
            api.setMessageReaction('✘', messageID, threadID, () => {}, true);
            return api.sendMessage('✘ لا توجد صور', threadID, messageID);
        }

        const imageSet = new Set(allImages);
        allImages = Array.from(imageSet);

        const imagesToShow = allImages.slice(0, displayCount);
        if (imagesToShow.length === 0) {
            api.setMessageReaction('✘', messageID, threadID, () => {}, true);
            return api.sendMessage('✘ لا توجد صور كافية للعرض', threadID, messageID);
        }

        const attachments = [];
        for (let i = 0; i < imagesToShow.length; i++) {
            const imgRes = await axios.get(imagesToShow[i], { responseType: 'arraybuffer' });
            const imgPath = path.join(cacheDir, `pin_${Date.now()}_${i}.jpg`);
            await fs.outputFile(imgPath, imgRes.data);
            attachments.push(fs.createReadStream(imgPath));
        }

        const msg = `✔ تم العثور على ${allImages.length} صورة لـ "${keySearch}"\nعرض ${imagesToShow.length} منها\nتفاعل بـ 👍 لجلب المزيد`;

        api.sendMessage({
            body: msg,
            attachment: attachments
        }, threadID, (err, info) => {
            if (err) return;
            
            for (const att of attachments) {
                if (fs.existsSync(att.path)) fs.unlinkSync(att.path);
            }
            
           
            Zote.client.ZOTEReaction.push({
                name: module.exports.config.title,
                messageID: info.messageID,
                author: event.senderID,
                type: 'more',
                keyword: keySearch,
                allImages: allImages,
                startIndex: displayCount,
                displayCount: displayCount,
                totalFetched: allImages.length
            });
        }, messageID);
    } catch (err) {
        api.setMessageReaction('✘', messageID, threadID, () => {}, true);
        api.sendMessage('✘ خطأ: ' + err.message, threadID, messageID);
    }
};

module.exports.ZOTEReaction = async ({ api, event, ZOTEReaction }) => {
    const { threadID, messageID, userID, reaction } = event;
         
    if (reaction !== '👍') return;
      
    if (userID !== ZOTEReaction.author) {
        return api.sendMessage('✘ أنت لست صاحب البحث', threadID, messageID);
    }
    
   
    if (ZOTEReaction.type !== 'more') return;

    const { keyword, allImages, startIndex, displayCount } = ZOTEReaction;
    const cacheDir = path.join(__dirname, 'cache');

    api.setMessageReaction('⏳', messageID, threadID, () => {}, true);

    try {
        let updatedImages = allImages;
        let newStartIndex = startIndex;

       
        if (startIndex >= allImages.length) {
            const apiUrl = await baseApiUrl();
            const limit = 30;
            const response = await axios.get(
                `${apiUrl}/api/pin/mahmud?query=${encodeURIComponent(keyword)}&limit=${limit}`
            );
            const newImages = response.data.images || [];
            if (newImages.length === 0) {
                api.setMessageReaction('✘', messageID, threadID, () => {}, true);
                return api.sendMessage('✘ لا توجد صور إضافية', threadID, messageID);
            }

            const combinedSet = new Set([...allImages, ...newImages]);
            updatedImages = Array.from(combinedSet);
            newStartIndex = allImages.length;
        }

       
        const nextBatch = updatedImages.slice(newStartIndex, newStartIndex + displayCount);
        if (nextBatch.length === 0) {
            api.setMessageReaction('✘', messageID, threadID, () => {}, true);
            return api.sendMessage('✘ لا توجد صور إضافية', threadID, messageID);
        }

        
        const attachments = [];
        for (let i = 0; i < nextBatch.length; i++) {
            const imgRes = await axios.get(nextBatch[i], { responseType: 'arraybuffer' });
            const imgPath = path.join(cacheDir, `pin_${Date.now()}_${i}.jpg`);
            await fs.outputFile(imgPath, imgRes.data);
            attachments.push(fs.createReadStream(imgPath));
        }

        const totalImages = updatedImages.length;
        const shownSoFar = newStartIndex + nextBatch.length;
        const msg = `✔ صور إضافية لـ "${keyword}" (${shownSoFar}/${totalImages} صورة)\nتفاعل بـ 👍 لجلب المزيد`;

        api.sendMessage({
            body: msg,
            attachment: attachments
        }, threadID, (err, info) => {
            if (err) return;
            
            for (const att of attachments) {
                if (fs.existsSync(att.path)) fs.unlinkSync(att.path);
            }
            
           
            const index = Zote.client.ZOTEReaction.findIndex(h => h.messageID === ZOTEReaction.messageID);
            if (index !== -1) {
                Zote.client.ZOTEReaction[index] = {
                    ...ZOTEReaction,
                    messageID: info.messageID,
                    allImages: updatedImages,
                    startIndex: newStartIndex + displayCount,
                };
            }
        }, messageID);
    } catch (err) {
        api.setMessageReaction('✘', messageID, threadID, () => {}, true);
        api.sendMessage('✘ خطأ: ' + err.message, threadID, messageID);
    }
};