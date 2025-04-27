# VRPC-EXTENSION

Browser extension portion of the [VRPC application](https://github.com/Viktirr/vrpc-app).  


## What's this about?
This extension connects to a desktop application on your computer, where the extension actively sends data from the currently listening song on YouTube Music and Soundcloud to that desktop application (no data is sent to any server online). You may also choose to change settings to the application from the Popup window available when you click the extension icon.  

The application then sends that information to the Discord client for Rich Presence and also saves your listening history (if you so choose, this is more of a personal feature but I believe that it could be of use).

## Downloads  
These are the official downloads of VRPC. Be careful as there are some AI-generated impostors of this extension
[Chrome Web Store (Brave, Edge, etc.)](https://chromewebstore.google.com/detail/vrpc-extension/dmfcnhgakihhigbkpefjgjkbbnkjagpb)
[Firefox](https://addons.mozilla.org/en-US/firefox/addon/vrpc-extension)
### Direct Downloads (NOT RECOMMENDED!)
If you wish to build the latest version of the app, feel free to download the latest release. You're going to have to build the extension though.  
[Download](https://github.com/Viktirr/vrpc-extension/releases/latest)


## Building  
I really didn't think I'd have to create a sort of building script for this, however it has to be done due to differences in Firefox and Chrome browsers.   
The script will build on the parent folder.  

Build for every platform -  
`build.py`  
Build for firefox -  
`build.py firefox`  
Build for Chrome-based browsers -  
`build.py chrome`

### Prerequisites (for building)
Latest Python 3

### What does it do?
The script has to be placed in the same folder as this extension's files. Upon running the script, it will create 2 folders (or 1 if you chose a specific platform) on the parent directory (the folder above the script) with the selected platform for the extension.

## Usage
While it's not available yet on any browser, you may enable the extension manually by going to
`about:debugging`
on Firefox and selecting manifest.json from there.  
On Edge you may go onto the Extensions tab and enable Developer Mode, which will allow you to load this extension.

## Troubleshooting / IT DOESN'T WORK!!
Please review the troubleshooting section over at the [VRPC APP](https://github.com/Viktirr/vrpc-app) repository for more details, however here are some notes.  
  
### Native Messaging Permissions
Please make sure the script is allowed native messaging permissions from the browser. Check the following registry keys:  
Firefox: `HKEY_LOCAL_MACHINE\SOFTWARE\Mozilla\NativeMessagingHosts`  
Chrome: `HKEY_LOCAL_MACHINE\SOFTWARE\Google\Chrome\NativeMessagingHosts`  
Edge: `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Edge\NativeMessagingHosts`  
If your browser is not listed here, please look online for "NativeMessaging (your browser name here)"  
You should create a key with the name of the extension and on the (Default) value, select the path to the manifest file available [here](https://github.com/Viktirr/vrpc-app/blob/main/NativeMessagingJson/vrpc.json).  
  
### Double-check Paths/Directories
Make sure every directory is rightly listed. If you need to change the directory of the app, I recommend reinstalling it.

### Crashes
It can also be that this is not a problem of user error, so there might be possible crashes from the application. If you encounter so, feel free to create an Issue (change it to a form or something else later).