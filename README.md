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


## Auto-update notifications
From extension version 1.1.0 the popup shows the desktop app's update state: when a newer app version has been downloaded and verified, it links the release notes and offers **Update now**, which opens the desktop setup panel for the final approval. The extension only sends update commands to app versions 1.1.0 or newer; older apps are left exactly as they were. Update checks and downloads happen inside the desktop app (over `api.viktir.com` and a signed GitHub release asset), not in the browser.

Automatic installation is optional and off by default. The one-time update page (`new-update-page/update.html`, opened once per extension version) explains it and offers **Enable automatic installs**; the same switch lives in the popup under **Configuration → Updates → Install Updates Automatically**. It is stored in the app's `Config.json` (`UnattendedUpdates`) and only applies to signed, verified packages. The default remains the user-approved **Update now** flow.

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
The extension is published on the Chrome Web Store and Firefox Add-ons (links above). For development, load the unpacked build from the sibling `vrpc-extension-chrome` / `vrpc-extension-firefox` output folders: open `about:debugging` on Firefox and select that folder's `manifest.json`, or enable Developer Mode and "Load unpacked" in Chromium-based browsers.

## Troubleshooting / IT DOESN'T WORK!!
Please review the troubleshooting section over at the [VRPC APP](https://github.com/Viktirr/vrpc-app) repository for more details, however here are some notes.  
  
### Native Messaging Permissions
The VRPC app installer creates the native-messaging registration automatically. If you need to check it manually, use the per-user keys:

Firefox: `HKEY_CURRENT_USER\SOFTWARE\Mozilla\NativeMessagingHosts\vrpc`

Chrome: `HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\vrpc`

Edge: `HKEY_CURRENT_USER\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\vrpc`

The value should point at a generated manifest in `%LOCALAPPDATA%\Viktir\VRPCApp\manifests`. If your browser is not listed, look up its native-messaging registry path (Search online for "Native messaging (browser)") and add a `vrpc` key pointing at the same manifest.
  
### Double-check Paths/Directories
Make sure every directory is rightly listed. If you need to change the directory of the app, I recommend reinstalling it.

### Crashes
It can also be that this is not a problem of user error, so there might be possible crashes from the application. If you encounter so, feel free to create an Issue (change it to a form or something else later).