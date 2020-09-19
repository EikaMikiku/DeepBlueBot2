const cfg = require("../../config.json");

async function LeagueCommand(deepblue, msg) {
    if(cfg.league.channels) {
        if(!cfg.league.channels.includes(msg.channel.name)) {
            return; //Not in the right channel
        }
    }

    let leagueRole = msg.member.roles.find(val => val.name === cfg.league.leagueRoleName);
    if(leagueRole) {
        //Remove the role
        await msg.member.removeRole(leagueRole);
        await deepblue.sendMessage(msg.channel, "League role removed.");
    } else {
        //Add the role
        let role = msg.guild.roles.find(val => val.name === cfg.league.leagueRoleName);
        await msg.member.addRole(role);
        await deepblue.sendMessage(msg.channel, "League role added.");
    }
}

module.exports = LeagueCommand;