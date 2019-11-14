const request = require("request");


/**
 *
 * @param url
 * @param options
 * @return {Promise}
 */
function asyncRequest(url, options) {
    return new Promise((resolve, reject) => {
        request(url, options, (err, res, body) => {
            if(err === null)
                resolve({res: res, body: body});
            else
                reject(err);
        })
    })
}

module.exports.asyncRequest = asyncRequest;