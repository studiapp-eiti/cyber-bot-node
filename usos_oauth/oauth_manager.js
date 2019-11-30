'use strict';

const crypto = require("crypto");
const OAuth = require("oauth-1.0a");
const request = require("request");
const sql = require("../database/sql_manager");
const logger = require("log4js").getLogger();
const qs = require('qs');
const {asyncRequest} = require("../utils");

const oauth = OAuth({
    consumer: {key: process.env.USOS_KEY, secret: process.env.USOS_SECRET},
    signature_method: "HMAC-SHA1",
    hash_function(base_string, key) {
        return crypto
            .createHmac("sha1", key)
            .update(base_string)
            .digest("base64")
    }
})

oauth.URL_BASE = "https://apps.usos.pw.edu.pl/services";
oauth.URL_AUTHORIZE = oauth.URL_BASE + "/oauth/authorize";
oauth.URL_REQUEST_TOKEN = oauth.URL_BASE + "/oauth/request_token";
oauth.URL_ACCESS_TOKEN = oauth.URL_BASE + "/oauth/access_token";
oauth.URL_USER = oauth.URL_BASE + "/users/user";

async function requestToken(user, account_linking_token, redirect_uri) {
    const request_data = {
        url: oauth.URL_REQUEST_TOKEN,
        method: "POST",
        data: {
            scopes: "grades|offline_access|studies|crstests",
            oauth_callback: process.env.BOT_BASE_PATH + process.env.BOT_USOS_OAUTH_CALLBACK_PATH
        }
    };

    try {
        const {body} = await asyncRequest(request_data.url, {
            method: request_data.method,
            form: oauth.authorize(request_data)
        });

        const data = qs.parse(body);
        await sql.insertLoginAttempt(
            user.id,
            account_linking_token,
            redirect_uri,
            crypto.randomBytes(32).toString("hex"),
            data.oauth_token,
            data.oauth_token_secret
        );

        logger.debug("Got USOS tokens, redirecting to authorize for user", user.id);

        return data.oauth_token;
    } catch(e) {
        logger.error(e);
        return null;
    }
}

async function handleUsosOauthResponse(oauth_token, oauth_verifier) {
    const token_key = oauth_token;
    let login_flow = await sql.getLoginFlowByToken(token_key);
    const token = {
        key: token_key,
        secret: login_flow.usos_oauth_secret
    };

    const user_id = login_flow.user_id;
    logger.debug("Received USOS token callback for user", user_id);

    const request_data = {
        url: oauth.URL_ACCESS_TOKEN,
        method: "POST",
        data: {
            oauth_token: token_key,
            oauth_verifier: oauth_verifier
        }
    };

    try {
        const {body} = await asyncRequest(request_data.url, {
            method: request_data.method,
            form: oauth.authorize(request_data, token)
        });

        const json = qs.parse(body);

        await sql.updateUsosTokensForUserId(user_id, json.oauth_token, json.oauth_token_secret);
        await sql.updateUserRegistered(user_id, true);

        logger.debug("Registered successfully user_id -", user_id);

        return {callback_url: login_flow.messenger_callback_url, auth_code: login_flow.messenger_auth_code};
    } catch(e) {
        logger.error(e);
        return null;
    }
}

oauth.requestToken = requestToken;
oauth.handleUsosOauthResponse = handleUsosOauthResponse;

module.exports = oauth;