const cfg = require("../../config.json");
const DataManager = require("../datamanager.js");
const PerformanceBreakdown = require("../perf.js");

async function RankCommand(deepblue, msg) {
    if(cfg.rank.channels) {
        if(!cfg.rank.channels.includes(msg.channel.name)) {
            return; //Not in the right channel
        }
    }

    let member = msg.member;
    let allData = new DataManager(cfg.lichessTracker.dataFile).getData();

    //Get member from message
    let split = msg.content.split(/\s+/);

    if(split.length === 2) {
        member = deepblue.getMemberFromMention(split[1]);
        if(!member) {
            //Not a mention, so a username
            let uid = getUidFromUsername(allData, split[1]);
            member = deepblue.guild.members.get(uid);
        }
        if(!member) {
            await deepblue.sendMessage(msg.channel, `Couldn't find tracked Lichess username "${split[1]}".`);
            return;
        }
    }

    let allRatings = {};
    let userData = null;

    for(let uid in allData) {
        if(uid === member.id) {
            userData = allData[uid];
            break;
        }
    }

    if(!userData) {
        await deepblue.sendMessage(msg.channel, "Couldn't find ranking.");
        return;
    }

    if(userData.allProvisional) {
        await deepblue.sendMessage(msg.channel, "All ratings are provisional. Cannot fetch active ranks.");
        return;
    }

    //Only active members are allowed to be listed
    let now = Date.now();
    if(allData[msg.member.id]) {
        //Make sure to allow sender to be ranked
        allData[msg.member.id].lastMessageAt = now;
    }
    for(uid in allData) {
        if(allData[uid].lastMessageAt) {
            let d = allData[uid].lastMessageAt + cfg.list.inactiveThreshold;
            if(d > now) {
                continue;
            }
        }
        if(uid === member.id) {
            //If asking active rating for an inactive member
            await deepblue.sendMessage(msg.channel, "Member is inactive. Cannot fetch active ranks.");
            return;
        }
        delete allData[uid];
    }

    for(let i = 0; i < cfg.deepblue.allPerfs.length; i++) {
        let type = cfg.deepblue.allPerfs[i];
        if(userData.perfs[type]) {
            //Do not include provisional ratings, or inactive members
            if(!userData.perfs[type].prov) {
                allRatings[type] = {
                    "rank": PerformanceBreakdown.getRank(allData, member.id, [type], true), //Active flag set
                    "type": PerformanceBreakdown.perfToReadable(type),
                    "rating": userData.perfs[type].rating - (userData.perfs[type].penalty || 0),
                    "penalty": userData.perfs[type].penalty
                };
            }
        }
    }

    let result = {
        "embed": {
            "thumbnail": {
              "url": member.user.avatarURL
            },
            "url": cfg.lichessTracker.lichessProfileUrl.replace("%username%", userData.username),
            "color": cfg.deepblue.embedColor,
            "title": `${member.nickname || member.user.username}'s ratings and rankings:`,
            "description": ""
        }
    };

    let roleRating = PerformanceBreakdown.getMaxRating(userData.perfs, cfg.deepblue.perfsForRoles);
    if(roleRating.penalty) {
        roleRating.rating -= roleRating.penalty;
    }
    result.embed.description += `Rating for role: **${roleRating.rating}** (${roleRating.type})${roleRating.penalty ? " ▼" : ""}`;

    //Finding highest rating rank
    let highObj = null;
    let highRating = -Infinity;
    for(let type in allRatings) {
        let rating = allRatings[type].rating;
        if(rating >= highRating) {
            highObj = allRatings[type];
            highRating = rating;
        }
    }
    result.embed.description += `\nHighest rating: **${highObj.rating}** (#${highObj.rank}, ${highObj.type})${highObj.penalty ? " ▼" : ""}`;

    //Finding best rank
    let bestObj = null;
    let bestRank = Infinity;
    for(let type in allRatings) {
        let rank = allRatings[type].rank;
        if(!rank) {
            continue;
        } else if(rank < bestRank) {
            bestObj = allRatings[type];
            bestRank = rank;
        }
    }
    if(bestObj) {
        result.embed.description += `\nBest rank: **#${bestObj.rank}** (${bestObj.rating}, ${bestObj.type})${bestObj.penalty ? " ▼" : ""}\n`;
    }

    //Standard chess rankings
    result.embed.description += getRankText(allRatings, "classical");
    result.embed.description += getRankText(allRatings, "rapid");
    result.embed.description += getRankText(allRatings, "blitz");
    result.embed.description += getRankText(allRatings, "bullet") + "\n";

    result.embed.description += getRankText(allRatings, "fide");
    result.embed.description += getRankText(allRatings, "chess960");
    result.embed.description += getRankText(allRatings, "crazyhouse");

    for(let type in allRatings) {
        if(allRatings[type].penalty) {
            result.embed.description += `\n\n▼ — Penalty of ${cfg.lichessTracker.highRatingDeviationPenalty}.`
            result.embed.description += ` RD is above ${cfg.lichessTracker.ratingDeviationThreshold}.`;
            break;
        }
    }

    await deepblue.sendMessage(msg.channel, result);
}

function getUidFromUsername(allData, username) {
    for(let uid in allData) {
        if(allData[uid].username.toLowerCase() === username.toLowerCase()) {
            return uid;
        }
    }

    return null;
}

function getRankText(allRatings, type) {
    if(allRatings[type]) {
        let data = allRatings[type];
        return `\n${data.type}: **${data.rating}** (#${data.rank})${data.penalty ? " ▼" : ""}`;
    }
    return "";
}

module.exports = RankCommand;