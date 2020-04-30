const request = require("request");
const cfg = require("../config.json");
const EmojiSelector = require("./emoji.js");
const DataManager = require("./datamanager.js");
const PerformanceBreakdown = require("./perf.js");

function LichessTracker(deepblue) {
    this.deepblue = deepblue;
    this.dataManager = new DataManager(cfg.lichessTracker.dataFile);
    this.data = this.dataManager.getData();
    this.updateInterval = null;
    this.lastUpdateAt = null;
    this.updateAll();
}

LichessTracker.prototype.validateLichessParsedData = function(data, noModSpam) {
    if(data.closed) {
        console.error(`Account "${data.username}" is closed on Lichess.`);
        if(!noModSpam) {
            this.deepblue.modChannel.send(`${this.deepblue.staffRole}\n${data.username} has a closed account.`);
        }
        return false;
    }
    if(data.cheating) {
        console.error(data.cheating);
        if(!noModSpam) {
            this.deepblue.modChannel.send(`${this.deepblue.staffRole}\n${data.cheating}`);
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
    let fide = PerformanceBreakdown.getFideEstimate(data.perfs);
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

LichessTracker.prototype.updateManyUsers = function(lichessData) {
    for(let i = 0; i < lichessData.length; i++) {
        let parsedData = this.parseLichessUserData(lichessData[i]);
        let uid = this.getLinkedUserId(parsedData.username);
        let valid = this.validateLichessParsedData(parsedData);
        if(uid && valid) {
            let member = this.deepblue.guild.members.get(uid);
            if(!member) {
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
                this.deepblue.ratingRoleManager.assignProvisionalRole(member);
                this.data[uid] = parsedData;
                continue;
            }

            let currentRatingRole = this.deepblue.ratingRoleManager.getCurrentRatingRole(member);
            let perf = PerformanceBreakdown.getMaxRating(parsedData.perfs, cfg.deepblue.perfsForRoles);
            let updatedRole = this.deepblue.ratingRoleManager.assignRatingRole(
                member,
                perf
            );

            if(updatedRole) {
                let mrInt = parseInt(updatedRole.name);
                let crrInt = parseInt(currentRatingRole.name);
                if(isNaN(crrInt)) {
                    //Was provisional, now has proper ratings
                    this.sendTrackSuccessMessage(
                        this.deepblue.botChannel,
                        perf,
                        parsedData.username,
                        updatedRole,
                        name
                    );
                    this.deepblue.sendMessage(null, `${name} went from provisional rating to ${mrInt}! Congratulations! ${EmojiSelector("happy")}`);
                } else if(mrInt > crrInt) {
                    this.deepblue.sendMessage(null, `${name} went from ${crrInt} to ${mrInt}! Congratulations! ${EmojiSelector("happy")}`);
                } else if(mrInt < crrInt) {
                    this.deepblue.sendMessage(null, `${name} went from ${crrInt} to ${mrInt}. ${EmojiSelector("sad")}`);
                }
            }

            this.data[uid] = parsedData;
        } else if(uid) {
            delete this.data[uid];
        }
    }
};

LichessTracker.prototype.updateAll = function() {
    //Create chain of bulk updates and start it
    let start = null;
    let chain = new Promise((resolve, reject) => start = resolve);

    let uids = Object.keys(this.data);

    for(let i = 0; i < uids.length; i+= cfg.lichessTracker.perRequest) {
        let usernames = uids.slice(i, i + cfg.lichessTracker.perRequest).map(uid => {
            return this.data[uid].username;
        }).join(","); //Create CSV of usernames
        chain = chain.then(() => {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    this.getLichessManyUsersData(usernames)
                    .then(data => this.updateManyUsers(data))
                    .then(resolve)
                    .catch(reject);
                }, i === 0 ? 0 : cfg.lichessTracker.apiRequestTimeout);
            });
        })
        .catch(console.error);
    }

    chain = chain.then(() => {
        this.dataManager.saveData(this.data);
    });
    chain.then(() => {
        this.lastUpdateAt = Date.now();

        if(this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(() => {
            //Round to multiple of 2
            let rem = Math.round((this.lastUpdateAt + cfg.lichessTracker.updateAllDelay - Date.now()) / 2000) * 2;
            this.deepblue.discord.user.setActivity(`updates in ${rem}s`, { type: 'PLAYING' });
        }, 10000);

        setTimeout(() => {
            this.updateAll();
        }, cfg.lichessTracker.updateAllDelay);
    });
    chain.catch(console.error);

    start();
};

LichessTracker.prototype.sendTrackSuccessMessageProvisional = function(channel, username, role, nickname) {
    let title = `Linked ${nickname} to ${cfg.lichessTracker.lichessProfileUrl.replace("%username%", username)}`;
    let requiredVariants = cfg.deepblue.perfsForRoles.map(p => PerformanceBreakdown.perfToReadable(p)).join(", ");
    let msg = `Added to rating group **${role.name}**.\nCouldn't find non-provisional ratings for required variants (${requiredVariants}).`;

    this.deepblue.sendMessage(channel, {
        "embed": {
            "title": title,
            "description": msg,
            "color": cfg.deepblue.embedColor
        }
    }, true);
};

LichessTracker.prototype.sendTrackSuccessMessage = function(channel, perf, username, role, nickname) {
    let title = `Linked ${nickname} to ${cfg.lichessTracker.lichessProfileUrl.replace("%username%", username)}`;
    let msg = `Added to rating group **${role.name}** with a rating of **${perf.rating}** (${perf.type})`;

    if(perf.penalty) {
        msg += ` ▼\n\n▼ — Penalty of ${cfg.lichessTracker.highRatingDeviationPenalty}.`
        msg += ` RD is above ${cfg.lichessTracker.ratingDeviationThreshold}.`;
    }

    this.deepblue.sendMessage(channel, {
        "embed": {
            "title": title,
            "description": msg,
            "color": cfg.deepblue.embedColor
        }
    }, true); //Keep message
}

LichessTracker.prototype.track = function(msg, username, member) {
    member = member || msg.member;

    this.getLichessUserData(username)
    .then((lichessUserData) => {
        if(this.data[member.id] && this.data[member.id].username) {
            let url = cfg.lichessTracker.lichessProfileUrl.replace("%username%", this.data[member.id].username);
            this.deepblue.sendMessage(msg.channel, `Previously you were tracked as ${url}.`);
        }

        let parsedData = this.parseLichessUserData(lichessUserData);

        if(parsedData) {
            let valid = this.validateLichessParsedData(parsedData, true);
            if(valid) {
                if(parsedData.allProvisional) {
                    //If all provisional, only add provisional role, still keep track
                    let role = this.deepblue.ratingRoleManager.assignProvisionalRole(member);
                    this.sendTrackSuccessMessageProvisional(
                        msg.channel,
                        parsedData.username,
                        role,
                        member.nickname || msg.author.username
                    );
                } else {
                    let perf = PerformanceBreakdown.getMaxRating(parsedData.perfs, cfg.deepblue.perfsForRoles);
                    let role = this.deepblue.ratingRoleManager.assignRatingRole(member, perf);
                    this.sendTrackSuccessMessage(
                        msg.channel,
                        perf,
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
                this.deepblue.sendMessage(msg.channel, `Account "${parsedData.username}" is closed on Lichess.`);
            } else {
                this.deepblue.sendMessage(msg.channel, `Couldn't track ${parsedData.username}.\nDid you type your username correctly?`);
            }
        }
    })
    .catch(error => {
        this.deepblue.sendMessage(msg.channel, error.toString());
    })
    .finally(() => {
        console.log("Tracking done", username);
    });
};

LichessTracker.prototype.remove = function(msg, member) {
    let existed = !!this.data[member.id];

    if(existed) {
        delete this.data[member.id];
        this.dataManager.saveData(this.data);

        if(msg) { //No message if left server, kicked
            this.deepblue.ratingRoleManager.removeRatingRole(member);
        }

        let channel = msg ? msg.channel : this.deepblue.botChannel;
        this.deepblue.sendMessage(channel, `No longer tracking ${member.nickname || member.user.username}.`, true);
    }
};

LichessTracker.prototype.removeByUsername = function(msg, username) {
    let uid = this.getLinkedUserId(username);

    if(uid) {
        let member = this.deepblue.guild.members.get(uid);

        delete this.data[uid];
        this.dataManager.saveData(this.data);
        this.deepblue.ratingRoleManager.removeRatingRole(member);
        this.deepblue.sendMessage(msg.channel, `No longer tracking ${member.nickname || member.user.username}.`, true);
    } else {
        this.deepblue.sendMessage(msg.channel, `Couldn't find a member with Lichess username "${username}".`);
    }
};

LichessTracker.prototype.getLinkedUserId = function(lichessUsername) {
    for(let uid in this.data) {
        if(this.data[uid].username.toLowerCase() === lichessUsername.toLowerCase()) {
            return uid;
        }
    }
};

LichessTracker.prototype.getLichessUserData = function(username) {
    return new Promise((resolve, reject) => {
        let url = cfg.lichessTracker.lichessApiUser.replace("%username%", username);
        request.get(url, (error, response, body) => {
            if(error) {
                return reject("Error accessing Lichess API.");
            }
            if(body.length === 0) {
                return reject(`Couldn't find "${username}" on Lichess.`);
            }
            let json = null;
            try {
                json = JSON.parse(body);
                resolve(json);
            } catch(e) {
                reject(`Error getting user data for "${username}".`);
            }
        });
    });
};

LichessTracker.prototype.getLichessManyUsersData = function(usernames) {
    return new Promise((resolve, reject) => {
        request({
            method: "POST",
            url: cfg.lichessTracker.lichessApiManyUsers,
            body: usernames
        }, (error, response, body) => {
            if(error) {
                return reject("Error accessing Lichess API.");
            }
            if(body.length === 0) {
                return reject(`Couldn't find one of "${usernames}" on Lichess.`);
            }
            let json = null;
            try {
                json = JSON.parse(body);
                resolve(json);
            } catch(e) {
                reject(`Error getting user data for "${usernames}".`);
            }
        });
    });
};

module.exports = LichessTracker;