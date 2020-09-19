const fetch = require("node-fetch");
const cfg = require("../config.json");
const EmojiSelector = require("./emoji.js");
const DataManager = require("./datamanager.js");
const PerfUtils = require("./perf.js");

function LichessTracker(deepblue) {
    this.deepblue = deepblue;
    this.dataManager = new DataManager(cfg.lichessTracker.dataFile);
    this.data = this.dataManager.getData();
    this.updateInterval = null;
    this.lastUpdateAt = null;
    this.updateAll();
}

LichessTracker.prototype.validateLichessParsedData = async function(data, noModSpam) {
    if(data.closed) {
        console.error(`Account "${data.username}" is closed on Lichess.`);
        if(!noModSpam) {
            await this.deepblue.modChannel.send(`${this.deepblue.staffRole}\n${data.username} has a closed account.`);
        }
        return false;
    }
    if(data.cheating) {
        console.error(data.cheating);
        if(!noModSpam) {
            await this.deepblue.modChannel.send(`${this.deepblue.staffRole}\n${data.cheating}`);
        }
        return false;
    }
    return true;
};

LichessTracker.prototype.parseLichessUserData = function(data) {
    let output = {};
    output.username = data.username;

    if(data.closed) {
        output.closed = true;
        return output;
    }

    if(data.engine || data.booster) {
        let cheating = `Player "${data.username}" (${cfg.lichessTracker.lichessProfileUrl.replace("%username%", data.username)})`;
        if(!data.engine) {
            cheating += " artificially increases/decreases their rating.";
        } else if(!data.booster) {
            cheating += " uses chess computer assistance.";
        } else {
            cheating += " uses chess computer assistance, and artificially increases/decreases their rating.";
        }
        output.cheating = cheating;
    }

    let allProvisional = true;
    for(let type in data.perfs) {
        if(cfg.deepblue.perfsForRoles.includes(type)) {
            if(!data.perfs[type].prov) {
                allProvisional = false;
            }
        }

        if(!cfg.deepblue.allPerfs.includes(type)) {
            //Do not care about this variant, delete it
            delete data.perfs[type];
            continue;
        }

        //Decrease rating if RD is above theshold and rating above threshold
        if(!data.perfs[type].prov
            && data.perfs[type].rd > cfg.lichessTracker.ratingDeviationThreshold - 1) {

            data.perfs[type].penalty = cfg.lichessTracker.highRatingDeviationPenalty;
        }
    }
    if(allProvisional) {
        output.allProvisional = true;
    }

    //Add custom FIDE perf if possible
    let fide = PerfUtils.getFideEstimate(data.perfs);
    if(fide) {
        data.perfs.fide = {
            "rating": Math.round(fide),
            "rd": 0,
            "games": -1,
            "prog": -1
        };
    }

    output.perfs = data.perfs;
    return output;
};

LichessTracker.prototype.updateManyUsers = async function(lichessData) {
    for(let i = 0; i < lichessData.length; i++) {
        let parsedData = this.parseLichessUserData(lichessData[i]);
        let uid = this.getLinkedUserId(parsedData.username);
        let valid = await this.validateLichessParsedData(parsedData);
        if(uid && valid) {
            let member = this.deepblue.guild.members.get(uid);
            if(!member) {
                console.log(`Seems like ${parsedData.username} left the server.`);
                delete this.data[uid];
                continue;
            }

            let name = member.nickname || member.user.username;

            if(member.lastMessage) {
                parsedData.lastMessageAt = member.lastMessage.createdTimestamp;
            } else {
                parsedData.lastMessageAt = this.data[uid].lastMessageAt;
            }

            if(parsedData.allProvisional) {
                await this.deepblue.ratingRoleManager.assignProvisionalRole(member);
                this.data[uid] = parsedData;
                continue;
            }

            let currentRatingRole = this.deepblue.ratingRoleManager.getCurrentRatingRole(member);
            let maxRatingPerf = PerfUtils.getMaxRating(parsedData.perfs, cfg.deepblue.perfsForRoles);
            let updatedRole = await this.deepblue.ratingRoleManager.assignRatingRole(member, maxRatingPerf);

            if(updatedRole) {
                let mrInt = parseInt(updatedRole.name);
                let crrInt = parseInt(currentRatingRole && currentRatingRole.name);
                if(isNaN(crrInt)) {
                    //Was provisional, now has proper ratings
                    await this.deepblue.sendMessage(null, `${name} went from provisional rating to ${mrInt}! Congratulations! ${EmojiSelector("happy")}`);
                } else if(mrInt > crrInt) {
                    await this.deepblue.sendMessage(null, `${name} went from ${crrInt} to ${mrInt}! Congratulations! ${EmojiSelector("happy")}`);
                } else if(mrInt < crrInt) {
                    await this.deepblue.sendMessage(null, `${name} went from ${crrInt} to ${mrInt}. ${EmojiSelector("sad")}`);
                }
            }

            this.data[uid] = parsedData;
        } else if(uid) {
            delete this.data[uid];
        }
    }
};

LichessTracker.prototype.updateAll = async function() {
    let uids = Object.keys(this.data);
    for(let i = 0; i < uids.length; i+= cfg.lichessTracker.perRequest) {
        let usernames = uids.slice(i, i + cfg.lichessTracker.perRequest).map(uid => {
            return this.data[uid].username;
        }).join(","); //Create CSV of usernames

        let newData = await this.getLichessManyUsersData(usernames);
        await this.updateManyUsers(newData)
    }
    this.dataManager.saveData(this.data);

    this.lastUpdateAt = Date.now();

    if(this.updateInterval) {
        clearInterval(this.updateInterval);
    }

    let rem = Math.round((this.lastUpdateAt + cfg.lichessTracker.updateAllDelay - Date.now()) / 2000) * 2;
    this.deepblue.discord.user.setActivity(`updates in ${rem}s`, { type: 'PLAYING' });
    this.updateInterval = setInterval(() => {
        //Round to multiple of 2
        rem = Math.round((this.lastUpdateAt + cfg.lichessTracker.updateAllDelay - Date.now()) / 2000) * 2;
        this.deepblue.discord.user.setActivity(`updates in ${rem}s`, { type: 'PLAYING' });
    }, 10000);

    setTimeout(() => {
        clearInterval(this.updateInterval);
        this.deepblue.discord.user.setActivity(`updates now!`, { type: 'PLAYING' });
        this.updateAll();
    }, cfg.lichessTracker.updateAllDelay);
};

LichessTracker.prototype.sendTrackSuccessMessageProvisional = async function(channel, username, role, nickname) {
    let title = `Linked ${nickname} to ${cfg.lichessTracker.lichessProfileUrl.replace("%username%", username)}`;
    let requiredVariants = cfg.deepblue.perfsForRoles.map(p => PerfUtils.perfToReadable(p)).join(", ");
    let msg = `Added to rating group **${role.name}**.\nCouldn't find non-provisional ratings for required variants (${requiredVariants}).`;

    await this.deepblue.sendMessage(channel, {
        "embed": {
            "title": title,
            "description": msg,
            "color": cfg.deepblue.embedColor
        }
    }, true);
};

LichessTracker.prototype.sendTrackSuccessMessage = async function(channel, perf, username, role, nickname) {
    let title = `Linked ${nickname} to ${cfg.lichessTracker.lichessProfileUrl.replace("%username%", username)}`;
    let msg = `Added to rating group **${role.name}** with a rating of **${perf.rating}** (${perf.type})`;

    if(perf.penalty) {
        msg += ` ▼\n\n▼ — Penalty of ${cfg.lichessTracker.highRatingDeviationPenalty}.`
        msg += ` RD is above ${cfg.lichessTracker.ratingDeviationThreshold}.`;
    }

    await this.deepblue.sendMessage(channel, {
        "embed": {
            "title": title,
            "description": msg,
            "color": cfg.deepblue.embedColor
        }
    }, true); //Keep message
};

LichessTracker.prototype.track = async function(msg, username, member) {
    member = member || msg.member;

    let lichessUserData = await this.getLichessUserData(username);

    if(this.data[member.id] && this.data[member.id].username) {
        let url = cfg.lichessTracker.lichessProfileUrl.replace("%username%", this.data[member.id].username);
        await this.deepblue.sendMessage(msg.channel, `Previously you were tracked as ${url}.`);
    }

    let parsedData = this.parseLichessUserData(lichessUserData);

    if(parsedData) {
        let valid = await this.validateLichessParsedData(parsedData, true);
        if(valid) {
            if(parsedData.allProvisional) {
                //If all provisional, only add provisional role, still keep track
                let role = await this.deepblue.ratingRoleManager.assignProvisionalRole(member);
                await this.sendTrackSuccessMessageProvisional(
                    msg.channel,
                    parsedData.username,
                    role,
                    member.nickname || msg.author.username
                );
            } else {
                let maxRatingPerf = PerfUtils.getMaxRating(parsedData.perfs, cfg.deepblue.perfsForRoles);
                let role = await this.deepblue.ratingRoleManager.assignRatingRole(member, maxRatingPerf);
                await this.sendTrackSuccessMessage(
                    msg.channel,
                    maxRatingPerf,
                    parsedData.username,
                    role,
                    member.nickname || member.user.username
                );
            }

            if(member.lastMessage) {
                parsedData.lastMessageAt = member.lastMessage.createdTimestamp;
            } else {
                parsedData.lastMessageAt = Date.now();
            }

            this.data[member.id] = parsedData;
            this.dataManager.saveData(this.data);
        } else if(parsedData.closed) {
            await this.deepblue.sendMessage(msg.channel, `Account "${parsedData.username}" is closed on Lichess.`);
        } else {
            await this.deepblue.sendMessage(msg.channel, `Couldn't track ${parsedData.username}.\nDid you type your username correctly?`);
        }
    }
};

LichessTracker.prototype.remove = async function(msg, member) {
    let existed = !!this.data[member.id];

    if(existed) {
        delete this.data[member.id];
        this.dataManager.saveData(this.data);

        if(msg) { //No message if left server, kicked
            await this.deepblue.ratingRoleManager.removeRatingRole(member);
        }

        let channel = msg ? msg.channel : this.deepblue.botChannel;
        await this.deepblue.sendMessage(channel, `No longer tracking ${member.nickname || member.user.username}.`, true);
    }
};

LichessTracker.prototype.removeByUsername = async function(msg, username) {
    let uid = this.getLinkedUserId(username);

    if(uid) {
        let member = this.deepblue.guild.members.get(uid);

        delete this.data[uid];
        this.dataManager.saveData(this.data);
        await this.deepblue.ratingRoleManager.removeRatingRole(member);
        await this.deepblue.sendMessage(msg.channel, `No longer tracking ${member.nickname || member.user.username}.`, true);
    } else {
        await this.deepblue.sendMessage(msg.channel, `Couldn't find a member with Lichess username "${username}".`);
    }
};

LichessTracker.prototype.getLinkedUserId = function(lichessUsername) {
    for(let uid in this.data) {
        if(this.data[uid].username.toLowerCase() === lichessUsername.toLowerCase()) {
            return uid;
        }
    }
};

LichessTracker.prototype.getLichessUserData = async function(username) {
    let result = await fetch(
        cfg.lichessTracker.lichessApiUser.replace("%username%", username),
        {
            method: "GET",
        }
    );
    return await result.json();
};

LichessTracker.prototype.getLichessManyUsersData = async function(usernames) {
    let result = await fetch(
        cfg.lichessTracker.lichessApiManyUsers,
        {
            method: "POST",
            body: usernames
        }
    );
    return await result.json();
};

module.exports = LichessTracker;