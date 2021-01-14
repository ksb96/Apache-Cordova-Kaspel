var oauth2 = require('./oauth2');
var saml2 = require('./saml2');
var utils = require('./utils');

if (window.OData && window.OData.defaultHttpClient) {
    window.OData.defaultHttpClient = customHttpClient(window.OData.defaultHttpClient);
} else {
    defineOData();
}

/**
 * Lazy wait for OData to be defined.
 * @private
 */
function defineOData() {
    var odata;

    Object.defineProperty(window, 'OData', {
        get: function () {
            return odata;
        },
        set: function (odataValue) {
            odata = odataValue;

            if (odata) {
                if (odata.defaultHttpClient) {
                    odata.defaultHttpClient = customHttpClient(odata.defaultHttpClient);
                }
                else {
                    defineDefaultHttpClient(odata);
                }
            }
        }
    });
}

function defineDefaultHttpClient(odata) {
    var defaultHttpClient;
    Object.defineProperty(odata, 'defaultHttpClient', {
        get: function () {
            return defaultHttpClient;
        },
        set: function (defaultHttpClientValue) {
            // Only replace the first http client definition
            if (!defaultHttpClient) {
                defaultHttpClient = customHttpClient(defaultHttpClientValue);
            }
            else {
                defaultHttpClient = defaultHttpClientValue;
            }
        }
    });
}

function customHttpClient(defaultHttpClient) {
    return {
        request: function (request, success, error) {
            var aborted = false;
            var result = {
                abort : function() {
                    aborted = true;
                    if (error) {
                        error({ message: "Request aborted" });
                    }
                }
            };

            // datajs success callback.
            var requestSuccessCallback = function(response) {
                if (response && saml2.isChallenge(response)) {
                    saml2.authenticate(function() {
                        // Should have valid session.  Send request again.
                        var retryResult = defaultHttpClient.request(request, success, error);

                        // Update abort
                        if (result && retryResult) {
                            result.abort = retryResult.abort;
                        }
                    }, function() {
                        success(response);
                    });
                }
                else {
                    success(response);
                }
            }

            // datajs error callback
            var requestErrorCallback = function(errorResponse) {
                // Check for challenges
                if (request && oauth2.isProtectedEndpoint(request.requestUri) && errorResponse && errorResponse.response && oauth2.isChallenge(errorResponse.response)) {
                    oauth2.authenticate(function (token) {
                        if (token && token.access_token) {
                            // Send request again with token
                            request.headers = utils.updateHeader("Authorization", "Bearer " + token.access_token, request.headers);
                            var retryResult = defaultHttpClient.request(request, success, error);

                            // Update abort
                            if (result && retryResult) {
                                result.abort = retryResult.abort;
                            }
                        } else {
                            error(errorResponse);
                        }
                    }, function () {
                        error(errorResponse);
                    });
                } else {
                    error(errorResponse);
                }
            }

            // Apply the access token if we have it.
            if (request && oauth2.isProtectedEndpoint(request.requestUri)) {
                oauth2.getToken(function(token) {
                    if (!aborted) {
                        if (token && token.access_token) {
                            request.headers = utils.updateHeader("Authorization", "Bearer " + token.access_token, request.headers);
                        }

                        var filteredResult = defaultHttpClient.request(request, requestSuccessCallback, requestErrorCallback);

                        // Update abort
                        if (result && filteredResult) {
                            result.abort = filteredResult.abort;
                        }
                    }
                });
            }
            else {
                result = defaultHttpClient.request(request, requestSuccessCallback, requestErrorCallback);
            }

            return result;
        }
    }
}