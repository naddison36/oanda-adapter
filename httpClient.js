var http = require("http"),
    https = require("https"),
    querystring = require("querystring"),
    logger = require('config-logger');

module.exports = {

    sendRequest: function (hostname, port, method, path, data, callback, onData) {

        var options,
            request,
            keepAlive,
            timeout = 20000;

        if (typeof hostname === "object") {
            options = hostname;
            data = hostname.data;
            timeout = options.timeout || timeout;
            callback = port;
            onData = method;
        } else {
            options = {
                hostname: hostname,
                port: port,
                method: method,
                path: path
            };
        }

        keepAlive = options.headers && options.headers.Connection === "Keep-Alive";

        logger.debug("HTTPS OUT", options.hostname, options.port, options.method, options.path);

        if (options.secure === false) {
            request = http.request(options);
        } else {
            request = https.request(options);
        }

        if (data) {
            if (options.headers && options.headers["Content-Type"] === "application/x-www-form-urlencoded") {
                request.write(querystring.stringify(data));
            } else {
                request.write(JSON.stringify(data));
            }
        }

        request.end();

        request.once("response", options.onResponse || function (response) {

            var body = "",
                statusCode = response.statusCode;

            response.setEncoding("utf8");

            response.on("data", function (chunk) {
                if (keepAlive) {
                    if (onData) {
                        onData(chunk);
                    }
                    body = chunk;
                } else {
                    body += chunk;
                }
            });

            response.once("end", function () {
                if (body) {
                    try {
                        body = JSON.parse(body);
                    } catch (error) {
                        logger.warn("HTTPS IN ", options.hostname, options.port, options.method, options.path, body.length, "Could not parse response body");
                    }
                }

                if (statusCode !== 200 && statusCode !== 204 && statusCode !== 206) {
                    logger.error("HTTPS IN ", options.hostname, options.port, options.method, options.path, ":", statusCode, body.length);
                    return callback(true, body, statusCode, body); // TODO added body as second argument anyway (error responses can have a body that describes the error). Get rid of anywhere expecting it as 4th arg
                }

                logger.debug("HTTPS IN", body);
                callback(null, body, statusCode);
            });

            response.once("error", function (error) {
                logger.error("HTTPS IN ", options.hostname, options.port, options.method, options.path, "Response stream errored", error);
            });

            request.removeAllListeners();
        });

        request.once("error", options.onError || function (error) {
            logger.error("HTTPS IN ", options.hostname, options.port, options.method, options.path, error);
            callback(error, null, 500);
        });

        if (!keepAlive) {
            request.setTimeout(timeout, function () {
                request.removeAllListeners();
                logger.error("HTTPS IN ", options.hostname, options.port, options.method, options.path, "Timed out after " + (timeout / 1000) + "s");
                callback("timeout", null, 508);
            });
        }

        return request;
    }
};