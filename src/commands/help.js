const cfg = require("../../config.json");

async function HelpCommand(deepblue, msg) {
    if(cfg.help.channels) {
        if(!cfg.help.channels.includes(msg.channel.name)) {
            return; //Not in the right channel
        }
    }

    await deepblue.sendMessage(msg.channel, {
        "embed": {
            "color": cfg.deepblue.embedColor,
            "fields": cfg.help.fields
        }
    });
}

module.exports = HelpCommand;