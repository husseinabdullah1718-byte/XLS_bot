// ============================================================
//  utils/backupRemote.js
//  عميل GitHub خاص بالنسخ الاحتياطي فقط — منفصل تمامًا عن أي شيء
//  آخر. يكتب لمستودع بوت الاستعادة B (وليس مستودع هذا البوت نفسه)،
//  لأن الهدف عزل النسخة الاحتياطية بمكان مستقل عن هذا البوت وقاعدته.
//
//  الإعداد المطلوب:
//    - BACKUP_GITHUB_TOKEN في متغيرات بيئة Render (Fine-grained،
//      محصور بمستودع بوت B فقط، صلاحية Contents: Read and write).
//      توكن منفصل تمامًا عن أي توكن ثاني — لو تسرّب هذا، أقصى ضرر
//      كتابة/قراءة بمستودع بوت B فقط، ما له علاقة بمستودع هذا البوت.
//    - config.BACKUP_GITHUB_OWNER / BACKUP_GITHUB_REPO / BACKUP_GITHUB_BRANCH
//
//  غير مفعّل افتراضيًا: لو التوكن غير مضبوط، كل شي يتجاوز بصمت بدون
//  أي تأثير على عمل البوت الطبيعي.
// ============================================================

const axios = require('axios');
const config = require('../config.json');

function client() {
    const token = process.env.BACKUP_GITHUB_TOKEN;
    if (!token) return null;
    const { BACKUP_GITHUB_OWNER, BACKUP_GITHUB_REPO, BACKUP_GITHUB_BRANCH } = config;
    if (!BACKUP_GITHUB_OWNER || !BACKUP_GITHUB_REPO) return null;
    return {
        owner: BACKUP_GITHUB_OWNER,
        repo: BACKUP_GITHUB_REPO,
        branch: BACKUP_GITHUB_BRANCH || 'main',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    };
}

/** يكتب/يحدّث ملف النسخة الاحتياطية بمستودع بوت B — { skipped: true } لو غير مفعّل */
async function pushBackup(filePath, jsonData) {
    const c = client();
    if (!c) return { skipped: true };

    const content = JSON.stringify(jsonData, null, 2);
    const url = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${encodeURIComponent(filePath)}`;

    let sha;
    try {
        const res = await axios.get(`${url}?ref=${encodeURIComponent(c.branch)}`, { headers: c.headers });
        sha = res.data.sha;
    } catch (e) {
        // 404 يعني الملف مو موجود بعد — عادي، رح يُنشأ أول مرة
    }

    const body = {
        message: `نسخة احتياطية تلقائية — ${new Date().toISOString()}`,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: c.branch,
    };
    if (sha) body.sha = sha;

    const res = await axios.put(url, body, { headers: c.headers });
    return { pushed: true, commitSha: res.data.commit?.sha || null };
}

module.exports = { pushBackup };
