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
            msg.delete(cfg.deepblue.messageDeleteDelay).catch(console.error);
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
        msg.delete(cfg.deepblue.messageDeleteDelay).catch(console.error);
        return;
    }

    for(let i = 0; i < cfg.deepblue.allPerfs.length; i++) {
        let type = cfg.deepblue.allPerfs[i];
        if(userData.perfs[type]) {
            //Show provisional, but without rank
            if(userData.perfs[type].prov) {
                allRatings[type] = {
                    "type": PerformanceBreakdown.perfToReadable(type),
                    "rating": userData.perfs[type].rating
                };
            } else {
                allRatings[type] = {
                    "rank": PerformanceBreakdown.getRank(allData, member.id, [type]),
                    "type": PerformanceBreakdown.perfToReadable(type),
                    "rating": userData.perfs[type].rating
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
    if(!isFinite(roleRating.rating)) {
        result.embed.description += `Rating for role: **Provisional**`;
    } else {
        if(roleRating.penalty) {
            roleRating.rating -= roleRating.penalty;
        }
        result.embed.description += `Rating for role: **${roleRating.rating}${roleRating.penalty ? "▼" : ""}** (${roleRating.type})`;
    }

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
    result.embed.description += `\nHighest rating: **${highObj.rating}** (${highObj.rank ? "#" + highObj.rank : "Provisional"}, ${highObj.type})`;

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
        result.embed.description += `\nBest rank: **#${bestObj.rank}** (${bestObj.rating}, ${bestObj.type})\n`;
    } else {
        result.embed.description += `\nBest rank: **All provisional**\n`;
    }

    //Standard chess rankings
    result.embed.description += getRankText(allRatings, "classical");
    result.embed.description += getRankText(allRatings, "rapid");
    result.embed.description += getRankText(allRatings, "blitz");
    result.embed.description += getRankText(allRatings, "bullet") + "\n";

    result.embed.description += getRankText(allRatings, "fide");
    result.embed.description += getRankText(allRatings, "chess960");
    result.embed.description += getRankText(allRatings, "crazyhouse");

    if(roleRating.penalty) {
        result.embed.description += `\n\n▼ — Penalty of ${cfg.lichessTracker.highRatingDeviationPenalty}.`
        result.embed.description += ` RD is above ${cfg.lichessTracker.ratingDeviationThreshold}.`;
    }

    await deepblue.sendMessage(msg.channel, result);
    msg.delete(cfg.deepblue.messageDeleteDelay).catch(console.error);
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
        if(data.rank) {
            return `\n${data.type}: **${data.rating}** (#${data.rank})`;
        } else {
            //Provisional, so no rank
            return `\n${data.type}: ${data.rating}?`;
        }
    }
    return "";
}

module.exports = RankCommand;