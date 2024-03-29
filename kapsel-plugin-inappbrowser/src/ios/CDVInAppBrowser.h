/*
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
 */

#import <Cordova/CDVPlugin.h>
#import <Cordova/CDVInvokedUrlCommand.h>
#import <Cordova/CDVScreenOrientationDelegate.h>
#import <WebKit/WebKit.h>

#ifdef __CORDOVA_4_0_0
    #import <Cordova/CDVUIWebViewDelegate.h>
#else
    #import <Cordova/CDVWebViewDelegate.h>
#endif

@class CDVInAppBrowserViewController;

@interface CDVInAppBrowser : CDVPlugin {
}

@property (nonatomic, retain) CDVInAppBrowserViewController* inAppBrowserViewController;
@property (nonatomic, copy) NSString* callbackId;
@property (nonatomic, copy) NSRegularExpression *callbackIdPattern;

- (void)open:(CDVInvokedUrlCommand*)command;
- (void)close:(CDVInvokedUrlCommand*)command;
- (void)injectScriptCode:(CDVInvokedUrlCommand*)command;
- (void)show:(CDVInvokedUrlCommand*)command;
- (void)hide:(CDVInvokedUrlCommand*)command;

// kapsel change: to hide screenshot on inappbrowser for appswitcher
typedef struct {
    BOOL iPhone;
    BOOL iPad;
    BOOL iPhone5;
    BOOL iPhone6;
    BOOL iPhone6Plus;
    BOOL retina;
    
} CDV_iOSDevice;
// kapsel change end

@end

@interface CDVInAppBrowserOptions : NSObject {}

@property (nonatomic, assign) BOOL location;
@property (nonatomic, assign) BOOL toolbar;
@property (nonatomic, copy) NSString* closebuttoncaption;
@property (nonatomic, copy) NSString* toolbarposition;
@property (nonatomic, assign) BOOL clearcache;
@property (nonatomic, assign) BOOL clearsessioncache;

@property (nonatomic, copy) NSString* presentationstyle;
@property (nonatomic, copy) NSString* transitionstyle;

@property (nonatomic, assign) BOOL enableviewportscale;
@property (nonatomic, assign) BOOL mediaplaybackrequiresuseraction;
@property (nonatomic, assign) BOOL allowinlinemediaplayback;
@property (nonatomic, assign) BOOL keyboarddisplayrequiresuseraction;
@property (nonatomic, assign) BOOL suppressesincrementalrendering;
@property (nonatomic, assign) BOOL hidden;
@property (nonatomic, assign) BOOL disallowoverscroll;
@property (nonatomic, assign) BOOL usewkwebview;
    
//kapsel customization
@property (nonatomic, assign) BOOL hidenavigation;
/*
 * showshareoption is deprecated, use showprintoption instead
 */
@property (nonatomic, assign) BOOL showshareoption DEPRECATED_ATTRIBUTE;
@property (nonatomic, assign) BOOL showprintoption;
//end kapsel customization

+ (CDVInAppBrowserOptions*)parseOptions:(NSString*)options;

@end

@interface CDVInAppBrowserViewController : UIViewController <UIWebViewDelegate, WKNavigationDelegate, CDVScreenOrientationDelegate>{
    @private
    NSString* _userAgent;
    NSString* _prevUserAgent;
    NSInteger _userAgentLockToken;
    CDVInAppBrowserOptions *_browserOptions;
#ifdef __CORDOVA_4_0_0
    CDVUIWebViewDelegate* _webViewDelegate;
#else
    CDVWebViewDelegate* _webViewDelegate;
#endif
    CDVInAppBrowser* _navigationDelegate;
}

@property (nonatomic, strong) IBOutlet UIView* webView;
@property (nonatomic, strong) IBOutlet UIBarButtonItem* closeButton;
@property (nonatomic, strong) IBOutlet UIBarButtonItem* shareButton;
@property (nonatomic, strong) IBOutlet UILabel* addressLabel;
@property (nonatomic, strong) IBOutlet UIBarButtonItem* backButton;
@property (nonatomic, strong) IBOutlet UIBarButtonItem* forwardButton;
@property (nonatomic, strong) IBOutlet UIActivityIndicatorView* spinner;
@property (nonatomic, strong) IBOutlet UIToolbar* toolbar;

@property (nonatomic, weak) id <CDVScreenOrientationDelegate> orientationDelegate;
@property (nonatomic) NSURL* currentURL;
@property (nonatomic, strong, readwrite) id <WKUIDelegate> uiDelegate;
    
- (void)close;
- (void)navigateTo:(NSURL*)url;
- (void)showLocationBar:(BOOL)show;
- (void)showToolBar:(BOOL)show : (NSString *) toolbarPosition;
- (void)setCloseButtonTitle:(NSString*)title;

- (id)initWithUserAgent:(NSString*)userAgent prevUserAgent:(NSString*)prevUserAgent browserOptions: (CDVInAppBrowserOptions*) browserOptions navigationDelegate:navigationDelegate;

@end

@interface CDVInAppBrowserNavigationController : UINavigationController

@property (nonatomic, weak) id <CDVScreenOrientationDelegate> orientationDelegate;

@end

@interface CDVWKInAppBrowserUIDelegate : NSObject <WKUIDelegate>
    
@property (nonatomic, copy) NSString* title;
    
- (instancetype)initWithTitle:(NSString*)title;
    
@end
