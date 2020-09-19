const cfg = require("../config.json");
const FenCommand = require("./commands/fen.js");
const HelpCommand = require("./commands/help.js");
const ArenaCommand = require("./commands/arena.js");
const LeagueCommand = require("./commands/league.js");
const StudyCommand = require("./commands/study.js");
const VariantsCommand = require("./commands/variants.js");
const LichessCommand = require("./commands/lichess.js");
const RemoveCommand = require("./commands/remove.js");

const RatingRoleManager = require("./ratingrolemanager.js");
const LichessTracker = require("./lichesstracker.js");

const ListCommand = require("./commands/list.js");
const ActiveListCommand = require("./commands/activelist.js");
const RankCommand = require("./commands/rank.js");
const ActiveRankCommand = require("./commands/activerank.js");

function DeepBlue(discord) {
    this.guild = discord.guilds.first();
    this.botChannel = this.guild.channels.find(val => val.name === cfg.deepblue.botChannelName);
    this.modChannel = this.guild.channels.find(val => val.name === cfg.deepblue.modChannelName);
    this.staffRole = this.guild.roles.find(val => val.name === cfg.deepblue.staffRole);
    this.discord = discord;
    this.ratingRoleManager = new RatingRoleManager(this);
    this.lichessTracker = new LichessTracker(this);

    discord.on("message", msg => this.onMessage(msg));

    discord.on("guildMemberRemove", member => {
        this.lichessTracker.remove(null, member);
    });
}

DeepBlue.prototype.onMessage = async function(msg) {
    if(!cfg.deepblue.commandStartChars.includes(msg.content[0]) || !msg.member) {
        return; //Not a command, or a direct message
    }
    let cmd = msg.content.substring(1).toLowerCase();
    let log = true;

    if(cmd.startsWith("fen")) {
        await FenCommand(this, msg);
    } else if(cmd.startsWith("help") || cmd.startsWith("dbhelp")) {
        await HelpCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd.startsWith("lichess") || cmd.startsWith("link")) {
        await LichessCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd.startsWith("rank") || cmd.startsWith("myrank")) {
        await RankCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd.startsWith("activerank") || cmd.startsWith("activemyrank") || cmd.startsWith("actrank") || cmd.startsWith("actmyrank")) {
        await ActiveRankCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd.startsWith("list")) {
        await ListCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd.startsWith("active") || cmd.startsWith("actlist")) {
        await ActiveListCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd.startsWith("remove") || cmd.startsWith("unlink")) {
        await RemoveCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd === "arena") {
        await ArenaCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd === "league") {
        await LeagueCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd === "study") {
        await StudyCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd === "variants") {
        await VariantsCommand(this, msg);
        msg.delete(cfg.deepblue.messageDeleteDelay);
    } else if(cmd === "update") {
        await this.sendMessage(msg.channel, "Bot auto updates now. Check when the next update is due in the bot's status message.");
    } else {
    	log = false;
    }

    if(log) {
    	console.log(new Date().toString(), msg.member.nickname || msg.author.username, ":", msg.content);
    }
};

DeepBlue.prototype.sendMessage = async function(channel, msg, keep) {
    if(!channel) {
        channel = this.botChannel;
    }
    let sent = await channel.send(msg);
    if(!sent.deleted && !keep) {
        sent.delete(cfg.deepblue.messageDeleteDelay);
    }
};

DeepBlue.prototype.getMemberFromMention = function(text) {
    if(!text.startsWith("<@") || !text.endsWith(">")) {
        return null;
    }
    text = text.replace(/[^\d]/g, "");
    return this.guild.members.get(text);
};

module.exports = DeepBlue;
