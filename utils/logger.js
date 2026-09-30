const chalk = require('chalk');

const colors = {
    Zote: chalk.bold.hex('#00E5FF'),
    ZOTE: chalk.bold.hex('#FF007F'),
    info: chalk.hex('#00FF95'),
    warn: chalk.hex('#FFD700'),
    error: chalk.hex('#FF3131'),
    cmd: chalk.hex('#BC13FE'),
    event: chalk.hex('#39FF14')
};

const logger = {
    banner: () => {
        console.clear();

        const botName = Zote.client?.config?.BOTNAME || 'Zote';
        const commandsCount = Zote.client?.commands?.size || 0;
        const uptime = Zote.client?.startTime ? Math.floor((Date.now() - Zote.client.startTime) / 1000) : 0;
        const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;


        const logo = `
   ${colors.Zote('███████╗ ██████╗ ████████╗███████╗')}
   ${colors.Zote('╚══███╔╝██╔═══██╗╚══██╔══╝██╔════╝')}
   ${colors.Zote('  ███╔╝ ██║   ██║   ██║   █████╗  ')}
   ${colors.Zote(' ███╔╝  ██║   ██║   ██║   ██╔══╝  ')}
   ${colors.Zote('███████╗╚██████╔╝   ██║   ███████╗')}
   ${colors.Zote('╚══════╝ ╚═════╝    ╚═╝   ╚══════╝')}
        `;


        const infoLine = `${colors.ZOTE('Developer: ZOTE Tracks')}  •  ${colors.info('Bot:')} ${botName}  •  ${colors.event('Uptime:')} ${uptimeStr}  •  ${colors.cmd('Commands:')} ${commandsCount}`;

        console.log(logo);
        console.log(chalk.gray('   ' + '—'.repeat(60)));
        console.log(`   ${infoLine}`);
        console.log(chalk.gray('   ' + '—'.repeat(60)) + '\n');
    },

    info: (msg) => {
        console.log(`${colors.info(' [ INFO ] ')} ${chalk.white(msg)}`);
    },

    warn: (msg) => {
        console.log(`${colors.warn(' [ WARN ] ')} ${chalk.white(msg)}`);
    },

    error: (msg, err) => {
        console.log(`${colors.error(' [ ERROR ] ')} ${chalk.white(msg)}`);
        if (err) console.error(chalk.redBright(err));
    },

    success: (msg) => {
        console.log(`${colors.info(' [ SUCCESS ] ')} ${chalk.bold.greenBright(msg)} ✨`);
    },

    loader: (msg, type) => {
        let color;
        switch (type?.toLowerCase()) {
            case 'cmd': color = colors.cmd; break;
            case 'event': color = colors.event; break;
            default: color = colors.Zote;
        }
        console.log(`${color(` [ ${type?.toUpperCase() || 'LOAD'} ] `)} ${chalk.white(msg)}`);
    },

    ZOTE: (msg) => {
        console.log(`${colors.ZOTE(' [ ZOTE TRACKS ] ')} ${chalk.magentaBright(msg)} 🔥`);
    }
};

module.exports = logger;