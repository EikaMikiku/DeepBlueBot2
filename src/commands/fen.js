const cfg = require("../../config.json");

async function FenCommand(deepblue, msg) {
    let spaceIdx = msg.content.indexOf(" ");
    if(spaceIdx < 0) {
        return await deepblue.sendMessage(msg.channel, "No valid fen provided!");
    }

    let fen = msg.content.slice(spaceIdx).trim();
    let toMove = "White to move.";
    let flip = 0;

    if(fen.includes(" b ")) {
        toMove = "Black to move.";
        flip = 1;
    }

    let imageUrl = cfg.fen.fenImgeApiUrl +
        "?fen=" + encodeURIComponent(fen) +
        "&board=" + cfg.fen.board +
        "&piece=" + cfg.fen.pieces +
        "&coordinates=" + cfg.fen.coords +
        "&size=" + cfg.fen.size +
        "&flip=" + flip +
        "&ext=.png"; //Make discord recognise an image

    let lichessUrl = cfg.fen.analysisUrl + encodeURIComponent(fen);

    await msg.channel.send({
        "embed": {
            "color": cfg.deepblue.embedColor,
            "title": toMove,
            "url": lichessUrl,
            "image": {
                "url": imageUrl
            }
        }
    });
}

module.exports = FenCommand;