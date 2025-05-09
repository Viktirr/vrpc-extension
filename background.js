// Chrome support
if (typeof browser === 'undefined') {
  var browser = chrome;
}

const updateUrl = "./new-update-page/update.html"

browser.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    browser.tabs.create({ url: updateUrl });
  }
  else if (details.reason === "update") {
    browser.tabs.create( {url: updateUrl });
  }
})

let port = browser.runtime.connectNative("vrpc");

let hadLaunched = false;
let AppActive = false;
let appLocked = false;

port.onMessage.addListener((response) => {
  console.log("Received: " + response);
  if (response === "Alive") {
    AppActive = true;
    hadLaunched = true;
    browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: "STATUS: ALIVE"
    });
    return;
  }
  if (response === "PROGRAM: LOCK")
  {
    appLocked = true;
    browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: "STATUS: LOCKED"
    });
    return;
  }
  browser.runtime.sendMessage({
    type: "SEND_POPUP_INFO",
    content: response
  });
});

// Check if the app is running
function CheckAppHeartbeat() {
  if (appLocked) {
    browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: "STATUS: LOCKED"
    });
    return;
  }
  const timeoutAppResponse = setTimeout(() => {
    if (AppActive == true || appLocked == true) {
      clearTimeout(timeoutAppResponse);
      return;
    }
    browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: "STATUS: FAILED"
    });
    AppActive = false;
  }, 5000);

  console.log("Checking App Status");

  port.postMessage("Status: \nProgram\nHeartbeat");
}

function CheckLaunched() {
  if (appLocked == true) {
    return;
  }
  if (hadLaunched == false) {
    browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: "STATUS: NOT_LAUNCHED"
    });
  }
  else {
    browser.runtime.sendMessage({
      type: "SEND_POPUP_INFO",
      content: "STATUS: CRASHED"
    });
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_RPC_INFO") {
    //console.log("RPC Info: " + message.content);
    port.postMessage("RPC: \n" + message.content);
  } else if (message.type === "SET_STATUS_INFO") {
    console.log("Status Info: " + message.content);
    port.postMessage("Status: \n" + message.content);
  } else if (message.type === "GET_POPUP_INFO") {
    if (message.content === "CHECK_APP_HEARTBEAT") {
      CheckAppHeartbeat();
    }
    if (message.content === "CHECK_LAUNCHED") {
      CheckLaunched();
    }
  } else if (message.type === "SEND_TO_APP") {
    console.log("Sending to app... " + message.content);
    port.postMessage("Status: \n" + message.content);
  }
});