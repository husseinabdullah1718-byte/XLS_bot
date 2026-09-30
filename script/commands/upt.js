const moment = require('moment-timezone');
const os = require('os');
const deco = require('../../utils/decorations');

module.exports = {
    config: {
    title: "ابتايم",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "عرض معلومات تفصيلية عن وقت التشغيل والاستضافة",
    section: "عـــامـة",
    syntax: "",
    delay: 5,
},
    ZOTERun: async ({ api, event }) => {

        const startTime = Date.now();


        const uptimeSeconds = process.uptime();
        const uptimeHours = Math.floor(uptimeSeconds / 3600);
        const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeSecs = Math.floor(uptimeSeconds % 60);
        const uptimeString = `${uptimeHours.toString().padStart(2, '0')}:${uptimeMinutes.toString().padStart(2, '0')}:${uptimeSecs.toString().padStart(2, '0')}`;


        const hostname = os.hostname();
        const platform = os.platform();
        const arch = os.arch();
        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'غير معروف';
        const cpuCores = cpus.length;
        const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(2);
        const freeMem = (os.freemem() / (1024 ** 3)).toFixed(2);
        const usedMem = (totalMem - freeMem).toFixed(2);
        const osUptime = os.uptime();
        const osUptimeHours = Math.floor(osUptime / 3600);
        const osUptimeMinutes = Math.floor((osUptime % 3600) / 60);
        const osUptimeDays = Math.floor(osUptimeHours / 24);
        const osUptimeHoursLeft = osUptimeHours % 24;
        const osUptimeString = osUptimeDays > 0 
            ? `${osUptimeDays} يوم، ${osUptimeHoursLeft} ساعة، ${osUptimeMinutes} دقيقة` 
            : `${osUptimeHours} ساعة، ${osUptimeMinutes} دقيقة`;


        const nodeVersion = process.version;
        const memoryUsage = process.memoryUsage();
        const rss = (memoryUsage.rss / (1024 ** 2)).toFixed(2);
        const heapTotal = (memoryUsage.heapTotal / (1024 ** 2)).toFixed(2);
        const heapUsed = (memoryUsage.heapUsed / (1024 ** 2)).toFixed(2);


        const startupTime = new Date(Date.now() - uptimeSeconds * 1000);
        const formattedStartup = moment(startupTime).tz('Africa/Cairo').format('YYYY-MM-DD HH:mm:ss');


        const responseTime = Date.now() - startTime;


        const memPercent = Math.min(100, Math.floor((usedMem / totalMem) * 100));


        let content = '';


        content += deco.titlePremium('معلومات البوت') + '\n';


        content += deco.line(`📆 وقت بدء التشغيل: ${formattedStartup}`) + '\n';
        content += deco.line(`⏱️ وقت تشغيل البوت: ${uptimeString}`) + '\n';
        content += deco.line(`⚡ سرعة الاستجابة: ${responseTime}ms`) + '\n';


        content += deco.separator + '\n';


        content += deco.titlePremium('معلومات الاستضافة') + '\n';
        content += deco.line(`• النظام: ${platform} (${arch})`) + '\n';
        content += deco.line(`• المعالج: ${cpuModel} (${cpuCores} نواة)`) + '\n';
        content += deco.line(`• الذاكرة الكلية: ${totalMem} GB`) + '\n';
        content += deco.line(`• الذاكرة المستخدمة: ${usedMem} GB`) + '\n';
        content += deco.line(`• الذاكرة الحرة: ${freeMem} GB`) + '\n';
        content += deco.line(`• وقت تشغيل النظام: ${osUptimeString}`) + '\n';


        content += deco.separator + '\n';


        content += deco.titlePremium('🛠️ معلومات عملية البوت') + '\n';
        content += deco.line(`• إصدار Node.js: ${nodeVersion}`) + '\n';
        content += deco.line(`• الذاكرة المستخدمة (RSS): ${rss} MB`) + '\n';
        content += deco.line(`• الكومة الإجمالية: ${heapTotal} MB`) + '\n';
        content += deco.line(`• الكومة المستخدمة: ${heapUsed} MB`) + '\n';


        content += deco.progressBar(memPercent) + '\n';


        content += deco.separator + '\n';


        content += deco.center('Miror Bot', 40) + '\n';




        api.sendMessage(content, event.threadID, event.messageID);
    }
};