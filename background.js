// Chrome support
if (typeof browser === 'undefined') {
  var browser = chrome;
}

const updateUrl = "./new-update-page/update.html"
const nativeHostName = "vrpc";

// Don't hammer the host with launches if it keeps failing to start.
const reconnectIntervalMs = 10000;
// While another browser holds the app lock, only re-check this often.
const lockedRecheckMs = 30000;

browser.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    browser.tabs.create({ url: updateUrl });
  }
  else if (details.reason === "update") {
    browser.tabs.create( {url: updateUrl });
  }
})

let port = null;
let lastConnectAttempt = 0;
let lastLockedCheck = 0;
let hadLaunched = false;
let AppActive = false;
let appLocked = false;

function NotifyPopup(content) {
  try {
    const result = browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: content
    });
    // No popup open means nobody is listening, which is not worth reporting.
    if (result && typeof result.catch === "function") { result.catch(() => { }); }
  } catch (e) {
    console.log("Couldn't notify the popup: " + e);
  }
}

// Opens the native messaging port if it isn't open already. The port is created on demand, so a
// background page that was restarted (or a browser that lost the app) reconnects by itself
// instead of needing a browser restart.
function ConnectToApp() {
  if (port) { return port; }

  const now = Date.now();
  if (now - lastConnectAttempt < reconnectIntervalMs) { return null; }
  lastConnectAttempt = now;

  try {
    port = browser.runtime.connectNative(nativeHostName);
  } catch (e) {
    console.log("Couldn't connect to the app: " + e);
    port = null;
    return null;
  }

  port.onMessage.addListener(HandleAppMessage);
  port.onDisconnect.addListener(HandleAppDisconnect);
  return port;
}

// The app exited, crashed or was never installed: drop the port so the next message opens a fresh
// one. Reading lastError here also stops the browser from logging it as unchecked.
function HandleAppDisconnect() {
  const error = browser.runtime.lastError;
  console.log("Disconnected from the app" + (error ? ": " + error.message : ""));
  port = null;
  AppActive = false;
}

function SendToApp(message) {
  const currentPort = ConnectToApp();
  if (!currentPort) { return false; }

  try {
    currentPort.postMessage(message);
    return true;
  } catch (e) {
    // The port died between opening it and writing to it.
    console.log("Couldn't send to the app: " + e);
    port = null;
    AppActive = false;
    return false;
  }
}

function HandleAppMessage(response) {
  console.log("Received: " + response);
  if (response === "Alive") {
    AppActive = true;
    hadLaunched = true;
    appLocked = false;
    NotifyPopup("STATUS: ALIVE");
    return;
  }
  if (response === "PROGRAM: LOCK")
  {
    appLocked = true;
    NotifyPopup("STATUS: LOCKED");
    return;
  }
  NotifyPopup(response);
}

// Check if the app is running
function CheckAppHeartbeat() {
  if (appLocked) {
    // The browser holding the lock may have closed by now, so keep re-checking once in a while
    // instead of staying locked until this browser is restarted.
    const now = Date.now();
    if (now - lastLockedCheck < lockedRecheckMs) {
      NotifyPopup("STATUS: LOCKED");
      return;
    }
    lastLockedCheck = now;
  }

  // Only a fresh answer counts, otherwise one good heartbeat would hide a later crash.
  AppActive = false;

  const timeoutAppResponse = setTimeout(() => {
    if (AppActive == true || appLocked == true) { return; }
    NotifyPopup("STATUS: FAILED");
  }, 5000);

  console.log("Checking App Status");

  SendToApp("Status: \nProgram\nHeartbeat");
}

function CheckLaunched() {
  if (appLocked == true) {
    return;
  }
  if (hadLaunched == false) {
    NotifyPopup("STATUS: NOT_LAUNCHED");
  }
  else {
    NotifyPopup("STATUS: CRASHED");
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_RPC_INFO") {
    SendToApp("RPC: \n" + message.content);
  } else if (message.type === "SET_STATUS_INFO") {
    console.log("Status Info: " + message.content);
    SendToApp("Status: \n" + message.content);
  } else if (message.type === "GET_POPUP_INFO") {
    if (message.content === "CHECK_APP_HEARTBEAT") {
      CheckAppHeartbeat();
    }
    if (message.content === "CHECK_LAUNCHED") {
      CheckLaunched();
    }
  } else if (message.type === "SEND_TO_APP") {
    console.log("Sending to app... " + message.content);
    SendToApp("Status: \n" + message.content);
  }
});
