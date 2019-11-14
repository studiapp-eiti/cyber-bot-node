const crypto = require("crypto");
const OAuth = require("oauth-1.0a");

const oauth = OAuth({
    consumer: {key: process.env.USOS_KEY, secret: process.env.USOS_SECRET},
    signature_method: "HMAC-SHA1",
    hash_function(base_string, key) {
        return crypto
            .createHmac("sha1", key)
            .update(base_string)
            .digest("base64")
    }
});

oauth.URL_AUTHORIZE = "https://apps.usos.pw.edu.pl/services/oauth/authorize";
oauth.URL_REQUEST_TOKEN = "https://apps.usos.pw.edu.pl/services/oauth/request_token";
oauth.URL_ACCESS_TOKEN = "https://apps.usos.pw.edu.pl/services/oauth/access_token";

module.exports = oauth;