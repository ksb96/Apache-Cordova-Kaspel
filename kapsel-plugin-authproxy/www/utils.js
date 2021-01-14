var previousEventIdentifier;
var urlutil = require('cordova/urlutil');

/**
 * Normalizes headers so they can be found with consitent casing
 * @param {Object} headers  Dictionary of name/value pairs
 * @returns headers with lowercase names
 * @private
 */
module.exports.normalizeHeaders = function(headers) {
    var result = {};

    if (headers) {
        for (var name in headers) {
            result[name.toLocaleLowerCase()] = headers[name];
        }
    }

    return result;
}

/**
 * Finds and returns the value for the provided header
 * @param {String} The name of the header to search for
 * @param {Object} The headers to search in
 * @returns The value of the header of null if not found
 * @private
 */
module.exports.findHeader = function(name, headers) {
    if (headers) {
        for (var headerName in headers) {
            if (headerName.toLowerCase() === name.toLowerCase()) {
                return headers[headerName];
            }
        }
    }

    return null;
}

/**
 * Finds and updates the header in the collection.
 * If the header is not found it is added to the collection,
 * @param {String} name The name of the header
 * @param {Object} value The value of the header
 * @param {Object} The headers to update the header in
 * @return {Object} The updated headers.
 * @private
 */
module.exports.updateHeader = function (name, value, headers) {
    var result = headers ? headers : {};

    for (var destHeaderName in headers) {
        if (destHeaderName.toLowerCase() === name.toLowerCase()) {
            result[destHeaderName] = value;
            return result;
        }
    }

    result[name] = value;
    return result;
}

/**
 * Returns the media type from the response
 * This will be the first component in the content-type response header.
 * The additional properties in the header will be omitted.
 * @private
 */
module.exports.getMediaTypeFromResponse = function(response) {
    if (response && response.headers) {
        var contentType = module.exports.findHeader("content-type", response.headers);
        if (contentType) {
            return contentType.split(';')[0];
        }
    }
    return null;
}

/**
 * Registers listeners on the IAB to enable the save form credentials
 * feature (if configured).
 * @param {Object} the window reference of the inappbrowser
 * @private
 */
module.exports.initializeSaveFormCredentials = function(windowRef) {
    if (device.platform === "windows") {
        return;
    }
    // This feature depends on Logon to store the credentials
    if (sap && sap.logon) {
        if (device.platform.toLowerCase() == "ios") {
            windowRef.addEventListener('loadstart', function(event){
                handleSaveFormCredentialEvent(windowRef, event);
            });
        }
        windowRef.addEventListener('loadstop', function(event) {
            executeSaveFormCredentialJavascript(windowRef, event);
            if (device.platform.toLowerCase() == "android") {
                handleSaveFormCredentialEvent(windowRef, event);
            }
        });
    }
}

/**
 * Uses XHR to load the contents of a file.
 * @param {Function} The success callback.  Takes the file contents as an argument).
 * @param {Function} The error callback.  Takes an object
 * @param {String} The path to the file.
 * @private
 */
var getFileContentsAsString = function(successCallback, errorCallback, filePath) {
    var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4) {
                if (xhr.status == 200) {
                    successCallback(xhr.responseText);
                } else {
                    var errorInfo = {};
                    errorInfo.status = xhr.status;
                    errorCallback(errorInfo);
                }
            }
        }
        xhr.open("GET", filePath);
        xhr.send();
}

/**
 * Enables the save form credentials feature if the configuration allows it.
 * This function must be added as a loadstop listener on the IAB.  If added
 * as a loadstart listener then the events sent by the javascript inside the
 * IAB won't trigger the loadstart listener because they will be sent before
 * loadstop occurs.
 * @param {Object} the window reference of the inappbrowser
 * @param {Object} the event of the load listener
 * @private
 */
var executeSaveFormCredentialJavascript = function(windowRef, event) {
    var addFormListener = function () {
        if (windowRef) {
            var executeScript = function(javascriptToRunInIAB) {
                windowRef.executeScript(
                {
                    code: javascriptToRunInIAB
                });
            }
            var errorCallback = function(error) {
                module.exports.log("Error loading saveFormCredentialsIAB.js: " + JSON.stringify(error));
            }
            var javascriptFile;
            if (device.platform.toLowerCase() == "ios") {
                javascriptFile = "https://localhost/cdvfile/plugins/kapsel-plugin-authproxy/www/saveFormCredentialsIAB.js";
            } else {
                javascriptFile = urlutil.makeAbsolute("plugins/kapsel-plugin-authproxy/www/saveFormCredentialsIAB.js");
            }
            getFileContentsAsString(executeScript, errorCallback, javascriptFile);
        }
    }
    var checkPasscodeIsEnabled = function () {
        sap.logon.Core.getState(
            function (state) {
                // Only if the passcode is enabled should we allow the option to save form credentials.
                if (state != null && (!state.defaultPasscodeUsed)) {
                    addFormListener();
                }
            },
            function (error) {
                module.exports.log("Failed to get Logon state to see if the passcode is enabled.");
            }
        );
    }
    sap.logon.Core.getSecureStoreObject(function (allowSavingFormCredentials) {
        if (allowSavingFormCredentials == "true") {
            checkPasscodeIsEnabled();
        }
    }, function () {
        // Error callback - something went wrong.  Feature is disabled by default, so stop.
        module.exports.log("Error getting allowSavingFormCredentials configuration");
    }, "allowSavingFormCredentials");
    isFormListenerAdded = true;
}

/**
 * This function handles events sent from the javascript inside the IAB.
 *
 * for iOS:
 * This function must be added as a loadstart listener on the IAB.  The
 * loadstop listener does not get triggered for anchor navigation (which
 * is how the javascript inside the IAB sends events).
 *
 * for Android:
 * This function must be added as a loadstop listener; loadstart does
 * not get triggered.
 *
 * @param {Object} the window reference of the inappbrowser
 * @param {Object} the event of the load listener
 * @private
 */
var handleSaveFormCredentialEvent = function(windowRef, event) {
    var url = document.createElement('a');
    url.href = event.url;
    var hash = decodeURIComponent(url.hash.toString());
    var fragments = hash.match(/#([A-Z]+)(\+.*)?/);
    if (fragments) {
        if (fragments[1] == "EVENTOCCURRED") {
            var identifierKey = "+identifier=";
            var identifier = hash.substring(hash.indexOf(identifierKey) + identifierKey.length);
            if (previousEventIdentifier != identifier) {
                previousEventIdentifier = identifier;
                var payload = "var event = eventsObject[" + identifier + "];\n"+
                        "delete eventsObject[" + identifier + "];\n"+
                        "event;"; // The last line must be the value we want returned to the callback.
                var callback = function(result) {
                    var eventObject = result[0];
                    if (eventObject && eventObject.actionId) {
                        // handle the save form credential events
                        var indexOfQuery = event.url.indexOf("?");
                        var indexOfHash = event.url.indexOf("#");
                        var substringIndex = indexOfHash;
                        if (indexOfQuery > 0 && indexOfQuery < indexOfHash) {
                            substringIndex = indexOfQuery;
                        }
                        var urlMinusQueryAndHash = event.url.substring(0, substringIndex);
                        var actionId = eventObject.actionId.toLowerCase();
                        if (actionId == "setformcredentials") {
                            var key = "formCredentials" + urlMinusQueryAndHash + eventObject.formName;
                            var successCallback = function () {
                                windowRef.executeScript({ code: 'logonSetItemCallback();' });
                            }
                            var errorCallback = function (e) {
                                module.exports.log("Error setting item in Logon: " + JSON.stringify(e));
                            }
                            sap.Logon.core.setSecureStoreObject(successCallback, errorCallback, key, eventObject.value);
                        } else if (actionId == "getformcredentials") {
                            var key = "formCredentials" + urlMinusQueryAndHash + eventObject.formName;
                            var successCallback = function (value) {
                                windowRef.executeScript({ code: 'logonGetItemCallback("' + encodeURIComponent(value) + '");' });
                            }
                            var errorCallback = function (e) {
                                module.exports.log("Error getting item from Logon from LogonJsView (some errors here are expected): " + JSON.stringify(e));
                            }
                            sap.Logon.core.getSecureStoreObject(successCallback, errorCallback, key);
                        } else if (actionId == "getusersaidnever") {
                            var key = "userSaidNever" + urlMinusQueryAndHash + eventObject.formName;
                            var successCallback = function (value) {
                                windowRef.executeScript({ code: 'logonGetItemCallback("' + encodeURIComponent(value) + '");' });
                            }
                            var errorCallback = function (e) {
                                module.exports.log("Error getting item from Logon from LogonJsView (some errors here are expected): " + JSON.stringify(e));
                                windowRef.executeScript({ code: 'logonGetItemCallback("' + encodeURIComponent(null) + '");' });
                            }
                            sap.Logon.core.getSecureStoreObject(successCallback, errorCallback, key);
                        } else if (actionId == "setusersaidnever") {
                            var key = "userSaidNever" + urlMinusQueryAndHash + eventObject.formName;
                            var successCallback = function () {
                                windowRef.executeScript({ code: 'logonSetItemCallback();' });
                            }
                            var errorCallback = function (e) {
                                module.exports.log("Error setting item in Logon: " + JSON.stringify(e));
                            }
                            sap.Logon.core.setSecureStoreObject(successCallback, errorCallback, key, eventObject.value);
                        } else if (actionId == "askuserpermissiontosavecredentials") {
                            var promptCallback = function (buttonId) {
                                windowRef.executeScript({ code: 'askUserPermissionToSaveCredentialsCallback(' + buttonId + ');' });
                            }
                            var i18n = require('kapsel-plugin-i18n.i18n');
                            i18n.load(
                                {
                                    path: "smp/logon/i18n",
                                    name: "i18n"
                                },
                                function (bundle) {
                                    navigator.notification.confirm(
                                        bundle.get("ask_user_save_credentials"),
                                        promptCallback,
                                        bundle.get("save_credentials"),
                                        [bundle.get("not_now"), bundle.get("save"), bundle.get("never")]
                                    );
                                }
                            );
                        }
                    } else {
                        module.exports.log("IAB invalid event (event object not in expected format).");
                    }
                }
            }
            var executeDetails = {"code":payload};
            windowRef.executeScript(executeDetails, callback);
        } else {
            module.exports.log("IAB invalid event (IAB not using new callback method to pass information).");
        }
    }
}

/**
 * Logs a string.  Will use the Logon plugin's log function if available.
 * @param {String} The string to log.
 */
module.exports.log = function(stringToLog) {
    if (sap.logon.Utils) {
        sap.logon.Utils.log(stringToLog);
    } else {
        console.log(stringToLog);
    }
}