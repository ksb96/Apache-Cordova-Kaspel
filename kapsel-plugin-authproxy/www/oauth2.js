var argscheck = require('cordova/argscheck'),
    exec = require('cordova/exec'),
    channel = require('cordova/channel'),
    utils = require('./utils'),
    currentToken = null,
    currentConfig = null,
    windowRef = null,
    originalHandleOpenURL = window.handleOpenURL,
    tokenRequestActive = false,
    queue = [],
    channels = {
        'tokenchange': channel.create('tokenchange')
    },
    protectedURLInfo;

// Listen for OAuth redirect calls
/*if (!originalHandleOpenURL) {
    window.handleOpenURL = handleOpenURLForOAuth;
} else {
    window.handleOpenURL = function (url) {
        if (!handleOpenURLForOAuth(url)) {
            originalHandleOpenURL(url);
        }
    };
}*/

/**
 * Handle URL if it is the redirect URL from OAuth
 * @private
 * @param {String} url A application specific URL.
 */
function handleOpenURLForOAuth(url) {
    if (currentConfig && currentConfig.redirectURL) {
        if (url && url.indexOf(currentConfig.redirectURL) == 0) {
            // TODO: store callbacks when first opening the authorize page 
            requestToken(url, null, null);
            return true;
        }
    }
    return false;
}

/**
 * Returns the URL parameter with the given name from the URL
 * @private
 * @param {String} name The URL parameter to look for
 * @param {String} url The URL to search
 * @returns {String} The value of the URL parameter or null if not found
 * @private
 */
function getUrlParameter(name, url) {
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regexS = "[\\?&]" + name + "=([^&#]*)";
    var regex = new RegExp(regexS);
    var results = regex.exec(url);
    return results == null ? null : results[1];
};

/**
 * Queue the token request.  When the active request is finished,
 * all the queued requests wil be called.
 * @private
 * @param {function} successCallback 
 * @param {function} errorCallback 
 */
function addTokenRequestToQueue(successCallback, errorCallback) {
    queue.push({
        success: successCallback,
        error: errorCallback
    });
}

function emptyTokenRequestQueue(token, error) {
    var pendingRequests = queue;
    queue = [];

    for (var i = 0; i < pendingRequests.length; i++) {
        if (error) {
            var errorCallback = pendingRequests[i].error;
            if (errorCallback) {
                errorCallback.apply(null, [error]);
            }
        } else if (token) {
            var successCallback = pendingRequests[i].success;
            if (successCallback) {
                successCallback.apply(null, [token]);
            }
        }
    }
}

/**
 * Acquires an OAuth2 access token from the server.
 * This may show a webview if authorization is required.
 * @public
 * @param {function} successCallback 
 * @param {function} errorCallback 
 * @memberof sap.AuthProxy.OAuth2
 * @static 
 */
function authenticate(successCallback, errorCallback) {
    // Only allow one request to get a token at a time
    // When the first request finishes.  All queued requests
    // will get the same result as the first request.
    if (tokenRequestActive) {
        addTokenRequestToQueue(successCallback, errorCallback);
        return;
    }

    var win = function (token) {
        setToken(token, function () {
            if (successCallback) {
                successCallback(token);
            }
            tokenRequestActive = false;
            emptyTokenRequestQueue(token);
        }, fail);
    };

    var fail = function (error) {
        // Let native requests fail with empty access token.
        exec(null, null, 'AuthProxy', 'setOAuth2AccessToken', [null]);

        if (errorCallback) {
            errorCallback(error);
        }

        tokenRequestActive = false;
        emptyTokenRequestQueue(null, error);
    }

    tokenRequestActive = true;

    if (!currentConfig) {
        fail({
            error: "No active OAuth2 config"
        });
        return;
    }

    getToken(function (token) {
        if (token && token.refresh_token) {
            // Token already present. First try refresh it.
            refreshToken(token, win, function (error) {
                // If we are offline we wil not receive an HTTP error.
                // For server errors, we can assume that the refresh token is no longer valid.
                if (error && error.response && error.response.status && error.response.status > 0) {
                    authorize(function (token) {
                        win(token);
                    }, function (error) {
                        fail(error);
                    });
                }
                else {
                    fail(error);
                }
            });
        } else {
            // No token yet.  Do the authorize flow.
            authorize(win, fail);
        }
    });
}

/**
 * Starts the OAuth2 authorization process using a web view.
 * @private
 * @param {function} successCallback 
 * @param {function} errorCallback 
 */
function authorize(successCallback, errorCallback) {
    var url = currentConfig.authorizationEndpointURL + "?response_type=code&client_id=" + encodeURIComponent(currentConfig.clientID);
    var code = null;
    var error = null;

    if (currentConfig.redirectURL) {
        url = url + "&redirect_uri=" + encodeURIComponent(currentConfig.redirectURL);
    }
    if (currentConfig.requestingScopes) {
        url = url + "&scope=" + encodeURIComponent(currentConfig.requestingScopes.join(' '));
    }

    var loadListener = function (event) {
        code = getUrlParameter('code', event.url);
        error = getUrlParameter('error', event.url);

        if (code || error) {
            windowRef.close();
            if (cordova.require("cordova/platform").id.indexOf("windows") === 0) {
                exitListener();
            }
        }
    };
    var loadErrorListener = function (event) {
        error = event.message;
        windowRef.close();
    };
    var exitListener = function (event) {
        windowRef = null;

        if (error) {
            errorCallback({
                message: error
            });
        } else if (code) {
            requestToken(code, successCallback, errorCallback);
        } else {
            errorCallback({
                message: "OAuth flow cancelled"
            });
        }
    };

    windowRef = cordova.InAppBrowser.open(url, '_blank', 'location=no,toolbar=yes,hardwareback=no');

    windowRef.addEventListener('loadstop', loadListener);
    windowRef.addEventListener('loaderror', loadErrorListener);
    windowRef.addEventListener('exit', exitListener);
    utils.initializeSaveFormCredentials(windowRef);
}

/**
 * Obtains a token using the redirect URL
 * @private
 * @param {String} url The URL containing the authorization code or error parameter
 * @param {function} successCallback
 * @param {function} errorCallback
 */
function requestTokenFromRedirect(url, successCallback, errorCallback) {
    var code = getUrlParameter('code', url);
    var error = getUrlParameter('error', url);

    if (error) {
        if (errorCallback) {
            errorCallback({
                message: error
            });
        }
    } else if (code) {
        requestToken(code, successCallback, errorCallback);
    } else {
        if (errorCallback) {
            errorCallback({
                message: "No code or error parameter found on URL."
            });
        }
    }
}

/**
 * Obtains a token using the authorization code
 * @private
 * @param {String} authorizationCode 
 * @param {function} successCallback 
 * @param {function} errorCallback 
 */
function requestToken(authorizationCode, successCallback, errorCallback) {
    var url = currentConfig.tokenEndpointURL;

    var headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    };

    var body = "grant_type=authorization_code" + "&client_id=" + currentConfig.clientID + "&code=" + authorizationCode;

    sap.AuthProxy.sendRequest("POST", currentConfig.tokenEndpointURL, headers, body,
        function (result) {
            if (result.status == 200 && result.responseText) {
                try {
                    var token = JSON.parse(result.responseText);
                    successCallback(token);
                } catch (e) {
                    errorCallback({
                        message: "Invalid JSON response. " + e.message
                    });
                }
            } else {
                errorCallback({
                    message: "Server error.",
                    response: result
                });
            }
        },
        function (error) {
            errorCallback({
                message: "Request error. " + error
            });
        }
    );
}

/**
 * Refreshes the OAuth2 token.
 * @private
 * @param {String} token The OAuth2 token
 * @param {function} successCallback 
 * @param {function} errorCallback 
 */
function refreshToken(token, successCallback, errorCallback) {
    if ((!token || !token.refresh_token)) {
        if (errorCallback) {
            errorCallback({
                message: "OAuth2 refresh token is missing"
            });
        }
        return;
    }

    var headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    };
    var body = "grant_type=refresh_token" + "&refresh_token=" + token.refresh_token + "&client_id=" + currentConfig.clientID;

    sap.AuthProxy.sendRequest("POST", currentConfig.tokenEndpointURL, headers, body,
        function (result) {
            if (result.status == 200 && result.responseText) {
                try {
                    var token = JSON.parse(result.responseText);
                    successCallback(token);
                } catch (e) {
                    errorCallback({
                        message: "Invalid JSON response. " + e.message
                    });
                }
            } else {
                errorCallback({
                    message: "Server error.",
                    response: result
                });
            }
        },
        function (error) {
            errorCallback({
                message: "Request error. " + error
            });
        }
    );
}

/**
 * Gets the OAuth2 token
 * @public
 * @param {function} successCallback 
 * @memberof sap.AuthProxy.OAuth2
 * @static
 */
function getToken(successCallback) {
    if (successCallback) {
        successCallback(currentToken);
    }
}
/**
 * Sets the OAuth2 token
 * @public
 * @param {Object} token The OAuth2 token
 * @param {function} successCallback 
 * @param {function} errorCallback 
 * @private
 */
function setToken(token, successCallback, errorCallback) {
    // Update token in JavaScript and native.
    currentToken = token;

    var event = {
        type: 'tokenchange',
        token: token
    };

    channels[event.type].fire(event);

    if (cordova.require("cordova/platform").id !== 'windows') {
        var accessToken = currentToken ? currentToken.access_token : null;
        exec(successCallback, errorCallback, 'AuthProxy', 'setOAuth2AccessToken', [accessToken]);
    } else if (successCallback) {
        successCallback();
    }
}

/**
 * Breaks the URL into its components
 * @param {String} url The URL to parse
 */
function getURLInfo(url) {
    var anchorEl = document.createElement('a');
    anchorEl.href = url;

    return {
        host:     anchorEl.hostname,
        port:     anchorEl.port,
        protocol: anchorEl.protocol
    }
}

/**
 * Determines if this is an OAuth2 challenge
 * @public
 * @param {Object} response
 * @returns true if this is a challenge
 * @memberof sap.AuthProxy.OAuth2
 * @static
 */
function isChallenge(response) {
    if (currentConfig && response) {
        var status = response.status || response.statusCode;

        if (status === 401 && response.headers) {
            var wwwAuthenticate = utils.findHeader("www-authenticate", response.headers);
            if (wwwAuthenticate && wwwAuthenticate.indexOf("Bearer") === 0) {
                return true;
            }
        } else if (status === 400 && response.headers) {
            var smpAuthenticationStatus = utils.findHeader("x-smp-authentication-status", response.headers);
            if (smpAuthenticationStatus === "1000") {
                return true;
            }
        }
    }

    return false;
}

/**
 * Determines if the OAuth2 token should be sent to the provided URL
 * @param {String} url The URL to check
 * @return True if it is safe to provide the access token to the provided URL.
 * @memberof sap.AuthProxy.OAuth2
 * @static
 */
function isProtectedEndpoint(url) {
    if (currentConfig && protectedURLInfo && url) {
        var urlInfo = getURLInfo(url);
        return protectedURLInfo.host === urlInfo.host && protectedURLInfo.port === urlInfo.port && protectedURLInfo.protocol === urlInfo.protocol;
    }

    return false;
}

/** 
 * Enables OAuth2 challenge support
 * @param {Object} config The OAuth2 config
 * @param {String} config.protectedEndpointURL The server that the token should be used with.
 * @param {String} config.authorizationEndpointURL
 * @param {String} config.clientID
 * @param {String} config.redirectURL
 * @param {String} config.tokenEndpointURL
 * @param {String[]} config.requestingScopes
 * @param {function} successCallback 
 * @param {function} errorCallback 
 * @param {Object} [token] Optional initial OAuth2 token to use
 * @param {Object} [token.access_token] The OAuth2 access token.  Should be used as a Bearer credential.
 * @param {Object} [token.refresh_token] The OAuth2 refresh token.  Can be used to obtain a fresh access token.
 * @memberof sap.AuthProxy.OAuth2
 * @static
 */
function enable(config, successCallback, errorCallback, token) {
    currentConfig = config;

    if (currentConfig.protectedEndpointURL) {
        protectedURLInfo = getURLInfo(currentConfig.protectedEndpointURL);
    }

    if (cordova.require("cordova/platform").id !== 'windows') {
        exec(function() {
            setToken(token, successCallback, errorCallback);
        }, errorCallback, 'AuthProxy', 'enableOAuth2', [config]);
    }
    else {
        setToken(token, successCallback, errorCallback);
    }
}

/**
 * Disables the OAuth2 challenge support
 * @param {function} successCallback 
 * @param {function} errorCallback 
 * @memberof sap.AuthProxy.OAuth2
 * @static
 */
function disable(successCallback, errorCallback) {
    currentConfig = null;
    currentToken = null;
    protectedURLInfo = null;

    if (cordova.require("cordova/platform").id !== 'windows') {
        exec(successCallback, errorCallback, 'AuthProxy', 'disableOAuth2', []);
    } else if (successCallback) {
        successCallback();
    }
}

/**
 * Registers the specified listener on the event target.
 * Available types are: 'tokenchange'.
 * @param {String} type A string representing the event type to listen for.
 * @param {function} listener The function to add to the event target.
 * @memberof sap.AuthProxy.OAuth2
 * @static
 */
function addEventListener(type, listener) {
    if (type in channels) {
        channels[type].subscribe(listener);
    }
}

/**
 * Removes the event listener previously registered 
 * @param {String} type  A string representing the event type to remove.
 * @param {function} listener The function to remove from the event target.
 * @memberof sap.AuthProxy.OAuth2
 * @static
 */
function removeEventListener(type, listener) {
    if (type in channels) {
        channels[type].unsubscribe(listener);
    }
}

/**
 * @namespace
 * @alias OAuth2
 * @memberof sap.AuthProxy
 */
module.exports = {
    enable: enable,
    disable: disable,
    authenticate: authenticate,
    getToken: getToken,
    isProtectedEndpoint: isProtectedEndpoint,
    isChallenge: isChallenge,
    addEventListener: addEventListener,
    removeEventListener: removeEventListener
};