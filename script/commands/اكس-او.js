/**
 * أمر: اكس او (XO / تيك تاك تو) — لعبة بين لاعبين داخل المجموعة
 * -------------------------------------------------------------
 * .اكس او (بالرد على رسالة الشخص الي تريد تلعب معه) → يبدأ اللعبة
 * كل لاعب يرد على رسالة اللوحة برقم الخانة (1-9) عشان يلعب دوره
 * .اكس او استسلام (بالرد على لوحة اللعبة) → استسلام وإنهاء الجولة
 *
 * لعبة واحدة فقط بكل مجموعة بنفس الوقت (حالة بالذاكرة، تُصفَّر عند
 * إعادة تشغيل البوت — طبيعي لأنها لعبة قصيرة العمر).
 */

const deco = require("../../utils/decorations");

module.exports.config = {
    title: "اكس او",
    aliases: ["xo", "tictactoe"],
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "لعبة اكس-او (تيك تاك تو) بين لاعبين، بالرد على رسالة الخصم لبدء التحدي",
    section: "الــعــاب",
    syntax: "اكس او (بالرد على رسالة الخصم)",
    delay: 3,
};

// threadID -> { board, players: {X: id, O: id}, names: {X, O}, turn, messageID }
const activeGames = new Map();

const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // صفوف
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // أعمدة
    [0, 4, 8], [2, 4, 6],            // أقطار
];

const CELL_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

function renderBoard(board) {
    const cells = board.map((v, i) => (v === null ? CELL_NUMBERS[i] : v === "X" ? "❌" : "⭕"));
    return (
        `${cells[0]}${cells[1]}${cells[2]}\n` +
        `${cells[3]}${cells[4]}${cells[5]}\n` +
        `${cells[6]}${cells[7]}${cells[8]}`
    );
}

function checkWinner(board) {
    for (const [a, b, c] of WIN_LINES) {
        if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
    }
    if (board.every((v) => v !== null)) return "draw";
    return null;
}

async function getSafeName(api, userID) {
    try {
        const info = await api.getUserInfo(userID);
        return info?.[userID]?.name || "لاعب";
    } catch (e) {
        return "لاعب";
    }
}

function sendBoard(api, threadID, game, extraNote = "") {
    const turnName = game.names[game.turn];
    const body =
        `⭕❌ لعبة اكس-او\n\n${renderBoard(game.board)}\n\n` +
        `دور: ${turnName} (${game.turn === "X" ? "❌" : "⭕"})\n` +
        `↩ رد على هذه الرسالة برقم الخانة (1-9)${extraNote}`;

    api.sendMessage(body, threadID, (err, info) => {
        if (err) return;
        game.messageID = info.messageID;
        activeGames.set(threadID, game);
        Zote.client.ZOTEReply.push({
            name: module.exports.config.title,
            messageID: info.messageID,
            author: null, // كلا اللاعبين يقدروا يردوا، الفحص الفعلي داخل ZOTEReply
            threadID,
        });
    });
}

module.exports.ZOTERun = async function ({ api, event }) {
    const { threadID, messageID, senderID, messageReply } = event;

    if (activeGames.has(threadID)) {
        return api.sendMessage(deco.error("فيه لعبة اكس-او شغّالة أصلاً بهذه المجموعة. خلّصوها أول."), threadID, messageID);
    }

    if (!messageReply || !messageReply.senderID) {
        return api.sendMessage(
            "• طريقة الاستخدام:\n.اكس او (بالرد على رسالة الشخص اللي تريد تتحدّاه)",
            threadID, messageID
        );
    }

    const opponentID = messageReply.senderID;

    if (opponentID === senderID) {
        return api.sendMessage(deco.error("ما بتقدر تلعب مع حالك 😂"), threadID, messageID);
    }
    if (opponentID === api.getCurrentUserID()) {
        return api.sendMessage(deco.error("البوت مش لاعب 🤖"), threadID, messageID);
    }

    const [challengerName, opponentName] = await Promise.all([
        getSafeName(api, senderID),
        getSafeName(api, opponentID),
    ]);

    const game = {
        board: Array(9).fill(null),
        players: { X: senderID, O: opponentID },
        names: { X: challengerName, O: opponentName },
        turn: "X",
    };
    activeGames.set(threadID, game);

    sendBoard(api, threadID, game, `\n\n(${challengerName} ❌ ضد ${opponentName} ⭕)`);
};

module.exports.ZOTEReply = async function ({ api, event, ZOTEReply }) {
    const { threadID, messageID, senderID, body } = event;

    const game = activeGames.get(threadID);
    if (!game || game.messageID !== ZOTEReply.messageID) return; // لعبة قديمة/منتهية

    if (senderID !== game.players.X && senderID !== game.players.O) return; // مو لاعب بهذه الجولة

    const playerSymbol = senderID === game.players.X ? "X" : "O";

    // استسلام
    if (body.trim() === "استسلام") {
        activeGames.delete(threadID);
        const winnerSymbol = playerSymbol === "X" ? "O" : "X";
        return api.sendMessage(
            deco.line(`🏳️ ${game.names[playerSymbol]} استسلم!\n🏆 الفائز: ${game.names[winnerSymbol]}`),
            threadID, messageID
        );
    }

    if (playerSymbol !== game.turn) {
        return; // مو دورك — تجاهل صامت
    }

    const cell = parseInt(body.trim());
    if (isNaN(cell) || cell < 1 || cell > 9) return; // رد غير صالح، تجاهل صامت

    const index = cell - 1;
    if (game.board[index] !== null) {
        return api.sendMessage(deco.error("هذه الخانة محجوزة أصلاً، اختر رقم ثاني."), threadID, messageID);
    }

    game.board[index] = playerSymbol;

    const result = checkWinner(game.board);

    if (result === "draw") {
        activeGames.delete(threadID);
        return api.sendMessage(
            `⭕❌ لعبة اكس-او\n\n${renderBoard(game.board)}\n\n🤝 تعادل! لا يوجد فائز.`,
            threadID, messageID
        );
    }

    if (result === "X" || result === "O") {
        activeGames.delete(threadID);
        return api.sendMessage(
            `⭕❌ لعبة اكس-او\n\n${renderBoard(game.board)}\n\n🏆 الفائز: ${game.names[result]} (${result === "X" ? "❌" : "⭕"})`,
            threadID, messageID
        );
    }

    game.turn = game.turn === "X" ? "O" : "X";
    sendBoard(api, threadID, game);
};
