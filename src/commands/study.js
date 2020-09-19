const cfg = require("../../config.json");

async function StudyCommand(deepblue, msg) {
    if(cfg.study.channels) {
        if(!cfg.study.channels.includes(msg.channel.name)) {
            return; //Not in the right channel
        }
    }

    let studyRole = msg.member.roles.find(val => val.name === cfg.study.studyRoleName);
    if(studyRole) {
        //Remove the role
        await msg.member.removeRole(studyRole);
        await deepblue.sendMessage(msg.channel, "Study role removed.");
    } else {
        //Add the role
        let role = msg.guild.roles.find(val => val.name === cfg.study.studyRoleName);
        await msg.member.addRole(role);
        await deepblue.sendMessage(msg.channel, "Study role added.");
    }
}

module.exports = StudyCommand;