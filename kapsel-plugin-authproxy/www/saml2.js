var argscheck = require('cordova/argscheck'),
    exec = require('cordova/exec'),
    utils = require('./utils'),
    currentConfig = null,
    requestActive = false,
    queue = [];

/**
 * Queue the token request.  When the active request is finished,
 * all the queued requests wil be called.
 * @private
 * @param {function} successCallback 
 * @param {function} errorCallback 
 */
function addRequestToQueue(successCallback, errorCallback) {
    queue.push({
        success: successCallback,
        error: errorCallback
    });
}

function emptyRequestQueue(error) {
    var pendingRequests = queue;
    queue = [];

    for (var i = 0; i < pendingRequests.length; i++) {
        if (error) {
            var errorCallback = pendingRequests[i].error;
            if (errorCallback) {
                errorCallback.apply(null, [error]);
            }
        } else {
            var successCallback = pendingRequests[i].success;
            if (successCallback) {
                successCallback.apply(null, []);
            }
        }
    }
}

/**
 * Acquires a SAML session with the server. This will show a webview.
 * @public
 * @param {function} successCallback 
 * @param {function} errorCallback 
 * @memberof sap.AuthProxy.OAuth2
 */
function authenticate(successCallback, errorCallback) {
    // Only allow one request to get a token at a time
    // When the first request finishes.  All queued requests
    // will get the same result as the first request.
    if (requestActive) {
        addRequestToQueue(successCallback, errorCallback);
        return;
    }

    var win = function () {
        if (successCallback) {
            successCallback();
        }
        requestActive = false;
        emptyRequestQueue();
    };

    var fail = function (error) {
        if (errorCallback) {
            errorCallback(error);
        }

        requestActive = false;
        emptyRequestQueue(error);
    }

    requestActive = true;

    if (!currentConfig) {
        fail({message: "No active SAML2 config"});
        return;
    }

    var ref = cordova.InAppBrowser.open(currentConfig.authorizationEndpointURL, '_blank', 'location=no,toolbar=yes,hardwareback=no');
    var success = false;
    var loadListener = function(event) {
        if (event.url.indexOf(currentConfig.finishEndpointURLParam) >= 0) {
            success = true;
            ref.close();
            if (cordova.require("cordova/platform").id.indexOf("windows") === 0) {
                exitListener();
            }
        }
    };
    var errorListener = function(event) {
        ref.close();
    };
    var exitListener = function(event) {
        if (success) {
            win()
        } else {
            fail({ message: "SAML2 authentication failed"});
        }
    };
    ref.addEventListener('loadstop', loadListener);
    ref.addEventListener('loaderror', errorListener);
    ref.addEventListener('exit', exitListener);
    utils.initializeSaveFormCredentials(ref);
}

/**
 * Determines if this is an SAML2 challenge
 * @public
 * @param {Object} response
 * @returns true if this is a challenge
 * @memberof sap.AuthProxy.OAuth2
 */
function isChallenge(response) {
    if (currentConfig && response) {
        var status = response.status || response.statusCode;

        if (status === 200 && response.headers) {
            var challenge = utils.findHeader(currentConfig.challengeHeaderName, response.headers);
            if (challenge) {
                return true;
            }

            if (cordova.require("cordova/platform").id === 'windows') {
                // checking if SAML redirect happened
                if (response.requestUri && (response.requestUri.indexOf("SAMLRequest=") !== -1)) {
                    return true;
                }
            }
        }
    }

    return false;
}

/* 
 * Enable SAML2 challenge support
 * @param {Object} config The SAML2 config 
 * @param {String} config.authorizationEndpointURL The URL to navigate to in case of a SAML challange.
 * @param {String} config.finishEndpointURLParam The URL param which indicates the SAML authentication flow's end.
 * @param {String} config.challengeHeaderName The HTTP header name used to identify the SAML challenge.
 * @param {function} successCallback 
 * @param {function} errorCallback 
 * @memberof sap.AuthProxy.OAuth2
 */
function enable(config, successCallback, errorCallback) {
    currentConfig = config;

    if (cordova.require("cordova/platform").id !== 'windows') {
        exec(successCallback, errorCallback, 'AuthProxy', 'enableSAML2', [config]);
    }
    else if (successCallback) {
        successCallback();
    }
}

/**
 * Disable SAML2 challenge support
 * @param {function} successCallback 
 * @param {function} errorCallback 
 * @memberof sap.AuthProxy.OAuth2
 */
function disable(successCallback, errorCallback) {
    currentConfig = null;

    if (cordova.require("cordova/platform").id !== 'windows') {
        exec(successCallback, errorCallback, 'AuthProxy', 'disableSAML2', []);
    }
    else if (successCallback) {
        successCallback();
    }
}

/**
 * @namespace
 * @alias SAML2
 * @memberof sap.AuthProxy
 */
module.exports = {
    enable: enable,
    disable: disable,
    authenticate: authenticate,
    isChallenge: isChallenge
};