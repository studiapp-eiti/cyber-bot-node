const qs = require("qs");
const {asyncRequest} = require("./../utils");
const logger = require("log4js").getLogger();
const LOGIN_URL = "https://studia3.elka.pw.edu.pl/en/19Z/-/login-ldap";
const GET_COOKIE_URL = "https://studia3.elka.pw.edu.pl/en/19Z/-/login/";
const REGEX_COOKIE = /STUDIA_SID=([a-zA-Z\d]+);/;

async function attemptLogin(username, password) {
    const get_cookie = (await asyncRequest(GET_COOKIE_URL, {
        method: "GET",
        headers: {"Cookie": "STUDIA_COOKIES=YES;"}
    })).res;

    let cookie = null;
    for(const c of get_cookie.headers["set-cookie"]) {
        const match = c.match(REGEX_COOKIE);
        if(match !== null) {
            cookie = match[1];
            break;
        }
    }

    if(cookie === null) {
        logger.error("Session cookie not set by Studia3");
        return null;
    }

    logger.trace(username, password);
    const post_data = {
        body: qs.stringify({
            studia_login: username,
            studia_passwd: password
        }),
        headers: {"Cookie": `STUDIA_COOKIES=YES;STUDIA_SID=${cookie}`},
        method: "POST"
    };

    logger.trace(post_data);

    const res = (await asyncRequest(LOGIN_URL, post_data)).res;
    if(res.statusCode === 302) {
        return cookie;
    }

    return null;
}

module.exports.attemptLogin = attemptLogin;