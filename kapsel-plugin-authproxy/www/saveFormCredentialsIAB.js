(function(){
    if (!window.logonGetItemCallback) {     //If this function is already defined, then the form listener code has already run for the current IAB page.
        var forms = document.forms;
        var formToSaveCredentialsFor;
        var identifier = identifier || 0;     //Don't overwrite if it already exists (iab.html and blank.html use the same event handling procedure).
        window.logonGetItemCallback = function() {};
        window.logonSetItemCallback = function() {};
        window.askUserPermissionToSaveCredentialsCallback = function() {};
        window.eventsObject = window.eventsObject || {};     //Don't overwrite if it already exists (iab.html and blank.html use the same event handling procedure).
        var getFormCredentials = function(formName, callback) {
            var href = "#EVENTOCCURRED+identifier="+identifier;
            var info = {};
            info.actionId = "getFormCredentials";
            info.formName = formName;
            window.eventsObject[identifier] = info;
            logonGetItemCallback = function(value) {
                callback(decodeURIComponent(value));
            };
            window.location.href = href;
            identifier++;
        };
        var getUserSaidNever = function(formName, callback) {
            var href = "#EVENTOCCURRED+identifier="+identifier;
            var info = {};
            info.actionId = "getUserSaidNever";
            info.formName = formName;
            eventsObject[identifier] = info;
            logonGetItemCallback = function(value) {
                callback(decodeURIComponent(value));
            };
            window.location.href = href;
            identifier++;
        };
        var setFormCredentials = function(formName, value, callback) {
            var href = "#EVENTOCCURRED+identifier="+identifier;
            var info = {};
            info.actionId = "setFormCredentials";
            info.formName = formName;
            info.value = value;
            window.eventsObject[identifier] = info;
            logonSetItemCallback = callback;
            window.location.href = href;
            identifier++;
        };
        var setUserSaidNever = function(formName, value, callback) {
            var href = "#EVENTOCCURRED+identifier="+identifier;
            var info = {};
            info.actionId = "setUserSaidNever";
            info.formName = formName;
            info.value = value;
            eventsObject[identifier] = info;
            logonSetItemCallback = callback;
            window.location.href = href;
            identifier++;
        };
        var askUserPermissionToSaveCredentials = function(callback) {
            var href = "#EVENTOCCURRED+identifier="+identifier;
            var info = {};
            info.actionId = "askUserPermissionToSaveCredentials";
            eventsObject[identifier] = info;
            askUserPermissionToSaveCredentialsCallback = callback;
            window.location.href = href;
            identifier++;
        };
        if (forms) {
            var formKeys = Object.keys(forms);
            for (var key in formKeys) {
                if (forms[key]){
                    var elements = forms[key].elements;
                    if (elements) {
                        for (var i=0; i<elements.length; i++) {
                            if(!formToSaveCredentialsFor && elements[i].type == "password") {
                                formToSaveCredentialsFor = forms[key];
                                break;
                            }
                        }
                    }
                }
                if (formToSaveCredentialsFor) {
                    break;
                }
            }
            if (formToSaveCredentialsFor) {
                var previouslySavedCredentials;
                var listenToSubmit = function() {
                    formToSaveCredentialsFor.onsubmit = function(event) {
                        var that = this;
                        var elements = formToSaveCredentialsFor.elements;
                        var saveCredentials = function() {
                            var savedFields = {};
                            for (var i=0; i<elements.length; i++) {
                                if (elements[i].type == "password" || elements[i].type == "text") {
                                    savedFields[elements[i].name] = elements[i].value;
                                }
                            }
                            setFormCredentials(formToSaveCredentialsFor.name, JSON.stringify(savedFields), function(){});
                        };
                        var neverSaveCredentials = function() {
                            setUserSaidNever(formToSaveCredentialsFor.name, "true", function(){});
                        };
                        var clearSavedCredentials = function() {
                            setFormCredentials(formToSaveCredentialsFor.name, null, function(){});
                        };
                        var onConfirmResponse = function(buttonIndex) {
                            if (buttonIndex == 1) {
                                clearSavedCredentials();
                            } else if (buttonIndex == 2) {
                                saveCredentials();
                            } else if (buttonIndex == 3) {
                                clearSavedCredentials();
                                neverSaveCredentials();
                            }
                            that.submit();
                        };
                        if (previouslySavedCredentials) {
                            // check if the user changed the saved values
                            var valuesChanged = false;
                            for (var i=0; i<elements.length; i++) {
                                if (previouslySavedCredentials[elements[i].name] && elements[i].value != previouslySavedCredentials[elements[i].name]) {
                                    valuesChanged = true;
                                    break;
                                }
                            }
                        }
                        if (!previouslySavedCredentials || valuesChanged) {
                            event.preventDefault();
                            askUserPermissionToSaveCredentials(onConfirmResponse);
                        }
                    }
                };
                var getPreviouslySavedFormCredentials = function() {
                    var gotPreviousCredentials = function(savedCredentialsString) {
                        listenToSubmit();
                        if (savedCredentialsString && savedCredentialsString != "" && savedCredentialsString !== "null") {
                            var savedCredentialsObject = JSON.parse(savedCredentialsString);
                            var loginForm = formToSaveCredentialsFor;
                            var elements = loginForm.elements;
                            for (var i=0; i<elements.length; i++) {
                                if (savedCredentialsObject[elements[i].name]) {
                                    elements[i].value = savedCredentialsObject[elements[i].name];
                                }
                            }
                            previouslySavedCredentials = savedCredentialsObject;
                        }
                    };
                    getFormCredentials(formToSaveCredentialsFor.name, gotPreviousCredentials);
                };
                var gotUserSaidNever = function(userSaidNever) {
                    if (!userSaidNever || userSaidNever === "null") {
                        getPreviouslySavedFormCredentials();
                    }
                };
                getUserSaidNever(formToSaveCredentialsFor.name, gotUserSaidNever);
            }
        };
    }
})();