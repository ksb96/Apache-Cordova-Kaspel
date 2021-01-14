#!/usr/bin/env node

module.exports = function(context) {
    var fs, path, et, projectManifestFile, manifestContents, projectManifestXmlTree, application, networkSecurityConfig,
        networkSecurityConfigFileName, pathToNetworkSecurityConfigFile, projectConfigXML, configXMLContents,
        configXMLTree, preferences, trustUserCertificatesElement, preferenceName, trustUserCertsConfigValue,
        networkSecurityConfigXML, networkSecurityConfigXMLContents, networkSecurityConfigXMLTree, baseConfigElement,
        trustAnchorsElement, certificatesElements, userCertificatesElement;

    fs = require('fs');
    path = require('path');
    et = require('elementtree');
    projectManifestFile = path.join(context.opts.projectRoot, "platforms", "android", 'AndroidManifest.xml');
    if (!fs.existsSync(projectManifestFile)) {
        // The Android platform must not be present.  Skip the rest of this hook.
        return;
    }
    manifestContents = fs.readFileSync(projectManifestFile, 'utf-8');
    projectManifestXmlTree = new et.ElementTree(et.XML(manifestContents));
    application = projectManifestXmlTree.find("./application");
    networkSecurityConfig = application.get("android:networkSecurityConfig");

    // Only set the networkSecurityConfig if none is set.  If the developer has set the
    // networkSecurityConfig file already, then only modify the values explicitly set in
    // the config.xml (at this point only the preference trustUserCertificates can be
    // set in config.xml).
    if (!networkSecurityConfig) {
        networkSecurityConfig = "@xml/kapsel_network_security_config";
        application.set("android:networkSecurityConfig", networkSecurityConfig);
        fs.writeFileSync(projectManifestFile, projectManifestXmlTree.write({indent: 4}), 'utf-8');
    }
    networkSecurityConfigFileName = networkSecurityConfig.substring("@xml/".length) + ".xml";
    pathToNetworkSecurityConfigFile = path.join(context.opts.projectRoot, "platforms", "android", "res", "xml", networkSecurityConfigFileName);
    
    if (!fs.existsSync(pathToNetworkSecurityConfigFile)) {
        // The file specified in AndroidManifest.xml doesn't exist; copy the kapsel one there.
        var pathToKapselNetworkSecurityConfig = path.join(context.opts.projectRoot, "plugins", "kapsel-plugin-corelibs", "android", "res", "xml", "kapsel_network_security_config.xml");
        fs.writeFileSync(pathToKapselNetworkSecurityConfig, fs.readFileSync(pathToNetworkSecurityConfigFile));
    }

    projectConfigXML = path.join(context.opts.projectRoot, "config.xml");
    configXMLContents = fs.readFileSync(projectConfigXML, 'utf-8');
    configXMLTree = new et.ElementTree(et.XML(configXMLContents));
    preferences = configXMLTree.findall("preference");
    for(var i=0; i<preferences.length; i++) {
        preferenceName = preferences[i].get("name");
        if (preferenceName === "trustUserCertificates") {
            trustUserCertificatesElement = preferences[i];
            break;
        }
    }
    trustUserCertsConfigValue = true;
    if (trustUserCertificatesElement) {
        trustUserCertsConfigValue = trustUserCertificatesElement.get("value");
        if (trustUserCertsConfigValue) {
            // convert from string to boolean
            trustUserCertsConfigValue = trustUserCertsConfigValue.toLowerCase() === "true";
        }
    }
    networkSecurityConfigXML = pathToNetworkSecurityConfigFile;
    networkSecurityConfigXMLContents = fs.readFileSync(networkSecurityConfigXML, 'utf-8');
    networkSecurityConfigXMLTree = new et.ElementTree(et.XML(networkSecurityConfigXMLContents));
    if (networkSecurityConfigXMLTree.getroot() === null) {
        console.log("Warning: kapsel-plugin-corelibs after_prepare hook could not apply network security configuration because the existing xml file is invalid.");
    }
    baseConfigElement = networkSecurityConfigXMLTree.find("base-config");
    if (!baseConfigElement) {
        baseConfigElement = et.SubElement(networkSecurityConfigXMLTree.getroot(), "base-config");
    }
    trustAnchorsElement = baseConfigElement.find("trust-anchors");
    if (!trustAnchorsElement) {
        trustAnchorsElement = et.SubElement(baseConfigElement, "trust-anchors");
    }
    certificatesElements = trustAnchorsElement.findall("certificates");
    for (var j=0; j<certificatesElements.length; j++) {
        if (certificatesElements[j].get("src") === "user") {
            userCertificatesElement = certificatesElements[j];
            break;
        }
    }

    if (trustUserCertsConfigValue && !userCertificatesElement) {
        userCertificatesElement = et.SubElement(trustAnchorsElement, "certificates");
        userCertificatesElement.set("src", "user");
        fs.writeFileSync(pathToNetworkSecurityConfigFile, networkSecurityConfigXMLTree.write({indent: 4}), 'utf-8');
    }
    else if (!trustUserCertsConfigValue && userCertificatesElement) {
        trustAnchorsElement.remove(userCertificatesElement);
        fs.writeFileSync(pathToNetworkSecurityConfigFile, networkSecurityConfigXMLTree.write({indent: 4}), 'utf-8');
    }
};