const cfg = require("../../config.json");

async function ArenaCommand(deepblue, msg) {
    if(cfg.arena.channels) {
        if(!cfg.arena.channels.includes(msg.channel.name)) {
            return; //Not in the right channel
        }
    }

    let arenaRole = msg.member.roles.find(val => val.name === cfg.arena.arenaRoleName);

    if(arenaRole) {
        //Remove the role
        await msg.member.removeRole(arenaRole);
        await deepblue.sendMessage(msg.channel, "Arena role removed.");
    } else {
        //Add the role
        let role = msg.guild.roles.find(val => val.name === cfg.arena.arenaRoleName);
        await msg.member.addRole(role);
        await deepblue.sendMessage(msg.channel, "Arena role added.");
    }
}

module.exports = ArenaCommand;