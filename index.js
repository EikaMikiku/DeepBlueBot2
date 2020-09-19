const cfg = require("./config.json");
const DeepBlue = require("./src/deepblue.js");
const client = new (require("discord.js")).Client({
    disabledEvents: ["TYPING_START"]
});

client.login(cfg.discordToken);
client.on("ready", () => {
    let guild = client.guilds.first();
    let roles = [...cfg.ratingRoleManager.roles];
    roles.push(cfg.ratingRoleManager.unrankedRole);
    roles.push(cfg.ratingRoleManager.provisionalRole);
    roles.push(cfg.deepblue.staffRole);
    roles.push(cfg.league.leagueRoleName);
    roles.push(cfg.arena.arenaRoleName);
    roles.push(cfg.study.studyRoleName);

    for(let i = 0; i < roles.length; i++) {
        let role = roles[i];
        let foundRole = guild.roles.find(val => val.name === role);
        if(!foundRole) {
            console.error("Coundn't find role", role);
            return;
        }
    }

    new DeepBlue(client);
    console.log(new Date().toString(), "The bot started!");
});

client.on("error", console.error);