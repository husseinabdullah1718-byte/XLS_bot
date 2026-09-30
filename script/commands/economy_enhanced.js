

const deco = require("../../utils/decorations");

module.exports.config = {
    title: "اقتصاد",
    release: "2.1.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "نظام اقتصادي متقدم: وظائف، بنك، تجارة، قمار، استثمارات، مكافآت يومية، تعدين",
    section: "الــعــاب",
    syntax: "اقتصاد [الأمر الفرعي]",
    delay: 3,
};


const JOBS = {
    "عامل": { pay: 100, exp: 10, cooldown: 3600000 },
    "مهندس": { pay: 300, exp: 30, cooldown: 3600000 },
    "طبيب": { pay: 500, exp: 50, cooldown: 3600000 },
    "معلم": { pay: 250, exp: 25, cooldown: 3600000 },
    "صياد": { pay: 150, exp: 15, cooldown: 3600000 },
    "مزارع": { pay: 200, exp: 20, cooldown: 3600000 },
};


const INVESTMENTS = {
    "أسهم": { risk: 0.3, reward: 1.5, duration: 86400000 },
    "عقارات": { risk: 0.2, reward: 2.0, duration: 259200000 },
    "ذهب": { risk: 0.15, reward: 1.8, duration: 172800000 },
    "عملات": { risk: 0.4, reward: 2.5, duration: 43200000 },
};


const MINERALS = {
    "نحاس": { value: 50, exp: 5, cooldown: 300000 },
    "حديد": { value: 100, exp: 10, cooldown: 600000 },
    "فضة": { value: 200, exp: 20, cooldown: 1200000 },
    "ذهب": { value: 500, exp: 50, cooldown: 3600000 },
};

module.exports.ZOTERun = async ({ api, event, args, userData, user }) => {
    const { threadID, messageID, senderID } = event;
    const subCommand = args[0]?.toLowerCase();

    if (!user || !user.isRegistered) {
        return api.sendMessage(
            deco.error("يجب عليك التسجيل أولاً!"),
            threadID,
            messageID
        );
    }


    // نُطبّع الكائن أولاً (Mongoose يُرجع economy كـ {} افتراضيًا للمستخدم الجديد،
    // وهذا كائن "صحيح" منطقيًا رغم أنه فارغ، فلا يمر فحص "!user.economy" التقليدي).
    // لذا نتحقق حقلاً حقلاً ونُكمل أي حقل ناقص، بدل الاكتفاء بفحص الكائن ككل.
    user.economy = user.economy || {};
    {
        const defaults = {
            money: 1000, bank: 5000, lastJob: 0, lastDaily: 0, lastMine: 0,
            investments: [], trades: [], level: 1, exp: 0,
        };
        let patched = false;
        for (const key of Object.keys(defaults)) {
            if (user.economy[key] === undefined) {
                user.economy[key] = defaults[key];
                patched = true;
            }
        }
        if (patched) await userData.set(senderID, { economy: user.economy });
    }

    const eco = user.economy;
    const now = Date.now();


    if (!subCommand || subCommand === "حالي" || subCommand === "status") {
        const totalWealth = eco.money + eco.bank;
        const expPercent = Math.floor((eco.exp / (eco.level * 500)) * 100);

        let status = deco.titlePremium("💰 حالتك المالية") + "\n\n";
        status += deco.lineStar(`الاسم: ${user.name}`) + "\n";
        status += deco.lineStar(`المستوى: ${eco.level}`) + "\n";
        status += deco.lineStar(`الخبرة: ${deco.progressBarLuxury(expPercent)}`) + "\n\n";
        
        status += deco.titleGolden("الأموال:") + "\n";
        status += deco.lineStar(`النقود: 💵 ${eco.money}$`) + "\n";
        status += deco.lineStar(`البنك: 🏦 ${eco.bank}$`) + "\n";
        status += deco.lineStar(`الثروة الكلية: 💎 ${totalWealth}$`) + "\n\n";
        
        if (eco.investments.length > 0) {
            status += deco.titleGolden("الاستثمارات النشطة:") + "\n";
            eco.investments.forEach((inv, idx) => {
                status += deco.lineStar(`${idx + 1}. ${inv.type}: ${inv.amount}$ (${Math.floor((now - inv.startTime) / 1000)}ث)`) + "\n";
            });
            status += "\n";
        }
        
        return api.sendMessage(status, threadID, messageID);
    }


    if (subCommand === "عمل" || subCommand === "work") {
        const job = args[1]?.toLowerCase() || "عامل";
        const jobData = JOBS[job];

        if (!jobData) {
            let jobs = deco.titlePremium("💼 الوظائف المتاحة") + "\n\n";
            for (const [jobName, data] of Object.entries(JOBS)) {
                jobs += deco.lineStar(`${jobName}: 💵 ${data.pay}$ | ✨ ${data.exp} XP`) + "\n";
            }
            return api.sendMessage(jobs, threadID, messageID);
        }

        if (now - eco.lastJob < jobData.cooldown) {
            const remaining = Math.ceil((jobData.cooldown - (now - eco.lastJob)) / 1000);
            return api.sendMessage(
                deco.warning(`يجب الانتظار ${remaining} ثانية قبل العمل مجدداً`),
                threadID,
                messageID
            );
        }

        eco.money += jobData.pay;
        eco.exp += jobData.exp;
        eco.lastJob = now;


        if (eco.exp >= eco.level * 500) {
            eco.level++;
            eco.exp = 0;
            api.sendMessage(
                deco.success(`🎉 تم ترقيتك إلى المستوى ${eco.level}!`),
                threadID
            );
        }

        await userData.set(senderID, { economy: eco });

        return api.sendMessage(
            deco.success(`✅ عملت كـ ${job} وحصلت على 💵 ${jobData.pay}$ و ✨ ${jobData.exp} XP`),
            threadID,
            messageID
        );
    }


    if (subCommand === "بنك" || subCommand === "bank") {
        const action = args[1]?.toLowerCase();
        const amount = parseInt(args[2]) || 0;

        if (action === "إيداع" || action === "deposit") {
            if (amount <= 0 || amount > eco.money) {
                return api.sendMessage(
                    deco.error("المبلغ المطلوب غير صحيح أو ليس لديك رصيد كافي"),
                    threadID,
                    messageID
                );
            }

            eco.money -= amount;
            eco.bank += amount;
            await userData.set(senderID, { economy: eco });

            return api.sendMessage(
                deco.success(`✅ تم إيداع 💵 ${amount}$ في البنك`),
                threadID,
                messageID
            );
        }

        if (action === "سحب" || action === "withdraw") {
            if (amount <= 0 || amount > eco.bank) {
                return api.sendMessage(
                    deco.error("المبلغ المطلوب غير صحيح أو رصيد البنك غير كافي"),
                    threadID,
                    messageID
                );
            }

            eco.bank -= amount;
            eco.money += amount;
            await userData.set(senderID, { economy: eco });

            return api.sendMessage(
                deco.success(`✅ تم سحب 💵 ${amount}$ من البنك`),
                threadID,
                messageID
            );
        }

        let bankInfo = deco.titlePremium("🏦 معلومات البنك") + "\n\n";
        bankInfo += deco.lineStar(`الرصيد: 💵 ${eco.bank}$`) + "\n";
        bankInfo += deco.box(`
اكتب: اقتصاد بنك إيداع [المبلغ]
اكتب: اقتصاد بنك سحب [المبلغ]
        `);
        return api.sendMessage(bankInfo, threadID, messageID);
    }


    if (subCommand === "استثمر" || subCommand === "invest") {
        const type = args[1];
        const amount = parseInt(args[2]) || 0;
        const investData = INVESTMENTS[type];

        if (!investData) {
            let invest = deco.titlePremium("📈 أنواع الاستثمارات") + "\n\n";
            for (const [invType, data] of Object.entries(INVESTMENTS)) {
                invest += deco.lineStar(`${invType}: مخاطرة ${Math.floor(data.risk * 100)}% | عائد ${Math.floor(data.reward * 100)}%`) + "\n";
            }
            return api.sendMessage(invest, threadID, messageID);
        }

        if (amount <= 0 || amount > eco.money) {
            return api.sendMessage(
                deco.error("المبلغ المطلوب غير صحيح"),
                threadID,
                messageID
            );
        }

        eco.money -= amount;
        eco.investments.push({
            type,
            amount,
            startTime: now,
            duration: investData.duration
        });

        await userData.set(senderID, { economy: eco });

        return api.sendMessage(
            deco.success(`✅ تم استثمار 💵 ${amount}$ في ${type}`),
            threadID,
            messageID
        );
    }


    if (subCommand === "رهان" || subCommand === "bet") {
        const amount = parseInt(args[1]) || 0;

        if (amount <= 0 || amount > eco.money) {
            return api.sendMessage(
                deco.error("المبلغ المطلوب غير صحيح"),
                threadID,
                messageID
            );
        }

        const result = Math.random() > 0.5;
        if (result) {
            const winAmount = Math.floor(amount * 1.5);
            eco.money += winAmount;
            await userData.set(senderID, { economy: eco });
            return api.sendMessage(
                deco.success(`🎉 فزت! حصلت على 💵 ${winAmount}$`),
                threadID,
                messageID
            );
        } else {
            eco.money -= amount;
            await userData.set(senderID, { economy: eco });
            return api.sendMessage(
                deco.error(`😞 خسرت 💵 ${amount}$`),
                threadID,
                messageID
            );
        }
    }


    if (subCommand === "يومي" || subCommand === "daily") {
        const dailyReward = 1000;
        const twentyFourHours = 86400000;

        if (now - eco.lastDaily < twentyFourHours) {
            const remainingTime = twentyFourHours - (now - eco.lastDaily);
            const hours = Math.floor(remainingTime / 3600000);
            const minutes = Math.floor((remainingTime % 3600000) / 60000);
            return api.sendMessage(
                deco.warning(`لقد استلمت مكافأتك اليومية بالفعل. انتظر ${hours} ساعة و ${minutes} دقيقة أخرى. `),
                threadID,
                messageID
            );
        }

        eco.money += dailyReward;
        eco.lastDaily = now;
        await userData.set(senderID, { economy: eco });

        return api.sendMessage(
            deco.success(`🎁 تهانينا! لقد استلمت مكافأتك اليومية 💵 ${dailyReward}$.`),
            threadID,
            messageID
        );
    }


    if (subCommand === "تعدين" || subCommand === "mine") {
        const mineralType = args[1]?.toLowerCase();
        const mineralInfo = MINERALS[mineralType];

        if (!mineralInfo) {
            let mineList = deco.titlePremium("⛏️ المعادن المتاحة للتعدين") + "\n\n";
            for (const [name, info] of Object.entries(MINERALS)) {
                mineList += deco.lineStar(`${name}: قيمة ${info.value}$ | وقت التعدين ${info.cooldown / 60000} دقيقة`) + "\n";
            }
            mineList += "\n" + deco.line("للتعدين اكتب: اقتصاد تعدين [نوع المعدن]");
            return api.sendMessage(mineList, threadID, messageID);
        }

        if (now - eco.lastMine < mineralInfo.cooldown) {
            const remaining = Math.ceil((mineralInfo.cooldown - (now - eco.lastMine)) / 1000);
            return api.sendMessage(
                deco.warning(`يجب الانتظار ${remaining} ثانية قبل التعدين مجدداً. `),
                threadID,
                messageID
            );
        }

        eco.money += mineralInfo.value;
        eco.exp += mineralInfo.exp;
        eco.lastMine = now;


        if (eco.exp >= eco.level * 500) {
            eco.level++;
            eco.exp = 0;
            api.sendMessage(
                deco.success(`🎉 تم ترقيتك إلى المستوى ${eco.level}!`),
                threadID
            );
        }

        await userData.set(senderID, { economy: eco });

        return api.sendMessage(
            deco.success(`✅ قمت بتعدين ${mineralType} وحصلت على 💵 ${mineralInfo.value}$ و ✨ ${mineralInfo.exp} XP. `),
            threadID,
            messageID
        );
    }


    let help = deco.titlePremium("💰 نظام الاقتصاد") + "\n\n";
    help += deco.titleGolden("الأوامر المتاحة:") + "\n";
    help += deco.box(`
اقتصاد حالي         - عرض حالتك المالية
اقتصاد عمل [نوع]   - العمل وكسب المال
اقتصاد بنك إيداع   - إيداع أموال
اقتصاد بنك سحب     - سحب أموال
اقتصاد استثمر      - استثمر أموالك
اقتصاد رهان [المبلغ] - رهان بسيط
اقتصاد يومي         - استلام مكافأة يومية
اقتصاد تعدين [نوع]  - تعدين المعادن
    `);

    return api.sendMessage(help, threadID, messageID);
};
