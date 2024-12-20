let port = browser.runtime.connectNative("vrpc");

port.onMessage.addListener((response) => {
  console.log("Received: " + response);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_RPC_INFO") {
    console.log("RPC Info: " + message.content);
    port.postMessage("RPC: \n" + message.content);
  } else if (message.type === "GET_STATUS_INFO") {
    console.log("Status Info: " + message.content);
    port.postMessage("Status: \n" + message.content);
  }
});

browser.runtime.onSuspend.addListener(() => {
  port.postMessage("Status: \n" + "Program\nShutdown");
});

browser.windows.onRemoved.addListener((windowId) => {
  port.postMessage("Status: \n" + "Program\nShutdown");
});

browser.browserAction.onClicked.addListener(() => {
  console.log("Sending: 1234");
  port.postMessage("1234");
});
