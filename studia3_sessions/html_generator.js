const moment = require("moment");
const momentDurationFormatSetup = require("moment-duration-format");

function generateMultiple(entries) {
    let html = "<head><title>Studia3 Login</title>" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"></head>";
    for(const entry of entries) {
        if(!entry.hasOwnProperty("alive")) {
            entry.alive = entry.cookie !== null;
        }
        html += generateSingle(entry.program_name, entry.program_id, entry.alive, entry.last_login);
    }
    return html;
}

/**
 *
 * @param {String} course_name
 * @param {Number} course_id
 * @param {Boolean} session_alive
 * @param {Date} last_login
 */
function generateSingle(course_name, course_id, session_alive, last_login) {
    if(session_alive) {
        return `<p>${course_name}: <b>session alive</b> for 
            ${moment.duration(Date.now() - last_login, "milliseconds").format("d [days] hh [hours] mm [minutes]")}</p>`;
    } else {
        let html = "";
        html += `<form action="" method="POST">`;
        html += `<p>${course_name} `;
        html += `<input name="program_id" type="hidden" value="${course_id}">`;
        html += `<input name="password" placeholder="Password" type="password">`;
        html += ` <button type="submit">Login</button>`;
        html += `</p>`;
        html += "</form>";

        return html;
    }
}

module.exports.generateMultiple = generateMultiple;
module.exports.generateSingle = generateSingle;