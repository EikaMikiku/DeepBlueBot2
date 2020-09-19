function PerformanceBreakdown() {
}

PerformanceBreakdown.getMaxRating = function(perfs, types) {
    let maxRating = {
        "rating": -Infinity,
        "type": "Unknown"
    };

    for(type in perfs) {
        if(types && types.includes(type) || !types) {
            if(!perfs[type].prov) {
                let penRat1 = perfs[type].rating - (perfs[type].penalty || 0);
                let penRat2 = maxRating.rating - (maxRating.penalty || 0);
                if(penRat1 > penRat2) {
                    maxRating = perfs[type];
                    maxRating.type = PerformanceBreakdown.perfToReadable(type);
                }
            }
        }
    }

    return maxRating;
};

PerformanceBreakdown.getRank = function(allData, pivotUid, types, activeOnly) {
    let keys = Object.keys(allData);

    keys = keys.map(uid => {
        allData[uid].uid = uid;
        allData[uid].maxRating = this.getMaxRating(allData[uid].perfs, types);
        return allData[uid];
    });

    keys.sort((a, b) => {
        if(activeOnly) {
            //Apply penalties when ranking
            return (b.maxRating.rating - (b.maxRating.penalty || 0)) - (a.maxRating.rating - (a.maxRating.penalty || 0));
        } else {
            return b.maxRating.rating - a.maxRating.rating;
        }
    });

    for(let i = 0; i < keys.length; i++) {
        if(keys[i].uid === pivotUid) {
            return i + 1;
        }
    }
};

PerformanceBreakdown.getFideEstimate = function(perfs) {
    //Classical rating
    let cr = null;
    if(perfs.classical && !perfs.classical.prov) {
        cr = perfs.classical.rating;
    }

    //Blitz rating
    let br = null;
    if(perfs.blitz && !perfs.blitz.prov) {
        br = perfs.blitz.rating;
    }

    if(cr && br) {
        if(cr > 2100 || br > 2100) {
            return (br + cr + cr + cr) / 4 - 150;
        } else {
            return (br + br + br + cr) / 4 - 150;
        }
    } else {
        return null;
    }
}

PerformanceBreakdown.toPerfName = function(name) {
    if(name === "ultrabullet" || name === "ultra") {
        return "ultraBullet";
    }
    if(name === "koth" || name === "kingofthehill") {
        return "kingOfTheHill";
    }
    if(name === "960" || name === "fischer" || name === "c960") {
        return "chess960";
    }
    if(name === "bughouse" || name === "ch" || name === "zh") {
        return "crazyhouse";
    }
    if(name === "threecheck" || name === "3c") {
        return "threeCheck";
    }
    if(name === "corr") {
        return "correspondence";
    }
    if(name === "racingkings" || name === "rk") {
        return "racingKings";
    }

    return name;
};

PerformanceBreakdown.perfToReadable = function(name) {
    if(name === "ultraBullet") {
        return "Ultra Bullet";
    }
    if(name === "kingOfTheHill") {
        return "King Of The Hill";
    }
    if(name === "racingKings") {
        return "Racing Kings";
    }
    if(name === "threeCheck") {
        return "Three Check";
    }
    if(name === "fide") {
        return "FIDE estimate";
    }

    return name[0].toUpperCase() + name.slice(1);
};

module.exports = PerformanceBreakdown;