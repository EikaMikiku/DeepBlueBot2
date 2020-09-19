const cfg = require("../../config.json");

async function LichessCommand(deepblue, msg) {
    if(cfg.lichess.channels) {
        if(!cfg.lichess.channels.includes(msg.channel.name)) {
            return; //Not in the right channel
        }
    }

    let split = msg.content.split(/\s+/);

    if(split.length < 2) {
        await deepblue.sendMessage(msg.channel, "Not enough parameters.");
    } else if(split.length === 2) {
        await deepblue.lichessTracker.track(msg, split[1]);
    } else if(split.length === 3) {
        let staffRoleOnMember = msg.member.roles.find(val => val.name === cfg.deepblue.staffRole);

        if(staffRoleOnMember) {
            //Check if mention
            let member = deepblue.getMemberFromMention(split[2]);

            if(member) {
                deepblue.lichessTracker.track(msg, split[1], member);
            } else {
                await deepblue.sendMessage(msg.channel, "Couldn't find a member from mention.");
            }
        } else {
            await deepblue.sendMessage(msg.channel, "You do not have a staff role to use this command.");
        }
    } else {
        await deepblue.sendMessage(msg.channel, "Too many parameters.");
    }
}

module.exports = LichessCommand;