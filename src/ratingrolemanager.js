const cfg = require("../config.json");

function RatingRoleManager(deepblue) {
    this.roles = cfg.ratingRoleManager.roles;
    this.unrankedRole = cfg.ratingRoleManager.unrankedRole;
    this.provisionalRole = cfg.ratingRoleManager.provisionalRole;
    this.deepblue = deepblue;

    this.deepblue.discord.on("guildMemberAdd", member => {
        let role =  this.deepblue.guild.roles.find(val => val.name === this.unrankedRole);
        member.addRole(role);
    });
}

RatingRoleManager.prototype.assignRatingRole = async function(member, perf) {
    //Check if user has unranked role and remove it
    let unranked = member.roles.find(val => val.name === this.unrankedRole);
    if(unranked) {
        await member.removeRole(unranked);
    }

    let matchedRole = this.getRatingRoleForRating(perf.rating - (perf.penalty || 0));
    let actualRole = null;

    //Remove other rating roles, if there are any
    let alreadyHasMatchedRole = false;
    member.roles.some(role => {
        if(this.roles.includes(role.name) || role.name === this.provisionalRole) {
            if(role.name === matchedRole) {
                alreadyHasMatchedRole = true;
                actualRole = role;
            } else {
                member.removeRole(role);
            }
        }
    });

    //Add new role, if needed
    if(!alreadyHasMatchedRole) {
        let role = this.deepblue.guild.roles.find(val => val.name === matchedRole);
        actualRole = role;
        await member.addRole(role);
    }

    return actualRole;
};

RatingRoleManager.prototype.assignProvisionalRole = async function(member) {
    //Check if user has unranked role and remove it
    let unranked = member.roles.find(val => val.name === this.unrankedRole);
    if(unranked) {
        await member.removeRole(unranked);
    }

    let currentRole = this.getCurrentRatingRole(member);
    let provRole = this.deepblue.guild.roles.find(val => val.name === this.provisionalRole);
    if(!currentRole || currentRole.name !== provRole.name) {
        if(currentRole) {
            await member.removeRole(currentRole);
        }
        await member.addRole(provRole);
    }

    return provRole;
};

RatingRoleManager.prototype.getCurrentRatingRole = function(member) {
    let found = null;

    member.roles.some(role => {
        if(this.roles.includes(role.name) || role.name === this.provisionalRole) {
            found = role;
        }
    });

    return found;
};

RatingRoleManager.prototype.removeRatingRole = async function(member) {
    member.roles.some(role => {
        if(this.roles.includes(role.name) || role.name === this.provisionalRole) {
            member.removeRole(role);
        }
    });

    let unranked = this.deepblue.guild.roles.find(val => val.name === this.unrankedRole);
    await member.addRole(unranked);
};

RatingRoleManager.prototype.getRatingRoleForRating = function(rating) {
    //Find appropriate rating role
    //Lowest role edge case
    let matchedRole = rating < parseInt(this.roles[0]) ? this.roles[0] : null;
    if(!matchedRole) {
        //Starting with 2nd lowest
        for(let i = 1; i < this.roles.length; i++) {
            let r = parseInt(this.roles[i]);
            if(rating >= r) {
                matchedRole = this.roles[i];
            } else {
                break; //Implies that roles in config are in order
            }
        }
    }

    if(!matchedRole) {
        console.log(`Coundn't find appropriate role for rating ${rating}.`);
        return null;
    }

    return matchedRole;
};

module.exports = RatingRoleManager;
